import { useQuery } from "@tanstack/react-query";
import { formatReps, hasIso } from "@/lib/formatSetsReps";
import { readAppDataKeys } from "@/api/appData";
import { listWorkoutLogs } from "@/api/workouts";
import { listEnergyAssignments } from "@/api/energy";
import { listTestSessionsWithResults } from "@/api/tests";
import { listCompetitionsBetween } from "@/api/competitions";
import { listExerciseComments } from "@/api/coachRetours";
import { getExerciseNames } from "@/api/exercises";
import { QK } from "@/lib/queryKeys";
import type { VideoRequestStatus,
  WeeklyRetourData, WeekComparisonData,
  PerformedExercise, PerformedSet, PlannedExercise, EnergySessionDetail,
  FreeActivityDetail,
} from "@/features/shared/types/retours.types";
import type { SetRow, Exercise, BlockConfig, ArchivedBlock, AthleteModifications, SessionSetLog } from "@/features/shared/types/athlete";
import type { ProgSession, Exercice, Bloc } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams, resolveVideoRequest } from "@/lib/sessionOccurrence";
import { fetchOccurrencesForSessions } from "./useSessionOccurrence";
import { startOfWeek, endOfWeek, subWeeks, format, addDays } from "date-fns";
import { averageWellness, dailyWellness, retoursWellnessHistory } from "@/lib/retoursWellness";
import { wellnessScore } from "@shared/domain/wellness";
import { getDays as getNutritionDays, getStrategy as getNutritionStrategy } from "@/api/nutrition";


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useWeeklyRetours(athleteId: string, weekStartDate: Date) {
  return useQuery({
    queryKey: QK.weeklyRetours(athleteId, format(weekStartDate, "yyyy-MM-dd")),
    queryFn: async (): Promise<WeekComparisonData> => {
      const curStart  = startOfWeek(weekStartDate, { weekStartsOn: 1 });
      const curEnd    = endOfWeek(weekStartDate,   { weekStartsOn: 1 });
      const prevStart = startOfWeek(subWeeks(weekStartDate, 1), { weekStartsOn: 1 });
      const prevEnd   = endOfWeek(subWeeks(weekStartDate, 1),   { weekStartsOn: 1 });

      // Load app_data once (shared between current + previous week)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const appDataMap: Record<string, any> = await readAppDataKeys(athleteId,
        ["asp:wh", "asp:sets", "asp:exos", "asp:blockConfig", "asp:sessionlogs", "asp:blockHistory", "asp:freesess", "asp:prog"]);

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
  const currentExos: Record<string, Exercise[]>     = appDataMap["asp:exos"]          ?? {};
  const currentSets: Record<string, SetRow[]>       = appDataMap["asp:sets"]           ?? {};
  const currentBlockConfig: BlockConfig             = appDataMap["asp:blockConfig"]   ?? {};
  const progSessions: ProgSession[]                 = appDataMap["asp:prog"]          ?? [];
  const blockHistory: ArchivedBlock[]               = appDataMap["asp:blockHistory"]  ?? [];

  // Wellness du bloc courant + blocs archivés, en jours ISO (clés compactes en base)
  const mergedWH = retoursWellnessHistory(appDataMap["asp:wh"], blockHistory);

  // ── Parallel DB queries ──────────────────────────────────────────────────────
  const [workoutList, energyRows, testRows, compRows, nutritionLogs, nutritionStrategy] = await Promise.all([
    listWorkoutLogs({ athleteIds: [athleteId], from: start, to: end, excludeStatuses: ["skipped"] }),
    listEnergyAssignments({ athleteIds: [athleteId], from: start, to: end, join: "summary" }),
    listTestSessionsWithResults(athleteId, start, end),
    listCompetitionsBetween(athleteId, start, end),

    // Nutrition : `app_data` via la couche API (les tables `nutrition_*` n'existent pas).
    getNutritionDays(athleteId, start, end),
    getNutritionStrategy(athleteId),
  ]);

  const workoutIds = workoutList.map((w) => w.id as string);

  // Occurrence de chaque séance (1re, 2e… fois planifiée) → params prévus
  const occurrences = await fetchOccurrencesForSessions(
    athleteId, workoutList.map((w) => w.session_id as string), end,
  ).catch(() => new Map<string, number>());

  // Exercise comments
  const comments = await listExerciseComments(workoutIds).catch((e) => {
    console.warn("[retours] commentaires non chargés", e);
    return [];
  });

  const avgWellness = averageWellness(mergedWH, start, end);

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
  // Noms de la banque (non bloquant ; les ids d'exercices perso ne sont pas des uuid).
  const bankIds = [...allUnknownIds].filter((id) => UUID_RE.test(id));
  if (bankIds.length > 0) {
    const names = await getExerciseNames(bankIds).catch((e) => {
      console.warn("[retours] noms d'exercices non chargés", e);
      return new Map<string, string>();
    });
    for (const [id, name] of names) globalExNameMap.set(id, name);
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
      wellness_day:   mergedWH[w.scheduled_date] ? wellnessScore(mergedWH[w.scheduled_date]) : null,
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
  const energySessions: EnergySessionDetail[] = energyRows.map((e: any) => {
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
    test_sessions: testRows.map((t: any) => ({
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
    competitions: compRows.map((c: any) => ({
      id:              c.id,
      name:            c.name,
      type:            c.type,
      date:            c.date,
      location:        c.location        ?? null,
      athlete_comment: c.athlete_comment ?? null,
      priority:        c.priority        ?? null,
    })),
    avg_wellness:    avgWellness,
    daily_wellness:  dailyWellness(mergedWH, start, end),
    free_activities: freeActivities,
    nutrition_strategy: nutritionStrategy,
    nutrition_logs:     nutritionLogs,
  };
}
