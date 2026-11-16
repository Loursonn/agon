/**
 * Objectif HYROX construit depuis le run (docs/HYROX_OBJECTIF_CONCEPTION.md §2).
 *
 * On choisit le run moyen dont l'athlète est capable (s/km, hors Roxzone) et
 * sa division : la grille donne les 8 stations, la Roxzone et la forme des
 * 8 runs chez les athlètes de ce run moyen. Le chrono est la somme des 17
 * cibles. L'entrée par chrono visé est l'inverse exact (même grille).
 *
 * Pur et testé, aucune lecture en base.
 */
import type { HyroxPlanTargets, HyroxResult } from "@/features/shared/types/hyrox";
import { raceCategory } from "../categories";
import { PLAN_SEGMENTS, planSegments, planTotal, type PlanSegment, type PlanSegments } from "../racePlan";
import { GRID_STATIONS, OBJECTIVE_GRID_V1, OBJECTIVE_GRID_VERSION, type GridDivision, type GridRow } from "./gridData";

export type ObjectiveGrid = Record<GridDivision, readonly GridRow[]>;

/** Au-delà de la dernière ligne mesurée, on prolonge la pente sur 30 s/km au plus (« estimé »). */
export const EXTRAPOLATION_MAX_S = 30;

const RUNS = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"] as const;

/** Division de la grille pour une catégorie de course, et facteur Pro à appliquer (Pro doubles). */
export function gridDivisionOf(category: string): { division: GridDivision; pro: "men" | "women" | null } | null {
  switch (category) {
    case "men": case "women": case "men_pro": case "women_pro":
    case "doubles_men": case "doubles_women": case "doubles_mixed":
      return { division: category, pro: null };
    case "doubles_men_pro": return { division: "doubles_men", pro: "men" };
    case "doubles_women_pro": return { division: "doubles_women", pro: "women" };
    default: return null; // relais : hors champ
  }
}

export interface GridLine {
  stations: number[];
  roxzone: number;
  shape: number[];
  /** Hors des lignes mesurées (extrapolé). */
  estimate: boolean;
}

/** Ligne de la grille au run moyen R : interpolation linéaire, extrapolation bornée, sinon `null`. */
export function lineAt(rows: readonly GridRow[], runS: number): GridLine | null {
  if (rows.length < 2 || !Number.isFinite(runS)) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (runS < first.run - EXTRAPOLATION_MAX_S || runS > last.run + EXTRAPOLATION_MAX_S) return null;
  let i = rows.findIndex((r) => r.run >= runS);
  if (i <= 0) i = i === 0 ? 1 : rows.length - 1;
  const a = rows[i - 1];
  const b = rows[i];
  const w = (runS - a.run) / (b.run - a.run);
  const mix = (x: readonly number[], y: readonly number[]) => x.map((v, j) => v + w * (y[j] - v));
  return {
    stations: mix(a.stations, b.stations),
    roxzone: a.roxzone + w * (b.roxzone - a.roxzone),
    shape: mix(a.shape, b.shape),
    estimate: runS < first.run || runS > last.run,
  };
}

export interface Objective {
  category: string;
  division: GridDivision;
  /** Run moyen de l'objectif (s/km). */
  runAvgS: number;
  segments: PlanSegments;
  totalS: number;
  /** Extrapolé, ou Pro doubles (facteur Pro sur les doubles). */
  estimate: boolean;
  modelVersion: string;
}

/** Bornes du run moyen couvert pour une catégorie (extrapolation comprise). */
export function runRange(category: string, grid: ObjectiveGrid = OBJECTIVE_GRID_V1): { min: number; max: number } | null {
  const d = gridDivisionOf(category);
  const rows = d ? grid[d.division] : null;
  if (!rows?.length) return null;
  return { min: rows[0].run - EXTRAPOLATION_MAX_S, max: rows[rows.length - 1].run + EXTRAPOLATION_MAX_S };
}

/** Objectif depuis un run moyen R (s/km). `null` hors des données ou pour le relais. */
export function objectiveFromRun(category: string, runAvgS: number, grid: ObjectiveGrid = OBJECTIVE_GRID_V1, version = OBJECTIVE_GRID_VERSION): Objective | null {
  const d = gridDivisionOf(category);
  if (!d || !(runAvgS > 0)) return null;
  const line = lineAt(grid[d.division], runAvgS);
  if (!line) return null;
  let { stations, roxzone } = line;
  let estimate = line.estimate;
  if (d.pro) {
    // Pro doubles : aucune donnée à run égal. Doubles du même sexe × écart Pro / Open en solo.
    const pro = lineAt(grid[d.pro === "men" ? "men_pro" : "women_pro"], runAvgS);
    const open = lineAt(grid[d.pro], runAvgS);
    if (!pro || !open) return null;
    stations = stations.map((v, j) => v * (pro.stations[j] / open.stations[j]));
    roxzone *= pro.roxzone / open.roxzone;
    estimate = true;
  }
  const mean = line.shape.reduce((a, b) => a + b, 0) / 8;
  const runTotal = Math.round(8 * runAvgS);
  const seg = {} as PlanSegments;
  RUNS.forEach((k, j) => { seg[k] = Math.round((runAvgS * line.shape[j]) / mean); });
  seg.run_8 += runTotal - RUNS.reduce((n, k) => n + seg[k], 0);
  GRID_STATIONS.forEach((k, j) => { seg[k] = Math.round(stations[j]); });
  seg.roxzone_total = Math.round(roxzone);
  return { category, division: d.division, runAvgS, segments: seg, totalS: planTotal(seg), estimate, modelVersion: version };
}

/**
 * Entrée par chrono visé : le run moyen dont l'objectif fait ce chrono
 * (recherche par dichotomie, le chrono croît avec le run). `null` hors des données.
 */
export function objectiveForTotal(category: string, totalS: number, grid: ObjectiveGrid = OBJECTIVE_GRID_V1, version = OBJECTIVE_GRID_VERSION): Objective | null {
  const range = runRange(category, grid);
  if (!range || !(totalS > 0)) return null;
  const at = (r: number) => objectiveFromRun(category, r, grid, version);
  const lo0 = at(range.min);
  const hi0 = at(range.max);
  if (!lo0 || !hi0 || totalS < lo0.totalS || totalS > hi0.totalS) return null;
  let lo = range.min;
  let hi = range.max;
  for (let i = 0; i < 40 && hi - lo > 0.05; i++) {
    const mid = (lo + hi) / 2;
    if ((at(mid)?.totalS ?? Infinity) < totalS) lo = mid; else hi = mid;
  }
  const r = Math.round(((lo + hi) / 2) * 10) / 10;
  const o = at(r);
  if (!o) return null;
  // Écart d'arrondi (1-2 s) rattrapé sur le run 8 : le chrono vaut la cible.
  const diff = Math.round(totalS) - o.totalS;
  if (diff !== 0) {
    o.segments.run_8 += diff;
    o.totalS += diff;
  }
  return o;
}

// ───────────────────────────── Objectif d'une course ─────────────────────────────

const runOf = (r: HyroxResult, k: string): number | null => {
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};

/** Run moyen réalisé (s/km, hors Roxzone) : `null` si un run manque. */
export function raceRunAvg(r: HyroxResult): number | null {
  const v = RUNS.map((k) => runOf(r, k));
  if (v.some((x) => x == null)) return null;
  return (v as number[]).reduce((a, b) => a + b, 0) / 8;
}

/** Ce que l'objectif d'une course lit d'un plan. */
export interface PlanForObjective {
  run_avg_s?: number | null;
  targets: HyroxPlanTargets;
  model_version?: string | null;
}

export interface RaceObjective {
  source: "plan" | "run_du_jour";
  runAvgS: number | null;
  segments: PlanSegments;
  totalS: number;
  estimate: boolean;
  modelVersion: string | null;
}

/**
 * Objectif contre lequel analyser une course (décision d'Hugo du 15/11/2026) :
 * le plan de la course s'il existe (ses 17 cibles, telles que saisies), sinon
 * l'objectif construit sur le run moyen réalisé ce jour-là.
 */
export function raceObjective(race: HyroxResult, plan: PlanForObjective | null, grid: ObjectiveGrid = OBJECTIVE_GRID_V1, version = OBJECTIVE_GRID_VERSION): RaceObjective | null {
  if (plan) {
    const segments = planSegments(plan.targets);
    if (PLAN_SEGMENTS.every((k) => Number.isFinite(segments[k]) && segments[k] > 0)) {
      return { source: "plan", runAvgS: plan.run_avg_s ?? null, segments, totalS: planTotal(segments), estimate: false, modelVersion: plan.model_version ?? null };
    }
  }
  const run = raceRunAvg(race);
  if (run == null) return null;
  const o = objectiveFromRun(raceCategory(race), run, grid, version);
  return o ? { source: "run_du_jour", runAvgS: o.runAvgS, segments: o.segments, totalS: o.totalS, estimate: o.estimate, modelVersion: o.modelVersion } : null;
}

// ───────────────────────────── Modifier un objectif ─────────────────────────────

/**
 * Modifie une cible (§2.6, comme ROXFIT). Chrono verrouillé : la différence est
 * redistribuée au prorata sur les cibles ni modifiées ni figées ; déverrouillé :
 * le chrono change. Les arrondis sont rattrapés sur la plus grande cible libre.
 */
export function editTarget(
  segs: PlanSegments,
  key: PlanSegment,
  valueS: number,
  opts: { locked: boolean; frozen?: ReadonlySet<PlanSegment> },
): PlanSegments {
  const v = Math.max(1, Math.round(valueS));
  const out = { ...segs, [key]: v };
  if (!opts.locked) return out;
  const free = PLAN_SEGMENTS.filter((k) => k !== key && !opts.frozen?.has(k));
  const pool = free.reduce((n, k) => n + segs[k], 0);
  const diff = v - segs[key];
  if (!free.length || pool - diff <= free.length) return segs; // rien à redistribuer
  for (const k of free) out[k] = Math.max(1, Math.round(segs[k] - (diff * segs[k]) / pool));
  const target = planTotal(segs);
  const biggest = free.reduce((m, k) => (out[k] > out[m] ? k : m), free[0]);
  out[biggest] += target - planTotal(out);
  return out;
}
