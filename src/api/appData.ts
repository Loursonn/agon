/**
 * Stockage clé-valeur hérité `app_data` (clés `asp:*` par athlète).
 *
 * Bas niveau : lu et écrit par `src/lib/storage.ts` (garde « clé non chargée »)
 * et `useAthletePersistedState`. Les entités déjà migrées (wellness, nutrition…)
 * ont leurs propres lectures et RPC atomiques : ne pas réécrire leurs clés ici.
 */
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

export interface AppDataRead<T> {
  /** false : la clé n'existe pas encore pour cet athlète. */
  found: boolean;
  value: T | undefined;
}

/**
 * Lectures d'une clé demandées dans la même passe (même tâche JS) pour le même
 * athlète : envoyées ensemble, en une requête. Au démarrage, contexte athlète,
 * programme, nutrition, retours, calendrier lisent chacun leur clé au même
 * moment : une requête au lieu de sept (base de prod sur le plan gratuit).
 */
interface PendingRead {
  key: string;
  resolve: (r: AppDataRead<unknown>) => void;
  reject: (e: unknown) => void;
}
const pendingReads = new Map<string, PendingRead[]>();

async function flushReads(athleteId: string): Promise<void> {
  const batch = pendingReads.get(athleteId) ?? [];
  pendingReads.delete(athleteId);
  const keys = [...new Set(batch.map((p) => p.key))];
  try {
    let values: Record<string, unknown>;
    if (keys.length === 1) {
      const row = unwrap<{ value: unknown }>(
        (await db().from("app_data").select("value").eq("athlete_id", athleteId).eq("key", keys[0]).maybeSingle()) as never,
        `Lecture de ${keys[0]} impossible`,
      );
      values = row ? { [keys[0]]: row.value } : {};
    } else {
      values = await readAppDataKeys(athleteId, keys);
    }
    for (const p of batch) {
      p.resolve(p.key in values ? { found: true, value: values[p.key] } : { found: false, value: undefined });
    }
  } catch (e) {
    for (const p of batch) {
      p.reject(keys.length === 1 ? e : new ApiError(`Lecture de ${p.key} impossible`, {
        message: e instanceof Error ? e.message : String(e),
        code: (e as { code?: string } | null)?.code,
      }));
    }
  }
}

/**
 * Lit une clé. Lève une `ApiError` si la lecture échoue (≠ clé absente).
 * Regroupée avec les autres lectures de la même passe (voir plus haut).
 */
export function readAppData<T>(athleteId: string, key: string): Promise<AppDataRead<T>> {
  return new Promise<AppDataRead<T>>((resolve, reject) => {
    let queue = pendingReads.get(athleteId);
    if (!queue) {
      queue = [];
      pendingReads.set(athleteId, queue);
      // Microtâche : jamais retardée par de faux minuteurs (tests), et lancée
      // dès que le code synchrone en cours (effets React…) a fini.
      void Promise.resolve().then(() => flushReads(athleteId));
    }
    queue.push({ key, resolve: resolve as (r: AppDataRead<unknown>) => void, reject });
  });
}

/**
 * Valeur d'une clé (`null` si absente), pour les modules qui ne distinguent
 * pas. En erreur, lève une `ApiError` au libellé `what`.
 */
export async function readAppDataValue(athleteId: string, key: string, what: string): Promise<unknown> {
  let r: AppDataRead<unknown>;
  try {
    r = await readAppData<unknown>(athleteId, key);
  } catch (e) {
    throw new ApiError(what, { message: e instanceof Error ? e.message : String(e), code: (e as { code?: string } | null)?.code });
  }
  return r.found ? (r.value ?? null) : null;
}

/** Écrit (remplace) la valeur entière d'une clé. */
export async function writeAppData(athleteId: string, key: string, value: unknown): Promise<void> {
  check(
    await db().from("app_data").upsert(
      { athlete_id: athleteId, key, value: value as never, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,key" },
    ),
    `Enregistrement de ${key} impossible`,
  );
}

/** Plusieurs clés d'un coup : `{ clé: valeur }`, clés absentes omises. Lève en cas d'erreur. */
export async function readAppDataKeys(athleteId: string, keys: readonly string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const rows = unwrapRows<{ key: string; value: unknown }>(
    (await db().from("app_data").select("key, value").eq("athlete_id", athleteId).in("key", [...keys])) as never,
    "Lecture des données de l'athlète impossible",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
