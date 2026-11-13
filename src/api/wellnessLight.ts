import type { QueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import {
  LIGHT_PARAMS,
  wellnessLight,
  type LightResult,
  type LoadSignals,
  type WatchDay,
  type WellnessSignals,
} from "@shared/domain/wellnessLight";
import type { WeekLoad } from "@shared/domain/trainingLoad";
import { assessWellness, Z_ITEM_VIGILANCE } from "@/lib/wellnessBaseline";
import { getHealthDays, type HealthDay } from "./health";
import { getLoadWeeks } from "./load";
import { getWellnessHistory } from "./wellness";

/**
 * Feu du matin (vert / orange / rouge) : lecture seule, calculé à la volée par
 * `_shared/domain/wellnessLight.ts`. Les mesures de montre (Garmin compris)
 * servent à ce calcul local et ne sont envoyées à aucune IA.
 */

export const wellnessLightKeys = {
  all: (aid: string) => ["wellnessLight", aid] as const,
  day: (aid: string, day: IsoDay) => ["wellnessLight", aid, day] as const,
};

export function invalidateWellnessLight(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: wellnessLightKeys.all(athleteId) });
}

/** Jours de montre lus : 7 j de fenêtre + 28 j d'habitude + 28 j pour le compte des jours sous la zone. */
const WATCH_DAYS = LIGHT_PARAMS.windowDays + 2 * LIGHT_PARAMS.baselineDays;

/** Un export Garmin et la synchro Garmin sont la même montre. */
export function brandOf(source: string): string {
  return source === "garmin_export" ? "garmin" : source;
}

export function watchDaysFromHealth(rows: readonly HealthDay[]): WatchDay[] {
  return rows.map((r) => ({
    day: r.day,
    brand: brandOf(r.source),
    hrvMs: r.hrvMs,
    restingHr: r.restingHr,
    sleepMin: r.sleepTotalMin,
  }));
}

/** Les 7 jours glissants finissant aujourd'hui, comparés aux 7 d'avant. */
export function loadSignalsFrom(previous: WeekLoad | undefined, current: WeekLoad | undefined): LoadSignals | null {
  if (!current) return null;
  const ceiling = current.ceilingKm;
  return {
    done: current.done,
    planned: current.planned,
    previous: previous ? previous.done : null,
    kmVariationPct: current.kmVariationPct,
    monotony: current.monotony,
    unplannedOverCeiling: ceiling != null && current.sessions.some((s) => s.planned == null && s.km != null && s.km > ceiling),
  };
}

export async function getWellnessLight(athleteId: string, today: IsoDay): Promise<LightResult | null> {
  const [health, history, load] = await Promise.all([
    getHealthDays(athleteId, addDays(today, -(WATCH_DAYS - 1)), today),
    getWellnessHistory(athleteId, { from: addDays(today, -(LIGHT_PARAMS.baselineDays + 2)), to: today }),
    getLoadWeeks(athleteId, addDays(today, -6), 2),
  ]);

  const a = assessWellness(history, today);
  // Saisie d'aujourd'hui ou d'hier seulement : plus vieille, elle ne dit rien de ce matin.
  const entry = a.date && a.date >= addDays(today, -1) ? history[a.date] : undefined;
  const wellness: WellnessSignals | null = entry && a.date
    ? {
        day: a.date,
        itemsLow: a.deviations.filter((d) => d.item !== "score" && d.z < Z_ITEM_VIGILANCE).length,
        // Le score n'apparaît dans les écarts qu'à z ≤ −1 : au-dessus, il est dans l'habitude.
        scoreZ: a.deviations.find((d) => d.item === "score")?.z ?? (a.baselineBuilding ? null : 0),
        sleepItemLow: a.deviations.some((d) => d.item === "sommeil" && d.z < Z_ITEM_VIGILANCE),
        envie: entry.envie,
        pain: entry.pain,
        sick: entry.sick,
      }
    : null;

  return wellnessLight({
    today,
    watch: watchDaysFromHealth(health),
    wellness,
    load: loadSignalsFrom(load.weeks[0], load.weeks[1]),
  });
}
