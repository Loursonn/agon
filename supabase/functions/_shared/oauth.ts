/**
 * Base OAuth 2.0 commune aux fournisseurs de montres.
 *
 * Ce qui est commun à tous les fournisseurs vit ici, une fois : PKCE S256, le
 * `state` stocké / consommé / expiré côté serveur, l'échange du code, le
 * rafraîchissement sous bail, l'écriture des jetons dans le Vault. Ce qui est
 * propre à un fournisseur (URL, présence d'un `client_secret`, identification
 * de l'utilisateur, révocation) vit dans un adaptateur
 * (`_shared/providers/<nom>.ts`).
 *
 * Aucune dépendance, aucun `Deno.*` : le module est importable par Vitest et
 * par les Edge Functions. Le client Supabase et `fetch` sont injectés.
 *
 * COROS garde pour l'instant son propre code (`coros.ts`, connect/callback) :
 * enregistrement dynamique du client par hôte régional et métadonnées vérifiées
 * à chaque appel, deux particularités qui ne rentrent pas telles quelles ici, et
 * des fonctions connect/callback sans tests qui garantiraient qu'une bascule ne
 * change rien. Voir docs/DECISIONS.md, 2026-11.
 */

// ─────────────────────────────── Types ───────────────────────────────────────

/** Client Supabase (supabase-js v2), typé au plus large : partagé Deno / Node. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from(table: string): any; rpc(fn: string, args?: Record<string, unknown>): any };

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ProviderName = "garmin" | "coros";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Échéance du jeton d'accès (ISO). */
  expiresAt?: string;
  /** Échéance du refresh token (ISO), quand le fournisseur la donne. */
  refreshExpiresAt?: string;
  /** Scopes réellement accordés (pas ceux demandés). */
  scopes: string[];
}

export interface OAuthClientConfig {
  clientId: string;
  /** Absent pour un client public (COROS) ; obligatoire chez Garmin. */
  clientSecret?: string;
}

export interface OAuthEndpoints {
  authorize: string;
  token: string;
}

/** Ce qu'un fournisseur doit savoir faire au-delà de l'OAuth standard. */
export interface ProviderAdapter {
  provider: ProviderName;
  /** Libellé humain pour les messages d'erreur. */
  label: string;
  endpoints: OAuthEndpoints;
  client: OAuthClientConfig;
  /** Scopes à demander ; vide si le fournisseur les fixe lui-même (Garmin). */
  scopes?: string;
  /** Identifiant stable de l'utilisateur chez le fournisseur. */
  fetchUserId(accessToken: string): Promise<string>;
  /**
   * Coupe l'accès chez le fournisseur. `true` = confirmé. Ne lève pas : le
   * droit de l'athlète à se déconnecter ne dépend pas de la disponibilité du
   * fournisseur.
   */
  revoke(tokens: { accessToken: string; refreshToken?: string | null }): Promise<boolean>;
}

/** Erreur du fournisseur à l'échange ou au rafraîchissement. */
export class OAuthTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Code OAuth (`invalid_grant`…) quand le corps en donne un. */
    readonly code?: string,
  ) {
    super(message);
  }

  /**
   * Le fournisseur refuse définitivement ce refresh token : l'athlète doit
   * reconnecter. À distinguer d'une panne réseau ou d'un 5xx, qui ne doivent
   * jamais faire passer une connexion en `needs_reauth`.
   */
  get isReauthRequired(): boolean {
    return this.code === "invalid_grant" || this.status === 400 || this.status === 401;
  }
}

// ───────────────────────────────── PKCE ──────────────────────────────────────

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Valeur aléatoire sûre, en base64url. 32 octets = 256 bits = 43 caractères. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Couple PKCE S256. Le `verifier` (43 caractères, dans l'alphabet autorisé par
 * la RFC 7636 et par la spec Garmin) reste côté serveur ; le `challenge` part
 * dans l'URL d'autorisation.
 */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: await pkceChallenge(verifier) };
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// ─────────────────────────── URL d'autorisation ──────────────────────────────

export function buildAuthorizeUrl(
  adapter: Pick<ProviderAdapter, "endpoints" | "client" | "scopes">,
  p: { redirectUri: string; state: string; challenge: string },
): string {
  const url = new URL(adapter.endpoints.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", adapter.client.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (adapter.scopes) url.searchParams.set("scope", adapter.scopes);
  return url.toString();
}

// ───────────────────────────── Jetons (HTTP) ─────────────────────────────────

/** Échéance ISO à partir d'une durée en secondes, `undefined` si absente. */
export function expiryFrom(seconds: unknown, now = Date.now()): string | undefined {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? new Date(now + seconds * 1000).toISOString()
    : undefined;
}

/** Interprète la réponse JSON d'un point de jeton. */
export function parseTokenResponse(body: Record<string, unknown>, now = Date.now()): OAuthTokenSet {
  const access = body.access_token;
  if (typeof access !== "string" || access === "") {
    throw new OAuthTokenError("pas d'access_token dans la réponse", 200);
  }
  return {
    accessToken: access,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token !== ""
      ? body.refresh_token
      : undefined,
    expiresAt: expiryFrom(body.expires_in, now),
    refreshExpiresAt: expiryFrom(body.refresh_token_expires_in, now),
    scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [],
  };
}

async function postTokenForm(
  adapter: Pick<ProviderAdapter, "endpoints" | "label">,
  form: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<OAuthTokenSet> {
  const res = await fetchImpl(adapter.endpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form),
  });
  const text = await res.text();
  if (!res.ok) {
    /*
      Le formulaire n'est jamais journalisé : il contient le `code_verifier`,
      le `client_secret` et, au rafraîchissement, le refresh token. Seul le
      code d'erreur OAuth est extrait du corps.
    */
    let code: string | undefined;
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (typeof j.error === "string") code = j.error;
    } catch { /* corps non JSON */ }
    throw new OAuthTokenError(
      `${adapter.label} : jeton refusé (${res.status}${code ? `, ${code}` : ""})`,
      res.status,
      code,
    );
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OAuthTokenError(`${adapter.label} : réponse de jeton illisible`, res.status);
  }
  return parseTokenResponse(body);
}

function clientFields(client: OAuthClientConfig): Record<string, string> {
  return client.clientSecret
    ? { client_id: client.clientId, client_secret: client.clientSecret }
    : { client_id: client.clientId };
}

export function exchangeCode(
  adapter: Pick<ProviderAdapter, "endpoints" | "label" | "client">,
  p: { code: string; verifier: string; redirectUri: string },
  fetchImpl: FetchLike = fetch,
): Promise<OAuthTokenSet> {
  return postTokenForm(adapter, {
    grant_type: "authorization_code",
    code: p.code,
    code_verifier: p.verifier,
    redirect_uri: p.redirectUri,
    ...clientFields(adapter.client),
  }, fetchImpl);
}

export function refreshTokens(
  adapter: Pick<ProviderAdapter, "endpoints" | "label" | "client">,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<OAuthTokenSet> {
  return postTokenForm(adapter, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...clientFields(adapter.client),
  }, fetchImpl);
}

/**
 * Le jeton d'accès doit-il être rafraîchi avant usage ? Marge de 10 minutes,
 * recommandée par Garmin (« subtract 600 seconds or more »). Échéance inconnue
 * = on le tente tel quel.
 */
export function accessTokenStale(expiresAt: string | null | undefined, now = Date.now(), marginSec = 600): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - marginSec * 1000 <= now;
}

// ────────────────────────── État d'autorisation ──────────────────────────────

export interface PendingAuthorization {
  athleteId: string;
  provider: ProviderName;
  apiHost: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Crée l'état d'une autorisation : `state` de 256 bits et `code_verifier`
 * conservés dans `provider_oauth_states` (service_role seulement, 10 minutes).
 * Écrit AVANT de rendre l'URL : si l'écriture échoue, l'athlète ne part pas
 * chez le fournisseur avec une autorisation dont le retour serait invalide.
 */
export async function startAuthorization(
  db: Db,
  adapter: Pick<ProviderAdapter, "provider" | "endpoints" | "client" | "scopes">,
  p: { athleteId: string; redirectUri: string; apiHost: string },
): Promise<{ authorizeUrl: string; state: string }> {
  const { verifier, challenge } = await createPkce();
  const state = randomToken(32);
  const { error } = await db.from("provider_oauth_states").insert({
    state,
    athlete_id: p.athleteId,
    provider: adapter.provider,
    api_host: p.apiHost,
    code_verifier: verifier,
    redirect_uri: p.redirectUri,
  });
  if (error) throw new Error(`état d'autorisation : ${error.message}`);
  return { authorizeUrl: buildAuthorizeUrl(adapter, { redirectUri: p.redirectUri, state, challenge }), state };
}

/**
 * Consomme un `state` en une opération SQL (`DELETE … RETURNING`). `null` si
 * inconnu, déjà consommé, expiré — ou émis pour un autre fournisseur : un
 * `state` Garmin présenté au callback COROS ne doit rien ouvrir.
 */
export async function consumeAuthorization(
  db: Db,
  state: string,
  provider: ProviderName,
): Promise<PendingAuthorization | null> {
  const { data, error } = await db.rpc("consume_oauth_state", { p_state: state });
  if (error) throw new Error(`consommation du state : ${error.message}`);
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  if (!row || row.provider !== provider) return null;
  return {
    athleteId: String(row.athlete_id),
    provider,
    apiHost: String(row.api_host),
    codeVerifier: String(row.code_verifier),
    redirectUri: String(row.redirect_uri),
  };
}

// ─────────────────────────── Jetons (stockage) ───────────────────────────────

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
}

export async function readTokens(db: Db, connectionId: string): Promise<StoredTokens | null> {
  const { data, error } = await db.rpc("provider_token_read", { p_connection_id: connectionId });
  if (error) throw new Error(`lecture du jeton : ${error.message}`);
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  return {
    accessToken: (row.access_token as string | null) ?? null,
    refreshToken: (row.refresh_token as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  };
}

/** Écrit les jetons dans le Vault, puis l'échéance du refresh token. */
export async function storeTokens(db: Db, connectionId: string, t: OAuthTokenSet): Promise<void> {
  const { error } = await db.rpc("provider_token_write", {
    p_connection_id: connectionId,
    p_access_token: t.accessToken,
    p_refresh_token: t.refreshToken ?? null,
    p_expires_at: t.expiresAt ?? null,
  });
  if (error) throw new Error(`écriture du jeton : ${error.message}`);
  if (t.refreshExpiresAt || t.refreshToken) {
    const { error: e2 } = await db
      .from("provider_tokens")
      .update({ refresh_expires_at: t.refreshExpiresAt ?? null })
      .eq("connection_id", connectionId);
    if (e2) throw new Error(`échéance du refresh token : ${e2.message}`);
  }
}

/**
 * Jeton d'accès utilisable, rafraîchi si nécessaire — sous bail.
 *
 * Garmin délivre un nouveau refresh token à chaque rafraîchissement et
 * l'ancien cesse de valoir : deux rafraîchissements simultanés (cron et
 * déconnexion) en brûleraient un et le second échouerait. Le bail
 * (`provider_token_claim_refresh`) garantit qu'un seul appelant rafraîchit ;
 * l'autre relit après une courte attente le jeton écrit par le premier.
 *
 * `force` rafraîchit même un jeton d'accès encore valide (cron d'entretien :
 * c'est le refresh token qu'on veut renouveler).
 */
export async function freshAccessToken(
  db: Db,
  adapter: Pick<ProviderAdapter, "endpoints" | "label" | "client">,
  connectionId: string,
  opts: { force?: boolean; fetchImpl?: FetchLike; now?: () => number; wait?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const now = opts.now ?? Date.now;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const current = await readTokens(db, connectionId);
  if (!current?.accessToken) throw new Error("aucun jeton enregistré");
  if (!opts.force && !accessTokenStale(current.expiresAt, now())) return current.accessToken;
  if (!current.refreshToken) {
    throw new OAuthTokenError(`${adapter.label} : pas de refresh token, reconnexion nécessaire`, 401, "invalid_grant");
  }

  const { data: claimed, error: claimError } = await db.rpc("provider_token_claim_refresh", {
    p_connection_id: connectionId,
    p_seconds: 60,
  });
  if (claimError) throw new Error(`bail de rafraîchissement : ${claimError.message}`);

  if (!claimed) {
    // Quelqu'un rafraîchit déjà : on relit ce qu'il a écrit.
    for (let i = 0; i < 5; i++) {
      await wait(1000);
      const again = await readTokens(db, connectionId);
      if (again?.accessToken && again.accessToken !== current.accessToken) return again.accessToken;
    }
    if (!opts.force && !accessTokenStale(current.expiresAt, now(), 0)) return current.accessToken;
    throw new Error("rafraîchissement concurrent non terminé");
  }

  try {
    const next = await refreshTokens(adapter, current.refreshToken, opts.fetchImpl);
    // Pas de nouveau refresh token renvoyé = l'ancien reste valable.
    await storeTokens(db, connectionId, next);
    return next.accessToken;
  } finally {
    await db.rpc("provider_token_release_refresh", { p_connection_id: connectionId });
  }
}

// ─────────────────────────── Utilitaires HTTP ────────────────────────────────

/** Comparaison en temps constant de deux chaînes (secrets de webhook). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** SHA-256 hexadécimal. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** JSON à clés triées : deux notifications identiques ont la même empreinte. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// ──────────────────────── Déconnexion complète ───────────────────────────────

export interface ForgetReport {
  activities: number;
  dailies: number;
  inbox: number;
  connection: number;
}

/**
 * Supprime ce que le fournisseur a apporté à cet athlète, en une transaction
 * (`provider_forget`) : activités et données quotidiennes de cette source,
 * messages en attente, connexion et jetons (cascade + trigger Vault). Les
 * activités `file_import` ne sont jamais touchées.
 */
export async function forgetProvider(db: Db, athleteId: string, provider: ProviderName): Promise<ForgetReport> {
  const { data, error } = await db.rpc("provider_forget", { p_athlete: athleteId, p_provider: provider });
  if (error) throw new Error(`suppression des données ${provider} : ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
  return { activities: n("activities"), dailies: n("dailies"), inbox: n("inbox"), connection: n("connection") };
}

/**
 * Déconnexion dans l'ordre qui ne laisse jamais d'accès ouvert sans moyen de
 * le fermer : révoquer chez le fournisseur D'ABORD (avec un jeton rafraîchi si
 * besoin), oublier ENSUITE. Un échec de révocation n'empêche pas l'oubli — le
 * droit de l'athlète ne dépend pas de la disponibilité du fournisseur — mais il
 * est remonté : « nos jetons sont effacés » n'est pas « l'accès est coupé ».
 */
export async function revokeAndForget(
  db: Db,
  adapter: ProviderAdapter,
  p: { athleteId: string; connectionId: string },
  opts: { fetchImpl?: FetchLike; wait?: (ms: number) => Promise<void> } = {},
): Promise<{ revoked: boolean; warnings: string[]; forgotten: ForgetReport }> {
  const warnings: string[] = [];
  let revoked = false;
  try {
    const stored = await readTokens(db, p.connectionId);
    if (!stored?.accessToken) {
      warnings.push("aucun jeton à révoquer");
    } else {
      let accessToken = stored.accessToken;
      try {
        accessToken = await freshAccessToken(db, adapter, p.connectionId, opts);
      } catch (e) {
        // On tente quand même avec le jeton connu : il peut encore valoir.
        warnings.push(`rafraîchissement impossible avant révocation : ${e instanceof Error ? e.message : String(e)}`);
      }
      revoked = await adapter.revoke({ accessToken, refreshToken: stored.refreshToken });
      if (!revoked) warnings.push(`${adapter.label} n'a pas confirmé la révocation`);
    }
  } catch (e) {
    warnings.push(`révocation impossible : ${e instanceof Error ? e.message : String(e)}`);
  }
  const forgotten = await forgetProvider(db, p.athleteId, adapter.provider);
  return { revoked, warnings, forgotten };
}

/**
 * Le refresh token doit-il être renouvelé par le cron d'entretien ?
 * Oui quand il expire dans moins de `marginDays` jours. Échéance inconnue :
 * on la suppose à `lifetimeDays` après la dernière écriture du jeton.
 * Garmin : 90 jours de vie, renouvelé à 60 jours de l'échéance → tous les
 * ~30 jours, avec 60 jours de reprises possibles si Garmin est indisponible.
 */
export function refreshTokenDue(
  t: { refreshExpiresAt: string | null; updatedAt: string },
  now = Date.now(),
  opts: { lifetimeDays?: number; marginDays?: number } = {},
): boolean {
  const day = 86_400_000;
  const expires = t.refreshExpiresAt
    ? Date.parse(t.refreshExpiresAt)
    : Date.parse(t.updatedAt) + (opts.lifetimeDays ?? 90) * day;
  if (!Number.isFinite(expires)) return true;
  return expires < now + (opts.marginDays ?? 60) * day;
}
