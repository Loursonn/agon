/**
 * Envoi des séances d'un athlète vers Garmin : lecture de ce qu'Agon a
 * programmé sur 7 jours, traduction, rapprochement, appels Training API.
 *
 * Appelé par `provider-garmin-workouts` (cron, clé service_role). Le client
 * Supabase et le client Garmin sont injectés : testable sans réseau.
 */
import { addDays, type IsoDay } from "../domain/dates.ts";
import { bestKgByRef, normalizeMetricName, parseRecordLinks, resolveRecordRef } from "../domain/performance.ts";
import { canonicalJson, sha256Hex, type Db } from "../oauth.ts";
import { GarminTrainingError, type GarminTrainingClient } from "./client.ts";
import { planPushActions, sourceKey, type DesiredWorkout, type PushAction, type PushedRow } from "./plan.ts";
import { resolveStrengthSession, type ProgSessionLite } from "./strength.ts";
import { translateEnergySession, translateStrengthSession } from "./translate.ts";
import type { AgonEnergySession, AthleteTrainingContext, TranslateResult } from "./types.ts";

/** Fenêtre d'envoi : aujourd'hui + 6 jours (décision d'Hugo : les 7 prochains jours). */
export const PUSH_WINDOW_DAYS = 7;

const PLANNED = "planned";
const DONE_OR_STARTED = new Set(["completed", "in_progress"]);

/** Jour calendaire à Paris (les séances sont programmées en heure française). */
export function parisDay(d: Date = new Date()): IsoDay {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} : ${error.message}`);
}

async function hashOf(date: IsoDay, result: TranslateResult): Promise<string> {
  return sha256Hex(canonicalJson(result.ok ? { date, workout: result.workout } : { date, reason: result.reason }));
}

interface Collected {
  desired: DesiredWorkout[];
  doneOrStarted: Set<string>;
}

/** Ce qu'Agon a programmé pour l'athlète sur la fenêtre, traduit. */
export async function collectDesired(db: Db, athleteId: string, today: IsoDay): Promise<Collected> {
  const last = addDays(today, PUSH_WINDOW_DAYS - 1);
  const doneOrStarted = new Set<string>();

  // ── Lectures ──────────────────────────────────────────────────────────────
  const { data: energyRows, error: eErr } = await db
    .from("energy_session_assignments")
    .select("id, scheduled_date, status, energy_sessions(name, session_kind, modality, format, intervals, classique_structure, notes)")
    .eq("athlete_id", athleteId)
    .gte("scheduled_date", today)
    .lte("scheduled_date", last);
  fail("séances énergie", eErr);

  const { data: logRows, error: lErr } = await db
    .from("workout_logs")
    .select("id, session_id, scheduled_date, status")
    .eq("athlete_id", athleteId)
    .gte("scheduled_date", today)
    .lte("scheduled_date", last);
  fail("séances de musculation", lErr);

  const energy = (energyRows ?? []) as Array<{ id: string; scheduled_date: string; status: string; energy_sessions: AgonEnergySession | null }>;
  const logs = (logRows ?? []) as Array<{ id: string; session_id: string | null; scheduled_date: string; status: string }>;
  for (const a of energy) if (DONE_OR_STARTED.has(a.status)) doneOrStarted.add(sourceKey("energy", a.id));
  for (const l of logs) if (DONE_OR_STARTED.has(l.status)) doneOrStarted.add(sourceKey("strength", l.id));

  const plannedEnergy = energy.filter((a) => a.status === PLANNED && a.energy_sessions);
  const plannedLogs = logs.filter((l) => l.status === PLANNED && l.session_id);
  if (plannedEnergy.length === 0 && plannedLogs.length === 0) return { desired: [], doneOrStarted };

  // Références (VMA, FCmax, FTP…) et zones FC par date.
  const { data: refRows, error: rErr } = await db
    .from("performance_logs")
    .select("metric_name, value, unit")
    .eq("athlete_id", athleteId)
    .eq("is_active_reference", true);
  fail("références", rErr);
  const refs: AthleteTrainingContext["refs"] = {};
  for (const r of (refRows ?? []) as Array<{ metric_name: string; value: unknown; unit: string | null }>) {
    const v = Number(r.value);
    if (Number.isFinite(v)) refs[normalizeMetricName(r.metric_name)] = { value: v, unit: r.unit ?? null };
  }
  const boundsByDay = new Map<string, number[] | null>();
  const dates = [...new Set([...plannedEnergy.map((a) => a.scheduled_date), ...plannedLogs.map((l) => l.scheduled_date)])];
  for (const day of dates) {
    const { data, error } = await db.rpc("hr_zone_bounds_at", { p_athlete: athleteId, p_day: day.slice(0, 10) });
    fail("zones FC", error);
    const row = Array.isArray(data) ? data[0] : null;
    const bounds = Array.isArray(row?.bounds) ? (row.bounds as unknown[]).map(Number).filter(Number.isFinite) : null;
    boundsByDay.set(day, bounds && bounds.length ? bounds : null);
  }
  const ctxAt = (day: string): AthleteTrainingContext => ({ hrZoneBounds: boundsByDay.get(day) ?? null, refs });

  const desired: DesiredWorkout[] = [];

  // ── Endurance / spécifique ────────────────────────────────────────────────
  for (const a of plannedEnergy) {
    const date = a.scheduled_date.slice(0, 10);
    const result = translateEnergySession(a.energy_sessions as AgonEnergySession, ctxAt(a.scheduled_date));
    desired.push({ kind: "energy", sourceId: a.id, date, result, hash: await hashOf(date, result) });
  }

  // ── Musculation ───────────────────────────────────────────────────────────
  if (plannedLogs.length > 0) {
    const { data: progRow, error: pErr } = await db
      .from("app_data").select("value").eq("athlete_id", athleteId).eq("key", "asp:prog").maybeSingle();
    fail("programme", pErr);
    const prog = (Array.isArray(progRow?.value) ? progRow.value : []) as ProgSessionLite[];
    const progById = new Map(prog.filter((s) => s && s.id).map((s) => [s.id, s]));
    const strengthLogs = plannedLogs.filter((l) => progById.has(l.session_id as string));

    if (strengthLogs.length > 0) {
      const sessionIds = [...new Set(strengthLogs.map((l) => l.session_id as string))];
      const { data: occRows, error: oErr } = await db
        .from("workout_logs")
        .select("session_id, scheduled_date")
        .eq("athlete_id", athleteId)
        .in("session_id", sessionIds)
        .neq("status", "skipped")
        .lte("scheduled_date", last)
        .range(0, 9999);
      fail("occurrences", oErr);
      const occDates = (occRows ?? []) as Array<{ session_id: string; scheduled_date: string }>;
      // Même règle que l'écran athlète (`countSessionOccurrence`) : séances non annulées jusqu'à ce jour inclus.
      const occurrenceOf = (sessionId: string, day: string) =>
        Math.max(1, occDates.filter((o) => o.session_id === sessionId && o.scheduled_date.slice(0, 10) <= day.slice(0, 10)).length);

      const { data: prRows, error: prErr } = await db.from("exercise_pr_logs").select("exercise_ref, kg").eq("athlete_id", athleteId);
      fail("records", prErr);
      const best = bestKgByRef((prRows ?? []) as Array<{ exercise_ref: string; kg: number }>);

      const { data: linkRows, error: lkErr } = await db
        .from("app_data").select("key, value").eq("athlete_id", athleteId).like("key", "asp:exos%");
      fail("liens de records", lkErr);
      const links = parseRecordLinks(
        ((linkRows ?? []) as Array<{ key: string; value: unknown }>).filter((r) => r.key === "asp:exos" || r.key.startsWith("asp:exos::")),
      );

      const exerciseIds = new Set<string>();
      const methodIds = new Set<string>();
      for (const sid of sessionIds) {
        for (const b of progById.get(sid)?.blocs ?? []) {
          for (const ex of b.exercices ?? []) {
            if (ex.exercise_id) exerciseIds.add(ex.exercise_id);
            if (ex.methode_id) methodIds.add(ex.methode_id);
          }
        }
      }
      const garminById = new Map<string, { category: string; name: string }>();
      if (exerciseIds.size) {
        const { data, error } = await db
          .from("exercises").select("id, garmin_category, garmin_exercise").in("id", [...exerciseIds]);
        fail("exercices", error);
        for (const r of (data ?? []) as Array<{ id: string; garmin_category: string | null; garmin_exercise: string | null }>) {
          if (r.garmin_category && r.garmin_exercise) garminById.set(r.id, { category: r.garmin_category, name: r.garmin_exercise });
        }
      }
      const methodById = new Map<string, string>();
      if (methodIds.size) {
        const { data, error } = await db.from("training_methods").select("id, name").in("id", [...methodIds]);
        fail("méthodes", error);
        for (const r of (data ?? []) as Array<{ id: string; name: string }>) methodById.set(r.id, r.name);
      }

      for (const l of strengthLogs) {
        const date = l.scheduled_date.slice(0, 10);
        const session = progById.get(l.session_id as string) as ProgSessionLite;
        const resolved = resolveStrengthSession(session, occurrenceOf(session.id, date), {
          oneRm: (ex) => {
            const ref = resolveRecordRef(ex, links);
            return ref ? best[ref] ?? null : null;
          },
          garmin: (id) => garminById.get(id) ?? null,
          methodName: (id) => methodById.get(id) ?? null,
        });
        const result = translateStrengthSession(resolved);
        desired.push({ kind: "strength", sourceId: l.id, date, result, hash: await hashOf(date, result) });
      }
    }
  }

  return { desired, doneOrStarted };
}

export async function loadPushed(db: Db, athleteId: string): Promise<PushedRow[]> {
  const { data, error } = await db
    .from("provider_workout_pushes")
    .select("id, source_kind, source_id, scheduled_date, external_workout_id, external_schedule_id, payload_hash, status, attempts, updated_at")
    .eq("athlete_id", athleteId)
    .eq("provider", "garmin");
  fail("séances envoyées", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    kind: r.source_kind as PushedRow["kind"],
    sourceId: String(r.source_id),
    date: String(r.scheduled_date).slice(0, 10),
    externalWorkoutId: (r.external_workout_id as string | null) ?? null,
    externalScheduleId: (r.external_schedule_id as string | null) ?? null,
    hash: (r.payload_hash as string | null) ?? null,
    status: r.status as PushedRow["status"],
    attempts: Number(r.attempts ?? 0),
    updatedAt: String(r.updated_at),
  }));
}

export interface ExecuteReport {
  created: number;
  replaced: number;
  removed: number;
  rejected: number;
  forgotten: number;
  errors: string[];
  stopped: string | null;
}

/** Exécute les actions ; s'arrête pour l'athlète au premier refus d'autorisation ou de quota. */
export async function executeActions(
  db: Db,
  garmin: GarminTrainingClient,
  athleteId: string,
  actions: PushAction[],
  now: () => string = () => new Date().toISOString(),
): Promise<ExecuteReport> {
  const report: ExecuteReport = { created: 0, replaced: 0, removed: 0, rejected: 0, forgotten: 0, errors: [], stopped: null };

  const upsert = async (fields: Record<string, unknown>) => {
    const { error } = await db.from("provider_workout_pushes").upsert(
      { athlete_id: athleteId, provider: "garmin", updated_at: now(), ...fields },
      { onConflict: "provider,source_kind,source_id" },
    );
    fail("suivi des séances envoyées", error);
  };
  const removeRow = async (id: string) => {
    const { error } = await db.from("provider_workout_pushes").delete().eq("id", id);
    fail("suivi des séances envoyées", error);
  };

  for (const action of actions) {
    if (action.type === "forget") {
      await removeRow(action.row.id);
      report.forgotten++;
      continue;
    }
    if (report.stopped) continue;

    // L'état Garmin connu avant cette action (pour ne jamais perdre un identifiant encore valable).
    let liveWorkoutId: string | null = action.row?.externalWorkoutId ?? null;
    let liveScheduleId: string | null = action.row?.externalScheduleId ?? null;
    try {
      if (action.type === "remove") {
        await garmin.deleteWorkout(action.row.externalWorkoutId as string);
        await removeRow(action.row.id);
        report.removed++;
        continue;
      }

      const item = action.item;
      const base = { source_kind: item.kind, source_id: item.sourceId, scheduled_date: item.date, payload_hash: item.hash };

      if (liveWorkoutId) {
        await garmin.deleteWorkout(liveWorkoutId);
        liveWorkoutId = null;
        liveScheduleId = null;
      }

      if (action.type === "reject") {
        const reason = item.result.ok ? "refusée" : item.result.reason;
        await upsert({ ...base, status: "rejected", external_workout_id: null, external_schedule_id: null, last_error: reason, warnings: [], attempts: 0 });
        report.rejected++;
        continue;
      }
      if (!item.result.ok) continue;

      const workoutId = await garmin.createWorkout(item.result.workout);
      liveWorkoutId = workoutId;
      let scheduleId: string | null;
      try {
        scheduleId = await garmin.scheduleWorkout(workoutId, item.date);
      } catch (e) {
        // Séance créée mais pas datée : on la retire plutôt que de laisser un doublon sans date.
        await garmin.deleteWorkout(workoutId).then(() => { liveWorkoutId = null; }, () => {});
        throw e;
      }
      await upsert({
        ...base,
        status: "sent",
        external_workout_id: workoutId,
        external_schedule_id: scheduleId,
        warnings: item.result.warnings,
        last_error: null,
        attempts: 0,
        sent_at: now(),
      });
      if (action.type === "replace") report.replaced++;
      else report.created++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      report.errors.push(message);
      if (action.type !== "remove") {
        const item = action.item;
        await upsert({
          source_kind: item.kind,
          source_id: item.sourceId,
          scheduled_date: item.date,
          payload_hash: item.hash,
          status: "error",
          external_workout_id: liveWorkoutId,
          external_schedule_id: liveWorkoutId ? liveScheduleId : null,
          last_error: message.slice(0, 500),
          attempts: (action.row?.attempts ?? 0) + 1,
        });
      } else {
        const { error } = await db.from("provider_workout_pushes")
          .update({ last_error: message.slice(0, 500), attempts: action.row.attempts + 1, updated_at: now() })
          .eq("id", action.row.id);
        fail("suivi des séances envoyées", error);
      }
      if (e instanceof GarminTrainingError && e.stopsAthlete) report.stopped = message;
    }
  }
  return report;
}

/** Un athlète, de bout en bout. `pushEnabled = false` : retire ce qui est à venir. */
export async function syncAthleteWorkouts(
  db: Db,
  garmin: GarminTrainingClient,
  athleteId: string,
  pushEnabled: boolean,
  opts: { today?: IsoDay; now?: number } = {},
): Promise<ExecuteReport> {
  const today = opts.today ?? parisDay();
  const pushed = await loadPushed(db, athleteId);
  // Envoi coupé sans rien sur Garmin : rien à lire.
  if (!pushEnabled && pushed.length === 0) return executeActions(db, garmin, athleteId, []);
  const collected = await collectDesired(db, athleteId, today);
  // Envoi coupé : plus rien de voulu, mais les séances faites / commencées restent protégées.
  const desired = pushEnabled ? collected.desired : [];
  const actions = planPushActions({ desired, doneOrStarted: collected.doneOrStarted, pushed, today, now: opts.now ?? Date.now() });
  return executeActions(db, garmin, athleteId, actions);
}
