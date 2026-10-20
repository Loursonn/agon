/**
 * useWorkoutSession — fetches a workout_log by id and resolves the corresponding
 * ProgSession from app_data, returning workout-ready data for the athlete fill page.
 *
 * Supports two session formats:
 *   NEW: ProgSession UUID — blocs/exercices stored in app_data (key=asp:prog)
 *   LEGACY: session id like "s_TIMESTAMP_x" — exercises in app_data (key=asp:exos::cycleId)
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { defaultExerciceParams } from "@/features/coach/components/programmation/types";
import type { Bloc, ExerciceParams, VideoRequest } from "@/features/coach/components/programmation/types";
import type { AthleteModifications, Exercise, WeekConfig } from "../types/athlete";
import type { FicheAttachment } from "../types/fiches";
import { resolveExerciceParams, resolveVideoRequest } from "@/lib/sessionOccurrence";
import { fetchSessionOccurrence } from "./useSessionOccurrence";

export interface WorkoutExerciceData {
  id: string;
  exercise_id?: string;
  exercise_name: string;
  muscle?: string;
  params: ExerciceParams;
  mode: "classique" | "methode" | "libre";
  libre_text?: string;
  methode_id?: string;
  comment?: string;
  superset_with_next?: boolean;
  /** Retour vidéo demandé par le coach pour cette séance (null si aucun) */
  video_request?: VideoRequest | null;
}

export interface WorkoutBlocData {
  id: string;
  name: string;
  color?: string;
  series_mode: "libre" | "fixe";
  series_count?: number;
  timing_mode: "libre" | "depart" | "repos";
  timing_repos_min?: number;
  timing_repos_sec?: number;
  timing_depart_min?: number;
  timing_depart_sec?: number;
  instructions?: string;
  /** Fiches du bloc (brutes : résoudre avec resolveFicheForWeek(att, weekNumber)) */
  fiches?: FicheAttachment[];
  exercices: WorkoutExerciceData[];
}

export interface WorkoutSessionResult {
  isLoading: boolean;
  workoutLogId: string | null;
  sessionId: string | null;
  sessionName: string;
  sessionShort: string;
  blocs: WorkoutBlocData[];
  status: string;
  rpeScore: number | null;
  scheduledDate: string | null;
  weekNumber: number;
  /** Fiches de la séance (brutes : résoudre avec resolveFicheForWeek) */
  sessionFiches: FicheAttachment[];
  athleteModifications: AthleteModifications | null;
  rescheduledByAthlete: boolean;
  originalScheduledDate: string | null;
}

// ── Legacy format helpers ─────────────────────────────────────────────────────

function parseReps(repsRange?: string): number {
  if (!repsRange) return 8;
  const match = repsRange.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

function weekConfigToParams(wc: WeekConfig | undefined, fallbackSets = 3): ExerciceParams {
  if (!wc) return defaultExerciceParams(fallbackSets);
  return {
    nb_series: wc.sets ?? fallbackSets,
    reps: { mode: "global", value: parseReps(wc.repsRange) },
    reps_mode: { mode: "global", value: "EC" },
    charge_unit: wc.pdc ? "PDC" : wc.pct_rm !== undefined ? "%RM" : "kg",
    charge: {
      mode: "global",
      value: wc.pdc ? null : wc.pct_rm !== undefined ? wc.pct_rm : (wc.kg ?? null),
    },
    rir: { mode: "global", value: wc.rir ?? null },
    tempo: { mode: "global", value: wc.tempo ?? "" },
  };
}

function buildLegacyBlocs(
  sessionId: string,
  rows: Array<{ key: string; value: unknown }>,
  weekNumber: number,
): WorkoutBlocData[] {
  // Find ExosMap that contains this sessionId
  let exercises: Exercise[] | null = null;
  for (const row of rows) {
    const exosMap = row.value as Record<string, Exercise[]>;
    if (exosMap && exosMap[sessionId]) {
      exercises = exosMap[sessionId];
      break;
    }
  }
  if (!exercises || exercises.length === 0) return [];

  // Group by bloc field
  const grouped = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const blocName = ex.bloc ?? "Séance";
    const arr = grouped.get(blocName) ?? [];
    arr.push(ex);
    grouped.set(blocName, arr);
  }

  return Array.from(grouped.entries()).map(([blocName, exList], idx) => ({
    id: `legacy-bloc-${idx}`,
    name: blocName,
    series_mode: "libre" as const,
    timing_mode: "libre" as const,
    exercices: exList.map((ex) => {
      // weeks keys are stored as strings in JSON
      const wc: WeekConfig | undefined =
        (ex.weeks as Record<string, WeekConfig>)?.[String(weekNumber)] ??
        (ex.weeks as Record<string, WeekConfig>)?.["1"] ??
        undefined;
      return {
        id: ex.id,
        exercise_id: ex.exercise_id,
        exercise_name: ex.name,
        muscle: ex.target,
        params: weekConfigToParams(wc, wc?.sets ?? 3),
        mode: "classique" as const,
      };
    }),
  }));
}

// ── ProgSession → WorkoutBlocData ──────────────────────────────────────────────

/**
 * Builds display-ready blocs from a ProgSession's blocs, resolving per-week
 * params to `weekNumber`. Shared by the normal template path and the coach
 * per-day override path (override passes flat single-week blocs + week 1).
 */
function buildProgBlocs(
  progBlocs: Bloc[],
  weekNumber: number,
): WorkoutBlocData[] {
  return progBlocs.map((bloc) => {
    const nbSeriesFixed =
      bloc.series_mode === "fixe" && bloc.series_count
        ? bloc.series_count
        : null;

    return {
      id: bloc.id,
      name: bloc.name,
      color: bloc.color,
      series_mode: bloc.series_mode,
      series_count: bloc.series_count,
      timing_mode: bloc.timing_mode,
      timing_repos_min: bloc.timing_repos_min,
      timing_repos_sec: bloc.timing_repos_sec,
      timing_depart_min: bloc.timing_depart_min,
      timing_depart_sec: bloc.timing_depart_sec,
      instructions: bloc.instructions,
      fiches: bloc.fiches,
      exercices: bloc.exercices.map((ex) => {
        // Params par occurrence (Record) ou plats ; une occurrence sans valeur
        // propre reprend la dernière définie avant elle.
        const params: ExerciceParams =
          resolveExerciceParams(ex.params, weekNumber) ?? defaultExerciceParams();

        // Guard against incomplete/corrupt stored params
        const def = defaultExerciceParams(params.nb_series);
        const safeParams: ExerciceParams = {
          ...def,
          ...params,
          reps: params.reps ?? def.reps,
          reps_mode: params.reps_mode ?? def.reps_mode,
          charge: params.charge ?? def.charge,
          rir: params.rir ?? def.rir,
          tempo: params.tempo ?? def.tempo,
        };

        const effectiveNbSeries = nbSeriesFixed ?? safeParams.nb_series;

        return {
          id: ex.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          muscle: (ex as { muscle?: string }).muscle,
          params: { ...safeParams, nb_series: effectiveNbSeries },
          mode: ex.mode,
          libre_text: ex.libre_text,
          methode_id: ex.methode_id,
          comment: (ex as { comment?: string }).comment,
          superset_with_next: ex.superset_with_next,
          video_request: resolveVideoRequest(ex, weekNumber),
        };
      }),
    };
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkoutSession(workoutLogId: string | undefined): WorkoutSessionResult {
  const { athleteId } = useAthleteContext();

  const { data: wlog, isLoading: loadingLog } = useQuery({
    queryKey: ["workout-log-detail", workoutLogId],
    enabled: !!workoutLogId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select(
          "id, session_id, session_name, status, rpe_score, scheduled_date, athlete_modifications, microcycle_id, original_scheduled_date, rescheduled_by_athlete, week_number"
        )
        .eq("id", workoutLogId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: microcycle } = useQuery({
    queryKey: ["microcycle", wlog?.microcycle_id],
    enabled: !!wlog?.microcycle_id,
    staleTime: 300_000,
    queryFn: async () => {
      const id = wlog?.microcycle_id;
      if (!id) return null;
      const { data } = await supabase
        .from("microcycles")
        .select("week_number, cycle_id")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: progSessions = [], isLoading: loadingSessions } = useProgrammation(athleteId);

  // Legacy fallback: enabled once progSessions loaded and session_id not found in new format
  const needsLegacy =
    !!wlog && !loadingSessions && progSessions.every((s) => s.id !== wlog.session_id);

  const { data: legacyExosRows = [], isLoading: loadingLegacy } = useQuery({
    queryKey: ["legacy-exos", athleteId],
    enabled: needsLegacy,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_data")
        .select("key, value")
        .eq("athlete_id", athleteId)
        .like("key", "asp:exos::%");
      return data ?? [];
    },
  });

  // Occurrence de la séance = rang chronologique de ce log parmi les logs non
  // « skipped » de la même séance (1re fois = 1, 2e fois = 2…), tous cycles confondus.
  const { data: sessionRank, isLoading: loadingRank } = useQuery({
    queryKey: ["session-occurrence", athleteId, wlog?.session_id, wlog?.scheduled_date],
    enabled: !!athleteId && !!wlog?.session_id && !!wlog?.scheduled_date,
    staleTime: 30_000,
    queryFn: () => fetchSessionOccurrence(athleteId!, wlog!.session_id, wlog!.scheduled_date),
  });

  return useMemo(() => {
    // Legacy (asp:exos) : semaines de bloc, pas d'occurrences
    const legacyWeek = wlog?.week_number ?? microcycle?.week_number ?? 1;
    const weekNumber = sessionRank ?? legacyWeek;
    const isLoading = loadingLog || loadingSessions || loadingRank || (needsLegacy && loadingLegacy);

    const empty: WorkoutSessionResult = {
      isLoading,
      workoutLogId: null,
      sessionId: null,
      sessionName: "",
      sessionShort: "",
      blocs: [],
      status: "planned",
      rpeScore: null,
      scheduledDate: null,
      weekNumber: 1,
      sessionFiches: [],
      athleteModifications: null,
      rescheduledByAthlete: false,
      originalScheduledDate: null,
    };

    if (!wlog) return empty;

    // ── Coach per-day override — self-contained, wins over template ──────────
    const earlyMods = (wlog.athlete_modifications as AthleteModifications | null) ?? null;
    if (earlyMods?.coachOverride?.blocs?.length) {
      const overrideBlocs = buildProgBlocs(
        earlyMods.coachOverride.blocs as Bloc[],
        1,      // override is stored flattened to a single week
      );
      const progSess = progSessions.find((s) => s.id === wlog.session_id);
      return {
        isLoading: false,
        workoutLogId: wlog.id,
        sessionId: wlog.session_id,
        sessionName: progSess?.name ?? wlog.session_name,
        sessionShort: (progSess?.short ?? wlog.session_name).slice(0, 3).toUpperCase(),
        blocs: overrideBlocs,
        status: wlog.status,
        rpeScore: wlog.rpe_score ?? null,
        scheduledDate: wlog.scheduled_date,
        weekNumber,
        sessionFiches: earlyMods.coachOverride.fiches ?? [],
        athleteModifications: earlyMods,
        rescheduledByAthlete: wlog.rescheduled_by_athlete ?? false,
        originalScheduledDate: wlog.original_scheduled_date ?? null,
      };
    }

    const progSession = progSessions.find((s) => s.id === wlog.session_id);

    if (!progSession) {
      // Still loading legacy data
      if (needsLegacy && loadingLegacy) {
        return { ...empty, isLoading: true };
      }

      // Build from legacy exos format
      const legacyBlocs = buildLegacyBlocs(wlog.session_id, legacyExosRows, legacyWeek);

      return {
        isLoading: false,
        workoutLogId: wlog.id,
        sessionId: wlog.session_id,
        sessionName: wlog.session_name,
        sessionShort: wlog.session_name.slice(0, 3).toUpperCase(),
        blocs: legacyBlocs,
        status: wlog.status,
        rpeScore: wlog.rpe_score ?? null,
        scheduledDate: wlog.scheduled_date,
        weekNumber,
        sessionFiches: [],
        athleteModifications: (wlog.athlete_modifications as AthleteModifications | null) ?? null,
        rescheduledByAthlete: wlog.rescheduled_by_athlete ?? false,
        originalScheduledDate: wlog.original_scheduled_date ?? null,
      };
    }

    const mods =
      (wlog.athlete_modifications as AthleteModifications | null) ?? null;

    const blocs = buildProgBlocs(progSession.blocs, weekNumber);

    return {
      isLoading: false,
      workoutLogId: wlog.id,
      sessionId: wlog.session_id,
      sessionName: progSession.name,
      sessionShort: progSession.short,
      blocs,
      status: wlog.status,
      rpeScore: wlog.rpe_score ?? null,
      scheduledDate: wlog.scheduled_date,
      weekNumber,
      sessionFiches: progSession.fiches ?? [],
      athleteModifications: mods,
      rescheduledByAthlete: wlog.rescheduled_by_athlete ?? false,
      originalScheduledDate: wlog.original_scheduled_date ?? null,
    };
  }, [wlog, progSessions, microcycle, loadingLog, loadingSessions, needsLegacy, loadingLegacy, legacyExosRows, sessionRank, loadingRank]);
}
