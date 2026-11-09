/**
 * Ce qu'il faut savoir sur COROS, rassemblé en un endroit.
 *
 * Ce module ne touche pas la base. Il ne fait que parler à COROS et rendre des
 * objets typés — pour que `provider-coros-connect` et
 * `provider-coros-callback` ne contiennent que de la logique propre à Agon, et
 * pour que les particularités de COROS (le routeur régional, le client sans
 * secret, PKCE obligatoire) soient décrites une seule fois.
 *
 * Faits vérifiés en direct contre les serveurs COROS (voir
 * `docs/integrations/COROS_INTEGRATION.md`) :
 *   - `code_challenge_methods_supported` ne contient que `S256`.
 *   - l'enregistrement dynamique de client répond 201 sans approbation humaine,
 *     et renvoie `token_endpoint_auth_method: "none"` : client public, aucun
 *     `client_secret` n'existe.
 *   - `/oauth2/revoke` existe, donc une déconnexion peut réellement couper
 *     l'accès au lieu d'effacer notre copie du jeton.
 */

/*
  Les trois hôtes régionaux. `mcp.coros.com` est délibérément absent : c'est un
  routeur, et interrogé depuis l'Europe il renvoie des métadonnées dont
  l'`issuer` vaut `https://mcpeu.coros.com`. L'écart entre l'hôte appelé et
  l'`issuer` annoncé est exactement ce que la vérification ci-dessous refuse.
*/
export const COROS_HOSTS = {
  eu: "https://mcpeu.coros.com",
  us: "https://mcpus.coros.com",
  cn: "https://mcpcn.coros.com",
} as const;

export type CorosRegion = keyof typeof COROS_HOSTS;

/*
  La région est celle du compte de l'athlète, pas la nôtre, et rien ne permet
  de la deviner avant qu'il se soit authentifié. Elle est donc demandée dans
  l'interface, avec l'Europe par défaut. Se tromper ne casse rien de
  définitif : l'autorisation échoue, l'athlète recommence en changeant de
  région.
*/
export function resolveRegion(value: unknown): CorosRegion {
  return typeof value === "string" && value in COROS_HOSTS
    ? (value as CorosRegion)
    : "eu";
}

/** Les scopes demandés, et pourquoi chacun. */
export const COROS_SCOPES = [
  "openid",
  // Accès aux outils MCP : sans lui, le jeton n'ouvre rien d'utile.
  "mcp.tools",
  /*
    Indispensable, et seulement obtenable à la première autorisation. Sans
    `offline_access`, pas de `refresh_token` : la synchronisation s'arrêterait
    à l'expiration du premier jeton d'accès, et il faudrait redemander son
    accord à l'athlète pour l'ajouter.
  */
  "offline_access",
].join(" ");

export interface CorosMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
}

/**
 * Métadonnées OAuth d'un hôte régional, vérifiées avant d'être utilisées.
 *
 * Les trois contrôles ne sont pas de la paranoïa de principe :
 *   - `issuer` doit valoir l'hôte appelé, ce qui démasque le routeur ;
 *   - chaque endpoint doit être sur cette même origine, sinon un document de
 *     métadonnées altéré pourrait nous faire envoyer le code d'autorisation
 *     ailleurs ;
 *   - `S256` doit être annoncé, parce que notre échange en dépend et qu'un
 *     serveur qui ne le supporte plus doit échouer bruyamment, pas se
 *     rabattre sur `plain`.
 */
export async function fetchMetadata(host: string): Promise<CorosMetadata> {
  const res = await fetch(`${host}/.well-known/oauth-authorization-server`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`COROS métadonnées indisponibles (${res.status})`);
  }
  const meta = (await res.json()) as CorosMetadata;

  if (meta.issuer !== host) {
    throw new Error(
      `COROS issuer inattendu : ${meta.issuer} au lieu de ${host}. ` +
        "Appeler l'hôte régional, jamais le routeur mcp.coros.com.",
    );
  }

  for (const [name, url] of [
    ["authorization_endpoint", meta.authorization_endpoint],
    ["token_endpoint", meta.token_endpoint],
  ] as const) {
    if (!url || new URL(url).origin !== host) {
      throw new Error(`COROS ${name} hors de l'origine ${host} : ${url}`);
    }
  }

  const methods = meta.code_challenge_methods_supported ?? [];
  if (!methods.includes("S256")) {
    throw new Error(
      `COROS n'annonce plus S256 (${methods.join(", ") || "aucune méthode"}). ` +
        "Arrêt volontaire : se rabattre sur plain reviendrait à désactiver PKCE.",
    );
  }

  return meta;
}

// ───────────────────────────────── PKCE ──────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Valeur aléatoire sûre, en base64url. 32 octets = 256 bits d'entropie. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Couple PKCE. Le `verifier` reste côté serveur, le `challenge` part dans
 * l'URL d'autorisation.
 *
 * C'est toute la mécanique : COROS ne nous délivrant pas de `client_secret`,
 * la preuve que l'échange du code vient bien de celui qui a initié
 * l'autorisation repose uniquement sur le fait que personne d'autre ne connaît
 * le `verifier`. Le transmettre au navigateur annulerait la protection.
 */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

// ───────────────────── Enregistrement dynamique du client ────────────────────

export interface RegisteredClient {
  client_id: string;
  scope: string;
}

/**
 * Enregistre Agon auprès d'un hôte régional (RFC 7591).
 *
 * À n'appeler qu'une fois par hôte : le `client_id` obtenu est conservé en
 * base (`provider_oauth_clients`). Réenregistrer à chaque autorisation
 * créerait un client COROS par connexion — inutile, et impossible à révoquer
 * proprement ensuite puisqu'on ne saurait plus lequel correspond à qui.
 */
export async function registerClient(
  meta: CorosMetadata,
  redirectUri: string,
): Promise<RegisteredClient> {
  if (!meta.registration_endpoint) {
    throw new Error("COROS n'annonce pas de registration_endpoint");
  }

  const res = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Agon",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: COROS_SCOPES,
      // Pas de secret à demander : COROS enregistre les clients en `none`.
      // Le réclamer ferait échouer l'enregistrement.
      token_endpoint_auth_method: "none",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `COROS enregistrement refusé (${res.status}) : ${(await res.text()).slice(0, 300)}`,
    );
  }

  const body = await res.json() as { client_id?: string; scope?: string };
  if (!body.client_id) throw new Error("COROS n'a pas renvoyé de client_id");

  return { client_id: body.client_id, scope: body.scope ?? COROS_SCOPES };
}

// ──────────────────────────── Échange de jetons ──────────────────────────────

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scopes: string[];
}

/**
 * Réponse non 2xx du point de jetons.
 *
 * Porte le statut HTTP et le code d'erreur OAuth (`error` du corps, RFC 6749
 * §5.2) pour que l'appelant distingue un refus définitif — `invalid_grant` :
 * le refresh token est mort, l'athlète doit reconnecter — d'une panne
 * passagère (5xx, 429), après laquelle il suffit de réessayer. Confondre les
 * deux fait afficher « reconnecte ta montre » à chaque hoquet de COROS.
 */
export class CorosTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly oauthError: string | null,
  ) {
    super(message);
    this.name = "CorosTokenError";
  }
}

/*
  Codes OAuth qui veulent dire « ce jeton ne marchera plus jamais ». Tout le
  reste (panne réseau, 5xx, 429, `invalid_request`, `temporarily_unavailable`,
  corps illisible) est traité comme passager.
*/
const REFRESH_REJECTED = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

/** Vrai si l'erreur est un refus explicite et définitif du renouvellement. */
export function isRefreshRejected(e: unknown): boolean {
  return e instanceof CorosTokenError &&
    e.oauthError !== null &&
    REFRESH_REJECTED.has(e.oauthError);
}

function oauthErrorCode(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    // Certains serveurs répondent `invalid_grant` en texte brut.
    const m = text.trim().match(/^([a-z_]+)$/);
    return m ? m[1] : null;
  }
}

async function postToken(
  tokenEndpoint: string,
  form: Record<string, string>,
): Promise<TokenSet> {
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });

  const text = await res.text();
  if (!res.ok) {
    /*
      Le corps est tronqué et le `form` n'est jamais journalisé : il contient
      le `code_verifier` et, au rafraîchissement, le `refresh_token`. Un jeton
      recopié dans les logs d'une Edge Function est un jeton qui survit à sa
      révocation.
    */
    throw new CorosTokenError(
      `COROS jeton refusé (${res.status}) : ${text.slice(0, 300)}`,
      res.status,
      oauthErrorCode(text),
    );
  }

  let body: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`COROS réponse de jeton illisible (${res.status})`);
  }
  if (!body.access_token) throw new Error("COROS n'a pas renvoyé d'access_token");

  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: typeof body.expires_in === "number"
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : undefined,
    /*
      Les scopes réellement accordés, pas ceux demandés. Si `offline_access`
      manque ici, la connexion s'éteindra à l'expiration du jeton d'accès, et
      mieux vaut le constater à la connexion que trois semaines plus tard.
    */
    scopes: (body.scope ?? "").split(/\s+/).filter(Boolean),
  };
}

export function exchangeCode(
  meta: CorosMetadata,
  params: { code: string; verifier: string; clientId: string; redirectUri: string },
): Promise<TokenSet> {
  return postToken(meta.token_endpoint, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
  });
}

export function refreshTokens(
  meta: CorosMetadata,
  params: { refreshToken: string; clientId: string },
): Promise<TokenSet> {
  return postToken(meta.token_endpoint, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
}

// ───────────────────────────── Outils MCP ────────────────────────────────────

/*
  Les noms d'outils, tels que documentés dans `coroslab/COROS-MCP`
  (`docs/en/tools.md`). Rassemblés ici parce qu'une faute de frappe dans un nom
  d'outil se manifeste par une erreur MCP opaque, et qu'un nom écrit deux fois
  dans le code finit par être corrigé une fois sur deux. Le premier essai avait
  d'ailleurs noté `getActivityList`, qui n'existe pas.
*/
export const COROS_TOOLS = {
  /** Liste d'activités, en prose. Utilisé seulement pour le diagnostic. */
  sportRecords: "querySportRecords",
  /** URL de téléchargement de fichiers FIT sur une plage de dates. */
  fitUrls: "queryActivityFitFileDownloadUrls",
  /** Données quotidiennes (sommeil, VFC, FC de repos, stress), en prose. */
  dailies: "queryDailyActivity",
} as const;

/*
  Quota de téléchargement de fichiers FIT, côté COROS : 50 par utilisateur et
  par 24 h, 10 par appel. Ce n'est pas un réglage de confort — le dépasser fait
  échouer les appels suivants, donc le rattrapage d'un historique d'un an est
  nécessairement étalé sur plusieurs jours.

  « 10 par appel » a une conséquence moins visible : une liste qui revient avec
  10 URL est peut-être tronquée. La synchronisation resserre alors la fenêtre
  de dates jusqu'à recevoir strictement moins de 10 URL, sinon les fichiers
  au-delà du dixième seraient sautés et le curseur avancerait par-dessus.

  Le décompte journalier est tenu en base (`provider_fit_quota`, par connexion
  et par jour UTC). COROS parle de « 24 h » sans préciser si la fenêtre est
  glissante : si elle l'est, un refus de quota peut survenir avant nos 50, et
  il est alors traité comme une erreur (curseur inchangé, quota du jour marqué
  épuisé), pas comme une liste vide.
*/
export const COROS_FIT_LIMITS = {
  perCall: 10,
  perDay: 50,
} as const;

/** Jour ISO (`YYYY-MM-DD`) d'une date, en UTC. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Décale un jour ISO de `days` jours. */
export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

/** Nombre de jours entre deux jours ISO (`b - a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Extrait les URL de fichiers FIT d'une réponse d'outil.
 *
 * Les outils MCP répondent en prose : il n'y a pas de champ à lire, seulement
 * un texte qui contient les URL. C'est le seul endroit où on se résout à
 * chercher dans du texte, et c'est acceptable ici précisément parce qu'une URL
 * est un jeton non ambigu — contrairement à « 12.03 km », dont le sens dépend
 * d'un séparateur, d'une unité et d'une langue.
 *
 * Les URL sont dédupliquées en conservant l'ordre : une même activité peut
 * apparaître deux fois si la réponse la mentionne dans un résumé puis dans une
 * liste, et télécharger deux fois le même fichier consommerait deux unités de
 * quota pour rien.
 */
export function extractFitUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>)\]}]+/g)) {
    // La ponctuation finale d'une phrase se colle à l'URL dans de la prose.
    const url = match[0].replace(/[.,;:!?]+$/, "");
    /*
      Filtre volontairement large : `.fit`, `.fit.gz`, ou un chemin qui
      mentionne `fit` (les URL présignées portent souvent le nom de fichier en
      paramètre de requête). Trop strict, on raterait des fichiers valides et
      l'athlète verrait son historique s'arrêter sans explication ; trop large,
      on télécharge une page HTML qui sera simplement rejetée par le décodeur,
      faute de signature `.FIT`.
    */
    if (!/fit/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }

  return out;
}

export interface FitWindow {
  from: string;
  to: string;
}

/**
 * Fenêtre de dates à demander ensuite, à partir d'où la synchronisation s'est
 * arrêtée.
 *
 * La fenêtre est bornée par `span` jours *et* par aujourd'hui. Demander une
 * plage ouverte serait plus simple, mais le quota est par fichier : une plage
 * d'un an renverrait trois cents URL dont on ne pourrait traiter que dix, et
 * il faudrait alors choisir lesquelles — c'est-à-dire créer des trous dans
 * l'historique dont personne ne saurait plus la cause. Avancer par fenêtres
 * datées garantit qu'il n'y a jamais de trou : seulement un bord qui progresse.
 */
export function planFitWindow(
  cursor: string,
  today: string,
  span: number,
): FitWindow | null {
  if (daysBetween(cursor, today) < 0) return null;
  const end = shiftDay(cursor, span - 1);
  return { from: cursor, to: daysBetween(end, today) < 0 ? today : end };
}

// ──────────────────────── Curseur et recouvrement ────────────────────────────

const maxDay = (a: string, b: string) => (a > b ? a : b);
const minDay = (a: string, b: string) => (a < b ? a : b);

/** Décalage UTC plausible (±14 h), en secondes. */
function plausibleOffset(s: number | null | undefined): s is number {
  return typeof s === "number" && Number.isFinite(s) && Math.abs(s) <= 14 * 3600;
}

/**
 * Dernier jour *terminé* : le curseur `synced_through` ne doit jamais aller
 * au-delà.
 *
 * Avancer le curseur jusqu'à aujourd'hui perdait toute sortie faite après la
 * synchronisation de la nuit : la journée était marquée « traitée » à 3 h 40,
 * et la course de 18 h n'était jamais redemandée.
 *
 * Fuseau connu (`utcOffsetS`, lu dans le dernier FIT de l'athlète) : la veille
 * de son jour local. Fuseau inconnu : le dernier jour terminé partout sur
 * Terre — une journée D finit au plus tard à D+1 12:00 UTC (UTC−12), donc
 * c'est le jour de `now − 36 h`.
 */
export function lastSettledDay(now: Date, utcOffsetS?: number | null): string {
  if (plausibleOffset(utcOffsetS)) {
    return shiftDay(ymd(new Date(now.getTime() + utcOffsetS * 1000)), -1);
  }
  return ymd(new Date(now.getTime() - 36 * 3600 * 1000));
}

export interface SyncPlan {
  /**
   * Fenêtre relue à chaque passage, terminée aujourd'hui : les derniers jours
   * terminés plus le jour en cours. Traitée en premier, parce que c'est ce que
   * le coach regarde le matin, même pendant un long rattrapage d'historique.
   */
  recent: FitWindow;
  /** Rattrapage entre le curseur et la fenêtre récente, s'il reste un écart. */
  backfill: FitWindow | null;
  /** Dernier jour terminé : borne haute du curseur. */
  settled: string;
  /** Dernier jour couvert sans trou au départ (curseur, ou veille du début d'historique). */
  coveredThrough: string;
  /** Curseur tel que lu en base (null = jamais synchronisé). */
  syncedThrough: string | null;
}

/**
 * Ce qu'un passage doit lister.
 *
 * La fenêtre récente recouvre volontairement des jours déjà couverts par le
 * curseur (`rescanDays` jours terminés avant `settled`) : une montre peut
 * remonter une sortie chez COROS avec plusieurs jours de retard, et la date de
 * l'activité est celle de la sortie, pas celle de la remontée. Les fichiers
 * relus sont reconnus à l'empreinte et ne créent pas de doublon ; ils coûtent
 * du quota, ce qui est le prix de ne pas perdre de sortie.
 */
export function planSync(p: {
  syncedThrough: string | null;
  historyStart: string;
  today: string;
  settled: string;
  rescanDays: number;
}): SyncPlan {
  const settled = minDay(p.settled, p.today);
  const coveredThrough = p.syncedThrough ?? shiftDay(p.historyStart, -1);
  const recentFrom = minDay(
    maxDay(p.historyStart, shiftDay(settled, -Math.max(0, p.rescanDays))),
    p.today,
  );
  const backfillFrom = shiftDay(coveredThrough, 1);
  return {
    recent: { from: recentFrom, to: p.today },
    backfill: backfillFrom < recentFrom
      ? { from: backfillFrom, to: shiftDay(recentFrom, -1) }
      : null,
    settled,
    coveredThrough,
    syncedThrough: p.syncedThrough,
  };
}

/**
 * Nouvelle valeur du curseur après un passage.
 *
 * `backfillThrough` / `recentThrough` : dernier jour de la fenêtre traité *en
 * entier et sans erreur*, depuis le début de cette fenêtre (null = rien).
 * Le curseur n'avance que sur une couverture contiguë, ne recule jamais, et ne
 * dépasse jamais le dernier jour terminé.
 */
export function nextSyncedThrough(
  plan: SyncPlan,
  done: { backfillThrough: string | null; recentThrough: string | null },
): string | null {
  let covered = plan.coveredThrough;
  if (plan.backfill && done.backfillThrough) {
    covered = maxDay(covered, minDay(done.backfillThrough, plan.backfill.to));
  }
  if (done.recentThrough && covered >= shiftDay(plan.recent.from, -1)) {
    covered = maxDay(covered, minDay(done.recentThrough, plan.settled));
  }
  if (covered === plan.coveredThrough) return plan.syncedThrough;
  return covered;
}

// ─────────────────── Réponse de l'outil de liste des FIT ─────────────────────

export type FitListing =
  | { kind: "urls"; urls: string[] }
  | { kind: "empty" }
  | { kind: "error"; reason: string; quota: boolean };

const QUOTA_RE = /quota|rate.?limit|too many requests|limit (?:exceeded|reached)|exceed/i;
const EMPTY_RE =
  /\bno\s+(?:\w+\s+){0,2}(?:activit|record|data|file|fit|workout|sport)|\bnot found\b|\bnone\b|\b0\s+(?:\w+\s+)?(?:activit|record|file)|aucun/i;
const ERRORISH_RE =
  /\berror\b|\binvalid\b|\bfail|unauthori[sz]ed|forbidden|denied|expired|exception|\bmissing\b|\brequired\b|\bnot allowed\b/i;

/**
 * Distingue une vraie réponse vide d'une erreur.
 *
 * Traiter une erreur (quota, paramètre refusé, texte d'erreur en prose sans
 * `isError`) comme « 0 fichier » faisait avancer le curseur par-dessus des
 * jours jamais lus : un trou définitif. Dans le doute, c'est une erreur — le
 * pire cas est alors un curseur qui n'avance pas et un `last_error` lisible,
 * pas une sortie perdue sans trace.
 */
export function classifyFitListing(result: { text: string; isError: boolean }): FitListing {
  const text = result.text ?? "";
  const urls = extractFitUrls(text);

  if (!result.isError && urls.length > 0) return { kind: "urls", urls };

  const reason = text.trim().slice(0, 300) || (result.isError ? "erreur sans message" : "");
  if (QUOTA_RE.test(text)) return { kind: "error", reason, quota: true };

  if (result.isError) {
    return EMPTY_RE.test(text) && !ERRORISH_RE.test(text)
      ? { kind: "empty" }
      : { kind: "error", reason, quota: false };
  }

  return ERRORISH_RE.test(text) ? { kind: "error", reason, quota: false } : { kind: "empty" };
}

// ──────────────────── Paramètres de dates des outils MCP ─────────────────────

interface JsonSchemaProp {
  type?: string | string[];
  format?: string;
  pattern?: string;
  description?: string;
  maximum?: number;
}

/** Ce que `tools/list` publie pour un outil (seuls les champs lus ici). */
export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, JsonSchemaProp>;
    required?: string[];
  };
}

/** `iso` = 2026-11-07, `compact` = "20261107", `int` = 20261107. */
export type DateFormat = "iso" | "compact" | "int";

export interface DateArgsSpec {
  tool: string;
  /** Début de période ; vaut `end` en mode « un seul jour » (`single`). */
  start: string;
  end: string;
  /** L'outil ne prend qu'un jour (`date` / `day`), pas une plage. */
  single: boolean;
  format: DateFormat;
  /** Paramètre de taille de page, seulement s'il est publié. */
  limitKey: string | null;
  /**
   * Outil « les N derniers jours » (`days`), sans dates : un seul appel couvre
   * la période, et la réponse n'est pas ventilée par jour. Observé sur
   * `queryDailyHealthData` à la première connexion réelle (2026-11-09).
   */
  lookbackKey?: string;
  /** Plafond publié par le schéma pour ce paramètre (`maximum`), s'il existe. */
  lookbackMax?: number;
}

/** Le schéma publié ne permet pas d'appeler l'outil sans deviner. */
export class CorosSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorosSchemaError";
  }
}

const START_RE = /^(start|begin|from)[_-]?(date|day|time)?$/i;
const END_RE = /^(end|to|until)[_-]?(date|day|time)?$/i;
const LIMIT_RE = /^(limit|page[_-]?size|size|max[_-]?results|count)$/i;
const DAY_RE = /^(date|day|query[_-]?date)$/i;
const LOOKBACK_RE = /^(days?|num[_-]?(of[_-]?)?days|number[_-]?of[_-]?days|lookback[_-]?days)$/i;

function dateFormatOf(name: string, prop: JsonSchemaProp, tool: string): DateFormat {
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];
  const hint = `${prop.description ?? ""} ${prop.format ?? ""} ${prop.pattern ?? ""}`;
  const numeric = types.includes("integer") || types.includes("number");

  if (/timestamp|epoch|milli|seconds|unix/i.test(hint) || (numeric && /time/i.test(name))) {
    throw new CorosSchemaError(
      `${tool}.${name} attend un horodatage (${hint.trim() || "type " + types.join("/")}) : format non pris en charge, à câbler explicitement.`,
    );
  }
  if (numeric) return "int";
  if (/yyyymmdd/i.test(hint) || /\\d\{8\}|\[0-9\]\{8\}/.test(prop.pattern ?? "")) return "compact";
  return "iso";
}

/**
 * Noms et format des paramètres de dates d'un outil, lus dans le schéma qu'il
 * publie.
 *
 * Les noms d'outils sont déjà résolus contre `tools/list` ; les paramètres
 * l'étaient d'après la documentation (`startDate` / `endDate`), jamais
 * vérifiés. Un nom de paramètre faux est ignoré en silence par beaucoup de
 * serveurs, qui répondent alors sur leur plage par défaut (7 jours chez
 * COROS) : la synchronisation « marcherait » et sauterait l'historique. D'où
 * une erreur explicite plutôt qu'une supposition.
 */
export function resolveDateArgs(
  tool: ToolDescriptor,
  opts: { allowSingleDay?: boolean } = {},
): DateArgsSpec {
  const props = tool.inputSchema?.properties;
  if (!props || Object.keys(props).length === 0) {
    throw new CorosSchemaError(
      `${tool.name} ne publie pas le schéma de ses paramètres : impossible de savoir comment lui passer une plage de dates.`,
    );
  }
  const names = Object.keys(props);
  const start = names.find((n) => START_RE.test(n));
  const end = names.find((n) => END_RE.test(n));
  const day = names.find((n) => DAY_RE.test(n));

  /*
    Un outil « un jour à la fois » (données quotidiennes) : acceptable quand
    l'appelant ne demande qu'un jour par appel, jamais pour les FIT, qu'on
    liste par fenêtres de plusieurs jours.
  */
  if ((!start || !end) && day && opts.allowSingleDay) {
    const format = dateFormatOf(day, props[day], tool.name);
    const unknown = (tool.inputSchema?.required ?? []).filter((r) => r !== day);
    if (unknown.length > 0) {
      throw new CorosSchemaError(
        `${tool.name} exige des paramètres que la synchronisation ne sait pas remplir : ${unknown.join(", ")}.`,
      );
    }
    return { tool: tool.name, start: day, end: day, single: true, format, limitKey: null };
  }

  /*
    Outil « N derniers jours » : un paramètre `days`, pas de dates. Réservé aux
    données quotidiennes (jamais aux FIT, qu'on liste par fenêtres datées).
  */
  const lookback = names.find((n) => LOOKBACK_RE.test(n));
  if ((!start || !end) && !day && lookback && opts.allowSingleDay) {
    const unknown = (tool.inputSchema?.required ?? []).filter((r) => r !== lookback);
    if (unknown.length > 0) {
      throw new CorosSchemaError(
        `${tool.name} exige des paramètres que la synchronisation ne sait pas remplir : ${unknown.join(", ")}.`,
      );
    }
    const max = props[lookback].maximum;
    return {
      tool: tool.name,
      start: lookback,
      end: lookback,
      single: true,
      format: "int",
      limitKey: null,
      lookbackKey: lookback,
      lookbackMax: typeof max === "number" && max > 0 ? max : undefined,
    };
  }

  if (!start || !end) {
    throw new CorosSchemaError(
      `${tool.name} : paramètres de début / fin de période introuvables dans le schéma publié (${names.join(", ")}).`,
    );
  }

  const format = dateFormatOf(start, props[start], tool.name);
  const endFormat = dateFormatOf(end, props[end], tool.name);
  if (endFormat !== format) {
    throw new CorosSchemaError(
      `${tool.name} : ${start} et ${end} n'ont pas le même format (${format} / ${endFormat}).`,
    );
  }

  const limitKey = names.find((n) => LIMIT_RE.test(n)) ?? null;

  const unknownRequired = (tool.inputSchema?.required ?? [])
    .filter((r) => r !== start && r !== end && r !== limitKey);
  if (unknownRequired.length > 0) {
    throw new CorosSchemaError(
      `${tool.name} exige des paramètres que la synchronisation ne sait pas remplir : ${unknownRequired.join(", ")}.`,
    );
  }

  return { tool: tool.name, start, end, single: false, format, limitKey };
}

/** Arguments d'appel d'un outil « N derniers jours » (`spec.lookbackKey`). */
export function buildLookbackArgs(spec: DateArgsSpec, days: number): Record<string, unknown> {
  if (!spec.lookbackKey) {
    throw new CorosSchemaError(`${spec.tool} n'est pas un outil « N derniers jours ».`);
  }
  const n = Math.max(1, Math.min(days, spec.lookbackMax ?? days));
  return { [spec.lookbackKey]: n };
}

/** Arguments d'appel pour une plage `from`–`to` (jours ISO inclus). */
export function buildDateArgs(
  spec: DateArgsSpec,
  from: string,
  to: string,
  limit?: number,
): Record<string, unknown> {
  const fmt = (d: string): string | number =>
    spec.format === "iso" ? d : spec.format === "compact" ? d.replace(/-/g, "") : Number(d.replace(/-/g, ""));
  if (spec.single && from !== to) {
    throw new CorosSchemaError(`${spec.tool} ne prend qu'un jour à la fois (${from} → ${to} demandé).`);
  }
  const args: Record<string, unknown> = spec.single
    ? { [spec.start]: fmt(from) }
    : { [spec.start]: fmt(from), [spec.end]: fmt(to) };
  if (spec.limitKey && typeof limit === "number") args[spec.limitKey] = limit;
  return args;
}

/**
 * Révoque un jeton chez COROS.
 *
 * Renvoie `true` si COROS a confirmé. Un échec n'est pas une erreur fatale
 * pour l'appelant : le droit de l'athlète à se déconnecter ne dépend pas de la
 * disponibilité de COROS. Mais il doit être remonté, parce que « j'ai effacé
 * ma copie du jeton » et « l'accès est coupé » ne sont pas la même chose.
 */
export async function revokeToken(
  meta: CorosMetadata,
  params: { token: string; clientId: string },
): Promise<boolean> {
  if (!meta.revocation_endpoint) return false;
  try {
    const res = await fetch(meta.revocation_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: params.token,
        client_id: params.clientId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
