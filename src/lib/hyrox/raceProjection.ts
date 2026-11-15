/**
 * Page « Évolution HYROX » (planche HyroxAnaCoachEvolution) : chrono estimé
 * pour la prochaine course, sa fiabilité sur les courses passées de
 * l'athlète, et l'efficacité des runs. Pur et testé.
 *
 * Projection = dernière analyse de tests (`outputs.chrono`, modèle « ma
 * méthode » de `predictChrono`). Fiabilité = courses solo passées tombées dans
 * la fourchette de l'analyse faite juste avant (`calibrationRows`).
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { segmentsAt, type ChronoPrediction, type Division } from "./tests/chrono";
import { calibrationRows, type CalibrationAnalysis, type CalibrationRace } from "./tests/calibration";
import type { RaceWatchAnalysis } from "./raceWatch";

export interface RaceProjection {
  /** Date de l'analyse de tests utilisée. */
  analysisDate: string;
  lowS: number;
  highS: number;
  medianS: number;
  /** Course (8 km) d'après la vitesse critique. */
  runS: number;
  /** Stations et Roxzone aux deux bornes de la fourchette. */
  stations: { lowS: number; highS: number };
  roxzone: { lowS: number; highS: number };
  /** Courses passées dans la fourchette de l'analyse d'avant ; `null` sans course comparable. */
  reliability: { inRange: number; n: number } | null;
}

/** Stations et Roxzone de l'athlète médian au chrono X, la course étant fixée. */
function split(X: number, runS: number, d: Division): { stations: number; roxzone: number } {
  const seg = segmentsAt(X, d);
  const roxzone = seg[8];
  return { stations: Math.max(0, X - runS - roxzone), roxzone };
}

/**
 * Projection depuis la dernière analyse de tests qui a un chrono estimé.
 * `null` sans analyse exploitable.
 */
export function raceProjection(analyses: readonly CalibrationAnalysis[], races: readonly HyroxResult[]): RaceProjection | null {
  const withChrono = analyses.filter((a) => a.outputs?.chrono).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = withChrono[0];
  if (!last) return null;
  const c = last.outputs.chrono as ChronoPrediction;
  const d: Division = { sex: last.profile.sex, category: last.profile.category };
  const lo = split(c.low_s, c.run_s, d);
  const hi = split(c.high_s, c.run_s, d);
  const rows = calibrationRows([...analyses], races as unknown as CalibrationRace[]);
  return {
    analysisDate: last.date,
    lowS: c.low_s,
    highS: c.high_s,
    medianS: c.median_s,
    runS: c.run_s,
    stations: { lowS: lo.stations, highS: hi.stations },
    roxzone: { lowS: Math.min(lo.roxzone, hi.roxzone), highS: Math.max(lo.roxzone, hi.roxzone) },
    reliability: rows.length ? { inRange: rows.filter((r) => r.in_range).length, n: rows.length } : null,
  };
}

/**
 * Efficacité des 8 runs (mètres par battement) ; `null` pour un run sans FC,
 * et pour les runs 1 et 8 qui ne se comparent pas (départ, arrivée).
 */
export function runEfficiencySeries(a: RaceWatchAnalysis): Array<number | null> {
  return a.segments
    .filter((s) => s.kind === "run")
    .map((s) => (s.key !== "run_1" && s.key !== "run_8" && s.avgHr != null && s.avgHr > 0 && s.officialS > 0 ? 1000 / (s.avgHr * (s.officialS / 60)) : null));
}

/** Prochaine compétition HYROX (nom contenant « HYROX »), aujourd'hui compris. */
export function nextHyroxCompetition<T extends { name: string; date: string; cancelled_at?: string | null }>(
  competitions: readonly T[],
  today: string,
): T | null {
  return competitions
    .filter((c) => !c.cancelled_at && c.date >= today && /hyrox/i.test(c.name))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
}

/** Courses affichées : toutes, ou seulement les officielles. Terminées, plus ancienne d'abord. */
export function evolutionRaces(races: readonly HyroxResult[], onlyOfficial: boolean): HyroxResult[] {
  return races
    .filter((r) => r.status === "finished" && r.total_s > 0 && (!onlyOfficial || r.is_official))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
