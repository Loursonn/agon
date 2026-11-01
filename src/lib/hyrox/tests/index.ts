/**
 * Moteur « Tests HYROX » : point d'entrée.
 *
 * analyzeTests() prend les données brutes du bilan (ou d'un retest), le profil
 * et un jeu de paramètres versionnés, et renvoie toutes les sorties, stampées
 * algo_version + grid_version. Les entrées brutes ne sont jamais modifiées :
 * un recalcul avec une nouvelle version produit une nouvelle analyse.
 */
import { predictChrono, type ChronoPrediction } from "./chrono";
import { axesPlan, matchRules, ruleMetrics, strengthsWeaknesses, type AthleteContext, type AxesPlan, type StrengthsWeaknesses } from "./insights";
import { ALGO_VERSION, GRID_SET_V1 } from "./params";
import { scoreTests, type ScoreResult } from "./scores";
import type { AthleteTestProfile, GridSet, HyroxTestInputs, WorkAxisRule } from "./types";

export * from "./types";
export * from "./params";
export * from "./util";
export * from "./running";
export * from "./sled";
export * from "./scores";
export * from "./chrono";
export * from "./insights";
export * from "./db";
export * from "./mapping";
export * from "./calibration";

export interface HyroxTestAnalysisOutputs {
  algo_version: string;
  grid_version: string;
  scores: ScoreResult;
  chrono: ChronoPrediction | null;
  insights: StrengthsWeaknesses;
  /** Règles d'axes de travail déclenchées (pistes par station). */
  rules: WorkAxisRule[];
  /** Proposition du moteur ; null sans chrono visé ou sans VC. */
  axes_plan: AxesPlan | null;
}

/** Sorties gardées en base (hyrox_test_analyses.outputs) : la proposition d'axes vit dans le brouillon. */
export type StoredOutputs = Omit<HyroxTestAnalysisOutputs, "axes_plan">;

export function storedOutputs(out: HyroxTestAnalysisOutputs): StoredOutputs {
  const { axes_plan, ...rest } = out;
  return JSON.parse(JSON.stringify(rest)) as StoredOutputs;
}

export function analyzeTests(
  inputs: HyroxTestInputs,
  profile: AthleteTestProfile,
  opts: { set?: GridSet; target_s?: number | null; context?: AthleteContext | null } = {},
): HyroxTestAnalysisOutputs {
  const set = opts.set ?? GRID_SET_V1;
  const scores = scoreTests(inputs, profile, set);
  const division = { sex: profile.sex, category: profile.category };
  const chrono = predictChrono(scores, division);
  const metrics = ruleMetrics(scores, { wb_no_reps: inputs.wall_balls_5min?.no_reps });
  return {
    algo_version: ALGO_VERSION,
    grid_version: set.version,
    scores,
    chrono,
    insights: strengthsWeaknesses(scores, set),
    rules: matchRules(set.rules, metrics, profile.sex),
    axes_plan:
      opts.target_s != null && opts.context
        ? axesPlan(scores, division, opts.target_s, opts.context, set, { age: profile.age, prediction: chrono })
        : null,
  };
}
