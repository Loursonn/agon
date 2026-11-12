/**
 * Wellness des Retours coach (hebdo et mensuels) : une journée au format
 * `WellnessDay`, calculée depuis le domaine (`@shared/domain/wellness`).
 * Score recalculé, note absente = null (affichée « — », jamais 0).
 */
import { averageScore, wellnessScore, type WellnessEntry, type WellnessHistory } from "@shared/domain/wellness";
import { addDays, type IsoDay } from "@shared/domain/dates";
import type { WellnessDay } from "@/features/shared/types/retours.types";

export function toWellnessDay(e: WellnessEntry): WellnessDay {
  return {
    score: wellnessScore(e),
    fatigue: e.items.fatigue,
    sommeil: e.items.sommeil,
    stress: e.items.stress,
    energie: e.items.energie,
    doms: e.items.doms,
    domsZones: e.domsZones,
    domsPoints: e.domsPoints,
    domsLevels: e.domsLevels,
    envie: e.envie,
    pain: e.pain,
    sick: e.sick,
    coucher: e.sleep.bedtime ?? undefined,
    reveil: e.sleep.wake ?? undefined,
    sleepDur: e.sleep.hours ?? undefined,
    injuryNote: e.injuryNote,
  };
}

/** Une case par jour de [from, to] (bornes incluses), null sans saisie. */
export function dailyWellness(h: WellnessHistory, from: IsoDay, to: IsoDay): Record<IsoDay, WellnessDay | null> {
  const out: Record<IsoDay, WellnessDay | null> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const e = h[d];
    out[d] = e ? toWellnessDay(e) : null;
  }
  return out;
}

/** Score moyen de [from, to], arrondi ; null si aucun score. */
export function averageWellness(h: WellnessHistory, from: IsoDay, to: IsoDay): number | null {
  const scores: Array<number | null> = [];
  for (const [d, e] of Object.entries(h)) if (d >= from && d <= to) scores.push(wellnessScore(e));
  return averageScore(scores);
}
