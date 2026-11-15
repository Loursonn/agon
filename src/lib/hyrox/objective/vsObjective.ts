/**
 * Course réalisée contre son objectif (docs/HYROX_OBJECTIF_CONCEPTION.md §4) :
 * écart en secondes par segment et sur le chrono, trois états (en avance /
 * dans l'objectif / en retard) et « départ rapide » pour le run 1, plus la
 * courbe d'avance-retard cumulée. Pur et testé.
 */
import { RACE_ORDER, type HyroxResult } from "@/features/shared/types/hyrox";
import { roxzoneTotal } from "../calc";
import { PLAN_SEGMENTS, planTotal, type PlanSegment, type PlanSegments } from "../racePlan";

/** Tolérance « dans l'objectif » (décision d'Hugo, Q6) : 2 % de la cible, au moins 3 s ; 1 % sur le chrono. */
export const TOL_PCT = 0.02;
export const TOL_MIN_S = 3;
export const TOTAL_TOL_PCT = 0.01;

export type ObjectiveState = "ahead" | "on" | "behind" | "fast_start";

export const STATE_LABEL: Record<ObjectiveState, string> = {
  ahead: "en avance",
  on: "dans l'objectif",
  behind: "en retard",
  fast_start: "départ rapide",
};

export const segmentTolerance = (targetS: number): number => Math.max(TOL_MIN_S, TOL_PCT * targetS);
export const totalTolerance = (targetS: number): number => TOTAL_TOL_PCT * targetS;

/** État d'un écart. Le run 1 en avance est un départ rapide, jamais un point fort. */
export function stateOf(deltaS: number, tolS: number, key?: string): ObjectiveState {
  if (deltaS < -tolS) return key === "run_1" ? "fast_start" : "ahead";
  if (deltaS > tolS) return "behind";
  return "on";
}

/**
 * Cible d'un segment (`run_1`…, stations, `roxzone_total`, `total`) : la même
 * forme que l'ancienne médiane du niveau, pour les vues qui lisent une référence
 * par segment (runs, montre, gains).
 */
export function objectiveLookup(objective: PlanSegments): (segment: string) => number | null {
  return (seg) => {
    if (seg === "total") return planTotal(objective);
    const v = (objective as unknown as Record<string, number | undefined>)[seg];
    return typeof v === "number" && v > 0 ? v : null;
  };
}

export interface SegmentVsObjective {
  key: PlanSegment;
  targetS: number;
  actualS: number | null;
  /** Réalisé − objectif (s), arrondi ; négatif = en avance. */
  deltaS: number | null;
  state: ObjectiveState | null;
}

export interface CumulativePoint {
  /** Segment après lequel l'écart est mesuré (ordre de course). */
  key: string;
  /** Cumul réalisé − cumul objectif (s) ; positif = en retard. */
  deltaS: number;
}

export interface RaceVsObjective {
  total: { targetS: number; actualS: number; deltaS: number; state: ObjectiveState };
  segments: SegmentVsObjective[];
  cumulative: CumulativePoint[];
}

const actualOf = (r: HyroxResult, k: PlanSegment): number | null => {
  if (k === "roxzone_total") return roxzoneTotal(r);
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};

export function raceVsObjective(r: HyroxResult, objective: PlanSegments): RaceVsObjective {
  const segments: SegmentVsObjective[] = PLAN_SEGMENTS.map((key) => {
    const targetS = objective[key];
    const actualS = actualOf(r, key);
    const deltaS = actualS == null ? null : Math.round(actualS - targetS);
    return { key, targetS, actualS, deltaS, state: deltaS == null ? null : stateOf(deltaS, segmentTolerance(targetS), key) };
  });
  const targetS = planTotal(objective);
  const totalDelta = Math.round(r.total_s - targetS);

  // Courbe cumulée : la Roxzone est répartie après chaque run (splits saisis, sinon 1/8 du total).
  const rox = roxzoneTotal(r);
  const splits = Array.isArray(r.roxzone_splits) && r.roxzone_splits.length === 8 ? r.roxzone_splits : null;
  const cumulative: CumulativePoint[] = [];
  let acc = 0;
  let broken = false;
  for (const key of RACE_ORDER) {
    const a = actualOf(r, key as PlanSegment);
    if (a == null) { broken = true; break; }
    acc += a - objective[key as PlanSegment];
    if (key.startsWith("run_")) {
      const i = Number(key.slice(4)) - 1;
      const roxA = splits ? splits[i] : rox != null ? rox / 8 : null;
      if (roxA == null) { broken = true; break; }
      acc += roxA - objective.roxzone_total / 8;
    }
    cumulative.push({ key, deltaS: Math.round(acc) });
  }

  return {
    total: { targetS, actualS: r.total_s, deltaS: totalDelta, state: stateOf(totalDelta, totalTolerance(targetS)) },
    segments,
    cumulative: broken ? [] : cumulative,
  };
}
