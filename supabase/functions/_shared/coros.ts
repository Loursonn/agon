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
    throw new Error(`COROS jeton refusé (${res.status}) : ${text.slice(0, 300)}`);
  }

  const body = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
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
