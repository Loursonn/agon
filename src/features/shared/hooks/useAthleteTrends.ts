/**
 * useAthleteTrends — agrège wellness / poids / sommeil / records / assiduité
 * sur N jours glissants (Mon profil athlète), + phrases de synthèse (Gemini, repli règles).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { localISO } from "@/lib/date";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { usePRLogs } from "@/features/shared/hooks/usePRLogs";
import {
  windows, wellnessTrend, weightTrend, sleepScore, recentProgress, attendance, ruleInsights,
} from "@/lib/athleteTrends";
import type { TrendSummary, WorkoutRow } from "@/lib/athleteTrends";

const NO_PRS: never[] = [];
const NO_LOGS: WorkoutRow[] = [];

export function useAthleteTrends(days: number): { summary: TrendSummary; ready: boolean } {
  const { athleteId, wellnessHistory, weightLog, goals, bodyWeight, nutritionStrategy } = useAthleteContext();
  const { data: prs = NO_PRS, isSuccess: prsReady } = usePRLogs(athleteId);
  const { cur, prev } = windows(days);

  const { data: logs = NO_LOGS, isSuccess: logsReady } = useQuery({
    queryKey: ["athlete-trend-sessions", athleteId, prev.start, cur.end],
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkoutRow[]> => {
      // Muscu + énergie / spécifique : toutes les séances prescrites
      const [workouts, energy] = await Promise.all([
        supabase
          .from("workout_logs")
          .select("scheduled_date, status")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", prev.start)
          .lte("scheduled_date", cur.end),
        supabase
          .from("energy_session_assignments")
          .select("scheduled_date, status")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", prev.start)
          .lte("scheduled_date", cur.end),
      ]);
      if (workouts.error) throw workouts.error;
      if (energy.error) throw energy.error;
      return [...(workouts.data ?? []), ...(energy.data ?? [])] as WorkoutRow[];
    },
  });

  const summary = useMemo<TrendSummary>(() => ({
    days,
    health:         wellnessTrend(wellnessHistory, "score", days),
    weight:         weightTrend(weightLog, days),
    weightTarget:   nutritionStrategy?.target_weight || bodyWeight.target || null,
    sleep:          sleepScore(wellnessHistory, goals, cur),
    prevSleep:      sleepScore(wellnessHistory, goals, prev),
    fatigue:        wellnessTrend(wellnessHistory, "fatigue", days),
    stress:         wellnessTrend(wellnessHistory, "stress", days),
    attendance:     attendance(logs, cur),
    prevAttendance: attendance(logs, prev),
    progress:       recentProgress(prs, days),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [days, wellnessHistory, weightLog, goals, bodyWeight.target, nutritionStrategy?.target_weight, logs, prs, cur.start]);

  return { summary, ready: prsReady && logsReady };
}

// ── Phrases de synthèse : Gemini 1×/jour/athlète (cache local), repli sur règles ──

const CACHE_PREFIX = "insights:";

function readCache(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.every(x => typeof x === "string") ? v : null;
  } catch { return null; }
}

function writeCache(key: string, v: string[]) {
  try {
    // Purge des entrées d'autres jours
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX) && !k.includes(localISO())) localStorage.removeItem(k);
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v));
  } catch { /* stockage indisponible */ }
}

/** Données envoyées à l'IA : agrégats uniquement, aucune info d'identité. */
function toAiPayload(s: TrendSummary) {
  return {
    periode_jours: s.days,
    score_sante_moyen: s.health.value, score_sante_periode_prec: s.health.prev,
    poids_kg: s.weight.value, poids_variation_kg: s.weight.delta, poids_objectif_kg: s.weightTarget,
    sommeil: s.sleep && { score: s.sleep.score, heures_moy: s.sleep.avgHours, objectif_h: s.sleep.targetHours, ecart_coucher_min: s.sleep.bedtimeDeviationMin },
    sommeil_score_periode_prec: s.prevSleep?.score ?? null,
    fatigue_moy_1a5: s.fatigue.value, stress_moy_1a5: s.stress.value,
    seances: s.attendance, seances_periode_prec: s.prevAttendance,
    records: s.progress.slice(0, 5).map(p => ({ exercice: p.exercise, kg: p.kg, gain_kg: p.gain })),
  };
}

export function useAthleteInsights(summary: TrendSummary, ready: boolean) {
  const { athleteId } = useAthleteContext();
  const rules = useMemo(() => ruleInsights(summary), [summary]);
  const day = localISO();
  const cacheKey = `${athleteId}:${summary.days}:${day}`;
  const hasData = rules.length > 0;

  const { data: ai, isFetching } = useQuery({
    queryKey: [...QK.athleteInsights(athleteId, day), summary.days],
    enabled: !!athleteId && ready && hasData,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<string[] | null> => {
      const cached = readCache(cacheKey);
      if (cached) return cached;
      try {
        const { data, error } = await supabase.functions.invoke("athlete-insights", { body: toAiPayload(summary) });
        const list = (data as { insights?: unknown })?.insights;
        if (error || !Array.isArray(list) || !list.length) return null;
        const clean = list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4);
        if (clean.length) writeCache(cacheKey, clean);
        return clean.length ? clean : null;
      } catch {
        // Edge function pas déployée ou inaccessible → fallback silencieux sur les règles
        return null;
      }
    },
  });

  return { insights: ai ?? rules, source: ai ? "ai" as const : "rules" as const, loading: isFetching };
}
