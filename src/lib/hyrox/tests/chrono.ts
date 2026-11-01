/**
 * Chrono HYROX estimé (port de predict() du radar bilan YOXX, modèle v0 du 30/10/2026).
 *
 * La course donne la fourchette : la VC (et D′) donnent un 5 km frais, converti
 * en course 8 km en HYROX (ratio RAT), puis en temps final P10 / P50 / P90 (BR).
 * Les stations placent l'athlète dedans : niveau moyen aux ergos, à l'endurance
 * de force et au grip (note 1 -> P90, note 5 -> P10).
 * Estimation « ma méthode », à recaler sur les vrais chronos des athlètes.
 */
import { BR, PRO_RUN_FACTOR, PROF, RAT, SEGMENTS, type DivisionKey } from "./chronoData";
import type { ScoreResult } from "./scores";
import type { HyroxCategory, Sex } from "./types";
import { clamp, lin, parseTime } from "./util";

export interface Division { sex: Sex; category: HyroxCategory }

export const divisionKey = (d: Division): DivisionKey => `${d.category === "Pro" ? "P" : "O"}${d.sex}` as DivisionKey;

/** Ratio allure HYROX / allure 5 km frais. */
export function runRatio(t5min: number, d: Division): number {
  const r = RAT[d.sex];
  const x = clamp(t5min, 17, 35);
  return lin(x, r.map(a => a[0]), r.map(a => a[1])) * (d.category === "Pro" ? PRO_RUN_FACTOR[d.sex] : 1);
}

/** Course 8 km en HYROX depuis la VC (km/h) et D′ (m). */
export function runFromCS(cs_kmh: number, dprime_m: number | null, d: Division) {
  const v = cs_kmh / 3.6;
  const dp = clamp(dprime_m == null ? 150 : dprime_m, 50, 250);
  const t5 = (5000 - dp) / v;
  const pace = (t5 / 5) * runRatio(t5 / 60, d);
  return { t5_s: t5, pace_s_per_km: pace, run_s: pace * 8 };
}

/** Temps final à un percentile (10-90) pour un temps de course 8 km donné. */
export function finalAt(run_s: number, pct: number, d: Division): number {
  const B = BR[divisionKey(d)];
  const R = B.map(b => b[0]);
  const q10 = lin(run_s, R, B.map(b => b[1]));
  const q50 = lin(run_s, R, B.map(b => b[2]));
  const q90 = lin(run_s, R, B.map(b => b[3]));
  const p = clamp(pct, 10, 90);
  return p <= 50 ? q10 + ((p - 10) / 40) * (q50 - q10) : q50 + ((p - 50) / 40) * (q90 - q50);
}

/** Niveau moyen aux stations : notes des ergos, de l'endurance de force et du grip. */
export function stationLevel(r: ScoreResult): { mean: number; count: number } | null {
  const n = r.measures.filter(m => !m.reading && (m.axis === "ergos" || m.axis === "endf" || m.axis === "grip") && m.note != null).map(m => m.note as number);
  return n.length ? { mean: n.reduce((a, b) => a + b, 0) / n.length, count: n.length } : null;
}

export const pctOfLevel = (m: number) => 90 - (m - 1) * 20;

export interface ChronoPrediction {
  run_s: number;
  pace_s_per_km: number;
  t5_s: number;
  station_level: { mean: number; count: number } | null;
  /** Niveau utilisé (3 si aucune station testée). */
  level: number;
  median_s: number;
  low_s: number;
  high_s: number;
  /** Même course, stations fortes (P10) / faibles (P90). */
  p10_s: number;
  p90_s: number;
  /** Leviers : secondes gagnées. */
  gain_cs_05_s: number;
  gain_stations_1_s: number;
}

export function predictChrono(r: ScoreResult, d: Division): ChronoPrediction | null {
  const cs = r.running.cs_kmh;
  if (cs == null) return null;
  const dp = r.running.dprime_m;
  const run = runFromCS(cs, dp, d);
  const st = stationLevel(r);
  const m = st ? st.mean : 3;
  const fin = finalAt(run.run_s, pctOfLevel(m), d);
  return {
    ...run,
    station_level: st,
    level: m,
    median_s: fin,
    low_s: finalAt(run.run_s, pctOfLevel(Math.min(m + 0.5, 5)), d),
    high_s: finalAt(run.run_s, pctOfLevel(Math.max(m - 0.5, 1)), d),
    p10_s: finalAt(run.run_s, 10, d),
    p90_s: finalAt(run.run_s, 90, d),
    gain_cs_05_s: fin - finalAt(runFromCS(cs + 0.5, dp, d).run_s, pctOfLevel(m), d),
    gain_stations_1_s: m < 5 ? fin - finalAt(run.run_s, pctOfLevel(Math.min(m + 1, 5)), d) : 0,
  };
}

/**
 * VC minimum pour un chrono visé T (s), selon le niveau aux stations.
 * col : 1 = stations fortes (P10), 2 = moyennes (P50), 3 = faibles (P90).
 */
export function csForTarget(T: number, col: 1 | 2 | 3, d: Division, dprime_m = 150) {
  const B = BR[divisionKey(d)];
  const run = lin(T, B.map(b => b[col]), B.map(b => b[0]));
  const pace = run / 8;
  let p5 = pace / 1.17;
  for (let i = 0; i < 20; i++) p5 = pace / runRatio((p5 * 5) / 60, d);
  return { run_s: run, pace_s_per_km: pace, t5_s: p5 * 5, cs_kmh: ((5000 - dprime_m) / (p5 * 5)) * 3.6 };
}

/** Splits de l'athlète médian (s) à un chrono final X (s), dans l'ordre SEGMENTS. */
export function segmentsAt(X: number, d: Division): number[] {
  const pr = PROF[divisionKey(d)];
  const ks = Object.keys(pr).map(Number).sort((a, b) => a - b);
  const m = clamp(X / 60, ks[0], ks[ks.length - 1]);
  const rows = ks.map(k => pr[String(k)].split(" ").map(s => parseTime(s) as number));
  return SEGMENTS.map((_, i) => lin(m, ks, rows.map(r => r[i])));
}

/** Chronos visés disponibles (min) pour la division. */
export function targetKeys(d: Division): number[] {
  return Object.keys(PROF[divisionKey(d)]).map(Number).sort((a, b) => a - b);
}
