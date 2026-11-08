/**
 * Cache hors ligne de React Query : règles pures (testées).
 *
 * Le cache des requêtes réussies est copié dans IndexedDB pour que l'athlète
 * retrouve sa séance, son programme et son historique sans réseau. Ce fichier
 * décide QUOI est gardé, SOUS QUELLE CLÉ et COMBIEN DE TEMPS ; le branchement
 * (IndexedDB, Supabase Auth) est dans `offlinePersistence.ts`.
 *
 * Données de santé sur un appareil potentiellement partagé :
 * - une entrée par utilisateur (`cacheKeyFor`), une seule présente à la fois ;
 * - tout est effacé à la déconnexion (`clearOfflineCache`).
 */

/** Durée de vie d'une copie persistée ET `gcTime` des requêtes (sinon une
 *  requête inactive quitterait la mémoire avant d'être recopiée). */
export const OFFLINE_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/** Délai entre deux écritures IndexedDB (le cache change souvent). */
export const OFFLINE_PERSIST_THROTTLE_MS = 1000;

/** Au-delà, on démarre sans cache plutôt que d'attendre un IndexedDB bloqué
 *  (bug connu de Safari iOS : l'ouverture de la base peut ne jamais répondre). */
export const OFFLINE_RESTORE_TIMEOUT_MS = 3000;

const KEY_PREFIX = "agon-rq:";

/** Clé IndexedDB du cache d'un utilisateur. */
export function cacheKeyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function isCacheKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(KEY_PREFIX);
}

/**
 * Version du cache : change à chaque build (commit Vercel ou horodatage). Un
 * cache écrit par une autre version est jeté, car la forme des données peut
 * avoir changé (migration `src/api/` en cours).
 */
export function appBuster(buildId: string | undefined): string {
  return `agon:${buildId && buildId.trim() ? buildId.trim() : "dev"}`;
}

/**
 * Requêtes jamais persistées, par préfixe de clé :
 * - URL signées (expirent en 1 h, inutiles hors ligne ; photos corporelles) ;
 * - jetons d'invitation / de rattachement (parcours sans compte) ;
 * - clés d'API coach.
 * Une requête peut aussi s'exclure elle-même avec `meta: { persist: false }`.
 */
export const NEVER_PERSIST: readonly (readonly string[])[] = [
  ["docs", "signed-url"],
  ["measurementPhotoUrls"],
  ["coach-api-keys"],
  ["claimInfo"],
  ["staff", "invitation"],
];

function startsWith(key: readonly unknown[], prefix: readonly string[]): boolean {
  return prefix.every((part, i) => key[i] === part);
}

/** Ce dont le filtre a besoin d'une `Query` (permet de tester sans QueryClient). */
export interface PersistCandidate {
  queryKey: readonly unknown[];
  state: { status: string; data?: unknown };
  meta?: Record<string, unknown>;
}

/** `shouldDehydrateQuery` : seulement les requêtes réussies et autorisées. */
export function shouldPersistQuery(query: PersistCandidate): boolean {
  if (query.state.status !== "success") return false;
  if (query.state.data === undefined) return false;
  if (query.meta?.persist === false) return false;
  return !NEVER_PERSIST.some((prefix) => startsWith(query.queryKey, prefix));
}

/** Date de la donnée la plus récente du cache (pour « données du … »). */
export function latestDataTimestamp(
  queries: readonly { state: { status: string; dataUpdatedAt: number } }[],
): number | null {
  let max = 0;
  for (const q of queries) {
    if (q.state.status === "success" && q.state.dataUpdatedAt > max) max = q.state.dataUpdatedAt;
  }
  return max > 0 ? max : null;
}

/** « 08/11 14:32 » (heure locale). */
export function formatOfflineStamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Utilisateur de la session Supabase enregistrée, lu SANS réseau.
 *
 * Nécessaire au démarrage : `getSession()` tente de rafraîchir un jeton expiré
 * et renvoie `null` hors ligne, alors que la session est toujours là. On lit
 * donc directement l'entrée `sb-<projet>-auth-token` écrite par supabase-js.
 */
export function readStoredAuthUser(
  storage: Pick<Storage, "getItem"> | null | undefined,
  supabaseUrl: string | undefined,
): ({ id: string } & Record<string, unknown>) | null {
  if (!storage || !supabaseUrl) return null;
  let ref: string;
  try {
    ref = new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return null;
  }
  try {
    const raw = storage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: Record<string, unknown>; currentSession?: { user?: Record<string, unknown> } };
    const user = parsed?.user ?? parsed?.currentSession?.user;
    return user && typeof user.id === "string" && user.id ? (user as { id: string } & Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Id de l'utilisateur de la session enregistrée (voir `readStoredAuthUser`). */
export function readStoredAuthUserId(
  storage: Pick<Storage, "getItem"> | null | undefined,
  supabaseUrl: string | undefined,
): string | null {
  return readStoredAuthUser(storage, supabaseUrl)?.id ?? null;
}

/**
 * Dernière fiche profil connue, pour ouvrir l'app sans réseau (sinon « Profil
 * introuvable »). Une seule fiche sur l'appareil, celle de l'utilisateur
 * connecté ; effacée à la déconnexion.
 */
const PROFILE_KEY = "agon:offline-profile";

export function saveOfflineProfile(storage: Pick<Storage, "setItem"> | null | undefined, userId: string, profile: unknown): void {
  try {
    storage?.setItem(PROFILE_KEY, JSON.stringify({ userId, profile }));
  } catch {
    /* stockage plein ou bloqué : tant pis, le réseau reste la source */
  }
}

export function readOfflineProfile<T>(storage: Pick<Storage, "getItem"> | null | undefined, userId: string): T | null {
  try {
    const raw = storage?.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown; profile?: T };
    return parsed?.userId === userId && parsed.profile ? parsed.profile : null;
  } catch {
    return null;
  }
}

export function clearOfflineProfile(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  try {
    storage?.removeItem(PROFILE_KEY);
  } catch {
    /* rien à effacer */
  }
}
