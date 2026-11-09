/**
 * Contrôle de version au démarrage (P4).
 *
 * Le build écrit `/version.json` ({ id, builtAt }) et injecte les mêmes valeurs
 * dans le bundle. Le client relit ce fichier sans cache : s'il est plus récent
 * que le bundle en cours, il met à jour le service worker puis recharge, mais
 * jamais pendant une saisie ni tant que des écritures attendent le réseau.
 *
 * Tout ce fichier est pur (aucun accès à `window`) : `UpdatePrompt` fait le lien.
 */

export interface BuildInfo {
  /** SHA du commit Vercel, sinon `local-<horodatage>`. */
  id: string;
  /** Millisecondes epoch du build : seul moyen d'ordonner deux builds (un SHA n'a pas d'ordre). */
  builtAt: number;
}

export const VERSION_URL = "/version.json";

/** Entre deux contrôles déclenchés par le retour au premier plan. */
export const VERSION_CHECK_MIN_GAP_MS = 30 * 1000;
/** Une fois une nouvelle version détectée mais pas applicable, on réessaie à ce rythme. */
export const VERSION_RETRY_MS = 10 * 1000;

/** Lit un `version.json` ; `null` si absent, mal formé ou renvoyé par la réécriture SPA (HTML). */
export function parseBuildInfo(raw: unknown): BuildInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const { id, builtAt } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof builtAt !== "number" || !Number.isFinite(builtAt) || builtAt <= 0) return null;
  return { id, builtAt };
}

/** La version servie est-elle plus récente que celle du bundle en cours ? */
export function isNewerBuild(served: BuildInfo | null, current: BuildInfo | null): boolean {
  if (!served || !current) return false;
  if (served.id === current.id) return false;
  return served.builtAt > current.builtAt;
}

/**
 * Écrans où l'athlète saisit une séance : un rechargement y est interdit
 * (les brouillons locaux protègent la saisie, mais on ne coupe pas quelqu'un en plein effort).
 */
export function isEntryRoute(pathname: string): boolean {
  return (
    /^\/athlete\/program\/workout\/[^/]+/.test(pathname) ||
    /^\/athlete\/specific\/[^/]+/.test(pathname) ||
    /^\/athlete\/log(\/|$)/.test(pathname)
  );
}

export function canReloadNow(state: { pendingWrites: number; pathname: string }): boolean {
  return state.pendingWrites === 0 && !isEntryRoute(state.pathname);
}

/** Évite de relire `version.json` à chaque basculement d'onglet. */
export function shouldCheckNow(lastCheckAt: number | null, now: number, minGapMs = VERSION_CHECK_MIN_GAP_MS): boolean {
  return lastCheckAt === null || now - lastCheckAt >= minGapMs;
}

/** Lit `/version.json` sans cache ; `null` hors ligne ou si la réponse n'est pas un build valide. */
export async function fetchServedBuild(fetchFn: typeof fetch = fetch): Promise<BuildInfo | null> {
  try {
    const res = await fetchFn(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return parseBuildInfo(await res.json());
  } catch {
    return null;
  }
}

/** Version du bundle en cours (constantes injectées au build) ; `null` hors build Vite. */
export function currentBuild(): BuildInfo | null {
  if (typeof __APP_BUILD_ID__ === "undefined" || typeof __APP_BUILD_TIME__ === "undefined") return null;
  return parseBuildInfo({ id: __APP_BUILD_ID__, builtAt: __APP_BUILD_TIME__ });
}
