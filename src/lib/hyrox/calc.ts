/**
 * HYROX pure calculation functions.
 * No React imports, no network access.
 */

import { formatMmSs } from '@/lib/time';
import type {
  HyroxResult, HyroxAlert, HyroxProfile, HyroxPlanTargets,
  SegmentKey, StationKey, HyroxReferenceSegment,
} from '@/features/shared/types/hyrox';
import {
  RUN_KEYS, STATION_KEYS, RACE_ORDER, STATION_META, ROXZONE_WEIGHT,
  REFERENCE_DIVISION, type HyroxDivision,
} from '@/features/shared/types/hyrox';

// ── Segment accessors ────────────────────────────────────────────────────────

function getSegment(r: HyroxResult, key: SegmentKey): number | null {
  const map: Record<string, number | null> = {
    run_1: r.run_1_s, run_2: r.run_2_s, run_3: r.run_3_s, run_4: r.run_4_s,
    run_5: r.run_5_s, run_6: r.run_6_s, run_7: r.run_7_s, run_8: r.run_8_s,
    ski: r.ski_s, sled_push: r.sled_push_s, sled_pull: r.sled_pull_s, bbj: r.bbj_s,
    row: r.row_s, farmers: r.farmers_s, lunges: r.lunges_s, wall_balls: r.wall_balls_s,
    roxzone_total: r.roxzone_total_s,
  };
  return map[key] ?? null;
}

export function runSplits(r: HyroxResult): (number | null)[] {
  return RUN_KEYS.map(k => getSegment(r, k));
}

// ─── Affichage des runs ───────────────────────────────────────────────────────
// Chaque run HYROX fait 1 km : on affiche un temps « par run », jamais « /km ».

/** « 4:32 /run » ("—" si inconnu). */
export function formatPerRun(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—';
  return `${formatMmSs(s)} /run`;
}

/** « moy. 4:32 /run » */
export function formatAvgPerRun(s: number | null | undefined): string {
  return s == null || !Number.isFinite(s) ? '—' : `moy. ${formatPerRun(s)}`;
}

/** Libellé d'axe des graphiques de runs. */
export const RUN_AXIS_UNIT = 'min/run';

/** Temps moyen par run (runs saisis uniquement). */
export function avgRunTime(r: HyroxResult): number | null {
  const v = runSplits(r).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function stationSplits(r: HyroxResult): Record<StationKey, number | null> {
  const result = {} as Record<StationKey, number | null>;
  for (const k of STATION_KEYS) result[k] = getSegment(r, k);
  return result;
}

function sumNullable(vals: (number | null)[]): number | null {
  if (vals.some(v => v == null)) return null;
  return vals.reduce((s, v) => s! + v!, 0);
}

export function runTotal(r: HyroxResult): number | null {
  return sumNullable(runSplits(r));
}

export function stationsTotal(r: HyroxResult): number | null {
  return sumNullable(STATION_KEYS.map(k => getSegment(r, k)));
}

export function roxzoneTotal(r: HyroxResult): number | null {
  if (r.roxzone_total_s != null) return r.roxzone_total_s;
  const rt = runTotal(r);
  const st = stationsTotal(r);
  if (rt == null || st == null) return null;
  const computed = r.total_s - rt - st;
  return computed >= 0 ? computed : null;
}

export function shares(r: HyroxResult): { run: number | null; stations: number | null; roxzone: number | null } {
  const rt = runTotal(r);
  const st = stationsTotal(r);
  const rox = roxzoneTotal(r);
  const pct = (v: number | null) => v != null ? Math.round(v / r.total_s * 1000) / 10 : null;
  return { run: pct(rt), stations: pct(st), roxzone: pct(rox) };
}

// ── Run stats ────────────────────────────────────────────────────────────────

export function runStats(r: HyroxResult): {
  best: { index: number; s: number } | null;
  worst: { index: number; s: number } | null;
  avg: number | null;
  fade18: number | null;
  fadeIndexPct: number | null;
  drop12: number | null;
  halvesDelta: number | null;
  // Runs 2-7 specific (core analysis — excludes run 1 & 8 which vary by course layout)
  avg27: number | null;
  best27: { index: number; s: number } | null;
  worst27: { index: number; s: number } | null;
  fade27: number | null;
  fadeIndex27Pct: number | null;
} {
  const splits = runSplits(r);
  const valid = splits.map((v, i) => v != null ? { index: i, s: v } : null).filter(Boolean) as { index: number; s: number }[];
  if (valid.length === 0) return { best: null, worst: null, avg: null, fade18: null, fadeIndexPct: null, drop12: null, halvesDelta: null, avg27: null, best27: null, worst27: null, fade27: null, fadeIndex27Pct: null };

  const best = valid.reduce((a, b) => a.s <= b.s ? a : b);
  const worst = valid.reduce((a, b) => a.s >= b.s ? a : b);
  const avg = valid.reduce((s, v) => s + v.s, 0) / valid.length;

  const r1 = splits[0];
  const r2 = splits[1];
  const r8 = splits[7];

  const fade18 = r1 != null && r8 != null ? r8 - r1 : null;
  const fadeIndexPct = best && worst ? Math.round((worst.s - best.s) / best.s * 100) : null;
  const drop12 = r1 != null && r2 != null ? r2 - r1 : null;

  const firstHalf = splits.slice(0, 4).filter(v => v != null) as number[];
  const secondHalf = splits.slice(4, 8).filter(v => v != null) as number[];
  const halvesDelta = firstHalf.length === 4 && secondHalf.length === 4
    ? Math.round(secondHalf.reduce((a, b) => a + b, 0) / 4 - firstHalf.reduce((a, b) => a + b, 0) / 4)
    : null;

  // Runs 2-7 core analysis
  const valid27 = valid.filter(v => v.index >= 1 && v.index <= 6);
  const avg27 = valid27.length > 0 ? Math.round(valid27.reduce((s, v) => s + v.s, 0) / valid27.length) : null;
  const best27 = valid27.length > 0 ? valid27.reduce((a, b) => a.s <= b.s ? a : b) : null;
  const worst27 = valid27.length > 0 ? valid27.reduce((a, b) => a.s >= b.s ? a : b) : null;
  const fade27 = valid27.length >= 2 ? valid27[valid27.length - 1].s - valid27[0].s : null;
  const fadeIndex27Pct = best27 && worst27 ? Math.round((worst27.s - best27.s) / best27.s * 100) : null;

  return { best, worst, avg: Math.round(avg), fade18, fadeIndexPct, drop12, halvesDelta, avg27, best27, worst27, fade27, fadeIndex27Pct };
}

// ── Cumulative ───────────────────────────────────────────────────────────────

export function cumulative(r: HyroxResult): { key: string; split: number | null; cumul: number | null }[] {
  const result: { key: string; split: number | null; cumul: number | null }[] = [];
  let cum = 0;
  let valid = true;

  for (const key of RACE_ORDER) {
    const split = getSegment(r, key);
    if (split != null && valid) {
      cum += split;
      result.push({ key, split, cumul: cum });
    } else {
      valid = false;
      result.push({ key, split, cumul: null });
    }
  }

  // Roxzone at the end
  const rox = roxzoneTotal(r);
  if (rox != null && valid) {
    cum += rox;
    result.push({ key: 'roxzone_total', split: rox, cumul: cum });
  } else {
    result.push({ key: 'roxzone_total', split: rox, cumul: null });
  }

  return result;
}

// ── Percentile ───────────────────────────────────────────────────────────────

export function percentile(
  value: number,
  ref: { p10_s: number | null; p50_s: number; p90_s: number | null },
): number | null {
  const { p10_s, p50_s, p90_s } = ref;
  if (p10_s == null || p90_s == null) return null;

  // Interpolation linéaire par morceaux
  if (value <= p10_s) {
    // Extrapolation below p10 with p10-p50 slope
    const slope = (50 - 10) / (p50_s - p10_s);
    const pct = 10 + (value - p10_s) * slope;
    return Math.max(1, Math.round(pct));
  }
  if (value <= p50_s) {
    // Between p10 and p50
    const pct = 10 + (value - p10_s) / (p50_s - p10_s) * (50 - 10);
    return Math.round(pct);
  }
  if (value <= p90_s) {
    // Between p50 and p90
    const pct = 50 + (value - p50_s) / (p90_s - p50_s) * (90 - 50);
    return Math.round(pct);
  }
  // Above p90: extrapolation with p50-p90 slope
  const slope = (90 - 50) / (p90_s - p50_s);
  const pct = 90 + (value - p90_s) * slope;
  return Math.min(99, Math.round(pct));
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export function alerts(r: HyroxResult): HyroxAlert[] {
  const result: HyroxAlert[] = [];
  const stats = runStats(r);
  const sh = shares(r);

  if (stats.fade18 != null && stats.fade18 > 90) {
    result.push({
      code: 'pacing',
      level: 'warn',
      message: `Run 1 plus rapide de ${stats.fade18}s que run 8 : parti trop vite`,
    });
  }
  if (stats.drop12 != null && stats.drop12 > 60) {
    result.push({
      code: 'early_drop',
      level: 'warn',
      message: `Chute de ${stats.drop12}s entre run 1 et run 2`,
    });
  }
  if (stats.halvesDelta != null && stats.halvesDelta > 20) {
    result.push({
      code: 'late_fade',
      level: 'warn',
      message: `Seconde moitié en moyenne ${stats.halvesDelta}s plus lente par run`,
    });
  }
  if (stats.best != null && stats.best.index === 7) {
    result.push({
      code: 'too_safe',
      level: 'info',
      message: 'Meilleur run = dernier : course trop prudente',
    });
  }
  if (sh.roxzone != null && sh.roxzone > 7) {
    result.push({
      code: 'roxzone',
      level: 'warn',
      message: `Roxzone = ${sh.roxzone} % du total (> 7 %)`,
    });
  }
  if (r.penalties_s > 0) {
    result.push({
      code: 'penalties',
      level: 'info',
      message: `${r.penalties_s}s de pénalités`,
    });
  }

  return result;
}

// ── Station priorities ───────────────────────────────────────────────────────

export type RefLookup = (division: string, segment: string, bracket: string) => HyroxReferenceSegment | undefined;

export type PriorityRow = {
  key: StationKey | 'roxzone';
  athlete_s: number;
  ref_s: number;       // p50
  top1_s: number | null; // p1
  gain_s: number;      // max(0, athlete − p50)
  gap_top1_s: number;  // max(0, athlete − p1)
  weight: number;
  score: number;
};

/**
 * Station priority scoring.
 * score = (0.6 × gain_vs_median + 0.4 × gap_vs_top1) × weight
 *
 * - gain_vs_median: seconds slower than p50 (0 if faster)
 * - gap_vs_top1:    seconds slower than p1 (always ≥ 0)
 * - weight:         station discriminant (wall_balls=1.0 … ski=0.15)
 *
 * Stations where athlete is far from both median and top 1% bubble up.
 * Athletes already faster than median still get scored via top 1% gap.
 */
export function stationPriorities(
  r: HyroxResult,
  pickRef: RefLookup,
): PriorityRow[] {
  const refDiv = REFERENCE_DIVISION(r.division as HyroxDivision);
  const bracket = bracketOf(r.total_s);
  const result: PriorityRow[] = [];

  for (const k of STATION_KEYS) {
    const athlete_s = getSegment(r, k);
    if (athlete_s == null) continue;
    const ref = pickRef(refDiv, k, bracket);
    if (!ref) continue;
    const gain_s = Math.max(0, athlete_s - ref.p50_s);
    const top1_s = ref.p1_s ?? null;
    const gap_top1_s = top1_s != null ? Math.max(0, athlete_s - top1_s) : gain_s;
    const weight = STATION_META[k].weight;
    const score = (0.6 * gain_s + 0.4 * gap_top1_s) * weight;
    result.push({ key: k, athlete_s, ref_s: ref.p50_s, top1_s, gain_s, gap_top1_s, weight, score });
  }

  // Roxzone
  const rox = roxzoneTotal(r);
  if (rox != null) {
    const ref = pickRef(refDiv, 'roxzone_total', bracket);
    if (ref) {
      const gain_s = Math.max(0, rox - ref.p50_s);
      const top1_s = ref.p1_s ?? null;
      const gap_top1_s = top1_s != null ? Math.max(0, rox - top1_s) : gain_s;
      const score = (0.6 * gain_s + 0.4 * gap_top1_s) * ROXZONE_WEIGHT;
      result.push({ key: 'roxzone', athlete_s: rox, ref_s: ref.p50_s, top1_s, gain_s, gap_top1_s, weight: ROXZONE_WEIGHT, score });
    }
  }

  result.sort((a, b) => b.score - a.score);
  return result;
}

// ── Typology ─────────────────────────────────────────────────────────────────

export function typology(pctRun: number | null, pctStations: number | null): HyroxProfile | null {
  if (pctRun == null || pctStations == null) return null;
  if (pctStations - pctRun >= 20) return 'runner';
  if (pctRun - pctStations >= 20) return 'powerhouse';
  return 'hybrid';
}

// ── Radar axes ───────────────────────────────────────────────────────────────

export function radarAxes(
  r: HyroxResult,
  pickRef: RefLookup,
): { key: string; label: string; value: number | null }[] {
  const refDiv = REFERENCE_DIVISION(r.division as HyroxDivision);
  const bracket = bracketOf(r.total_s);
  const axes: { key: string; label: string; value: number | null }[] = [];

  // Run avg
  const rt = runTotal(r);
  const runRef = pickRef(refDiv, 'run_total', bracket);
  if (runRef && rt != null) {
    const pct = percentile(rt, runRef);
    axes.push({ key: 'run_avg', label: 'Course', value: pct != null ? 100 - pct : null });
  } else {
    axes.push({ key: 'run_avg', label: 'Course', value: null });
  }

  // Roxzone
  const rox = roxzoneTotal(r);
  const roxRef = pickRef(refDiv, 'roxzone_total', bracket);
  if (roxRef && rox != null) {
    const pct = percentile(rox, roxRef);
    axes.push({ key: 'roxzone_total', label: 'Roxzone', value: pct != null ? 100 - pct : null });
  } else {
    axes.push({ key: 'roxzone_total', label: 'Roxzone', value: null });
  }

  // 8 stations in race order
  const stationOrder: StationKey[] = ['ski', 'sled_push', 'sled_pull', 'bbj', 'row', 'farmers', 'lunges', 'wall_balls'];
  for (const k of stationOrder) {
    const v = getSegment(r, k);
    const ref = pickRef(refDiv, k, bracket);
    if (ref && v != null) {
      const pct = percentile(v, ref);
      axes.push({ key: k, label: STATION_META[k].short, value: pct != null ? 100 - pct : null });
    } else {
      axes.push({ key: k, label: STATION_META[k].short, value: null });
    }
  }

  return axes;
}

// ── Bracket ──────────────────────────────────────────────────────────────────

export function bracketOf(total_s: number): 'sub70' | '70_80' | '80_90' | '90_plus' {
  if (total_s < 4200) return 'sub70';
  if (total_s < 4800) return '70_80';
  if (total_s < 5400) return '80_90';
  return '90_plus';
}

// ── Plan generation (P3 — implemented now for testing) ───────────────────────

const ROXZONE_PER_BRACKET: Record<string, number> = { sub70: 28, '70_80': 34, '80_90': 40, '90_plus': 52 };

export function generatePlan(input: {
  target_total_s: number;
  division: HyroxDivision;
  profile: HyroxProfile;
  pickRef: RefLookup;
  weakStations?: StationKey[];
}): HyroxPlanTargets {
  const { target_total_s, division, profile, pickRef, weakStations } = input;
  const refDiv = REFERENCE_DIVISION(division);

  // Step 1: k ratio
  const totalRef = pickRef(refDiv, 'total', 'all');
  const p50Total = totalRef?.p50_s ?? 5269;
  const k = target_total_s / p50Total;

  // Step 2: station targets
  const stations: Record<StationKey, number> = {} as Record<StationKey, number>;
  for (const sk of STATION_KEYS) {
    const ref = pickRef(refDiv, sk, 'all') ?? pickRef('men', sk, 'all');
    stations[sk] = Math.round((ref?.p50_s ?? 300) * k);
  }

  // Step 3: roxzone
  const bracket = bracketOf(target_total_s);
  const roxPerTransition = ROXZONE_PER_BRACKET[bracket];
  const roxTotal = 8 * roxPerTransition;

  // Step 4: run budget
  const stationsSum = Object.values(stations).reduce((a, b) => a + b, 0);
  let runBudget = target_total_s - stationsSum - roxTotal;
  const a = runBudget / 8;
  const rawRuns = [a - 20, a - 5, a - 5, a - 5, a + 5, a + 5, a + 5, a + 10];
  // Normalize to sum = runBudget
  const rawSum = rawRuns.reduce((s, v) => s + v, 0);
  let runs = rawRuns.map(v => v * runBudget / rawSum);

  // Step 5: profile adjustments
  const weak = weakStations ?? (['wall_balls', 'sled_pull'] as StationKey[]);
  if (profile === 'runner') {
    runs = runs.map(v => v * 0.97);
    for (const sk of weak) stations[sk] = Math.round(stations[sk] * 1.04);
  } else if (profile === 'powerhouse') {
    runs = runs.map(v => v * 1.03);
    for (const sk of weak) stations[sk] = Math.round(stations[sk] * 0.96);
  }

  // Renormalize runs to hit target exactly
  const currentStations = Object.values(stations).reduce((a, b) => a + b, 0);
  runBudget = target_total_s - currentStations - roxTotal;
  const currentRunSum = runs.reduce((a, b) => a + b, 0);
  runs = runs.map(v => Math.round(v * runBudget / currentRunSum));

  // Final adjustment: fix rounding to exactly match target
  const finalSum = runs.reduce((a, b) => a + b, 0) + currentStations + roxTotal;
  const diff = target_total_s - finalSum;
  if (diff !== 0) runs[7] += diff; // adjust last run

  return {
    run_1: runs[0], run_2: runs[1], run_3: runs[2], run_4: runs[3],
    run_5: runs[4], run_6: runs[5], run_7: runs[6], run_8: runs[7],
    ski: stations.ski, sled_push: stations.sled_push, sled_pull: stations.sled_pull,
    bbj: stations.bbj, row: stations.row, farmers: stations.farmers,
    lunges: stations.lunges, wall_balls: stations.wall_balls,
    roxzone_per_transition: roxPerTransition,
  };
}

export function planVsActual(
  plan: HyroxPlanTargets,
  r: HyroxResult,
): { key: string; target: number; actual: number | null; delta: number | null }[] {
  const result: { key: string; target: number; actual: number | null; delta: number | null }[] = [];

  for (const key of RACE_ORDER) {
    const target = key.startsWith('run_')
      ? plan[key as keyof HyroxPlanTargets] as number
      : plan[key as keyof HyroxPlanTargets] as number;
    const actual = getSegment(r, key);
    result.push({ key, target, actual, delta: actual != null ? actual - target : null });
  }

  // Roxzone
  const roxTarget = 8 * plan.roxzone_per_transition;
  const roxActual = roxzoneTotal(r);
  result.push({ key: 'roxzone_total', target: roxTarget, actual: roxActual, delta: roxActual != null ? roxActual - roxTarget : null });

  return result;
}

export function estimateFromTests(inputs: {
  fiveK?: number;
  ski1k?: number;
  row1k?: number;
  wb100?: number;
  bbj80?: number;
  farmers200?: number;
  sledPush50?: number;
  sledPull50?: number;
  lunges100?: number;
  lastRace?: HyroxResult;
  division: HyroxDivision;
  pickRef: RefLookup;
}): { low_s: number; high_s: number; from: Record<string, number> } | null {
  const { fiveK, lastRace, division, pickRef } = inputs;
  if (!fiveK && !lastRace) return null;

  const refDiv = REFERENCE_DIVISION(division);
  const from: Record<string, number> = {};

  // Run estimation
  let runEst: number;
  if (fiveK) {
    runEst = (fiveK / 5) * 8 * 1.15;
    from['5km'] = fiveK;
  } else if (lastRace) {
    const rt = runTotal(lastRace);
    runEst = rt ?? 2640;
  } else {
    return null;
  }

  const runTotalRef = pickRef(refDiv, 'run_total', 'all');
  const ratio = runTotalRef ? runEst / runTotalRef.p50_s : 1;
  const clampedRatio = Math.max(0.8, Math.min(1.3, ratio));

  // Station estimations
  const stationEsts: Record<string, number> = {};
  const testMap: [string, StationKey, number | undefined][] = [
    ['ski1k', 'ski', inputs.ski1k],
    ['row1k', 'row', inputs.row1k],
    ['wb100', 'wall_balls', inputs.wb100],
    ['bbj80', 'bbj', inputs.bbj80],
    ['farmers200', 'farmers', inputs.farmers200],
    ['sledPush50', 'sled_push', inputs.sledPush50],
    ['sledPull50', 'sled_pull', inputs.sledPull50],
    ['lunges100', 'lunges', inputs.lunges100],
  ];

  for (const [key, station, val] of testMap) {
    if (val != null) {
      stationEsts[station] = val * 1.15;
      from[key] = val;
    } else {
      const ref = pickRef(refDiv, station, 'all');
      if (ref) stationEsts[station] = ref.p50_s * clampedRatio;
      else stationEsts[station] = 300 * clampedRatio;
    }
  }

  const stationsSum = Object.values(stationEsts).reduce((a, b) => a + b, 0);
  const provisionalTotal = runEst + stationsSum;
  const bracket = bracketOf(provisionalTotal);
  const roxTotal = 8 * ROXZONE_PER_BRACKET[bracket];

  const total = runEst + stationsSum + roxTotal;
  let low_s = Math.round(total * 0.95);
  let high_s = Math.round(total * 1.08);

  if (lastRace) {
    low_s = Math.min(low_s, Math.round(lastRace.total_s * 0.97));
    high_s = Math.max(high_s, Math.round(lastRace.total_s * 1.02));
    from['lastRace'] = lastRace.total_s;
  }

  return { low_s, high_s, from };
}
