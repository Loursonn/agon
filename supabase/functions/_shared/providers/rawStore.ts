/**
 * Stockage intégral de ce qu'envoie un fournisseur (décision Hugo, 09/11/2026) :
 * tout garder, analyser plus tard.
 *
 *   - `provider_raw_records` : une ligne par résumé reçu, JSON complet ;
 *   - bucket privé `provider-raw` : ce qui est trop lourd pour une ligne —
 *       <athlete>/<source>/<type>/<summaryId>.json.gz  échantillons seconde par seconde
 *       <athlete>/<source>/<type>/<summaryId>.<ext>    fichier d'origine (.fit…)
 *
 * Pur (aucune dépendance Deno) : la base et Storage sont injectés.
 */
import type { Db } from "../oauth.ts";

export const RAW_BUCKET = "provider-raw";

type StorageResult = PromiseLike<{ error: { message: string } | null }>;

/** Le strict nécessaire de `supabase.storage` (testable sans supabase-js). */
export interface RawStorage {
  from(bucket: string): {
    upload(path: string, body: Uint8Array, opts: { contentType: string; upsert: boolean }): StorageResult;
    remove(paths: string[]): StorageResult;
  };
}

/** Storage du client service_role, s'il en a un. */
export function storageOf(db: Db): RawStorage | null {
  const s = (db as { storage?: RawStorage }).storage;
  return s && typeof s.from === "function" ? s : null;
}

/** Segment de chemin sûr (pas de « / », de « .. » ni de caractères exotiques). */
export function safeSegment(v: string): string {
  const s = v.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 150);
  return s === "" ? "_" : s;
}

export function rawPath(athleteId: string, source: string, type: string, id: string, ext: string): string {
  return `${athleteId}/${source}/${safeSegment(type)}/${safeSegment(id)}.${ext}`;
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function putRaw(storage: RawStorage, path: string, body: Uint8Array, contentType: string): Promise<void> {
  const { error } = await storage.from(RAW_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`stockage du fichier brut : ${error.message}`);
}

/**
 * Supprime les fichiers bruts d'un athlète pour une source (et des types
 * donnés, sinon tous). Lève en cas d'échec : un effacement demandé ne doit pas
 * être annoncé comme fait s'il ne l'est pas.
 */
export async function removeRawFiles(
  db: Db,
  athleteId: string,
  source: string,
  types: readonly string[] | null = null,
): Promise<number> {
  const { data, error } = await db.rpc("provider_raw_objects", {
    p_athlete: athleteId,
    p_provider: source,
    p_types: types ? [...types] : null,
  });
  if (error) throw new Error(`liste des fichiers bruts : ${error.message}`);
  const names = ((data ?? []) as Array<{ object_name: string }>).map((o) => o.object_name);
  if (names.length === 0) return 0;
  const storage = storageOf(db);
  if (!storage) throw new Error("suppression des fichiers bruts : Storage indisponible");
  for (let i = 0; i < names.length; i += 100) {
    const { error: e } = await storage.from(RAW_BUCKET).remove(names.slice(i, i + 100));
    if (e) throw new Error(`suppression des fichiers bruts : ${e.message}`);
  }
  return names.length;
}
