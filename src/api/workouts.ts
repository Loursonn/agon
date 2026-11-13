import type { QueryClient, Query } from "@tanstack/react-query";
import { type IsoDay, localIsoDay } from "@shared/domain/dates";
import {
  countLoggedSets,
  hasLoggedEntries,
  parseAthleteMods,
  withoutCoachOverride,
  type AthleteMods,
} from "@shared/domain/athleteMods";
import { workoutStats, type WorkoutStats } from "@shared/domain/workoutStats";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";
import { isUntouchedSession } from "@/lib/missedSession";

/**
 * Séances réalisées (`workout_logs`) — seule source des séances (lot 2,
 * docs/COUCHE_API.md). `set_logs`, `asp:completed`, `asp:sets`,
 * `asp:sessionlogs` sont morts ; `workout_rpe` n'est plus écrite (RPE =
 * `rpe_score` uniquement).
 *
 * - Lectures : lèvent en cas d'erreur ; `athlete_modifications` passe toujours
 *   par `parseAthleteMods`.
 * - Écritures de la saisie / validation / RPE / adaptation du coach : RPC
 *   atomiques (migration 20261108100000_workout_rpcs.sql). Jamais « relire le
 *   blob, le modifier, le réécrire ».
 * - « Séance saisie » : `hasLoggedEntries` du domaine (= SQL du cron).
 * - Après toute écriture : `invalidateWorkouts`, et rien d'autre.
 */

export type WorkoutStatus = "planned" | "in_progress" | "completed" | "missed" | "skipped";

export interface WorkoutLog {
  id: string;
  athlete_id: string;
  coach_id: string | null;
  session_id: string;
  session_name: string;
  scheduled_date: IsoDay;
  status: WorkoutStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_s: number | null;
  notes: string | null;
  microcycle_id: string | null;
  rpe_score: number | null;
  /** `null` si la liste a été lue sans la saisie (`withMods: false`). */
  athlete_modifications: AthleteMods | null;
  original_scheduled_date: IsoDay | null;
  rescheduled_by_athlete: boolean;
  coach_alert: boolean;
  week_number: number | null;
  run_distance_km: number | null;
}

const BASE_COLS =
  "id, athlete_id, coach_id, session_id, session_name, scheduled_date, status, started_at, completed_at, duration_s, notes, microcycle_id, rpe_score, original_scheduled_date, rescheduled_by_athlete, coach_alert, week_number, run_distance_km";
const FULL_COLS = `${BASE_COLS}, athlete_modifications`;

type RawRow = Record<string, unknown>;

/** `numeric` arrive en chaîne via PostgREST. */
const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toWorkoutLog(r: RawRow): WorkoutLog {
  return {
    id: String(r.id),
    athlete_id: String(r.athlete_id),
    coach_id: (r.coach_id as string | null) ?? null,
    session_id: String(r.session_id ?? ""),
    session_name: String(r.session_name ?? ""),
    scheduled_date: String(r.scheduled_date ?? "").slice(0, 10),
    status: (r.status as WorkoutStatus) ?? "planned",
    started_at: (r.started_at as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    duration_s: toNum(r.duration_s),
    notes: (r.notes as string | null) ?? null,
    microcycle_id: (r.microcycle_id as string | null) ?? null,
    rpe_score: toNum(r.rpe_score),
    athlete_modifications: parseAthleteMods(r.athlete_modifications),
    original_scheduled_date: r.original_scheduled_date ? String(r.original_scheduled_date).slice(0, 10) : null,
    rescheduled_by_athlete: r.rescheduled_by_athlete === true,
    coach_alert: r.coach_alert === true,
    week_number: toNum(r.week_number),
    run_distance_km: toNum(r.run_distance_km),
  };
}

// ── Clés React Query ──────────────────────────────────────────────────────────

export interface WorkoutListParams {
  athleteIds: string[];
  from?: IsoDay | null;
  to?: IsoDay | null;
  statuses?: WorkoutStatus[];
  excludeStatuses?: WorkoutStatus[];
  sessionId?: string;
  withMods?: boolean;
  ascending?: boolean;
  limit?: number;
}

const sorted = (ids: readonly string[]) => [...ids].sort();

/** Préfixe `['workouts', athleteId, …]` ; `_many` pour les vues multi-athlètes. */
export const workoutKeys = {
  athlete: (aid: string) => ["workouts", aid] as const,
  log: (aid: string, id: string) => ["workouts", aid, "log", id] as const,
  list: (p: WorkoutListParams) =>
    p.athleteIds.length === 1
      ? (["workouts", p.athleteIds[0], "list", { ...p, athleteIds: undefined }] as const)
      : (["workouts", "_many", sorted(p.athleteIds), "list", { ...p, athleteIds: undefined }] as const),
  session: (aid: string, sessionId: string) => ["workouts", aid, "session", sessionId] as const,
  previous: (aid: string, sessionId: string, excludeId: string | null, onOrBefore: string | null) =>
    ["workouts", aid, "previous", sessionId, excludeId, onOrBefore] as const,
  unfinished: (aids: readonly string[]) => ["workouts", "_many", sorted(aids), "unfinished"] as const,
  choices: (aid: string) => ["workouts", aid, "choices"] as const,
  choicesCount: (aid: string) => ["workouts", aid, "choices-count"] as const,
  stats: (aid: string) => ["workouts", aid, "stats"] as const,
};

// ── Lectures ──────────────────────────────────────────────────────────────────

export async function getWorkoutLog(id: string): Promise<WorkoutLog | null> {
  const row = unwrap<RawRow>(
    (await db().from("workout_logs").select(FULL_COLS).eq("id", id).maybeSingle()) as never,
    "Lecture de la séance impossible",
  );
  return row ? toWorkoutLog(row) : null;
}

export async function listWorkoutLogs(p: WorkoutListParams): Promise<WorkoutLog[]> {
  if (p.athleteIds.length === 0) return [];
  let q = db().from("workout_logs").select(p.withMods === false ? BASE_COLS : FULL_COLS);
  q = p.athleteIds.length === 1 ? q.eq("athlete_id", p.athleteIds[0]) : q.in("athlete_id", p.athleteIds);
  if (p.sessionId) q = q.eq("session_id", p.sessionId);
  if (p.from) q = q.gte("scheduled_date", p.from);
  if (p.to) q = q.lte("scheduled_date", p.to);
  if (p.statuses?.length) q = q.in("status", p.statuses);
  for (const s of p.excludeStatuses ?? []) q = q.neq("status", s);
  let ordered = q.order("scheduled_date", { ascending: p.ascending !== false });
  if (p.limit) ordered = ordered.limit(p.limit);
  const rows = unwrapRows<RawRow>((await ordered) as never, "Lecture des séances impossible");
  return rows.map(toWorkoutLog);
}

export interface UnfinishedWorkout {
  id: string;
  athleteId: string;
  sessionName: string;
  scheduledDate: IsoDay;
  /** Séries réellement renseignées (charge ou reps, règle du cron). */
  loggedSets: number;
}

/**
 * Séances passées saisies mais jamais clôturées (« Terminer » oublié). Même
 * règle que le cron de nuit, qui les clôturera de toute façon : le rappel
 * n'affiche donc que ce que le cron validera.
 */
export async function listUnfinishedWorkouts(athleteIds: string[], today: IsoDay = localIsoDay()): Promise<UnfinishedWorkout[]> {
  if (athleteIds.length === 0) return [];
  const q = db().from("workout_logs")
    .select("id, athlete_id, session_name, scheduled_date, athlete_modifications")
    .in("athlete_id", athleteIds)
    .eq("status", "planned")
    .lt("scheduled_date", today)
    .order("scheduled_date", { ascending: false })
    .limit(200);
  const rows = unwrapRows<RawRow>((await q) as never, "Lecture des séances non terminées impossible");
  return rows
    .filter((r) => hasLoggedEntries(r.athlete_modifications))
    .map((r) => ({
      id: String(r.id),
      athleteId: String(r.athlete_id),
      sessionName: String(r.session_name ?? ""),
      scheduledDate: String(r.scheduled_date).slice(0, 10),
      loggedSets: countLoggedSets(r.athlete_modifications),
    }));
}

/**
 * Dernière séance passée de la même séance-type qui contient une vraie saisie
 * (référence « la dernière fois »). Le statut validé n'est pas requis ; les
 * séances annulées sont ignorées.
 */
export async function getPreviousLoggedWorkout(p: {
  athleteId: string;
  sessionId: string;
  excludeId?: string | null;
  onOrBefore?: IsoDay | null;
}): Promise<WorkoutLog | null> {
  let q = db().from("workout_logs").select(FULL_COLS)
    .eq("athlete_id", p.athleteId)
    .eq("session_id", p.sessionId)
    .neq("status", "skipped");
  if (p.excludeId) q = q.neq("id", p.excludeId);
  if (p.onOrBefore) q = q.lte("scheduled_date", p.onOrBefore);
  const rows = unwrapRows<RawRow>(
    (await q.order("scheduled_date", { ascending: false }).limit(10)) as never,
    "Lecture de la séance précédente impossible",
  );
  const hit = rows.find((r) => hasLoggedEntries(r.athlete_modifications));
  return hit ? toWorkoutLog(hit) : null;
}

/** Ce que l'athlète a changé lui-même : déplacement ou saisie (Retours coach). */
export interface AthleteChoiceLog {
  id: string;
  sessionName: string;
  scheduledDate: IsoDay;
  originalScheduledDate: IsoDay;
  rescheduledByAthlete: boolean;
  /** Plus de colonne en base : toujours `null` (gardé pour l'affichage existant). */
  rescheduleReason: null;
  coachAlert: boolean;
  athleteModifications: AthleteMods | null;
  status: WorkoutStatus;
}

const CHOICE_COLS =
  "id, session_name, scheduled_date, original_scheduled_date, rescheduled_by_athlete, coach_alert, athlete_modifications, status";

/**
 * Deux requêtes (saisie présente / déplacée sans saisie) plutôt qu'un `.or()` :
 * même résultat, et la base simulée des tests les comprend. L'ancienne version
 * demandait `reschedule_reason`, colonne qui n'existe pas : la requête
 * échouait et la section « modifications » des Retours restait vide.
 */
export async function listAthleteChoices(athleteId: string, limit = 50): Promise<AthleteChoiceLog[]> {
  const [withMods, movedOnly] = await Promise.all([
    db().from("workout_logs").select(CHOICE_COLS)
      .eq("athlete_id", athleteId).not("athlete_modifications", "is", null)
      .order("scheduled_date", { ascending: false }).limit(limit),
    db().from("workout_logs").select(CHOICE_COLS)
      .eq("athlete_id", athleteId).eq("rescheduled_by_athlete", true).is("athlete_modifications", null)
      .order("scheduled_date", { ascending: false }).limit(limit),
  ]);
  const rows = [
    ...unwrapRows<RawRow>(withMods as never, "Lecture des choix de l'athlète impossible"),
    ...unwrapRows<RawRow>(movedOnly as never, "Lecture des choix de l'athlète impossible"),
  ]
    .map(toWorkoutLog)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : a.scheduled_date > b.scheduled_date ? -1 : 0))
    .slice(0, limit);
  return rows.map((w) => ({
    id: w.id,
    sessionName: w.session_name,
    scheduledDate: w.scheduled_date,
    originalScheduledDate: w.original_scheduled_date ?? w.scheduled_date,
    rescheduledByAthlete: w.rescheduled_by_athlete,
    rescheduleReason: null,
    coachAlert: w.coach_alert,
    athleteModifications: w.athlete_modifications,
    status: w.status,
  }));
}

/** Nombre de séances concernées (badge de la barre coach). */
export async function countAthleteChoices(athleteId: string): Promise<number> {
  const head = { count: "exact" as const, head: true };
  const [a, b] = await Promise.all([
    db().from("workout_logs").select("id", head).eq("athlete_id", athleteId).not("athlete_modifications", "is", null),
    db().from("workout_logs").select("id", head).eq("athlete_id", athleteId).eq("rescheduled_by_athlete", true).is("athlete_modifications", null),
  ]);
  const n = (res: { count?: number | null; data?: unknown; error: { message: string } | null }) => {
    if (res.error) throw new ApiError("Comptage des choix de l'athlète impossible", res.error);
    return res.count ?? (Array.isArray(res.data) ? res.data.length : 0);
  };
  return n(a as never) + n(b as never);
}

/** Série et total de séances validées, depuis `workout_logs`. */
export async function getWorkoutStats(athleteId: string, today: IsoDay = localIsoDay()): Promise<WorkoutStats> {
  const rows = unwrapRows<RawRow>(
    (await db().from("workout_logs").select("scheduled_date, status").eq("athlete_id", athleteId)) as never,
    "Lecture des séances impossible",
  );
  return workoutStats(rows.map((r) => ({ scheduled_date: String(r.scheduled_date), status: String(r.status) })), today);
}

// ── Écritures atomiques (RPC) ─────────────────────────────────────────────────

type RpcRes = { data: unknown; error: { message: string; code?: string } | null };
type RpcDb = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcRes> };
async function rpcRow(fn: string, args: Record<string, unknown>, what: string): Promise<WorkoutLog> {
  const row = unwrap<RawRow>(await (db() as unknown as RpcDb).rpc(fn, args) as never, what);
  if (!row || !row.id) throw new ApiError(what, { message: "réponse vide", code: "P0002" });
  return toWorkoutLog(row);
}

/** Code SQL levé par les RPC quand la séance n'existe plus. */
export const WORKOUT_NOT_FOUND = "P0002";
export const isWorkoutNotFound = (e: unknown) => e instanceof ApiError && e.code === WORKOUT_NOT_FOUND;

/** Saisie envoyée par l'athlète : jamais l'adaptation du coach. */
function entriesPayload(mods: object | null | undefined): Record<string, unknown> | null {
  return mods ? (withoutCoachOverride(mods as Record<string, unknown>) as Record<string, unknown>) : null;
}

/**
 * Valide une séance. Idempotent (un retry ne change ni `completed_at` ni le
 * RPE/distance déjà donnés). La saisie est fusionnée côté serveur en gardant
 * l'adaptation du coach.
 */
export function completeWorkout(p: {
  logId: string;
  mods?: object | null;
  runKm?: number | null;
  rpe?: number | null;
}): Promise<WorkoutLog> {
  return rpcRow("complete_workout", {
    p_log: p.logId,
    p_mods: entriesPayload(p.mods),
    p_run_km: p.runKm ?? null,
    p_rpe: p.rpe ?? null,
  }, "Validation de la séance impossible");
}

/** Annule la validation (statut prévu, RPE effacé ; saisie gardée). */
export function reopenWorkout(logId: string): Promise<WorkoutLog> {
  return rpcRow("reopen_workout", { p_log: logId }, "Réouverture de la séance impossible");
}

/** Note libre de l'athlète sur la séance (`workout_logs.notes`). */
export async function setWorkoutNote(logId: string, note: string | null): Promise<void> {
  check(await db().from("workout_logs").update({ notes: note }).eq("id", logId), "Note de séance non enregistrée");
}

/** RPE de fin de séance (1-10, `null` = retirer). Seule source : `rpe_score`. */
export function setWorkoutRpe(logId: string, rpe: number | null): Promise<WorkoutLog> {
  if (rpe != null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) {
    return Promise.reject(new ApiError("RPE non enregistré", { message: "RPE entre 1 et 10", code: "22023" }));
  }
  return rpcRow("set_workout_rpe", { p_log: logId, p_rpe: rpe }, "RPE non enregistré");
}

/** Saisie en cours (séries, forme, commentaires…) fusionnée sous verrou. */
export function patchWorkoutEntries(logId: string, patch: object): Promise<WorkoutLog> {
  return rpcRow("patch_workout_entries", { p_log: logId, p_patch: entriesPayload(patch) ?? {} }, "Saisie non enregistrée");
}

/** Adaptation du jour par le coach (`null` = retirer). Coach seulement. */
export function setCoachOverride(logId: string, override: Record<string, unknown> | null): Promise<WorkoutLog> {
  return rpcRow("set_coach_override", { p_log: logId, p_override: override }, "Adaptation non enregistrée");
}

/**
 * Envoi `keepalive` de la saisie (fermeture d'onglet, `pagehide`) : appel REST
 * direct de la RPC `patch_workout_entries`, seule façon qu'une requête partie à
 * la fermeture aille au bout (supabase-js ne transmet pas `keepalive`). Passer
 * par la RPC — et pas par un PATCH de la colonne — garde l'adaptation du coach.
 * Best effort : renvoie `false` si rien n'est parti.
 */
export function sendEntriesKeepalive(p: {
  logId: string;
  mods: object;
  token: string | null;
  maxBytes?: number;
}): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key || !p.token || typeof fetch === "undefined") return false;
  const body = JSON.stringify({ p_log: p.logId, p_patch: entriesPayload(p.mods) ?? {} });
  if (body.length > (p.maxBytes ?? 60_000)) return false;
  try {
    void fetch(`${url}/rest/v1/rpc/patch_workout_entries`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${p.token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Jeton de session courant (pour l'envoi keepalive). */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Suit le jeton de session ; renvoie la fonction de désabonnement. */
export function onAccessTokenChange(cb: (token: string | null) => void): () => void {
  const { data } = db().auth.onAuthStateChange((_e, session) => cb(session?.access_token ?? null));
  return () => data.subscription.unsubscribe();
}

// ── Planification / déplacements / suppression ───────────────────────────────

/**
 * Supprime une séance. Une séance VALIDÉE est refusée sauf `allowCompleted`
 * (suppression explicite et confirmée par le coach, ex. doublon dans
 * l'historique). Les opérations de planification passent par
 * `deletePlannedWorkouts`.
 */
export async function removeWorkout(id: string, opts: { allowCompleted?: boolean } = {}): Promise<void> {
  let q = db().from("workout_logs").delete().eq("id", id);
  if (!opts.allowCompleted) q = q.neq("status", "completed");
  const gone = unwrapRows<RawRow>((await q.select("id")) as never, "Suppression de la séance impossible");
  if (gone.length > 0 || opts.allowCompleted) return;
  const still = await getWorkoutLog(id);
  if (still?.status === "completed") {
    throw new ApiError("Suppression refusée", { message: "la séance a été réalisée", code: "42501" });
  }
}

/**
 * Marque une séance « annulée » (garde l'occurrence pour que la projection
 * du bloc ne réapparaisse pas). Refusé pour une séance validée : on ne perd
 * pas une séance réalisée en la déplaçant.
 */
export async function skipWorkout(id: string): Promise<void> {
  const res = unwrapRows<RawRow>(
    (await db().from("workout_logs").update({ status: "skipped" }).eq("id", id).neq("status", "completed").select("id")) as never,
    "Annulation de la séance impossible",
  );
  if (res.length > 0) return;
  const still = await getWorkoutLog(id);
  if (still?.status === "completed") {
    throw new ApiError("Annulation refusée", { message: "la séance a été réalisée", code: "42501" });
  }
}

export interface PlanWorkoutInput {
  athleteId: string;
  coachId: string | null;
  sessionId: string;
  sessionName: string;
  date: IsoDay;
  weekNumber?: number | null;
  /** Séance démarrée hors programme par l'athlète. */
  byAthlete?: boolean;
  /**
   * Id choisi par le client (séance libre démarrée sans réseau). La création
   * devient rejouable : un nouvel envoi ne crée jamais de doublon, et si la
   * place (séance-type, jour) est déjà prise, la séance existante est renvoyée
   * (son id peut alors différer de `id`).
   */
  id?: string;
}

/**
 * Nouvelle séance prévue (coach qui assigne, ou athlète hors programme).
 *
 * Avec `id` : `INSERT … ON CONFLICT (athlete_id, session_id, scheduled_date)
 * DO NOTHING`, puis relecture. Aucune migration : la RLS d'insertion
 * (`athlete_id = auth.uid()` ou `is_coach_of`) ne regarde pas l'id, et l'index
 * unique `idx_workout_logs_unique` sert d'arbitre.
 */
export async function planWorkout(p: PlanWorkoutInput): Promise<WorkoutLog> {
  if (p.id) return planWorkoutWithId(p as PlanWorkoutInput & { id: string });
  const row = unwrap<RawRow>(
    (await db().from("workout_logs").insert({
      athlete_id: p.athleteId,
      coach_id: p.coachId,
      session_id: p.sessionId,
      session_name: p.sessionName,
      scheduled_date: p.date,
      original_scheduled_date: p.date,
      status: "planned",
      ...(p.byAthlete ? { rescheduled_by_athlete: true, coach_alert: false } : {}),
      ...(p.weekNumber != null ? { week_number: p.weekNumber } : {}),
    }).select(BASE_COLS).single()) as never,
    "Ajout de la séance impossible",
  );
  return toWorkoutLog(row!);
}

async function planWorkoutWithId(p: PlanWorkoutInput & { id: string }): Promise<WorkoutLog> {
  const res = await db().from("workout_logs").upsert({
    id: p.id,
    athlete_id: p.athleteId,
    coach_id: p.coachId,
    session_id: p.sessionId,
    session_name: p.sessionName,
    scheduled_date: p.date,
    original_scheduled_date: p.date,
    status: "planned",
    ...(p.byAthlete ? { rescheduled_by_athlete: true, coach_alert: false } : {}),
    ...(p.weekNumber != null ? { week_number: p.weekNumber } : {}),
  }, { onConflict: "athlete_id,session_id,scheduled_date", ignoreDuplicates: true });
  // 23505 sur la clé primaire : cet id existe déjà (premier envoi arrivé, puis
  // séance déplacée par le coach avant le rejeu) → on la relit ci-dessous.
  if (res.error && (res.error as { code?: string }).code !== "23505") check(res, "Ajout de la séance impossible");
  const mine = await getWorkoutLog(p.id);
  if (mine) return mine;
  // Place déjà prise par une autre séance (prévue par le coach, annulée…) :
  // c'est elle que l'athlète fait.
  const other = unwrap<RawRow>(
    (await db().from("workout_logs").select(FULL_COLS)
      .eq("athlete_id", p.athleteId).eq("session_id", p.sessionId).eq("scheduled_date", p.date)
      .maybeSingle()) as never,
    "Ajout de la séance impossible",
  );
  if (other) return toWorkoutLog(other);
  throw new ApiError("Ajout de la séance impossible", { message: "séance introuvable après création", code: WORKOUT_NOT_FOUND });
}

/**
 * Supprime UNE occurrence d'une séance récurrente projetée (bloc) : on pose un
 * log « annulé » à cette date (rien n'existait encore).
 */
export async function skipOccurrence(p: {
  athleteId: string;
  coachId: string | null;
  sessionId: string;
  sessionName: string;
  date: IsoDay;
}): Promise<void> {
  check(
    await db().from("workout_logs").upsert({
      athlete_id: p.athleteId,
      coach_id: p.coachId,
      session_id: p.sessionId,
      session_name: p.sessionName,
      scheduled_date: p.date,
      status: "skipped",
    }, { onConflict: "athlete_id,session_id,scheduled_date" }),
    "Suppression de l'occurrence impossible",
  );
}

/**
 * Le coach déplace une séance : l'ancienne date est annulée (log « annulé »
 * pour une occurrence projetée), une séance prévue est posée à la nouvelle.
 */
export async function moveWorkoutByCoach(p: {
  athleteId: string;
  coachId: string;
  sessionId: string;
  sessionName: string;
  fromDate: IsoDay;
  toDate: IsoDay;
  /** id du log existant ; absent pour une occurrence projetée du bloc. */
  logId?: string | null;
}): Promise<void> {
  // L'upsert sur (athlète, séance, date) ferait repasser « prévue » une séance
  // déjà réalisée ce jour-là : on refuse avant d'écrire quoi que ce soit.
  const target = await listWorkoutLogs({
    athleteIds: [p.athleteId], sessionId: p.sessionId, from: p.toDate, to: p.toDate, withMods: false,
  });
  if (target.some((w) => w.status === "completed")) {
    throw new ApiError("Déplacement refusé", { message: "cette séance est déjà réalisée à la nouvelle date", code: "42501" });
  }
  if (p.logId) {
    const cur = await getWorkoutLog(p.logId);
    if (cur && !isUntouchedSession(cur)) {
      throw new ApiError("Déplacement refusé", { message: "séance réalisée, commencée ou notée", code: "42501" });
    }
    await skipWorkout(p.logId);
  }
  else {
    check(
      await db().from("workout_logs").insert({
        athlete_id: p.athleteId, coach_id: p.coachId, session_id: p.sessionId,
        session_name: p.sessionName, scheduled_date: p.fromDate, status: "skipped",
      }),
      "Déplacement de la séance impossible",
    );
  }
  check(
    await db().from("workout_logs").upsert({
      athlete_id: p.athleteId, coach_id: p.coachId, session_id: p.sessionId,
      session_name: p.sessionName, scheduled_date: p.toDate, status: "planned",
    }, { onConflict: "athlete_id,session_id,scheduled_date" }),
    "Déplacement de la séance impossible",
  );
}

/**
 * L'athlète déplace sa séance. `original_scheduled_date` garde la date du
 * coach (posée ici si elle manquait : 233 séances anciennes n'en avaient pas),
 * `rescheduled_by_athlete` et `coach_alert` sont enfin écrits (l'ancienne
 * version écrivait aussi `reschedule_reason`, colonne inexistante : la requête
 * échouait et le repli n'écrivait que la date, donc le coach ne voyait rien).
 * La raison donnée par l'athlète n'a pas de colonne : elle n'est pas stockée.
 */
export async function rescheduleWorkoutByAthlete(p: {
  logId: string;
  newDate: IsoDay;
  coachAlert: boolean;
}): Promise<WorkoutLog> {
  const cur = await getWorkoutLog(p.logId);
  if (!cur) throw new ApiError("Déplacement impossible", { message: "séance introuvable", code: WORKOUT_NOT_FOUND });
  if (!isUntouchedSession(cur)) {
    throw new ApiError("Déplacement refusé", { message: "séance réalisée, commencée ou notée", code: "42501" });
  }
  const row = unwrap<RawRow>(
    (await db().from("workout_logs").update({
      scheduled_date: p.newDate,
      // Une séance manquée déplacée redevient prévue à sa nouvelle date.
      ...(cur.status === "missed" ? { status: "planned" } : {}),
      original_scheduled_date: cur.original_scheduled_date ?? cur.scheduled_date,
      rescheduled_by_athlete: true,
      coach_alert: p.coachAlert || cur.coach_alert,
    }).eq("id", p.logId).select(BASE_COLS).single()) as never,
    "Déplacement de la séance impossible",
  );
  return toWorkoutLog(row!);
}

/**
 * L'athlète passe une séance en repos (planche « déplacer ») : elle est
 * retirée de sa journée (`skipped`). Refusé si elle a une saisie.
 */
export async function restWorkoutByAthlete(logId: string): Promise<void> {
  const cur = await getWorkoutLog(logId);
  if (!cur) throw new ApiError("Repos impossible", { message: "séance introuvable", code: WORKOUT_NOT_FOUND });
  if (!isUntouchedSession(cur)) {
    throw new ApiError("Repos refusé", { message: "séance réalisée, commencée ou notée", code: "42501" });
  }
  await skipWorkout(logId);
}

/** Séances d'une séance-type sur une semaine (démarrage hors programme). */
export function listSessionLogsBetween(p: { athleteId: string; sessionId: string; from: IsoDay; to: IsoDay }): Promise<WorkoutLog[]> {
  return listWorkoutLogs({ athleteIds: [p.athleteId], sessionId: p.sessionId, from: p.from, to: p.to, withMods: false });
}

/** L'athlète ramène une séance de la semaine à aujourd'hui (date du coach gardée). */
export async function moveWorkoutToDayByAthlete(logId: string, date: IsoDay): Promise<WorkoutLog> {
  const row = unwrap<RawRow>(
    (await db().from("workout_logs").update({ scheduled_date: date, rescheduled_by_athlete: true })
      .eq("id", logId).select(BASE_COLS).single()) as never,
    "Déplacement de la séance impossible",
  );
  return toWorkoutLog(row!);
}

// ── Invalidation : LA seule liste ─────────────────────────────────────────────

/**
 * Préfixes des requêtes qui lisent `workout_logs` et sont propres à un
 * athlète (son id apparaît dans la clé, à n'importe quelle position).
 * À compléter ici — et nulle part ailleurs — quand un écran lit les séances.
 */
const ATHLETE_SCOPED = new Set<string>([
  "workouts",                 // ce module
  "cal",                      // calendrier unifié / planning coach
  "workout-logs-week",        // semaine athlète
  "activePlan",               // plan actif
  "athleteModifications",     // ancienne clé Retours (avant workoutKeys.choices)
  "weeklyRetours", "monthlyRetours",
  "energy",                   // séances énergie affichées avec le statut
  "energy-assignments",       // ancienne clé, tant que des appelants la lisent
  "historique",               // onglet Données > Historique
  "session-week-logs",        // tiroir de la programmation
  "micro-stats", "meso-load", "timeline-data", "micro-days", "cycle-sessions", // planning (RPE, statuts)
  "athlete-trend-sessions", "athlete-insights", // tendances athlète
  "runningVolume",            // volume de course (distance des séances)
  "session-occurrence",       // rang d'occurrence d'une séance
  "muscleVolumeLogs",         // volume musculaire
  "prev-workout-log",         // ancienne clé « la dernière fois »
  "unfinished-workouts",      // ancienne clé du rappel
  "staff",                    // vues staff (logs, planning, retours, occurrences)
  "load",                     // charge YOXX (src/api/load.ts)
]);
/** Requêtes sans id d'athlète dans la clé : toujours invalidées. */
const GLOBAL = new Set<string>([
  "coachDashboard",           // accueil coach (séances du jour, manquées)
  "coach-override-log",       // modale d'adaptation du coach (par séance)
]);

function keyHas(key: unknown, needle: string): boolean {
  if (key === needle) return true;
  if (Array.isArray(key)) return key.some((k) => keyHas(k, needle));
  return false;
}

/**
 * Rafraîchit tout ce qui affiche les séances d'un athlète après une écriture :
 * détail, semaine, calendriers, plan actif, planning coach (RPE, statuts),
 * Retours hebdo/mensuels, séances non finies, volume de course, accueil
 * coach, vues staff. Remplace les 9 listes d'invalidation d'avant.
 *
 * Sans `athleteId`, invalide toutes les séances de tous les athlètes.
 */
export function invalidateWorkouts(
  qc: QueryClient,
  p: { athleteId?: string | null; logId?: string | null },
): Promise<void> {
  const { athleteId, logId } = p;
  return qc.invalidateQueries({
    predicate: (q: Query) => {
      const k = q.queryKey;
      const head = k[0];
      if (typeof head !== "string") return false;
      if (head === "workout-log-detail") return !logId || k[1] === logId || (!!athleteId && keyHas(k, athleteId));
      if (GLOBAL.has(head)) return true;
      if (!ATHLETE_SCOPED.has(head)) return false;
      return !athleteId || keyHas(k, athleteId);
    },
  });
}

// ── Planification : jamais une séance réelle ──────────────────────────────────

/**
 * Une séance est « réelle » dès que l'athlète y a laissé une trace : validée,
 * saisie commencée (`athlete_modifications`), RPE donné, ou rattachée à une
 * activité de montre (`activity_plan_links`). Une opération de
 * planification (raccourcir, déplacer ou supprimer un cycle) ne doit jamais
 * l'effacer : le 2026-11-07, 38 séances réelles rattachées à une semaine de
 * cycle étaient exposées à cette suppression.
 *
 * Les séances gardées perdent seulement leur rattachement à la semaine
 * supprimée (`microcycle_id` → NULL par la clé étrangère `ON DELETE SET NULL`).
 */
export type PlannedWorkoutScope =
  | { microcycleIds: string[] }
  | { athleteId: string; after: string; until: string };

export async function deletePlannedWorkouts(scope: PlannedWorkoutScope): Promise<void> {
  if ("microcycleIds" in scope && scope.microcycleIds.length === 0) return;
  let sel = db().from("workout_logs").select("id");
  if ("microcycleIds" in scope) {
    sel = sel.in("microcycle_id", scope.microcycleIds);
  } else {
    sel = sel
      .eq("athlete_id", scope.athleteId)
      .gt("scheduled_date", scope.after)
      .lte("scheduled_date", scope.until);
  }
  const candidates = unwrapRows<{ id: string }>(
    (await sel.neq("status", "completed").is("athlete_modifications", null).is("rpe_score", null)) as never,
    "Suppression des séances prévues impossible",
  ).map((r) => r.id);

  /*
    Une séance rattachée à une activité de montre (lien `auto` ou `confirmed`)
    compte comme réalisée : jamais supprimée. RPC : le coach doit la voir même
    sans consentement à voir l'activité.
  */
  for (let i = 0; i < candidates.length; i += DELETE_CHUNK) {
    const chunk = candidates.slice(i, i + DELETE_CHUNK);
    const linked = new Set(
      (unwrap<string[]>(
        (await db().rpc("linked_planned_ids", { p_kind: "workout", p_ids: chunk })) as never,
        "Suppression des séances prévues impossible",
      ) ?? []).map(String),
    );
    const ids = chunk.filter((id) => !linked.has(id));
    if (ids.length === 0) continue;
    // Mêmes conditions à la suppression : une séance commencée entre-temps reste.
    check(
      await db().from("workout_logs").delete().in("id", ids)
        .neq("status", "completed").is("athlete_modifications", null).is("rpe_score", null),
      "Suppression des séances prévues impossible",
    );
  }
}

/** Taille des lots d'identifiants (longueur d'URL PostgREST). */
const DELETE_CHUNK = 100;

// ── Occurrences d'une séance-type ─────────────────────────────────────────────

/**
 * Rang (1-based) de la séance `sessionId` du `date` : nombre de séances non
 * annulées de cette séance-type jusqu'à ce jour inclus (tous cycles). Les
 * paramètres multi-semaines d'un exercice en dépendent. Jamais moins de 1.
 */
export async function countSessionOccurrence(athleteId: string, sessionId: string, date: IsoDay): Promise<number> {
  const res = (await db().from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId)
    .eq("session_id", sessionId)
    .neq("status", "skipped")
    .lte("scheduled_date", date)) as unknown as { count?: number | null; data?: unknown; error: { message: string; code?: string } | null };
  if (res.error) throw new ApiError("Lecture de l'occurrence impossible", res.error);
  const n = res.count ?? (Array.isArray(res.data) ? res.data.length : 0);
  return Math.max(n || 1, 1);
}

/** Séances non annulées de ces séances-types jusqu'à `upTo` inclus, par date. */
export async function listSessionOccurrenceLogs(
  athleteId: string,
  sessionIds: string[],
  upTo: IsoDay,
): Promise<{ id: string; session_id: string; scheduled_date: IsoDay }[]> {
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (ids.length === 0) return [];
  // Une requête par séance : reste loin de la limite de 1000 lignes de PostgREST.
  const results = await Promise.all(ids.map(async (sid) => unwrapRows<RawRow>(
    (await db().from("workout_logs")
      .select("id, session_id, scheduled_date")
      .eq("athlete_id", athleteId)
      .eq("session_id", sid)
      .neq("status", "skipped")
      .lte("scheduled_date", upTo)
      .order("scheduled_date")) as never,
    "Lecture des occurrences impossible",
  )));
  return results.flat().map((r) => ({
    id: String(r.id), session_id: String(r.session_id), scheduled_date: String(r.scheduled_date).slice(0, 10),
  }));
}

/**
 * Pose une séance prévue sur chacune des dates données (séance récurrente du
 * coach). Une séance déjà présente ce jour-là n'est pas touchée.
 */
export async function planWorkoutsIfAbsent(rows: {
  athleteId: string;
  coachId: string | null;
  sessionId: string;
  sessionName: string;
  date: IsoDay;
  microcycleId?: string | null;
  weekNumber?: number | null;
}[]): Promise<void> {
  if (rows.length === 0) return;
  check(
    await db().from("workout_logs").upsert(rows.map((r) => ({
      athlete_id: r.athleteId,
      coach_id: r.coachId,
      session_id: r.sessionId,
      session_name: r.sessionName,
      scheduled_date: r.date,
      original_scheduled_date: r.date,
      status: "planned",
      ...(r.microcycleId ? { microcycle_id: r.microcycleId } : {}),
      ...(r.weekNumber != null ? { week_number: r.weekNumber } : {}),
    })), { onConflict: "athlete_id,session_id,scheduled_date", ignoreDuplicates: true }),
    "Placement de la séance impossible",
  );
}
