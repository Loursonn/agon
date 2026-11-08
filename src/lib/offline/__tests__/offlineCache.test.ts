import { describe, it, expect } from "vitest";
import {
  appBuster,
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
  it("change avec le build", () => {
    expect(appBuster("abc")).not.toBe(appBuster("def"));
    expect(appBuster("abc")).toBe(appBuster("abc"));
  });
  it("valeur stable sans build id", () => {
    expect(appBuster(undefined)).toBe(appBuster(""));
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
  it("exclut URL signées, jetons et clés d'API", () => {
    expect(shouldPersistQuery(ok(["docs", "signed-url", "p"]))).toBe(false);
    expect(shouldPersistQuery(ok(["measurementPhotoUrls", ["a"]]))).toBe(false);
    expect(shouldPersistQuery(ok(["coach-api-keys", "c"]))).toBe(false);
    expect(shouldPersistQuery(ok(["claimInfo", "t"]))).toBe(false);
    expect(shouldPersistQuery(ok(["staff", "invitation", "t"]))).toBe(false);
  });
  it("le préfixe doit correspondre exactement", () => {
    expect(shouldPersistQuery(ok(["docs", "athlete", "a1"]))).toBe(true);
    expect(shouldPersistQuery(ok(["staff", "athlete", "a1"]))).toBe(true);
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
