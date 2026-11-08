/**
 * Stockage clé-valeur hérité `app_data` (clés `asp:*` par athlète).
 *
 * Bas niveau : lu et écrit par `src/lib/storage.ts` (garde « clé non chargée »)
 * et `useAthletePersistedState`. Les entités déjà migrées (wellness, nutrition…)
 * ont leurs propres lectures et RPC atomiques : ne pas réécrire leurs clés ici.
 */
import { check, db, unwrap, unwrapRows } from "./client";

export interface AppDataRead<T> {
  /** false : la clé n'existe pas encore pour cet athlète. */
  found: boolean;
  value: T | undefined;
}

/** Lit une clé. Lève une `ApiError` si la lecture échoue (≠ clé absente). */
export async function readAppData<T>(athleteId: string, key: string): Promise<AppDataRead<T>> {
  const row = unwrap<{ value: unknown }>(
    (await db().from("app_data").select("value").eq("athlete_id", athleteId).eq("key", key).maybeSingle()) as never,
    `Lecture de ${key} impossible`,
  );
  return row ? { found: true, value: row.value as T } : { found: false, value: undefined };
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
