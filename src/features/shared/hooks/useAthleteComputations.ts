import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWorkoutStats, workoutKeys } from "@/api/workouts";
import { DEF_METHODS } from "@/lib/exercises";
import { getAllPRs, getMuscSets, getCombinedData } from "@/lib/calculations";
import { calcScore, getReco } from "@/lib/wellness";
import type { ExosMap, SetsMap, Session, BlockConfig, Goals, WellnessData } from "../types/athlete";

interface ComputationInput {
  exos: ExosMap;
  exMeta: Record<string, unknown>;
  sets: SetsMap;
  sessions: Session[];
  blockConfig: BlockConfig;
  goals: Goals;
  completedSessions: Record<number, string[]>;
  customMethods: unknown[];
  wellness: WellnessData | null;
  wellnessHistory: Record<string, WellnessData>;
  /**
   * Athlète affiché. Quand il est fourni, la série et le total de séances
   * viennent de `workout_logs` (source réelle) au lieu de l'ancien
   * `asp:completed`, abandonné depuis juin (≈ 0 pour tout le monde).
   */
  athleteId?: string | null;
}

export function useAthleteComputations(s: ComputationInput) {
  const {
    exos, exMeta, sets, sessions, blockConfig, goals,
    completedSessions, customMethods, wellness, wellnessHistory, athleteId,
  } = s;

  const { data: workoutStats } = useQuery({
    queryKey: workoutKeys.stats(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getWorkoutStats(athleteId!),
  });

  const tw = blockConfig.totalWeeks || 6;
  const dw = blockConfig.deloadWeek || 0;

  const allMethods = useMemo(
    () => ({ ...DEF_METHODS, ...Object.fromEntries((customMethods as Array<{ key: string }>).map(m => [m.key, m])) }),
    [customMethods],
  );

  const weeksArr = useMemo(() => Array.from({ length: tw }, (_, i) => i + 1), [tw]);

  const isDeload = useMemo(() => (w: number) => !!(blockConfig.deloadWeek && w === blockConfig.deloadWeek), [blockConfig.deloadWeek]);

  const weeklyTarget = useMemo(() => {
    const t: Record<number, number> = {};
    for (let w = 1; w <= tw; w++) {
      const n = sessions.filter(s => (exos[s.id] || []).some(ex => ex.weeks?.[w]?.sets)).length;
      t[w] = n > 0 ? n : sessions.length || 1;
    }
    return t;
  }, [sessions, exos, tw]);

  const currentWeek = useMemo(() => {
    if (blockConfig?.startDate) {
      const days = Math.floor((Date.now() - new Date(blockConfig.startDate).getTime()) / 86400000);
      return Math.min(Math.max(1, Math.floor(days / 7) + 1), tw);
    }
    for (let w = 1; w <= tw; w++) {
      if ((completedSessions[w] || []).length < (weeklyTarget[w] || goals.sessionsPerWeek)) return w;
    }
    return tw;
  }, [blockConfig?.startDate, completedSessions, weeklyTarget, goals.sessionsPerWeek, tw]);

  const totalTarget = useMemo(
    () => weeksArr.reduce((acc, w) => acc + (weeklyTarget[w] || goals.sessionsPerWeek), 0),
    [weeksArr, weeklyTarget, goals.sessionsPerWeek],
  );

  const legacyStreak = useMemo(() => {
    let str = 0;
    for (let w = currentWeek - 1; w >= 1; w--) {
      if ((completedSessions[w] || []).length >= (weeklyTarget[w] || goals.sessionsPerWeek)) str++;
      else break;
    }
    return str;
  }, [completedSessions, currentWeek, weeklyTarget, goals.sessionsPerWeek]);

  const weekAdherence = Math.round(
    ((completedSessions[currentWeek] || []).length / (weeklyTarget[currentWeek] || goals.sessionsPerWeek)) * 100,
  );

  const prs = useMemo(() => getAllPRs(exos), [exos]);
  const muscSets = useMemo(() => getMuscSets(exos, exMeta), [exos, exMeta]);
  const combinedData = useMemo(() => getCombinedData(exos, sets, wellnessHistory, tw), [exos, sets, wellnessHistory, tw]);
  const legacyTotalDone = useMemo(() => Object.values(completedSessions).flat().length, [completedSessions]);
  const streak = athleteId ? workoutStats?.streak ?? 0 : legacyStreak;
  const totalDone = athleteId ? workoutStats?.totalDone ?? 0 : legacyTotalDone;
  // Les blessures actives ne se déduisent plus d'ici : elles viennent de
  // `medical_entries` via `useActiveInjuries`, la même source que les
  // antécédents du profil. Un badge « blessure active » et une fiche blessure
  // qui se contredisent, c'est un badge qu'on arrête de croire.

  // Recalculé depuis les notes (domaine wellness) ; affiché seulement si `wellness` existe.
  const wScore = calcScore(wellness) ?? 0;
  const wReco = useMemo(() => getReco(wScore), [wScore]);

  return {
    tw, dw, allMethods, weeksArr, isDeload, weeklyTarget, currentWeek,
    totalTarget, streak, weekAdherence, prs, muscSets, combinedData,
    totalDone, wScore, wReco,
  };
}
