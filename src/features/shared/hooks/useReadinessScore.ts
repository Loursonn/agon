import { useMemo } from "react";
import type { WellnessData } from "../types/athlete";

export interface ReadinessScore {
  score: number;
  color: string;
  label: string;
}

/**
 * Computes the readiness score (0-100) from wellness data.
 * Uses stored score when available, otherwise recomputes from fields (scale 1-5, all fields: high = good).
 * Formula mirrors calcScore in lib/wellness.ts: sum(5 fields) / 25 * 100
 * Returns null when wellness is not yet logged.
 */
export function useReadinessScore(wellness: WellnessData | null): ReadinessScore | null {
  return useMemo(() => {
    if (!wellness) return null;

    const score = wellness.score ?? Math.min(100, Math.max(0, Math.round(
      ((wellness.fatigue ?? 3) + (wellness.sommeil ?? 3) + (wellness.stress ?? 3) +
       (wellness.energie ?? 3) + (wellness.doms ?? 3)) / 25 * 100
    )));

    let color: string;
    let label: string;
    if (score >= 85) {
      color = "#66F03C"; label = "Excellent";
    } else if (score >= 70) {
      color = "#66F03C"; label = "Bon";
    } else if (score >= 50) {
      color = "#F5A623"; label = "Moyen";
    } else {
      color = "#FF5A33"; label = "Faible";
    }

    return { score, color, label };
  }, [wellness]);
}
