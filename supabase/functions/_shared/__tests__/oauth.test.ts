/**
 * Base OAuth commune : ce qui doit être vrai pour tout fournisseur.
 *
 * Les cas qui comptent sont les refus et les courses : un `state` émis pour un
 * autre fournisseur, un refresh token à usage unique que deux appelants
 * voudraient utiliser en même temps, une panne prise pour un refus.
 */
import { describe, expect, it, vi } from "vitest";
import {
  accessTokenStale,
  buildAuthorizeUrl,
  canonicalJson,
  consumeAuthorization,
  createPkce,
  exchangeCode,
  freshAccessToken,
  OAuthTokenError,
  parseTokenResponse,
  pkceChallenge,
  refreshTokenDue,
  revokeAndForget,
  startAuthorization,
  timingSafeEqual,
  type Db,
  type ProviderAdapter,
} from "../oauth";

const adapter: ProviderAdapter = {
  provider: "garmin",
  label: "Garmin",
  endpoints: { authorize: "https://auth.example/authorize", token: "https://auth.example/token" },
  client: { clientId: "cid", clientSecret: "sec" },
  fetchUserId: async () => "u1",
  revoke: async () => true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Base minimale : enregistre les appels, répond selon `rpcs`. */
function fakeDb(rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: Array<{ kind: string; name: string; args?: unknown }> = [];
  const db: Db = {
    rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ kind: "rpc", name, args });
      const fn = rpcs[name];
      return Promise.resolve({ data: fn ? fn(args) : null, error: null });
    },
    from(table: string) {
      const chain = {
        insert: (row: unknown) => {
          calls.push({ kind: "insert", name: table, args: row });
          return Promise.resolve({ error: null });
        },
        update: (row: unknown) => {
          calls.push({ kind: "update", name: table, args: row });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return chain;
    },
  };
  return { db, calls };
}

describe("PKCE", () => {
  it("produit un verifier conforme à la RFC 7636 et un challenge S256", async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toBe(await pkceChallenge(verifier));
  });

  it("calcule le challenge de l'exemple de la RFC 7636", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("buildAuthorizeUrl", () => {
  it("porte tous les paramètres PKCE, sans scope quand le fournisseur l'impose", () => {
    const url = new URL(buildAuthorizeUrl(adapter, { redirectUri: "https://x/cb", state: "st", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://auth.example/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "https://x/cb",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("ne met jamais le secret dans l'URL", () => {
    expect(buildAuthorizeUrl(adapter, { redirectUri: "r", state: "s", challenge: "c" })).not.toContain("sec");
  });
});

describe("parseTokenResponse", () => {
  it("lit la réponse type de Garmin (24 h / ~90 j)", () => {
    const now = Date.parse("2026-11-07T10:00:00Z");
    const t = parseTokenResponse({
      access_token: "a",
      expires_in: 86400,
      token_type: "bearer",
      refresh_token: "r",
      scope: "PARTNER_WRITE PARTNER_READ CONNECT_READ CONNECT_WRITE",
      jti: "x",
      refresh_token_expires_in: 7775998,
    }, now);
    expect(t.accessToken).toBe("a");
    expect(t.refreshToken).toBe("r");
    expect(t.expiresAt).toBe("2026-11-08T10:00:00.000Z");
    expect(t.refreshExpiresAt?.slice(0, 10)).toBe("2027-02-05");
    expect(t.scopes).toEqual(["PARTNER_WRITE", "PARTNER_READ", "CONNECT_READ", "CONNECT_WRITE"]);
  });

  it("refuse une réponse sans access_token", () => {
    expect(() => parseTokenResponse({ refresh_token: "r" })).toThrow(OAuthTokenError);
  });

  it("laisse les échéances absentes à undefined, jamais à « maintenant »", () => {
    const t = parseTokenResponse({ access_token: "a" });
    expect(t.expiresAt).toBeUndefined();
    expect(t.refreshExpiresAt).toBeUndefined();
  });
});

describe("exchangeCode", () => {
  it("envoie client_secret et code_verifier dans le formulaire", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 86400 }));
    await exchangeCode(adapter, { code: "c", verifier: "v", redirectUri: "https://x/cb" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.example/token");
    const form = Object.fromEntries(new URLSearchParams(String(init.body)));
    expect(form).toEqual({
      grant_type: "authorization_code",
      code: "c",
      code_verifier: "v",
      redirect_uri: "https://x/cb",
      client_id: "cid",
      client_secret: "sec",
    });
  });

  it("n'ajoute pas de client_secret pour un client public", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "a" }));
    await exchangeCode({ ...adapter, client: { clientId: "cid" } }, { code: "c", verifier: "v", redirectUri: "r" }, fetchImpl);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(String(init.body)).has("client_secret")).toBe(false);
  });

  it("distingue un refus (reconnexion) d'une panne (réessayer)", async () => {
    const refus = vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400));
    const e1 = await exchangeCode(adapter, { code: "c", verifier: "v", redirectUri: "r" }, refus).catch((e) => e);
    expect(e1).toBeInstanceOf(OAuthTokenError);
    expect(e1.isReauthRequired).toBe(true);
    expect(e1.message).not.toContain("sec");

    const panne = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    const e2 = await exchangeCode(adapter, { code: "c", verifier: "v", redirectUri: "r" }, panne).catch((e) => e);
    expect(e2.isReauthRequired).toBe(false);
  });
});

describe("state", () => {
  it("écrit le verifier côté serveur et ne renvoie que l'URL", async () => {
    const { db, calls } = fakeDb();
    const { authorizeUrl, state } = await startAuthorization(db, adapter, {
      athleteId: "ath",
      redirectUri: "https://x/cb",
      apiHost: "https://apis.example",
    });
    const insert = calls.find((c) => c.kind === "insert")!;
    expect(insert.name).toBe("provider_oauth_states");
    const row = insert.args as Record<string, string>;
    expect(row.state).toBe(state);
    expect(row.provider).toBe("garmin");
    expect(authorizeUrl).not.toContain(row.code_verifier);
    expect(new URL(authorizeUrl).searchParams.get("code_challenge")).toBe(await pkceChallenge(row.code_verifier));
  });

  it("refuse un state émis pour un autre fournisseur", async () => {
    const { db } = fakeDb({
      consume_oauth_state: () => [{ athlete_id: "a", provider: "coros", api_host: "h", code_verifier: "v", redirect_uri: "r" }],
    });
    expect(await consumeAuthorization(db, "st", "garmin")).toBeNull();
  });

  it("rend null pour un state inconnu, consommé ou expiré", async () => {
    const { db } = fakeDb({ consume_oauth_state: () => [] });
    expect(await consumeAuthorization(db, "st", "garmin")).toBeNull();
  });
});

describe("échéances", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");

  it("rafraîchit le jeton d'accès 10 minutes avant son expiration", () => {
    expect(accessTokenStale("2026-11-07T10:05:00Z", now)).toBe(true);
    expect(accessTokenStale("2026-11-07T11:00:00Z", now)).toBe(false);
    expect(accessTokenStale(null, now)).toBe(false);
  });

  it("renouvelle le refresh token à 60 jours de son échéance", () => {
    expect(refreshTokenDue({ refreshExpiresAt: "2027-01-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" }, now)).toBe(true);
    expect(refreshTokenDue({ refreshExpiresAt: "2027-02-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
  });

  it("échéance inconnue : 90 jours après la dernière écriture", () => {
    expect(refreshTokenDue({ refreshExpiresAt: null, updatedAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(refreshTokenDue({ refreshExpiresAt: null, updatedAt: "2026-10-01T00:00:00Z" }, now)).toBe(true);
  });
});

describe("freshAccessToken", () => {
  const stored = (expires: string) => [{ access_token: "old", refresh_token: "r-old", expires_at: expires }];

  it("rend le jeton courant s'il est encore valable, sans appeler le fournisseur", async () => {
    const fetchImpl = vi.fn();
    const { db } = fakeDb({ provider_token_read: () => stored("2999-01-01T00:00:00Z") });
    expect(await freshAccessToken(db, adapter, "c1", { fetchImpl })).toBe("old");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rafraîchit sous bail, écrit les nouveaux jetons et relâche le bail", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "new", refresh_token: "r-new", expires_in: 86400, refresh_token_expires_in: 7775998 }));
    const { db, calls } = fakeDb({
      provider_token_read: () => stored("2000-01-01T00:00:00Z"),
      provider_token_claim_refresh: () => true,
    });
    expect(await freshAccessToken(db, adapter, "c1", { fetchImpl })).toBe("new");
    const names = calls.map((c) => c.name);
    expect(names.indexOf("provider_token_claim_refresh")).toBeLessThan(names.indexOf("provider_token_write"));
    expect(names.at(-1)).toBe("provider_token_release_refresh");
    const write = calls.find((c) => c.name === "provider_token_write")!.args as Record<string, unknown>;
    expect(write.p_refresh_token).toBe("r-new");
    expect(calls.some((c) => c.kind === "update" && c.name === "provider_tokens")).toBe(true);
  });

  it("sans le bail, ne consomme pas le refresh token et relit celui de l'autre appelant", async () => {
    const fetchImpl = vi.fn();
    let reads = 0;
    const { db } = fakeDb({
      provider_token_read: () => (++reads === 1 ? stored("2000-01-01T00:00:00Z") : [{ access_token: "par-l-autre", refresh_token: "r2", expires_at: "2999-01-01T00:00:00Z" }]),
      provider_token_claim_refresh: () => false,
    });
    expect(await freshAccessToken(db, adapter, "c1", { fetchImpl, wait: async () => {} })).toBe("par-l-autre");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("relâche le bail même quand le fournisseur refuse", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400));
    const { db, calls } = fakeDb({
      provider_token_read: () => stored("2000-01-01T00:00:00Z"),
      provider_token_claim_refresh: () => true,
    });
    await expect(freshAccessToken(db, adapter, "c1", { fetchImpl })).rejects.toBeInstanceOf(OAuthTokenError);
    expect(calls.at(-1)?.name).toBe("provider_token_release_refresh");
  });
});

describe("revokeAndForget", () => {
  it("révoque AVANT d'oublier, et oublie même si la révocation échoue", async () => {
    const order: string[] = [];
    const { db } = fakeDb({
      provider_token_read: () => [{ access_token: "a", refresh_token: "r", expires_at: "2999-01-01T00:00:00Z" }],
      provider_forget: () => {
        order.push("forget");
        return { activities: 3, dailies: 2, inbox: 0, connection: 1 };
      },
    });
    const failing: ProviderAdapter = {
      ...adapter,
      revoke: async () => {
        order.push("revoke");
        return false;
      },
    };
    const r = await revokeAndForget(db, failing, { athleteId: "ath", connectionId: "c1" });
    expect(order).toEqual(["revoke", "forget"]);
    expect(r.revoked).toBe(false);
    expect(r.warnings.join(" ")).toContain("pas confirmé");
    expect(r.forgotten).toEqual({ activities: 3, dailies: 2, raw: 0, files: 0, inbox: 0, connection: 1 });
  });
});

describe("utilitaires", () => {
  it("compare deux secrets sans court-circuit sur la longueur", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("donne la même forme canonique quel que soit l'ordre des clés", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});
