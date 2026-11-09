/**
 * Traitement des notifications Garmin stockées dans `provider_webhook_inbox`.
 *
 * Appelé après la réponse 200 du webhook (`EdgeRuntime.waitUntil`) et par le
 * cron `garmin-maintenance` pour ce qui n'a pas abouti. Idempotent : rejouer
 * une ligne ne crée rien de plus (upsert sur la clé d'unicité, fusion par
 * type pour les données quotidiennes).
 *
 * Tout résumé reçu d'un athlète connecté est d'abord stocké tel quel
 * (`provider_raw_records`, échantillons et fichiers .FIT dans le bucket
 * `provider-raw`), qu'Agon sache l'exploiter ou non. Ensuite seulement, les
 * types connus alimentent `provider_activities` et `provider_dailies`.
 *
 * Aucune dépendance Deno : la base, la recherche de doublons inter-sources et
 * le téléchargement des fichiers sont injectés (voir `garminIngestDeps.ts`),
 * ce qui rend le module testable par Vitest.
 */
import type { Db, FetchLike } from "../oauth.ts";
import { canonicalJson, forgetProvider, sha256Hex } from "../oauth.ts";
import {
  ACTIVITY_PERMISSION_TYPES,
  ACTIVITY_TYPES,
  DAILY_TYPES,
  GARMIN_PERMISSIONS,
  RAW_FILE_TYPES,
  isPingEntry,
  mapGarminActivity,
  mapGarminDaily,
  normalizePermissions,
  permissionFor,
} from "./garmin.ts";
import { gzip, putRaw, rawPath, removeRawFiles, storageOf } from "./rawStore.ts";

export interface InboxRow {
  id: string;
  type: string;
  external_user_id: string | null;
  payload: Record<string, unknown>;
}

export interface DedupCandidate {
  athleteId: string;
  sport: string | null;
  startedAt: string;
  externalId?: string | null;
}

export type FindDuplicate = (
  db: Db,
  c: DedupCandidate,
) => Promise<{ id: string; source: string } | null>;

/**
 * Télécharge un fichier d'activité (.FIT…) depuis l'URL de rappel Garmin.
 * Renvoie `null` si Garmin répond 410 (déjà téléchargé ou expiré : l'URL vaut
 * 24 h et un seul téléchargement).
 */
export type DownloadActivityFile = (url: string, connectionId: string) => Promise<Uint8Array | null>;

export interface IngestDeps {
  db: Db;
  findDuplicate: FindDuplicate;
  downloadActivityFile?: DownloadActivityFile;
  now?: () => Date;
}

/** Fichier d'activité : 100 Mo au plus (limite du bucket). */
const MAX_ACTIVITY_FILE_BYTES = 100 * 1024 * 1024;

/** Téléchargeur réel : jeton d'accès de l'utilisateur, hôte Garmin uniquement. */
export function activityFileDownloader(opts: {
  fetchImpl: FetchLike;
  accessToken: (connectionId: string) => Promise<string>;
}): DownloadActivityFile {
  return async (url, connectionId) => {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "apis.garmin.com") {
      throw new Error("fichier d'activité : URL hors de apis.garmin.com refusée");
    }
    const token = await opts.accessToken(connectionId);
    const res = await opts.fetchImpl(u, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 410) return null;
    if (!res.ok) throw new Error(`fichier d'activité : HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_ACTIVITY_FILE_BYTES) throw new Error("fichier d'activité trop volumineux");
    return bytes;
  };
}

export type Outcome =
  | "imported"
  | "stored"
  | "duplicate"
  | "skipped"
  | "forgotten"
  | "permissions_updated"
  | "unknown_user"
  | "error";

interface Connection {
  id: string;
  athlete_id: string;
  status: string;
  granted_scopes: string[] | null;
}

async function connectionFor(db: Db, userId: string | null): Promise<Connection | null> {
  if (!userId) return null;
  const { data, error } = await db
    .from("provider_connections")
    .select("id, athlete_id, status, granted_scopes")
    .eq("provider", "garmin")
    .eq("external_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`connexion : ${error.message}`);
  return (data as Connection | null) ?? null;
}

async function markDone(db: Db, id: string, note: string | null, now: Date): Promise<void> {
  const { error } = await db
    .from("provider_webhook_inbox")
    .update({ processed_at: now.toISOString(), error: note, locked_until: null })
    .eq("id", id);
  if (error) throw new Error(`inbox : ${error.message}`);
}

/** Données de santé d'un inconnu : on ne les garde pas, même 7 jours. */
async function dropRow(db: Db, id: string): Promise<void> {
  const { error } = await db.from("provider_webhook_inbox").delete().eq("id", id);
  if (error) throw new Error(`inbox : ${error.message}`);
}

const FILE_EXT: Record<string, string> = { FIT: "fit", TCX: "tcx", GPX: "gpx" };

async function upsertRaw(db: Db, record: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("provider_raw_records")
    .upsert(record, { onConflict: "athlete_id,source,summary_type,summary_id" });
  if (error) throw new Error(`stockage brut : ${error.message}`);
}

/**
 * Range le résumé tel que reçu. Les échantillons d'`activityDetails` partent
 * compressés dans Storage ; le fichier d'`activityFiles` est téléchargé et
 * rangé à côté. L'URL de rappel (porteuse d'un jeton) n'est jamais stockée.
 * Renvoie une note pour l'inbox (fichier perdu…), ou null.
 */
async function storeRaw(
  row: InboxRow,
  entry: Record<string, unknown>,
  conn: Connection,
  userId: string | null,
  deps: IngestDeps,
): Promise<string | null> {
  const { db } = deps;
  const given = typeof entry.summaryId === "string" || typeof entry.summaryId === "number"
    ? String(entry.summaryId).trim()
    : "";
  const summaryId = (given || await sha256Hex(canonicalJson(entry))).slice(0, 200);
  const payload: Record<string, unknown> = { ...entry };
  delete payload.callbackURL;
  const record: Record<string, unknown> = {
    athlete_id: conn.athlete_id,
    source: "garmin",
    summary_type: row.type.slice(0, 60),
    summary_id: summaryId,
    external_user_id: userId,
    payload,
  };

  if (row.type === "activityDetails" && Array.isArray(entry.samples) && entry.samples.length > 0) {
    const storage = storageOf(db);
    if (!storage) throw new Error("stockage des échantillons : Storage indisponible");
    delete payload.samples;
    const path = rawPath(conn.athlete_id, "garmin", row.type, summaryId, "json.gz");
    await putRaw(storage, path, await gzip(new TextEncoder().encode(JSON.stringify(entry.samples))), "application/gzip");
    record.samples_path = path;
    record.samples_count = entry.samples.length;
  }

  if (row.type === "activityFiles" && typeof entry.callbackURL === "string") {
    let bytes: Uint8Array | null;
    try {
      if (!deps.downloadActivityFile) throw new Error("fichier d'activité : téléchargement non configuré");
      bytes = await deps.downloadActivityFile(entry.callbackURL, conn.id);
    } catch (e) {
      // Le résumé est gardé ; la ligne d'inbox reste en erreur et sera reprise.
      await upsertRaw(db, record);
      throw e;
    }
    if (bytes === null) {
      // Ne pas effacer un fichier déjà rangé lors d'un premier passage.
      await upsertRaw(db, record);
      return "fichier d'activité déjà téléchargé ou expiré (410)";
    }
    const storage = storageOf(db);
    if (!storage) throw new Error("stockage du fichier : Storage indisponible");
    const fileType = typeof entry.fileType === "string" ? entry.fileType.toUpperCase() : "";
    const path = rawPath(conn.athlete_id, "garmin", row.type, summaryId, FILE_EXT[fileType] ?? "bin");
    await putRaw(storage, path, bytes, "application/octet-stream");
    record.file_path = path;
    record.file_type = fileType || null;
    record.file_bytes = bytes.length;
  }

  await upsertRaw(db, record);
  return null;
}

/**
 * Traite une ligne. Ne lève pas : une erreur est écrite sur la ligne, qui
 * reste non traitée et sera reprise (5 tentatives au plus, bail de 5 min).
 */
export async function processInboxRow(row: InboxRow, deps: IngestDeps): Promise<Outcome> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  try {
    return await handle(row, deps, now);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.from("provider_webhook_inbox").update({ error: msg, locked_until: null }).eq("id", row.id);
    return "error";
  }
}

async function handle(row: InboxRow, deps: IngestDeps, now: Date): Promise<Outcome> {
  const { db } = deps;
  const entry = row.payload ?? {};
  const userId = row.external_user_id ?? (typeof entry.userId === "string" ? entry.userId : null);

  // ── Désinscription : l'athlète a retiré Agon depuis Garmin Connect ──────────
  if (row.type === "deregistrations") {
    const conn = await connectionFor(db, userId);
    if (!conn) {
      await dropRow(db, row.id);
      return "unknown_user";
    }
    /*
      Même effet qu'une déconnexion depuis Agon, sans appel à Garmin :
      l'enregistrement n'existe plus de leur côté. `provider_forget` supprime
      aussi les lignes d'inbox de cet utilisateur, celle-ci comprise.
    */
    await forgetProvider(db, conn.athlete_id, "garmin");
    return "forgotten";
  }

  // ── Changement de permissions ──────────────────────────────────────────────
  if (row.type === "userPermissionsChange") {
    const conn = await connectionFor(db, userId);
    if (!conn) {
      await dropRow(db, row.id);
      return "unknown_user";
    }
    const permissions = normalizePermissions(entry.permissions);
    const { error } = await db
      .from("provider_connections")
      .update({ granted_scopes: permissions })
      .eq("id", conn.id);
    if (error) throw new Error(`permissions : ${error.message}`);
    /*
      Permission retirée = on cesse d'importer ce type (contrôle à
      l'import, ci-dessous) ET on supprime ce qui avait été obtenu grâce à
      elle — même logique que la déconnexion décidée le 07/11/2026.
    */
    const activityTypes = `(${ACTIVITY_PERMISSION_TYPES.join(",")})`;
    if (!permissions.includes(GARMIN_PERMISSIONS.activity)) {
      await removeRawFiles(db, conn.athlete_id, "garmin", RAW_FILE_TYPES);
      const { error: e1 } = await db.from("provider_activities").delete()
        .eq("athlete_id", conn.athlete_id).eq("source", "garmin");
      if (e1) throw new Error(`suppression des activités : ${e1.message}`);
      const { error: e3 } = await db.from("provider_raw_records").delete()
        .eq("athlete_id", conn.athlete_id).eq("source", "garmin")
        .filter("summary_type", "in", activityTypes);
      if (e3) throw new Error(`suppression des activités brutes : ${e3.message}`);
    }
    if (!permissions.includes(GARMIN_PERMISSIONS.health)) {
      const { error: e2 } = await db.from("provider_dailies").delete()
        .eq("athlete_id", conn.athlete_id).eq("source", "garmin");
      if (e2) throw new Error(`suppression des données quotidiennes : ${e2.message}`);
      const { error: e4 } = await db.from("provider_raw_records").delete()
        .eq("athlete_id", conn.athlete_id).eq("source", "garmin")
        .not("summary_type", "in", activityTypes);
      if (e4) throw new Error(`suppression des données santé brutes : ${e4.message}`);
    }
    await markDone(db, row.id, null, now);
    return "permissions_updated";
  }

  const isActivity = (ACTIVITY_TYPES as readonly string[]).includes(row.type);
  const isDaily = (DAILY_TYPES as readonly string[]).includes(row.type);

  // `activityFiles` arrive toujours avec une URL de rappel, même en push.
  if (isPingEntry(entry) && row.type !== "activityFiles") {
    // Palier Starter = push. Une URL de rappel signifierait un réglage « ping »
    // dans le portail : à corriger là-bas, pas à suivre ici.
    await markDone(db, row.id, "notification en mode ping : régler le portail Garmin en push", now);
    return "skipped";
  }

  const conn = await connectionFor(db, userId);
  if (!conn) {
    await dropRow(db, row.id);
    return "unknown_user";
  }

  // Le consentement est relu ici, à chaque import, pas seulement à la connexion.
  if (conn.status !== "active" && conn.status !== "needs_reauth") {
    await dropRow(db, row.id);
    return "skipped";
  }
  const { data: consent, error: consentError } = await db.rpc("source_consent_granted", {
    p_athlete: conn.athlete_id,
    p_source: "garmin",
  });
  if (consentError) throw new Error(`consentement : ${consentError.message}`);
  if (consent !== true) {
    await dropRow(db, row.id);
    return "skipped";
  }

  const needed = permissionFor(row.type);
  const scopes = conn.granted_scopes ?? [];
  // Liste vide = permissions inconnues (lecture échouée au callback) : Garmin
  // ne pousse de toute façon que ce que l'utilisateur a autorisé.
  if (needed && scopes.length > 0 && !scopes.includes(needed)) {
    await dropRow(db, row.id);
    return "skipped";
  }

  const note = await storeRaw(row, entry, conn, userId, deps);

  if (!isActivity && !isDaily) {
    await db.from("provider_connections")
      .update({ last_sync_at: now.toISOString(), last_error: null })
      .eq("id", conn.id);
    await markDone(db, row.id, note, now);
    return "stored";
  }

  if (isActivity) {
    const mapped = mapGarminActivity(entry);
    if (!mapped) {
      await markDone(db, row.id, "résumé d'activité inexploitable (identifiant ou départ absent)", now);
      return "skipped";
    }
    const hit = await deps.findDuplicate(db, {
      athleteId: conn.athlete_id,
      sport: mapped.sport,
      startedAt: mapped.started_at,
      externalId: mapped.external_id,
    });
    if (hit && hit.source !== "garmin") {
      await markDone(db, row.id, `doublon d'une activité ${hit.source}`, now);
      return "duplicate";
    }
    const { error } = await db
      .from("provider_activities")
      .upsert({ athlete_id: conn.athlete_id, ...mapped }, { onConflict: "athlete_id,source,external_id" });
    if (error) throw new Error(`activité : ${error.message}`);
  } else {
    const daily = mapGarminDaily(row.type, entry);
    if (!daily) {
      await markDone(db, row.id, "résumé quotidien sans date", now);
      return "skipped";
    }
    const { error } = await db.rpc("provider_daily_merge", {
      p_athlete: conn.athlete_id,
      p_source: "garmin",
      p_day: daily.day,
      p_kind: daily.kind,
      p_fields: daily.fields,
      p_raw: daily.raw,
    });
    if (error) throw new Error(`données quotidiennes : ${error.message}`);
  }

  await db.from("provider_connections")
    .update({ last_sync_at: now.toISOString(), last_error: null })
    .eq("id", conn.id);
  await markDone(db, row.id, null, now);
  return "imported";
}

/** Prend un lot (bail SQL) et le traite. Renvoie le décompte par issue. */
export async function drainInbox(
  deps: IngestDeps,
  opts: { ids?: string[]; limit?: number; deadlineMs?: number } = {},
): Promise<Record<Outcome, number>> {
  const counts: Record<Outcome, number> = {
    imported: 0, stored: 0, duplicate: 0, skipped: 0, forgotten: 0, permissions_updated: 0, unknown_user: 0, error: 0,
  };
  const { data, error } = await deps.db.rpc("provider_inbox_claim", {
    p_provider: "garmin",
    p_ids: opts.ids ?? null,
    p_limit: opts.limit ?? 100,
  });
  if (error) throw new Error(`prise du lot : ${error.message}`);
  const start = Date.now();
  for (const row of (data ?? []) as InboxRow[]) {
    // Au-delà du budget, on s'arrête : le bail expire et le cron reprendra.
    if (opts.deadlineMs && Date.now() - start > opts.deadlineMs) break;
    counts[await processInboxRow(row, deps)]++;
  }
  return counts;
}
