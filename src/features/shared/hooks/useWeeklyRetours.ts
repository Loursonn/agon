import { useQuery } from "@tanstack/react-query";
import { formatReps, hasIso } from "@/lib/formatSetsReps";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { VideoRequestStatus,
  WeeklyRetourData, WeekComparisonData,
  PerformedExercise, PerformedSet, PlannedExercise, WellnessDay, EnergySessionDetail,
  FreeActivityDetail, NutritionStrategy, NutritionDailyLog,
} from "@/features/shared/types/retours.types";
import type { SetRow, Exercise, BlockConfig, ArchivedBlock, AthleteModifications, SessionSetLog } from "@/features/shared/types/athlete";
import type { ProgSession, Exercice, Bloc } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams, resolveVideoRequest } from "@/lib/sessionOccurrence";
import { fetchOccurrencesForSessions } from "./useSessionOccurrence";
import { startOfWeek, endOfWeek, subWeeks, format, eachDayOfInterval, addDays } from "date-fns";
import { normalizeDayMap as normalizeWH } from "@/lib/date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useWeeklyRetours(athleteId: string, weekStartDate: Date) {
  return useQuery({
    queryKey: QK.weeklyRetours(athleteId, format(weekStartDate, "yyyy-MM-dd")),
    queryFn: async (): Promise<WeekComparisonData> => {
      const curStart  = startOfWeek(weekStartDate, { weekStartsOn: 1 });
      const curEnd    = endOfWeek(weekStartDate,   { weekStartsOn: 1 });
      const prevStart = startOfWeek(subWeeks(weekStartDate, 1), { weekStartsOn: 1 });
      const prevEnd   = endOfWeek(subWeeks(weekStartDate, 1),   { weekStartsOn: 1 });

      // Load app_data once (shared between current + previous week)
      const { data: appDataRows } = await db
        .from("app_data")
        .select("key, value")
        .eq("athlete_id", athleteId)
        .in("key", ["asp:wh", "asp:sets", "asp:exos", "asp:blockConfig", "asp:sessionlogs", "asp:blockHistory", "asp:freesess", "asp:prog"]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const appDataMap: Record<string, any> = Object.fromEntries(
        (appDataRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])
      );

      const [currentWeek, previousWeek] = await Promise.all([
        fetchWeekData(athleteId, curStart, curEnd, appDataMap),
        fetchWeekData(athleteId, prevStart, prevEnd, appDataMap),
      ]);

      return { current_week: currentWeek, previous_week: previousWeek };
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!athleteId,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Week number relative to a block's start (1-based). Fallback = 1. */
function calcWeekNum(dateStr: string, blockStartDate: string | null | undefined): number {
  if (!blockStartDate) return 1;
  const d = new Date(dateStr + "T12:00:00").getTime();
  const s = new Date(blockStartDate + "T12:00:00").getTime();
  const n = Math.floor((d - s) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return n >= 1 ? n : 1;
}

/**
 * Merge wellness histories from all archived blocks + current `asp:wh`.
 * Current block takes precedence for any date collision.
 */
function buildMergedWellness(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentWH: Record<string, any>,
  blockHistory: ArchivedBlock[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: Record<string, any> = {};
  for (const block of blockHistory) {
    if (block.wellnessHistory) Object.assign(merged, normalizeWH(block.wellnessHistory));
  }
  Object.assign(merged, normalizeWH(currentWH)); // current block wins
  return merged;
}

/**
 * Given a workout date, find which block it belongs to and return its
 * exos, sets, and blockConfig. Falls back to current block data.
 */
function findBlockForDate(
  dateStr: string,
  currentBlockConfig: BlockConfig,
  currentExos: Record<string, Exercise[]>,
  currentSets: Record<string, SetRow[]>,
  blockHistory: ArchivedBlock[],
): { exos: Record<string, Exercise[]>; sets: Record<string, SetRow[]>; blockConfig: BlockConfig } {
  // Current block: starts at startDate and has no upper bound from our perspective
  if (currentBlockConfig.startDate && dateStr >= currentBlockConfig.startDate) {
    return { exos: currentExos, sets: currentSets, blockConfig: currentBlockConfig };
  }
  // Search archived blocks most-recent first
  for (const block of [...blockHistory].reverse()) {
    const bc = block.blockConfig;
    if (!bc?.startDate) continue;
    const endDate = format(
      addDays(new Date(bc.startDate + "T12:00:00"), bc.totalWeeks * 7),
      "yyyy-MM-dd",
    );
    if (dateStr >= bc.startDate && dateStr <= endDate) {
      return { exos: block.exos ?? {}, sets: block.sets ?? {}, blockConfig: bc };
    }
  }
  // Fallback: current block
  return { exos: currentExos, sets: currentSets, blockConfig: currentBlockConfig };
}

function buildDailyWellness(
  startDate: Date,
  endDate: Date,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergedWH: Record<string, any>,
): Record<string, WellnessDay | null> {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const result: Record<string, WellnessDay | null> = {};
  for (const day of days) {
    const d = format(day, "yyyy-MM-dd");
    const e = mergedWH[d];
    result[d] = e
      ? {
          score:     e.score     ?? 0,
          fatigue:   e.fatigue   ?? 0,
          sommeil:   e.sommeil   ?? 0,
          stress:    e.stress    ?? 0,
          energie:   e.energie   ?? 0,
          doms:      e.doms,
          domsZones: e.domsZones,
          coucher:   e.coucher,
          reveil:    e.reveil,
          sleepDur:  e.sleepDur,
        }
      : null;
  }
  return result;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchWeekData(
  athleteId: string,
  startDate: Date,
  endDate: Date,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appDataMap: Record<string, any>,
): Promise<WeeklyRetourData> {
  const start = format(startDate, "yyyy-MM-dd");
  const end   = format(endDate,   "yyyy-MM-dd");

  // Current block data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentWH: Record<string, any>              = appDataMap["asp:wh"]           ?? {};
  const currentExos: Record<string, Exercise[]>     = appDataMap["asp:exos"]          ?? {};
  const currentSets: Record<string, SetRow[]>       = appDataMap["asp:sets"]           ?? {};
  const currentBlockConfig: BlockConfig             = appDataMap["asp:blockConfig"]   ?? {};
  const progSessions: ProgSession[]                 = appDataMap["asp:prog"]          ?? [];
  const blockHistory: ArchivedBlock[]               = appDataMap["asp:blockHistory"]  ?? [];

  // Merged wellness across all blocks
  const mergedWH = buildMergedWellness(currentWH, blockHistory);

  // ── Parallel DB queries ──────────────────────────────────────────────────────
  const [workoutsRes, energyRes, testsRes, compsRes, nutritionLogsRes, nutritionStrategyRes] = await Promise.all([
    db.from("workout_logs")
      .select("id, session_id, session_name, scheduled_date, status, duration_s, notes, rpe_score, athlete_modifications, week_number")
      .eq("athlete_id", athleteId)
      .not("status", "eq", "skipped")
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .order("scheduled_date"),

    db.from("energy_session_assignments")
      .select("id, scheduled_date, status, notes, rpe_score, block_logs, actual_duration_min, activity_url, energy_sessions(id, name, session_kind, total_duration_s, total_distance_m, intervals)")
      .eq("athlete_id", athleteId)
      .gte("scheduled_date", start)
      .lte("scheduled_date", end),

    db.from("test_sessions")
      .select("id, title, type, date, completed, results_note, results_structured, coach_validated")
      .eq("athlete_id", athleteId)
      .gte("date", start)
      .lte("date", end),

    db.from("competitions")
      .select("id, name, type, date, location, athlete_comment, priority")
      .eq("athlete_id", athleteId)
      .gte("date", start)
      .lte("date", end),

    db.from("nutrition_daily_log")
      .select("id, athlete_id, date, active_calories, total_calories_consumed, glucides_consumed, lipides_consumed, proteines_consumed")
      .eq("athlete_id", athleteId)
      .gte("date", start)
      .lte("date", end)
      .order("date"),

    db.from("nutrition_strategy")
      .select("id, athlete_id, coach_id, strategy, can_track_calories, total_calories_coach, target_weight, surplus_deficit_min, surplus_deficit_max, macros_glucides, macros_lipides, macros_proteines")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workoutList: any[] = workoutsRes.data ?? [];
  const workoutIds = workoutList.map((w) => w.id as string);

  // Occurrence de chaque séance (1re, 2e… fois planifiée) → params prévus
  const occurrences = await fetchOccurrencesForSessions(
    athleteId, workoutList.map((w) => w.session_id as string), end,
  ).catch(() => new Map<string, number>());

  // Exercise comments
  const { data: comments = [] } = workoutIds.length > 0
    ? await db
        .from("workout_exercise_comments")
        .select("id, workout_log_id, exercise_id, exercise_name, comment, created_at, updated_at")
        .in("workout_log_id", workoutIds)
    : { data: [] as unknown[] };

  // Wellness averages (using merged history)
  const scoresInWeek = Object.entries(mergedWH)
    .filter(([d]) => d >= start && d <= end)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(([, v]) => (v as any).score)
    .filter((s): s is number => s != null);
  const avgWellness = scoresInWeek.length > 0
    ? Math.round(scoresInWeek.reduce((a, b) => a + b, 0) / scoresInWeek.length)
    : null;

  // ── Pre-resolve exercise names for all workouts ─────────────────────────────
  // Collect all exercise IDs that appear in sessionSets but may not be in progSession/planned
  const globalExNameMap = new Map<string, string>();
  // Populate from progSessions
  for (const ps of progSessions) {
    for (const b of ps.blocs) {
      for (const ex of b.exercices) globalExNameMap.set(ex.id, ex.exercise_name);
    }
  }
  // Populate from customExercises in each workout
  const allUnknownIds = new Set<string>();
  for (const w of workoutList) {
    const mods = (w.athlete_modifications as AthleteModifications | null) ?? null;
    if (mods?.customExercises) {
      for (const ce of mods.customExercises) {
        if (ce.exerciseId) globalExNameMap.set(ce.exerciseId, ce.name);
        globalExNameMap.set(ce.tempId, ce.name);
      }
    }
    const ss = mods?.sessionSets;
    if (ss) {
      for (const id of Object.keys(ss)) {
        if (!globalExNameMap.has(id)) allUnknownIds.add(id);
      }
    }
  }
  // Single DB query for all unknown exercise IDs
  if (allUnknownIds.size > 0) {
    const { data: exRows } = await db
      .from("exercises")
      .select("id, name")
      .in("id", [...allUnknownIds]);
    for (const row of exRows ?? []) globalExNameMap.set(row.id, row.name);
  }

  // ── Build enriched workouts ──────────────────────────────────────────────────
  const enrichedWorkouts = workoutList.map((w) => {
    // Find which block this workout belongs to (legacy path)
    const { exos, sets, blockConfig } = findBlockForDate(
      w.scheduled_date, currentBlockConfig, currentExos, currentSets, blockHistory,
    );

    const weekNum  = calcWeekNum(w.scheduled_date, blockConfig.startDate);
    const legacyExercises: Exercise[] = exos[w.session_id] ?? [];

    // ── Planned: try asp:prog first, fallback to legacy asp:exos ──────────
    const progSession = progSessions.find((s) => s.id === w.session_id);
    const wkNum = occurrences.get(w.id) ?? (w.week_number as number | undefined) ?? 1;
    // Modif ponctuelle du coach : c'est la version que l'athlète a eue
    const ovr = (w.athlete_modifications as AthleteModifications | null)?.coachOverride;
    const sourceBlocs: Bloc[] = ovr?.blocs?.length ? (ovr.blocs as Bloc[]) : (progSession?.blocs ?? []);
    // Retours vidéo demandés pour cette occurrence + suivi athlète
    const videoSent = (w.athlete_modifications as AthleteModifications | null)?.videoSent ?? {};
    const videoRequests: VideoRequestStatus[] = sourceBlocs.flatMap((b) => b.exercices.flatMap((ex) => {
      const v = resolveVideoRequest(ex, wkNum);
      return v ? [{ exercise_id: ex.id, exercise_name: ex.exercise_name, note: v.note ?? null, sent: !!videoSent[ex.id] }] : [];
    }));

    let planned: PlannedExercise[];
    if (progSession && sourceBlocs.length > 0) {
      // New system: read from asp:prog
      planned = sourceBlocs.flatMap((b) =>
        b.exercices.map((ex: Exercice): PlannedExercise => {
          const params = resolveExerciceParams(ex.params, wkNum);
          // Formateur unique : « 30 s » en iso, « 8-10 » sinon
          const repsRange = params ? formatReps(params) : null;
          const charge = params?.charge?.mode === "global" ? params.charge.value : null;
          return {
            exercise_id:   ex.id,
            exercise_name: ex.exercise_name,
            sets:          params?.nb_series ?? 0,
            reps_range:    repsRange,
            is_iso:        hasIso(params),
            kg:            typeof charge === "number" ? charge : null,
            rir:           params?.rir?.mode === "global" ? (params.rir.value ?? null) : null,
            method:        ex.mode === "methode" ? (ex.methode_id ?? "méthode") : null,
          };
        })
      );
    } else {
      // Legacy: read from asp:exos
      planned = legacyExercises.map((ex) => {
        const cfg = ex.weeks[weekNum] ?? {};
        return {
          exercise_id:   ex.id,
          exercise_name: ex.name,
          sets:          cfg.sets      ?? 0,
          reps_range:    cfg.repsRange ?? null,
          kg:            cfg.kg        ?? null,
          rir:           cfg.rir       ?? null,
          method:        cfg.method    ?? null,
        };
      });
    }

    // ── Performed: try athlete_modifications first, fallback to asp:sets ──
    const mods = (w.athlete_modifications as AthleteModifications | null) ?? null;
    const sessionSets = mods?.sessionSets ?? null;

    let performed: PerformedExercise[];
    if (sessionSets && Object.keys(sessionSets).length > 0) {
      // New system: read from workout_logs.athlete_modifications.sessionSets
      // Name lookup uses pre-resolved globalExNameMap + planned exercises
      for (const p of planned) globalExNameMap.set(p.exercise_id, p.exercise_name);

      performed = Object.entries(sessionSets)
        .map(([exId, rawSets]): PerformedExercise => {
          const allSets = rawSets as SessionSetLog[];
          return {
            exercise_id:   exId,
            exercise_name: globalExNameMap.get(exId) ?? exId,
            sets: allSets.map((s, i): PerformedSet => ({
              set_num: i + 1,
              kg:     s.kg   ?? null,
              reps:   s.reps ?? null,
              rir:    s.rir  ?? null,
              method: null,
              done:   s.done,
            })),
          };
        });
    } else {
      // Legacy: read from asp:sets
      performed = legacyExercises
        .map((ex): PerformedExercise | null => {
          const rows = (sets[`${ex.id}_${weekNum}`] ?? [])
            .filter((r) => r.done)
            .map((r, i): PerformedSet => ({
              set_num: i + 1,
              kg:     r.kg   ?? null,
              reps:   r.reps ?? null,
              rir:    r.rir  ?? null,
              method: r.type ?? null,
              done:   r.done ?? true,
            }));
          return rows.length > 0
            ? { exercise_id: ex.id, exercise_name: ex.name, sets: rows }
            : null;
        })
        .filter((e): e is PerformedExercise => e !== null);
    }

    return {
      id:             w.id,
      session_name:   w.session_name,
      scheduled_date: w.scheduled_date,
      status:         w.status,
      duration_s:     w.duration_s ?? null,
      notes:          w.notes      ?? null,
      rpe_score:      w.rpe_score  ?? null,
      wellness_day:   mergedWH[w.scheduled_date]?.score ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercise_comments: (comments as any[]).filter((c) => c.workout_log_id === w.id),
      planned_exercises:   planned,
      performed_exercises: performed,
      athlete_session_comment:   mods?.sessionComment ?? null,
      athlete_exercise_comments: mods?.exerciceComments ?? {},
      athlete_forme:             mods?.sessionForme ?? null,
      session_id:                (w.session_id as string | null) ?? null,
      occurrence:                occurrences.get(w.id) ?? null,
      video_requests:            videoRequests,
    };
  });

  // ── Energy sessions ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const energySessions: EnergySessionDetail[] = (energyRes.data ?? []).map((e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const es = (e.energy_sessions as any) ?? {};
    let note: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stepLog: Record<string, any> | null = null;
    if (e.notes) {
      try {
        const parsed = JSON.parse(e.notes);
        if (parsed.__type === "step_log_v1") { stepLog = parsed.steps ?? null; note = parsed.session_comment ?? null; }
        else note = e.notes;
      } catch { note = e.notes; }
    }
    const blockLogs = (e.block_logs ?? {}) as Record<string, { done: boolean }>;
    const blVals = Object.values(blockLogs);
    const partial = blVals.length > 0 && blVals.some(b => b.done) && blVals.some(b => !b.done);
    return {
      id:            e.id,
      session_label: es.name             ?? "Session énergétique",
      date:          e.scheduled_date,
      status:        e.status            ?? "planned",
      completed:     e.status === "completed",
      partial,
      duration_min:  es.total_duration_s != null ? Math.round(es.total_duration_s / 60) : null,
      actual_duration_min: e.actual_duration_min ?? null,
      distance_m:    es.total_distance_m ?? null,
      session_kind:  es.session_kind     ?? null,
      note,
      rpe_score:     e.rpe_score         ?? null,
      intervals:     es.intervals        ?? [],
      step_log:      stepLog,
      block_logs:    e.block_logs        ?? null,
      activity_url:  (e as Record<string, unknown>).activity_url as string | null ?? null,
    };
  });

  // ── Free activities ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFree: any[] = appDataMap["asp:freesess"] ?? [];
  const freeActivities: FreeActivityDetail[] = allFree
    .filter((f) => f.date && f.date >= start && f.date <= end)
    .map((f) => ({
      id:         f.id,
      name:       f.name ?? f.sport ?? "Activité libre",
      date:       f.date,
      sport:      f.sport      ?? undefined,
      sportEmoji: f.sportEmoji ?? undefined,
      duration:   f.duration   ?? undefined,
      intensity:  f.intensity  ?? undefined,
      note:       f.note       ?? undefined,
    }));

  return {
    week_number:    calcWeekNum(start, currentBlockConfig.startDate),
    start_date:     start,
    end_date:       end,
    workouts:       enrichedWorkouts,
    energy_sessions: energySessions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    test_sessions: (testsRes.data ?? []).map((t: any) => ({
      id:                  t.id,
      title:               t.title,
      type:                t.type,
      date:                t.date,
      completed:           t.completed,
      results_note:        t.results_note        ?? null,
      results_structured:  t.results_structured  ?? null,
      coach_validated:     t.coach_validated      ?? null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    competitions: (compsRes.data ?? []).map((c: any) => ({
      id:              c.id,
      name:            c.name,
      type:            c.type,
      date:            c.date,
      location:        c.location        ?? null,
      athlete_comment: c.athlete_comment ?? null,
      priority:        c.priority        ?? null,
    })),
    avg_wellness:    avgWellness,
    daily_wellness:  buildDailyWellness(startDate, endDate, mergedWH),
    free_activities: freeActivities,
    nutrition_strategy: (nutritionStrategyRes.data as NutritionStrategy | null) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nutrition_logs: ((nutritionLogsRes.data ?? []) as any[]).map((n): NutritionDailyLog => ({
      id:                      n.id,
      athlete_id:              n.athlete_id,
      date:                    n.date,
      active_calories:         n.active_calories         ?? null,
      total_calories_consumed: n.total_calories_consumed ?? null,
      glucides_consumed:       n.glucides_consumed       ?? null,
      lipides_consumed:        n.lipides_consumed        ?? null,
      proteines_consumed:      n.proteines_consumed      ?? null,
    })),
  };
}
