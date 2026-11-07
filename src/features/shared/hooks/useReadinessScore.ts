import { useMemo } from "react";
import { getReco } from "@/lib/wellness";
import { scoreOfRaw } from "@shared/domain/wellness";
import type { WellnessData } from "../types/athlete";

export interface ReadinessScore {
  score: number;
  color: string;
  label: string;
}

/**
 * Score de forme (0-100) de la saisie du jour, avec son palier.
 * Seul calcul : `wellnessScore` / `wellnessBand` du domaine wellness (le
 * `score` stocké n'est plus lu), mêmes 5 paliers que le coach.
 * null si pas de saisie, ou saisie incomplète (« — », jamais 0).
 */
export function useReadinessScore(wellness: WellnessData | null): ReadinessScore | null {
  return useMemo(() => {
    const score = scoreOfRaw(wellness);
    if (score == null) return null;
    const reco = getReco(score);
    return { score, color: reco.c, label: reco.label };
  }, [wellness]);
}
