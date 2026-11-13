import type { QueryClient } from "@tanstack/react-query";
import { ApiError, db, unwrap, unwrapRows } from "./client";

/**
 * Montres connectées et activités importées : tables BRUTES
 * `provider_connections` / `provider_activities` (lues avec les droits de
 * l'utilisateur ; la RLS décide ce que voit le coach : `coach_visible`,
 * consentement de l'athlète). Les vues `ai_provider_*` sont réservées à l'IA
 * (filtre `ai_allowed`, Garmin exclu) : elles ne sont jamais lues ici.
 *
 * Tout ce qui est sensible (PKCE, `client_id`, jetons) reste côté serveur :
 * ce module ne fait que demander une URL d'autorisation, une synchro ou une
 * déconnexion aux Edge Functions.
 */

// ── Clés React Query ──────────────────────────────────────────────────────────

export const providerKeys = {
  all: (aid: string) => ["providers", aid] as const,
  connections: (aid: string) => ["providers", aid, "connections"] as const,
  activities: (aid: string, limit: number) => ["providers", aid, "activities", limit] as const,
  gear: (aid: string) => ["providers", aid, "gear"] as const,
  /** Sorties de montre lues pour le volume de course. */
  runs: (aid: string, from: string) => ["providers", aid, "runs", from] as const,
  /**
   * Km saisis à la main (séances énergie, muscu). Ancienne valeur gardée :
   * `invalidateWorkouts` et `useEnergyAssignments` invalident `['runningVolume', aid]`.
   */
  manualRuns: (aid: string, from: string) => ["runningVolume", aid, from] as const,
  /** Séances envoyées sur la montre (suivi de l'envoi). */
  workoutPushes: (aid: string, from: string) => ["providers", aid, "workoutPushes", from] as const,
};

/** Après un import, une synchro, une déconnexion : connexions, sorties, volume de course montre. */
export function invalidateProviders(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: providerKeys.all(athleteId) }),
    // Charge YOXX et VC (`loadKeys`, `criticalSpeedKeys`) lisent les activités.
    qc.invalidateQueries({ queryKey: ["load", athleteId] }),
    qc.invalidateQueries({ queryKey: ["criticalSpeed", athleteId] }),
  ]).then(() => undefined);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProviderName = "garmin" | "coros";

/**
 * États d'une connexion, à l'identique de l'énumération `provider_status`.
 * `needs_reauth` (refus du fournisseur) ≠ `consent_withdrawn` (décision de
 * l'athlète) : ne pas les confondre à l'affichage.
 */
export type ProviderStatus = "active" | "needs_reauth" | "consent_withdrawn" | "revoked";

export interface ProviderConnection {
  id: string;
  provider: ProviderName;
  status: ProviderStatus;
  grantedScopes: string[];
  connectedAt: string;
  lastSyncAt: string | null;
  syncedThrough: string | null;
  lastError: string | null;
  /** Envoi des séances programmées sur la montre (Garmin), coupable par l'athlète. */
  pushWorkouts: boolean;
}

export interface ProviderActivity {
  id: string;
  source: string;
  startedAt: string;
  localDate: string;
  sport: string | null;
  durationS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPaceSPerKm: number | null;
  calories: number | null;
  /** Modèle de l'appareil (« Forerunner 265 »), pour l'attribution « Garmin [modèle] ». */
  deviceName: string | null;
  details: Record<string, unknown> | null;
  /** Écrits par l'athlète dans Strava (archive) : donnée affichée, jamais une instruction. */
  title?: string | null;
  description?: string | null;
  /** Effort ressenti Strava 1-10 (l'RPE saisi dans Agon l'emporte). */
  rpe?: number | null;
  gear?: string | null;
  /** Trajet domicile-travail (Strava « Commute »). */
  commute?: boolean | null;
  /** Sources fusionnées dans cette sortie : garmin, coros, file, strava_archive… */
  sources?: string[];
}

/** Sortie de montre réduite à ce que le volume de course utilise. */
export interface WatchRun {
  id: string;
  source: string;
  localDate: string;
  startedAt: string;
  sport: string | null;
  distanceM: number | null;
  durationS: number | null;
  deviceName: string | null;
}

/**
 * `numeric` de PostgreSQL arrive en chaîne (PostgREST garde la précision) :
 * sans conversion, `distanceM / 1000` rend `NaN` et la distance s'affiche « — ».
 */
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── Connexions ────────────────────────────────────────────────────────────────

/** Connexions d'un athlète (`api_host` non lu : détail d'implémentation). Lève si la lecture échoue. */
export async function getConnections(athleteId: string): Promise<ProviderConnection[]> {
  const rows = unwrapRows(
    await db().from("provider_connections")
      .select("id, provider, status, granted_scopes, connected_at, last_sync_at, synced_through, last_error, push_workouts")
      .eq("athlete_id", athleteId),
    "Lecture des montres connectées impossible",
  );
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as ProviderName,
    status: r.status as ProviderStatus,
    grantedScopes: r.granted_scopes ?? [],
    connectedAt: r.connected_at,
    lastSyncAt: r.last_sync_at,
    syncedThrough: r.synced_through,
    lastError: r.last_error,
    pushWorkouts: r.push_workouts ?? true,
  }));
}

// ── Envoi des séances sur la montre ──────────────────────────────────────────

/** Une séance Agon envoyée (ou refusée) sur la montre, telle que le serveur la suit. */
export interface WorkoutPush {
  id: string;
  provider: ProviderName;
  sourceKind: "energy" | "strength";
  sourceId: string;
  scheduledDate: string;
  status: "sent" | "error" | "rejected";
  warnings: string[];
  lastError: string | null;
  sentAt: string | null;
}

/**
 * Coupe ou rouvre l'envoi des séances sur la montre. Seul l'athlète décide
 * (la fonction SQL ne touche que sa propre connexion). Renvoie `false` si
 * aucune connexion n'a été modifiée.
 */
export async function setWorkoutPush(provider: ProviderName, enabled: boolean): Promise<boolean> {
  return !!unwrap(
    await db().rpc("set_workout_push", { p_provider: provider, p_enabled: enabled }),
    "Réglage de l'envoi sur la montre impossible",
  );
}

/** Séances envoyées à partir d'un jour (`YYYY-MM-DD`). Lève si la lecture échoue. */
export async function getWorkoutPushes(athleteId: string, from: string): Promise<WorkoutPush[]> {
  const rows = unwrapRows(
    await db().from("provider_workout_pushes")
      .select("id, provider, source_kind, source_id, scheduled_date, status, warnings, last_error, sent_at")
      .eq("athlete_id", athleteId)
      .gte("scheduled_date", from)
      .order("scheduled_date"),
    "Lecture des séances envoyées sur la montre impossible",
  );
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as ProviderName,
    sourceKind: r.source_kind as WorkoutPush["sourceKind"],
    sourceId: r.source_id,
    scheduledDate: r.scheduled_date,
    status: r.status as WorkoutPush["status"],
    warnings: r.warnings ?? [],
    lastError: r.last_error,
    sentAt: r.sent_at,
  }));
}

/** Erreur renvoyée par une fonction de connexion, avec son code serveur. */
export class ConnectError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

type FnError = { message: string; context?: unknown };
type Invoke = <T>(fn: string, opts: { body: unknown }) => Promise<{ data: T | null; error: FnError | null }>;
const invoke: Invoke = (fn, opts) => db().functions.invoke(fn, opts) as never;

/**
 * Corps JSON d'une erreur d'Edge Function : `invoke` ne rend qu'un message
 * générique (« non-2xx status code »), le code (`garmin_indisponible`,
 * `consentement_absent`…) est dans la réponse.
 */
export async function connectError(error: FnError): Promise<ConnectError> {
  const ctx = error.context as { json?: () => Promise<unknown> } | undefined;
  try {
    const body = (await ctx?.json?.()) as { error?: unknown; message?: unknown } | undefined;
    if (body && typeof body === "object") {
      return new ConnectError(
        typeof body.message === "string" ? body.message : error.message,
        typeof body.error === "string" ? body.error : null,
      );
    }
  } catch {
    /* corps illisible : message générique */
  }
  return new ConnectError(error.message, null);
}

/** URL d'autorisation COROS (le navigateur y part en redirection complète). */
export async function startCorosAuthorization(region: string): Promise<string> {
  const { data, error } = await invoke<{ authorizeUrl?: string }>("provider-coros-connect", { body: { region } });
  if (error) throw new Error(error.message);
  if (!data?.authorizeUrl) throw new Error("URL d'autorisation absente");
  return data.authorizeUrl;
}

/** URL d'autorisation Garmin (OAuth 2.0 PKCE) ; lève une `ConnectError` avec le code serveur. */
export async function startGarminAuthorization(): Promise<string> {
  const { data, error } = await invoke<{ authorizeUrl?: string }>("provider-garmin-connect", { body: {} });
  if (error) throw await connectError(error);
  if (!data?.authorizeUrl) throw new ConnectError("URL d'autorisation absente", null);
  return data.authorizeUrl;
}

export interface SyncReport {
  athleteId: string;
  imported: number;
  duplicates: number;
  rejected: Array<{ name: string; reason: string }>;
  dailies: number;
  syncedThrough: string | null;
  error?: string;
}

/** Synchro COROS immédiate (budget de fichiers plus étroit que le cron, appliqué par le serveur). */
export async function syncCoros(): Promise<SyncReport | undefined> {
  const { data, error } = await invoke<{ reports?: SyncReport[] }>("provider-coros-sync", { body: {} });
  if (error) throw new Error(error.message);
  return data?.reports?.[0];
}

export interface DisconnectResult {
  success: boolean;
  /** Vrai si le fournisseur a confirmé la révocation de son côté. */
  revoked?: boolean;
  warnings?: string[];
  /** Ce qui a été supprimé chez nous (activités, journées, connexion). */
  deleted?: { activities: number; dailies: number; inbox: number; connection: number };
}

/**
 * Déconnecte un service pour l'utilisateur du jeton de session. Supprime les
 * activités et journées importées PAR CE FOURNISSEUR (décision du 07/11/2026) ;
 * les imports manuels restent.
 */
export async function disconnectProvider(provider: ProviderName): Promise<DisconnectResult> {
  const { data, error } = await invoke<DisconnectResult>("provider-disconnect", { body: { provider } });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error("La déconnexion n'a pas abouti");
  return data;
}

// ── Activités ─────────────────────────────────────────────────────────────────

/** Nombre de sorties remontées par défaut. */
export const DEFAULT_ACTIVITY_LIMIT = 60;

/**
 * Sorties d'un athlète, plus récentes d'abord (`started_at` en second : deux
 * sorties le même jour gardent leur ordre). Même requête pour l'athlète et son
 * coach ; un coach peut en voir moins (RLS), sans erreur — c'est voulu.
 */
const ACTIVITY_COLS =
  "id, source, started_at, local_date, sport, duration_s, distance_m, elevation_gain_m, avg_hr, max_hr, avg_pace_s_per_km, calories, device_name, details, title, description, rpe, gear, commute, sources";

type ActivityRow = {
  id: string; source: string; started_at: string; local_date: string; sport: string | null;
  duration_s: number | null; distance_m: unknown; elevation_gain_m: unknown; avg_hr: number | null;
  max_hr: number | null; avg_pace_s_per_km: unknown; calories: number | null; device_name: string | null;
  details: unknown; title?: string | null; description?: string | null; rpe?: number | null;
  gear?: string | null; commute?: boolean | null; sources?: string[] | null;
};

const toProviderActivity = (r: ActivityRow): ProviderActivity => ({
  id: r.id,
  source: r.source,
  startedAt: r.started_at,
  localDate: r.local_date,
  sport: r.sport,
  durationS: r.duration_s,
  distanceM: num(r.distance_m),
  elevationGainM: num(r.elevation_gain_m),
  avgHr: r.avg_hr,
  maxHr: r.max_hr,
  avgPaceSPerKm: num(r.avg_pace_s_per_km),
  calories: r.calories,
  deviceName: r.device_name ?? null,
  details: (r.details as Record<string, unknown> | null) ?? null,
  title: r.title ?? null,
  description: r.description ?? null,
  rpe: r.rpe ?? null,
  gear: r.gear ?? null,
  commute: r.commute ?? null,
  sources: r.sources ?? [],
});

export async function getActivities(athleteId: string, limit = DEFAULT_ACTIVITY_LIMIT): Promise<ProviderActivity[]> {
  const rows = unwrapRows(
    await db().from("provider_activities")
      .select(ACTIVITY_COLS)
      .eq("athlete_id", athleteId)
      .order("local_date", { ascending: false })
      .order("started_at", { ascending: false })
      .limit(limit),
    "Lecture des activités impossible",
  );
  return rows.map(toProviderActivity);
}

/** Sorties d'un athlète entre deux jours inclus (planning d'une semaine), dans l'ordre chronologique. */
export async function getActivitiesBetween(athleteId: string, from: string, to: string): Promise<ProviderActivity[]> {
  const rows = unwrapRows(
    await db().from("provider_activities")
      .select(ACTIVITY_COLS)
      .eq("athlete_id", athleteId)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("started_at", { ascending: true }),
    "Lecture des activités impossible",
  );
  return rows.map(toProviderActivity);
}

/** Sorties depuis `from` (jour ISO), dans l'ordre chronologique, pour le volume de course. */
export async function getWatchRuns(athleteId: string, from: string): Promise<WatchRun[]> {
  const rows = unwrapRows(
    await db().from("provider_activities")
      .select("id, source, started_at, local_date, sport, distance_m, duration_s, device_name")
      .eq("athlete_id", athleteId)
      .gte("local_date", from)
      .order("started_at", { ascending: true })
      .limit(2000),
    "Lecture des sorties impossible",
  );
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    localDate: r.local_date,
    startedAt: r.started_at,
    sport: r.sport,
    distanceM: num(r.distance_m),
    durationS: num(r.duration_s),
    deviceName: r.device_name ?? null,
  }));
}

export interface ManualRunSources {
  /** Séances énergie / spécifiques prévues ou validées. */
  planned: Array<{
    id: string;
    date: string;
    status: string | null;
    activityType: string | null;
    sessionKind: string | null;
    label: string;
    plannedDistanceM: number | null;
    plannedDurationS: number | null;
    manualKm: number | null;
    manualDurationMin: number | null;
  }>;
  /** Km courus saisis dans une séance de muscu. */
  strength: Array<{ date: string; km: number }>;
}

interface AssignmentRow {
  id: string;
  scheduled_date: string;
  status: string | null;
  activity_type: string | null;
  distance_km: number | string | null;
  actual_duration_min: number | null;
  energy_sessions: {
    name: string | null;
    session_kind: string | null;
    total_distance_m: number | string | null;
    total_duration_s: number | null;
  } | null;
}

/**
 * Km saisis à la main depuis `from` : séances énergie (prévues et validées) et
 * distance courue en séance de muscu. Lus ici parce que seul le volume de
 * course les combine aux sorties de montre (`buildRunLedger`).
 */
export async function getManualRunSources(athleteId: string, from: string): Promise<ManualRunSources> {
  const [energy, workouts] = await Promise.all([
    db().from("energy_session_assignments")
      .select("id, scheduled_date, status, activity_type, distance_km, actual_duration_min, energy_sessions(name, session_kind, total_distance_m, total_duration_s)")
      .eq("athlete_id", athleteId)
      .gte("scheduled_date", from),
    db().from("workout_logs")
      .select("scheduled_date, run_distance_km")
      .eq("athlete_id", athleteId)
      .not("run_distance_km", "is", null)
      .gte("scheduled_date", from),
  ]);
  const planned = unwrapRows(energy, "Lecture des séances énergie impossible") as unknown as AssignmentRow[];
  const strength = unwrapRows(workouts, "Lecture des séances impossible") as unknown as { scheduled_date: string; run_distance_km: number | string }[];
  return {
    planned: planned.map((r) => ({
      id: r.id,
      date: r.scheduled_date,
      status: r.status,
      activityType: r.activity_type,
      sessionKind: r.energy_sessions?.session_kind ?? null,
      label: r.energy_sessions?.name ?? "Séance énergie",
      plannedDistanceM: num(r.energy_sessions?.total_distance_m),
      plannedDurationS: num(r.energy_sessions?.total_duration_s),
      manualKm: num(r.distance_km),
      manualDurationMin: num(r.actual_duration_min),
    })),
    strength: strength.map((r) => ({ date: r.scheduled_date, km: num(r.run_distance_km) ?? 0 })),
  };
}

// ── Import de fichiers ────────────────────────────────────────────────────────

export interface KnownActivities {
  /** `external_id` déjà en base. */
  ids: Set<string>;
  starts: Array<{ ms: number; sport: string | null }>;
}

const KNOWN_PAGE = 1000;

/**
 * Activités déjà en base entre deux jours inclus, pour dédoublonner un import.
 * Paginé : PostgREST plafonne une réponse à 1000 lignes ; sans pagination, les
 * lignes au-delà seraient réimportées en double.
 */
export async function getKnownActivities(athleteId: string, fromDate: string, toDate: string): Promise<KnownActivities> {
  const ids = new Set<string>();
  const starts: KnownActivities["starts"] = [];
  for (let page = 0; ; page++) {
    const rows = unwrapRows(
      await db().from("provider_activities")
        .select("external_id, started_at, sport")
        .eq("athlete_id", athleteId)
        .gte("local_date", fromDate)
        .lte("local_date", toDate)
        // Ordre stable, sans quoi deux pages peuvent se recouvrir ou se sauter.
        .order("started_at", { ascending: true })
        .range(page * KNOWN_PAGE, page * KNOWN_PAGE + KNOWN_PAGE - 1),
      "Lecture de l'historique impossible",
    );
    for (const r of rows) {
      ids.add(r.external_id);
      starts.push({ ms: Date.parse(r.started_at), sport: r.sport });
    }
    if (rows.length < KNOWN_PAGE) break;
  }
  return { ids, starts };
}

/**
 * Insère des activités décodées ; renvoie le nombre de lignes réellement
 * ajoutées. `ignoreDuplicates` : deux onglets ou un dépôt relancé ne font pas
 * échouer le lot, les doublons sont simplement écartés.
 */
export async function insertActivities(rows: Record<string, unknown>[]): Promise<number> {
  return (await insertActivitiesReturning(rows)).length;
}

/** Comme `insertActivities`, en rendant `id` et `external_id` des lignes créées. */
export async function insertActivitiesReturning(
  rows: Record<string, unknown>[],
): Promise<Array<{ id: string; external_id: string }>> {
  if (rows.length === 0) return [];
  const res = await db().from("provider_activities")
    .upsert(rows as never, { onConflict: "athlete_id,source,external_id", ignoreDuplicates: true })
    .select("id, external_id");
  if (res.error) throw new ApiError("Insertion des activités impossible", res.error);
  return (res.data ?? []) as Array<{ id: string; external_id: string }>;
}

/** Sorties qui portent un matériel, pour le kilométrage par paire (`gearTotals`). Paginé. */
export async function getGearOutings(
  athleteId: string,
): Promise<Array<{ gear: string | null; distanceM: number | null; localDate: string }>> {
  const out: Array<{ gear: string | null; distanceM: number | null; localDate: string }> = [];
  for (let page = 0; ; page++) {
    const rows = unwrapRows(
      await db().from("provider_activities")
        .select("id, gear, distance_m, local_date")
        .eq("athlete_id", athleteId)
        .not("gear", "is", null)
        .order("id", { ascending: true })
        .range(page * KNOWN_PAGE, page * KNOWN_PAGE + KNOWN_PAGE - 1),
      "Lecture du matériel impossible",
    );
    for (const r of rows) out.push({ gear: r.gear, distanceM: num(r.distance_m), localDate: r.local_date });
    if (rows.length < KNOWN_PAGE) break;
  }
  return out;
}

/**
 * Fusionne des sorties décodées (P42) : une sortie déjà présente, quelle qu'en
 * soit la source, est complétée au lieu d'être écartée ; une nouvelle est
 * créée. Atomique côté base (`merge_provider_activities`, verrou par athlète).
 * L'athlète, ou son coach (référent ou co-coach) pour lui.
 * Rend un résultat brut par sortie, dans l'ordre (`parseMergeResult`).
 */
export async function mergeActivities(
  athleteId: string,
  tag: "file" | "strava_archive" | "garmin_export",
  payloads: Record<string, unknown>[],
): Promise<unknown[]> {
  if (payloads.length === 0) return [];
  const res = await db().rpc("merge_provider_activities", {
    p_athlete: athleteId,
    p_source: "file_import",
    p_tag: tag,
    p_activities: payloads as never,
  });
  if (res.error) throw new ApiError("Enregistrement des sorties impossible", res.error);
  return Array.isArray(res.data) ? (res.data as unknown[]) : [];
}

/**
 * Range le détail (série seconde par seconde, tours, séries de muscu) d'une
 * activité importée par l'athlète. Charge utile : `detailPayload` (@shared).
 */
export async function saveActivityDetail(activityId: string, payload: Record<string, unknown>): Promise<void> {
  const res = await db().rpc("activity_detail_upsert", { p_activity: activityId, p_detail: payload as never });
  if (res.error) throw new ApiError("Enregistrement du détail de l'activité impossible", res.error);
}
