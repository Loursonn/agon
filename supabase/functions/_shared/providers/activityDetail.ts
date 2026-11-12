/**
 * Range le détail d'une activité Garmin (série, tours, séries de muscu) à
 * partir du brut déjà stocké : fichier FIT (`activityFiles`) de préférence,
 * sinon échantillons JSON (`activityDetails`).
 *
 * Appelé à la réception (garminIngest), quel que soit l'ordre d'arrivée des
 * trois notifications (`activities`, `activityDetails`, `activityFiles`), et
 * par le rattrapage. Idempotent : `activity_detail_upsert` remplace la série
 * et ne touche pas aux tours qu'un humain a modifiés.
 */
import type { Db } from "../oauth.ts";
import { normalizeActivity } from "../activityFiles/normalize.ts";
import { detailPayload, type NormalizedActivity } from "../activityFiles/stream.ts";
import { gunzip, RAW_BUCKET } from "./rawStore.ts";

type Download = (path: string) => Promise<Uint8Array | null>;

/** Lecture d'un objet du bucket `provider-raw` via le client service_role. */
export function rawDownloader(db: Db): Download | null {
  const storage = (db as {
    storage?: { from(b: string): { download(p: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }> } };
  }).storage;
  if (!storage || typeof storage.from !== "function") return null;
  return async (path) => {
    const { data, error } = await storage.from(RAW_BUCKET).download(path);
    if (error) throw new Error(`lecture du brut : ${error.message}`);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };
}

export type DetailOutcome = "stored" | "no_activity" | "no_raw";

/** Normalise le meilleur brut disponible pour une activité Garmin. */
export async function garminDetailFromRaw(
  db: Db,
  download: Download,
  athleteId: string,
  garminActivityId: string,
): Promise<NormalizedActivity | null> {
  const { data, error } = await db.from("provider_raw_records")
    .select("summary_type, payload, samples_path, file_path, file_type")
    .eq("athlete_id", athleteId)
    .eq("source", "garmin")
    .in("summary_type", ["activityFiles", "activityDetails"])
    .eq("payload->>activityId", garminActivityId);
  if (error) throw new Error(`brut de l'activité : ${error.message}`);
  const rows = (data ?? []) as Array<{
    summary_type: string;
    payload: Record<string, unknown>;
    samples_path: string | null;
    file_path: string | null;
    file_type: string | null;
  }>;

  const fit = rows.find((r) => r.summary_type === "activityFiles" && r.file_path && (r.file_type ?? "FIT") === "FIT");
  if (fit?.file_path) {
    const bytes = await download(fit.file_path);
    if (bytes) return normalizeActivity({ kind: "fit", bytes });
  }
  const json = rows.find((r) => r.summary_type === "activityDetails" && r.samples_path);
  if (json?.samples_path) {
    const gz = await download(json.samples_path);
    if (gz) {
      const samples = JSON.parse(new TextDecoder().decode(await gunzip(gz))) as Array<Record<string, unknown>>;
      const payload = json.payload ?? {};
      return normalizeActivity({
        kind: "garmin_json",
        samples,
        laps: Array.isArray(payload.laps) ? payload.laps as Array<Record<string, unknown>> : null,
        summary: (payload.summary ?? null) as Record<string, unknown> | null,
      });
    }
  }
  return null;
}

/** Construit et range le détail d'une activité Garmin, si l'activité et le brut sont là. */
export async function refreshGarminActivityDetail(
  db: Db,
  athleteId: string,
  garminActivityId: string,
  download: Download | null = rawDownloader(db),
): Promise<DetailOutcome> {
  if (!download) throw new Error("détail d'activité : Storage indisponible");
  const { data: act, error } = await db.from("provider_activities")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("source", "garmin")
    .eq("external_id", garminActivityId)
    .maybeSingle();
  if (error) throw new Error(`activité : ${error.message}`);
  if (!act) return "no_activity";
  const detail = await garminDetailFromRaw(db, download, athleteId, garminActivityId);
  if (!detail) return "no_raw";
  const { error: e2 } = await db.rpc("activity_detail_upsert", {
    p_activity: (act as { id: string }).id,
    p_detail: detailPayload(detail),
  });
  if (e2) throw new Error(`détail d'activité : ${e2.message}`);
  return "stored";
}

/** Identifiant d'activité Garmin porté par une entrée de notification. */
export function garminActivityIdOf(entry: Record<string, unknown>): string | null {
  const v = entry.activityId ?? (entry.summary as Record<string, unknown> | undefined)?.activityId;
  return typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? String(v) : null;
}
