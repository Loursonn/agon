import { describe, it, expect, vi } from "vitest";
import {
  canReloadNow,
  currentBuild,
  fetchServedBuild,
  isEntryRoute,
  isNewerBuild,
  parseBuildInfo,
  shouldCheckNow,
} from "../versionCheck";

const old = { id: "aaa", builtAt: 1000 };
const fresh = { id: "bbb", builtAt: 2000 };

describe("parseBuildInfo", () => {
  it("accepte un build valide", () => {
    expect(parseBuildInfo({ id: "abc", builtAt: 123 })).toEqual({ id: "abc", builtAt: 123 });
  });
  it.each([null, undefined, "x", 3, {}, { id: "", builtAt: 1 }, { id: "a" }, { id: "a", builtAt: "1" }, { id: "a", builtAt: 0 }, { id: "a", builtAt: NaN }])(
    "refuse %j",
    (v) => expect(parseBuildInfo(v)).toBeNull(),
  );
});

describe("isNewerBuild", () => {
  it("version servie plus récente", () => expect(isNewerBuild(fresh, old)).toBe(true));
  it("même build", () => expect(isNewerBuild(old, old)).toBe(false));
  it("même id, horodatage différent : pas de rechargement", () =>
    expect(isNewerBuild({ id: "aaa", builtAt: 5000 }, old)).toBe(false));
  it("serveur plus ancien (retour arrière) : on ne recharge pas", () => expect(isNewerBuild(old, fresh)).toBe(false));
  it("information manquante : jamais", () => {
    expect(isNewerBuild(null, old)).toBe(false);
    expect(isNewerBuild(fresh, null)).toBe(false);
  });
});

describe("isEntryRoute / canReloadNow", () => {
  it.each(["/athlete/program/workout/abc", "/athlete/specific/42", "/athlete/log", "/athlete/log/"])(
    "saisie ouverte sur %s",
    (p) => expect(isEntryRoute(p)).toBe(true),
  );
  it.each(["/athlete", "/athlete/program", "/athlete/profil", "/coach/athletes", "/athlete/login"])(
    "pas de saisie sur %s",
    (p) => expect(isEntryRoute(p)).toBe(false),
  );
  it("rechargement permis seulement sans écriture en attente et hors saisie", () => {
    expect(canReloadNow({ pendingWrites: 0, pathname: "/athlete" })).toBe(true);
    expect(canReloadNow({ pendingWrites: 2, pathname: "/athlete" })).toBe(false);
    expect(canReloadNow({ pendingWrites: 0, pathname: "/athlete/program/workout/x" })).toBe(false);
  });
});

describe("shouldCheckNow", () => {
  it("premier contrôle", () => expect(shouldCheckNow(null, 5)).toBe(true));
  it("trop tôt", () => expect(shouldCheckNow(1000, 1000 + 29_000)).toBe(false));
  it("assez tard", () => expect(shouldCheckNow(1000, 1000 + 30_000)).toBe(true));
});

describe("fetchServedBuild", () => {
  const resp = (body: unknown, ok = true) =>
    ({ ok, json: async () => body }) as unknown as Response;

  it("lit sans cache", async () => {
    const f = vi.fn().mockResolvedValue(resp({ id: "x", builtAt: 9 }));
    expect(await fetchServedBuild(f as unknown as typeof fetch)).toEqual({ id: "x", builtAt: 9 });
    expect(f.mock.calls[0][0]).toMatch(/^\/version\.json\?t=\d+$/);
    expect(f.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
  it("hors ligne : null", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("network"));
    expect(await fetchServedBuild(f as unknown as typeof fetch)).toBeNull();
  });
  it("404 : null", async () => {
    expect(await fetchServedBuild(vi.fn().mockResolvedValue(resp({}, false)) as unknown as typeof fetch)).toBeNull();
  });
  it("HTML renvoyé par la réécriture SPA : null", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("<!doctype"); } });
    expect(await fetchServedBuild(f as unknown as typeof fetch)).toBeNull();
  });
});

describe("currentBuild", () => {
  it("lit les constantes du build", () => {
    const b = currentBuild();
    expect(b?.id).toBe(__APP_BUILD_ID__);
    expect(b?.builtAt).toBe(__APP_BUILD_TIME__);
  });
});
