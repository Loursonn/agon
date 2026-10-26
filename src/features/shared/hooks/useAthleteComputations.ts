import { useMemo } from "react";
import { DEF_METHODS } from "@/lib/exercises";
import { getAllPRs, getMuscSets, getCombinedData } from "@/lib/calculations";
import { getReco } from "@/lib/wellness";
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
}

export function useAthleteComputations(s: ComputationInput) {
  const {
    exos, exMeta, sets, sessions, blockConfig, goals,
    completedSessions, customMethods, wellness, wellnessHistory,
  } = s;

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

  const streak = useMemo(() => {
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
  const totalDone = useMemo(() => Object.values(completedSessions).flat().length, [completedSessions]);
  // Les blessures actives ne se déduisent plus d'ici : elles viennent de
  // `medical_entries` via `useActiveInjuries`, la même source que les
  // antécédents du profil. Un badge « blessure active » et une fiche blessure
  // qui se contredisent, c'est un badge qu'on arrête de croire.

  const wScore = wellness?.score || 50;
  const wReco = useMemo(() => getReco(wScore), [wScore]);

  return {
    tw, dw, allMethods, weeksArr, isDeload, weeklyTarget, currentWeek,
    totalTarget, streak, weekAdherence, prs, muscSets, combinedData,
    totalDone, wScore, wReco,
  };
}
