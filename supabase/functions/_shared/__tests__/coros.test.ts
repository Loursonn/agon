/**
 * Ce que le client COROS refuse de faire.
 *
 * Les cas intéressants ici ne sont pas les cas nominaux — un échange OAuth qui
 * marche se voit à l'usage. Ce sont les refus : le routeur régional déguisé en
 * hôte, un document de métadonnées qui pointe ailleurs, un serveur qui
 * n'annonce plus S256. Chacun est une panne silencieuse si on ne vérifie pas,
 * et une erreur lisible si on vérifie.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COROS_HOSTS,
  COROS_SCOPES,
  createPkce,
  daysBetween,
  exchangeCode,
  extractFitUrls,
  fetchMetadata,
  planFitWindow,
  randomToken,
  resolveRegion,
  revokeToken,
  shiftDay,
} from "../coros";

const EU = COROS_HOSTS.eu;

/** Métadonnées conformes, telles que mcpeu.coros.com les renvoie réellement. */
function metadata(overrides: Record<string, unknown> = {}) {
  return {
    issuer: EU,
    authorization_endpoint: `${EU}/oauth2/authorize`,
    token_endpoint: `${EU}/oauth2/token`,
    revocation_endpoint: `${EU}/oauth2/revoke`,
    registration_endpoint: `${EU}/connect/register`,
    code_challenge_methods_supported: ["S256"],
    ...overrides,
  };
}

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(JSON.parse(text)),
    text: () => Promise.resolve(text),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRegion", () => {
  it("accepte les trois régions annoncées", () => {
    expect(resolveRegion("eu")).toBe("eu");
    expect(resolveRegion("us")).toBe("us");
    expect(resolveRegion("cn")).toBe("cn");
  });

  it("retombe sur l'Europe plutôt que de lever", () => {
    // Se tromper de région ne casse rien de définitif : l'autorisation échoue
    // et l'athlète recommence. Lever ici empêcherait seulement d'essayer.
    for (const bad of ["MCP", "fr", "", null, undefined, 42, {}]) {
      expect(resolveRegion(bad)).toBe("eu");
    }
  });

  it("ne connaît pas le routeur mcp.coros.com", () => {
    // Le routeur renvoie un issuer régional : son absence est volontaire.
    expect(Object.values(COROS_HOSTS)).not.toContain("https://mcp.coros.com");
  });
});

describe("PKCE", () => {
  it("produit un challenge en base64url, sans caractère à échapper", async () => {
    const { verifier, challenge } = await createPkce();
    // 43 caractères = 32 octets en base64url sans remplissage, soit le minimum
    // exigé par la RFC 7636.
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(challenge).not.toContain("=");
    expect(challenge).not.toBe(verifier);
  });

  it("dérive le challenge du verifier par SHA-256", async () => {
    // Vecteur de la RFC 7636, annexe B : la seule façon de vérifier qu'on
    // calcule bien S256 et non autre chose.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier),
    );
    let s = "";
    for (const b of new Uint8Array(digest)) s += String.fromCharCode(b);
    const attendu = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(attendu).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("ne répète pas deux fois le même verifier", async () => {
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("tire des states distincts", () => {
    const vus = new Set(Array.from({ length: 50 }, () => randomToken(32)));
    expect(vus.size).toBe(50);
  });
});

describe("COROS_SCOPES", () => {
  it("demande offline_access dès la première autorisation", () => {
    // Sans ce scope, pas de refresh_token, et l'ajouter plus tard oblige à
    // redemander son accord à l'athlète.
    expect(COROS_SCOPES.split(" ")).toContain("offline_access");
    expect(COROS_SCOPES.split(" ")).toContain("mcp.tools");
  });
});

describe("fetchMetadata — ce qui est refusé", () => {
  it("accepte des métadonnées conformes", async () => {
    stubFetch(metadata());
    const meta = await fetchMetadata(EU);
    expect(meta.token_endpoint).toBe(`${EU}/oauth2/token`);
  });

  it("refuse un issuer différent de l'hôte appelé", async () => {
    // Le cas du routeur : on appelle mcp.coros.com, il répond mcpeu.
    stubFetch(metadata({ issuer: "https://mcpus.coros.com" }));
    await expect(fetchMetadata(EU)).rejects.toThrow(/issuer inattendu/);
  });

  it("refuse un endpoint hors de l'origine annoncée", async () => {
    // Un document de métadonnées altéré ne doit pas pouvoir nous faire envoyer
    // le code d'autorisation ailleurs.
    stubFetch(metadata({ token_endpoint: "https://ailleurs.example/oauth2/token" }));
    await expect(fetchMetadata(EU)).rejects.toThrow(/token_endpoint hors de l'origine/);
  });

  it("refuse un serveur qui n'annonce plus S256", async () => {
    // Se rabattre sur `plain` reviendrait à désactiver PKCE, seule protection
    // d'un client sans secret.
    stubFetch(metadata({ code_challenge_methods_supported: ["plain"] }));
    await expect(fetchMetadata(EU)).rejects.toThrow(/S256/);
  });

  it("refuse une absence de méthode plutôt que de supposer", async () => {
    stubFetch(metadata({ code_challenge_methods_supported: undefined }));
    await expect(fetchMetadata(EU)).rejects.toThrow(/S256/);
  });

  it("signale un hôte injoignable sans masquer le code", async () => {
    stubFetch("{}", { ok: false, status: 503 });
    await expect(fetchMetadata(EU)).rejects.toThrow(/503/);
  });
});

describe("exchangeCode", () => {
  it("envoie le verifier et le client_id, en form-urlencoded", async () => {
    const fn = stubFetch({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "openid mcp.tools offline_access" });
    await exchangeCode(metadata(), {
      code: "c",
      verifier: "v",
      clientId: "cid",
      redirectUri: "https://x/cb",
    });

    const [, init] = fn.mock.calls[0];
    const body = (init.body as URLSearchParams);
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("v");
    expect(body.get("client_id")).toBe("cid");
    // Pas de client_secret : il n'en existe pas, et en envoyer un vide ferait
    // basculer COROS sur une méthode d'authentification qu'il n'accepte pas.
    expect(body.has("client_secret")).toBe(false);
  });

  it("renvoie les scopes accordés, pas ceux demandés", async () => {
    stubFetch({ access_token: "a", scope: "openid mcp.tools" });
    const tokens = await exchangeCode(metadata(), {
      code: "c", verifier: "v", clientId: "cid", redirectUri: "https://x/cb",
    });
    // offline_access manque : la connexion s'éteindra à l'expiration, et c'est
    // l'appelant qui doit pouvoir le constater.
    expect(tokens.scopes).toEqual(["openid", "mcp.tools"]);
    expect(tokens.refresh_token).toBeUndefined();
  });

  it("convertit expires_in en date absolue", async () => {
    stubFetch({ access_token: "a", expires_in: 3600 });
    const tokens = await exchangeCode(metadata(), {
      code: "c", verifier: "v", clientId: "cid", redirectUri: "https://x/cb",
    });
    const ecart = new Date(tokens.expires_at!).getTime() - Date.now();
    expect(ecart).toBeGreaterThan(3_500_000);
    expect(ecart).toBeLessThan(3_700_000);
  });

  it("ne recopie pas le corps de requête dans l'erreur", async () => {
    // Le form contient le code_verifier : un jeton journalisé est un jeton qui
    // survit à sa révocation.
    stubFetch("invalid_grant", { ok: false, status: 400 });
    await expect(
      exchangeCode(metadata(), {
        code: "c", verifier: "secret-verifier", clientId: "cid", redirectUri: "https://x/cb",
      }),
    ).rejects.toThrow(/^(?!.*secret-verifier).*400/s);
  });

  it("refuse une réponse 200 sans access_token", async () => {
    stubFetch({ token_type: "Bearer" });
    await expect(
      exchangeCode(metadata(), {
        code: "c", verifier: "v", clientId: "cid", redirectUri: "https://x/cb",
      }),
    ).rejects.toThrow(/access_token/);
  });
});

describe("revokeToken", () => {
  it("confirme une révocation acceptée", async () => {
    stubFetch("");
    expect(await revokeToken(metadata(), { token: "t", clientId: "c" })).toBe(true);
  });

  it("rend false sans lever quand COROS refuse", async () => {
    // Le droit de l'athlète à se déconnecter ne dépend pas de la disponibilité
    // de COROS : l'appelant doit pouvoir continuer et effacer nos jetons.
    stubFetch("", { ok: false, status: 500 });
    expect(await revokeToken(metadata(), { token: "t", clientId: "c" })).toBe(false);
  });

  it("rend false sans lever quand le réseau tombe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await revokeToken(metadata(), { token: "t", clientId: "c" })).toBe(false);
  });

  it("rend false si le serveur n'annonce pas de point de révocation", async () => {
    const fn = stubFetch("");
    const sansRevoke = metadata({ revocation_endpoint: undefined });
    expect(await revokeToken(sansRevoke, { token: "t", clientId: "c" })).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ───────────────────────── Arithmétique des jours ────────────────────────────

describe("shiftDay / daysBetween", () => {
  it("avance et recule d'un jour", () => {
    expect(shiftDay("2026-10-26", 1)).toBe("2026-10-27");
    expect(shiftDay("2026-10-26", -1)).toBe("2026-10-25");
  });

  it("franchit un changement de mois et une année bissextile", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("ne bouge pas sur un changement d'heure", () => {
    /*
      Le passage à l'heure d'hiver en Europe a lieu dans la nuit du 25 octobre
      2026. Calculer ces dates en heure locale ferait tomber un décalage de
      « un jour » sur 23 ou 25 heures, et un curseur de synchronisation
      reculerait ou sauterait une journée une fois par an. Tout est en UTC.
    */
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("compte les jours dans les deux sens", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(daysBetween("2026-10-26", "2026-10-26")).toBe(0);
  });
});

describe("planFitWindow", () => {
  it("borne la fenêtre à la largeur demandée", () => {
    // 30 jours à partir du 1er, donc jusqu'au 30 inclus — pas au 31.
    expect(planFitWindow("2026-01-01", "2026-12-31", 30)).toEqual({
      from: "2026-01-01",
      to: "2026-01-30",
    });
  });

  it("ne dépasse jamais aujourd'hui", () => {
    expect(planFitWindow("2026-10-20", "2026-10-26", 30)).toEqual({
      from: "2026-10-20",
      to: "2026-10-26",
    });
  });

  it("accepte une fenêtre d'un seul jour", () => {
    expect(planFitWindow("2026-10-26", "2026-10-26", 30)).toEqual({
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(planFitWindow("2026-10-01", "2026-12-31", 1)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
  });

  it("rend null quand le curseur a dépassé aujourd'hui", () => {
    // Le cas normal d'une synchronisation à jour : il n'y a rien à demander, et
    // surtout pas une plage dans le futur.
    expect(planFitWindow("2026-10-27", "2026-10-26", 30)).toBeNull();
  });
});

describe("extractFitUrls", () => {
  it("trouve les URL dans de la prose", () => {
    const text = [
      "Voici les fichiers disponibles :",
      "1. Sport(9807) — 2026-10-03 : https://s3.coros.com/fit/abc123.fit",
      "2. Sport(100) — 2026-10-05 : https://s3.coros.com/fit/def456.fit",
    ].join("\n");
    expect(extractFitUrls(text)).toEqual([
      "https://s3.coros.com/fit/abc123.fit",
      "https://s3.coros.com/fit/def456.fit",
    ]);
  });

  it("détache la ponctuation finale de la phrase", () => {
    // Dans un texte destiné à être lu, l'URL est suivie d'un point. Le garder
    // produirait un 404 sur chaque fichier.
    expect(extractFitUrls("Télécharge https://x.coros.com/a.fit.")).toEqual([
      "https://x.coros.com/a.fit",
    ]);
  });

  it("déduplique en conservant l'ordre", () => {
    /*
      Une même activité peut apparaître dans un résumé puis dans une liste.
      Télécharger deux fois le même fichier consommerait deux unités d'un quota
      de 50 par jour.
    */
    const text = "https://x.coros.com/b.fit et https://x.coros.com/a.fit et https://x.coros.com/b.fit";
    expect(extractFitUrls(text)).toEqual([
      "https://x.coros.com/b.fit",
      "https://x.coros.com/a.fit",
    ]);
  });

  it("garde les URL présignées avec paramètres de requête", () => {
    const url = "https://s3.eu.amazonaws.com/coros/fit/9807.fit?X-Amz-Signature=deadbeef&X-Amz-Expires=3600";
    expect(extractFitUrls(`Lien : ${url}`)).toEqual([url]);
  });

  it("écarte les liens qui ne concernent pas un fichier", () => {
    // La documentation et les pages d'aide se retrouvent dans les réponses des
    // outils : les télécharger gâcherait du quota.
    expect(extractFitUrls("Voir https://support.coros.com/aide pour en savoir plus")).toEqual([]);
  });

  it("rend une liste vide sur un texte sans URL", () => {
    expect(extractFitUrls("Aucune activité sur cette période.")).toEqual([]);
  });

  it("ne confond pas une URL avec le texte qui la suit entre parenthèses", () => {
    expect(extractFitUrls("Fichier (https://x.coros.com/a.fit) du 3 octobre")).toEqual([
      "https://x.coros.com/a.fit",
    ]);
  });
});
