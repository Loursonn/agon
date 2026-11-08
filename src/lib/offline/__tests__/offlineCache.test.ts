import { describe, it, expect } from "vitest";
import {
  appBuster,
  OFFLINE_CACHE_VERSION,
  authStorageKey,
  cacheKeyFor,
  formatOfflineStamp,
  isCacheKey,
  latestDataTimestamp,
  clearOfflineProfile,
  readOfflineProfile,
  readStoredAuthUser,
  readStoredAuthUserId,
  saveOfflineProfile,
  shouldPersistQuery,
} from "../offlineCache";
import { docsKeys } from "@/api/docs";
import { medicalKeys } from "@/api/injuries";
import { profileKeys } from "@/api/profile";
import { accountKeys } from "@/api/account";
import { staffKeys } from "@/api/staff";
import { coachKeys } from "@/api/coaches";

const ok = (queryKey: unknown[], data: unknown = [1], meta?: Record<string, unknown>) => ({
  queryKey,
  state: { status: "success", data },
  meta,
});

describe("cacheKeyFor", () => {
  it("une clé par utilisateur", () => {
    expect(cacheKeyFor("u1")).not.toBe(cacheKeyFor("u2"));
    expect(isCacheKey(cacheKeyFor("u1"))).toBe(true);
    expect(isCacheKey("autre")).toBe(false);
    expect(isCacheKey(42)).toBe(false);
  });
});

describe("appBuster", () => {
  it("suit la version du format, pas le déploiement", () => {
    expect(appBuster()).toBe(appBuster(OFFLINE_CACHE_VERSION));
    expect(appBuster("2")).not.toBe(appBuster("1"));
  });
});

describe("shouldPersistQuery", () => {
  it("garde une requête réussie", () => {
    expect(shouldPersistQuery(ok(["workouts", "a1"]))).toBe(true);
  });
  it("garde une donnée null (ligne absente) mais pas undefined", () => {
    expect(shouldPersistQuery(ok(["profile", "a1"], null))).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["profile", "a1"], state: { status: "success", data: undefined } })).toBe(false);
  });
  it("jamais une requête en erreur ou en attente", () => {
    expect(shouldPersistQuery({ queryKey: ["x"], state: { status: "error", data: [1] } })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ["x"], state: { status: "pending" } })).toBe(false);
  });
  it("exclut URL signées, jetons et clés d'API (clés réelles des modules)", () => {
    for (const key of [
      docsKeys.signedUrl("p"),
      medicalKeys.signedUrls("a1", ["x.pdf"]),
      profileKeys.photoUrls(["a1/p.jpg"]),
      accountKeys.claimInfo("t"),
      accountKeys.claimLink("a1"),
      staffKeys.invitation("t"),
      coachKeys.apiKeys("c"),
    ]) {
      expect(shouldPersistQuery(ok([...key])), JSON.stringify(key)).toBe(false);
    }
  });
  it("garde les autres clés de ces modules", () => {
    expect(shouldPersistQuery(ok(["docs", "athlete", "a1"]))).toBe(true);
    expect(shouldPersistQuery(ok(["staff", "athlete", "a1"]))).toBe(true);
    expect(shouldPersistQuery(ok(["medical", "a1", "entries"]))).toBe(true);
  });
  it("meta.persist = false exclut la requête", () => {
    expect(shouldPersistQuery(ok(["x"], [1], { persist: false }))).toBe(false);
  });
});

describe("latestDataTimestamp", () => {
  it("date de la donnée réussie la plus récente", () => {
    expect(latestDataTimestamp([
      { state: { status: "success", dataUpdatedAt: 100 } },
      { state: { status: "success", dataUpdatedAt: 300 } },
      { state: { status: "error", dataUpdatedAt: 900 } },
    ])).toBe(300);
  });
  it("null si rien en cache", () => {
    expect(latestDataTimestamp([])).toBeNull();
    expect(latestDataTimestamp([{ state: { status: "pending", dataUpdatedAt: 0 } }])).toBeNull();
  });
});

describe("formatOfflineStamp", () => {
  it("JJ/MM HH:MM en heure locale", () => {
    expect(formatOfflineStamp(new Date(2026, 10, 8, 14, 32).getTime())).toBe("08/11 14:32");
    expect(formatOfflineStamp(new Date(2026, 0, 3, 7, 5).getTime())).toBe("03/01 07:05");
  });
});

describe("readStoredAuthUserId", () => {
  const url = "https://abcdefgh.supabase.co";
  const storage = (entries: Record<string, string>) => ({ getItem: (k: string) => entries[k] ?? null });

  it("lit l'utilisateur de la session supabase-js sans réseau", () => {
    const s = storage({ "sb-abcdefgh-auth-token": JSON.stringify({ access_token: "x", user: { id: "u1" } }) });
    expect(readStoredAuthUserId(s, url)).toBe("u1");
  });
  it("ancien format currentSession", () => {
    const s = storage({ "sb-abcdefgh-auth-token": JSON.stringify({ currentSession: { user: { id: "u2" } } }) });
    expect(readStoredAuthUserId(s, url)).toBe("u2");
  });
  it("null sans session, avec JSON invalide ou sans stockage", () => {
    expect(readStoredAuthUserId(storage({}), url)).toBeNull();
    expect(readStoredAuthUserId(storage({ "sb-abcdefgh-auth-token": "{oups" }), url)).toBeNull();
    expect(readStoredAuthUserId(null, url)).toBeNull();
    expect(readStoredAuthUserId(storage({}), undefined)).toBeNull();
    expect(readStoredAuthUserId(storage({}), "pas une url")).toBeNull();
  });
  it("ignore la session d'un autre projet", () => {
    const s = storage({ "sb-autreprojet-auth-token": JSON.stringify({ user: { id: "u1" } }) });
    expect(readStoredAuthUserId(s, url)).toBeNull();
  });
});

describe("readStoredAuthUser", () => {
  it("renvoie l'utilisateur complet de la session enregistrée", () => {
    const s = { getItem: () => JSON.stringify({ user: { id: "u1", email: "a@b.fr" } }) };
    expect(readStoredAuthUser(s, "https://abcdefgh.supabase.co")).toEqual({ id: "u1", email: "a@b.fr" });
  });
});

describe("profil hors ligne", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("relit la fiche du même utilisateur, jamais celle d'un autre", () => {
    const s = mem();
    saveOfflineProfile(s, "u1", { id: "u1", role: "athlete" });
    expect(readOfflineProfile(s, "u1")).toEqual({ id: "u1", role: "athlete" });
    expect(readOfflineProfile(s, "u2")).toBeNull();
  });
  it("effacée à la déconnexion ; stockage absent ou cassé = null", () => {
    const s = mem();
    saveOfflineProfile(s, "u1", { id: "u1" });
    clearOfflineProfile(s);
    expect(readOfflineProfile(s, "u1")).toBeNull();
    expect(readOfflineProfile(null, "u1")).toBeNull();
    expect(readOfflineProfile({ getItem: () => "{oups" }, "u1")).toBeNull();
  });
});

describe("authStorageKey", () => {
  it("clé supabase-js du projet", () => {
    expect(authStorageKey("https://abcdefgh.supabase.co")).toBe("sb-abcdefgh-auth-token");
    expect(authStorageKey(undefined)).toBeNull();
    expect(authStorageKey("pas une url")).toBeNull();
  });
});
