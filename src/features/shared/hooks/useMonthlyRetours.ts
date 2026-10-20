import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { VideoRequestStatus,
  MonthlyRetourData, DailyData, WorkoutDetail,
  PerformedExercise, PerformedSet, PlannedExercise, WellnessDay,
  EnergySessionDetail, WorkoutExerciseComment, FreeActivityDetail,
  NutritionStrategy, NutritionDailyLog,
} from "@/features/shared/types/retours.types";
import type { SetRow, Exercise, BlockConfig, ArchivedBlock, AthleteModifications, SessionSetLog } from "@/features/shared/types/athlete";
import type { ProgSession, Exercice, Bloc } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams, resolveVideoRequest } from "@/lib/sessionOccurrence";
import { fetchOccurrencesForSessions } from "./useSessionOccurrence";
import { startOfMonth, endOfMonth, format, eachDayOfInterval, addDays } from "date-fns";
import { normalizeDayMap as normalizeWH } from "@/lib/date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useMonthlyRetours(athleteId: string, monthStart: Date) {
  const monthKey = format(monthStart, "yyyy-MM");
  return useQuery({
    queryKey: QK.monthlyRetours(athleteId, monthKey),
    queryFn: () => fetchMonthData(athleteId, monthStart),
    staleTime: 1000 * 60 * 5,
    enabled: !!athleteId,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcWeekNum(dateStr: string, blockStartDate: string | null | undefined): number {
  if (!blockStartDate) return 1;
  const d = new Date(dateStr + "T12:00:00").getTime();
  const s = new Date(blockStartDate + "T12:00:00").getTime();
  const n = Math.floor((d - s) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return n >= 1 ? n : 1;
}

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
  Object.assign(merged, normalizeWH(currentWH));
  return merged;
}

function findBlockForDate(
  dateStr: string,
  currentBlockConfig: BlockConfig,
  currentExos: Record<string, Exercise[]>,
  currentSets: Record<string, SetRow[]>,
  blockHistory: ArchivedBlock[],
): { exos: Record<string, Exercise[]>; sets: Record<string, SetRow[]>; blockConfig: BlockConfig } {
  if (currentBlockConfig.startDate && dateStr >= currentBlockConfig.startDate) {
    return { exos: currentExos, sets: currentSets, blockConfig: currentBlockConfig };
  }
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
  return { exos: currentExos, sets: currentSets, blockConfig: currentBlockConfig };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWellnessDay(entry: any): WellnessDay | null {
  if (!entry) return null;
  return {
    score:     entry.score     ?? 0,
    fatigue:   entry.fatigue   ?? 0,
    sommeil:   entry.sommeil   ?? 0,
    stress:    entry.stress    ?? 0,
    energie:   entry.energie   ?? 0,
    doms:      entry.doms,
    domsZones: entry.domsZones,
    coucher:   entry.coucher,
    reveil:    entry.reveil,
    sleepDur:  entry.sleepDur,
  };
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchMonthData(athleteId: string, monthStart: Date): Promise<MonthlyRetourData> {
  const start = format(startOfMonth(monthStart), "yyyy-MM-dd");
  const end   = format(endOfMonth(monthStart),   "yyyy-MM-dd");

  // ── 1. Load app_data + DB tables in parallel ─────────────────────────────
  const [appDataRes, workoutsRes, energyRes, testsRes, compsRes, nutritionLogsRes, nutritionStrategyRes] = await Promise.all([
    db.from("app_data")
      .select("key, value")
      .eq("athlete_id", athleteId)
      .in("key", ["asp:wh", "asp:sets", "asp:exos", "asp:blockConfig", "asp:blockHistory", "asp:freesess", "asp:prog"]),

    db.from("workout_logs")
      .select("id, session_id, session_name, scheduled_date, status, duration_s, notes, rpe_score, athlete_modifications, week_number")
      .eq("athlete_id", athleteId)
      .not("status", "eq", "skipped")
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .order("scheduled_date"),

    db.from("energy_session_assignments")
      .select("id, scheduled_date, status, notes, rpe_score, block_logs, energy_sessions(id, name, session_kind, total_duration_s, total_distance_m, intervals)")
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

  // Extract app_data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appDataMap: Record<string, any> = Object.fromEntries(
    (appDataRes.data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentWH: Record<string, any>        = appDataMap["asp:wh"]          ?? {};
  const currentExos: Record<string, Exercise[]> = appDataMap["asp:exos"]      ?? {};
  const currentSets: Record<string, SetRow[]>   = appDataMap["asp:sets"]       ?? {};
  const currentBlockConfig: BlockConfig         = appDataMap["asp:blockConfig"] ?? {};
  const blockHistory: ArchivedBlock[]           = appDataMap["asp:blockHistory"] ?? [];
  const progSessions: ProgSession[]             = appDataMap["asp:prog"]        ?? [];

  const mergedWH = buildMergedWellness(currentWH, blockHistory);

  // ── 2. Exercise comments ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workoutList: any[] = workoutsRes.data ?? [];
  const workoutIds = workoutList.map((w) => w.id as string);

  // Occurrence de chaque séance (1re, 2e… fois planifiée) → params prévus
  const occurrences = await fetchOccurrencesForSessions(
    athleteId, workoutList.map((w) => w.session_id as string), end,
  ).catch(() => new Map<string, number>());

  const { data: commentsData = [] } = workoutIds.length > 0
    ? await db
        .from("workout_exercise_comments")
        .select("id, workout_log_id, exercise_id, exercise_name, comment, created_at, updated_at")
        .in("workout_log_id", workoutIds)
    : { data: [] as unknown[] };

  const commentsByWorkout: Record<string, WorkoutExerciseComment[]> = {};
  for (const c of commentsData as WorkoutExerciseComment[]) {
    if (!commentsByWorkout[c.workout_log_id]) commentsByWorkout[c.workout_log_id] = [];
    commentsByWorkout[c.workout_log_id].push(c);
  }

  // ── Pre-resolve exercise names ───────────────────────────────────────────
  const globalExNameMap = new Map<string, string>();
  for (const ps of progSessions) {
    for (const b of ps.blocs) {
      for (const ex of b.exercices) globalExNameMap.set(ex.id, ex.exercise_name);
    }
  }
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
  if (allUnknownIds.size > 0) {
    const { data: exRows } = await db
      .from("exercises")
      .select("id, name")
      .in("id", [...allUnknownIds]);
    for (const row of exRows ?? []) globalExNameMap.set(row.id, row.name);
  }

  // ── 3. Build workouts ────────────────────────────────────────────────────
  const workouts: WorkoutDetail[] = workoutList.map((w) => {
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
      planned = sourceBlocs.flatMap((b) =>
        b.exercices.map((ex: Exercice): PlannedExercise => {
          const params = resolveExerciceParams(ex.params, wkNum);
          const repsRange = params
            ? (params.reps.mode === "global"
              ? (params.reps_max?.mode === "global" && params.reps_max.value != null && params.reps_max.value !== params.reps.value
                ? `${params.reps.value}-${params.reps_max.value}`
                : String(params.reps.value))
              : params.reps.values.join("/"))
            : null;
          const charge = params?.charge?.mode === "global" ? params.charge.value : null;
          return {
            exercise_id:   ex.id,
            exercise_name: ex.exercise_name,
            sets:          params?.nb_series ?? 0,
            reps_range:    repsRange,
            kg:            typeof charge === "number" ? charge : null,
            rir:           params?.rir?.mode === "global" ? (params.rir.value ?? null) : null,
            method:        ex.mode === "methode" ? (ex.methode_id ?? "méthode") : null,
          };
        })
      );
    } else {
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

    const sessionType: 'muscu' | 'specific' = (progSession
      ? progSession.blocs.some(b => b.category && ["halterophilie", "plio"].includes(b.category))
      : legacyExercises.some((ex) => ex.exType && ["halterophilie", "plio"].includes(ex.exType))
    ) ? "specific" : "muscu";

    return {
      id:             w.id,
      session_name:   w.session_name,
      scheduled_date: w.scheduled_date,
      status:         w.status,
      session_type:   sessionType,
      duration_s:     w.duration_s ?? null,
      notes:          w.notes      ?? null,
      rpe_score:      w.rpe_score  ?? null,
      wellness_day:   mergedWH[w.scheduled_date]?.score ?? null,
      planned_exercises:   planned,
      performed_exercises: performed,
      exercise_comments:   commentsByWorkout[w.id] ?? [],
      athlete_session_comment:   mods?.sessionComment ?? null,
      athlete_exercise_comments: mods?.exerciceComments ?? {},
      athlete_forme:             mods?.sessionForme ?? null,
      session_id:                (w.session_id as string | null) ?? null,
      occurrence:                occurrences.get(w.id) ?? null,
      video_requests:            videoRequests,
    };
  });

  // ── 4. Energy sessions ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const energySessions: EnergySessionDetail[] = (energyRes.data ?? []).map((e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const es = (e.energy_sessions as any) ?? {};
    // notes may be plain text or JSON step_log_v1
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
      distance_m:    es.total_distance_m ?? null,
      session_kind:  es.session_kind     ?? null,
      note,
      rpe_score:     e.rpe_score         ?? null,
      intervals:     es.intervals        ?? [],
      step_log:      stepLog,
      block_logs:    e.block_logs        ?? null,
    };
  });

  // ── 5. Daily data ────────────────────────────────────────────────────────
  const allDays = eachDayOfInterval({
    start: startOfMonth(new Date(start + "T12:00:00")),
    end:   endOfMonth(new Date(start + "T12:00:00")),
  });

  const compDates  = new Set((compsRes.data ?? []).map((c: { date: string }) => c.date));
  const testDates  = new Set((testsRes.data ?? []).map((t: { date: string }) => t.date));
  const doneByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.status === "completed")
      doneByDate[w.scheduled_date] = (doneByDate[w.scheduled_date] ?? 0) + 1;
  }

  // Free activities
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
  const freeByDate: Record<string, number> = {};
  for (const f of freeActivities) freeByDate[f.date] = (freeByDate[f.date] ?? 0) + 1;

  const daily_data: Record<string, DailyData> = {};
  for (const day of allDays) {
    const d = format(day, "yyyy-MM-dd");
    daily_data[d] = {
      date:                d,
      wellness:            toWellnessDay(mergedWH[d]),
      workouts_completed:  doneByDate[d]    ?? 0,
      has_competition:     compDates.has(d),
      has_test:            testDates.has(d),
      free_activity_count: freeByDate[d]    ?? 0,
    };
  }

  // ── 6. Aggregates ────────────────────────────────────────────────────────
  const wellnessScores = Object.values(daily_data)
    .map((d) => d.wellness?.score)
    .filter((s): s is number => s != null);
  const avg_wellness = wellnessScores.length > 0
    ? Math.round(wellnessScores.reduce((a, b) => a + b, 0) / wellnessScores.length)
    : null;

  const completed      = workouts.filter((w) => w.status === "completed");
  const energyDone     = energySessions.filter((e) => e.completed).length;

  return {
    month:      format(monthStart, "yyyy-MM"),
    start_date: start,
    end_date:   end,
    avg_wellness,
    workouts_completed: completed.length + energyDone,
    workouts_total:     workouts.length  + energySessions.length,
    workouts_by_type: {
      muscu:    completed.filter((w) => w.session_type === "muscu").length,
      specific: completed.filter((w) => w.session_type === "specific").length,
      energy:   energySessions.filter((e) => e.completed).length,
    },
    tests_completed: (testsRes.data ?? []).filter((t: { completed: boolean }) => t.completed).length,
    daily_data,
    workouts,
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
