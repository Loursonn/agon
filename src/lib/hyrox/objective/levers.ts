/**
 * Leviers « meilleure stratégie » reliés au travail (docs/HYROX_OBJECTIF_CONCEPTION.md
 * §9.2 et §9.3) : proposition de travail, axe du bilan de tests validé qui dit
 * la même chose, et indice de la montre qui explique le levier sans le
 * chiffrer une seconde fois. Règles fixes, sans IA (données Garmin comprises).
 * Pur et testé.
 */
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { StationKey } from "@/features/shared/types/hyrox";
import type { HyroxTestAnalysisRow } from "../tests/db";
import type { WorkAxisRule } from "../tests/types";
import { cadenceDrop, shareAboveHr, type RaceWatchAnalysis } from "../raceWatch";
import { HYROX_WORK_PROPOSALS, runAfterProposal } from "../workProposals";
import type { LeverKey, StrategyLever, StrategyResult } from "./strategy";

/** Allure (départ, régularité) : texte du §9.2, validé par Hugo le 16/11/2026. */
export const PACING_PROPOSAL =
  "Allure : 3 séances simulées avec run 1 imposé à l'allure cible, puis 6 × 1 km à allure course avec stations courtes";
/** No reps : texte du §9.2, validé par Hugo le 16/11/2026. */
export const NO_REPS_PROPOSAL = "Technique : 5 × 20 wall balls à la cible, squat filmé de profil";

/** Règles d'axes (`hyrox_work_axes_rules`) qui disent la même chose que chaque levier. */
export const LEVER_RULES: Record<LeverKey, readonly string[]> = {
  depart: ["run_seuils"],
  regularite: ["run_seuils"],
  apres_sleds: ["sled_push_endf", "sled_pull_endf"],
  run_8: [],
  roxzone: [],
  no_reps: ["wb_tech"],
  allure: ["run_seuils", "run_vitesse", "run_vo2"],
  wall_balls: ["wb_endf"],
  sled_push: ["sled_push_force", "sled_push_endf"],
  sled_pull: ["sled_pull_force", "sled_pull_endf", "sled_pull_gap"],
  ski: ["ergo_tech", "ergo_run_first"],
  row: ["ergo_tech", "ergo_run_first"],
  bbj: ["bbj_endf", "bj_force"],
  farmers: ["grip"],
  lunges: [],
};

/** Proposition de travail d'un levier, `null` si aucune (allure : voir l'axe du bilan). */
export function leverProposal(l: Pick<StrategyLever, "key" | "focus">): string | null {
  switch (l.key) {
    case "depart": case "regularite": return PACING_PROPOSAL;
    case "apres_sleds": return runAfterProposal(l.focus ?? "sled_push");
    case "run_8": return runAfterProposal("lunges");
    case "roxzone": return HYROX_WORK_PROPOSALS.roxzone;
    case "no_reps": return NO_REPS_PROPOSAL;
    case "allure": return null;
    default: return HYROX_WORK_PROPOSALS[l.key as StationKey] ?? null;
  }
}

/**
 * Règles déclenchées du dernier bilan de tests validé par le coach, fait au
 * plus tard le jour de la course. `[]` sans bilan validé.
 */
export function validatedRules(analyses: readonly HyroxTestAnalysisRow[], raceDate: string): WorkAxisRule[] {
  const last = analyses
    .filter((a) => a.validated_at && a.date <= raceDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const rules = (last?.outputs as { rules?: unknown } | undefined)?.rules;
  return Array.isArray(rules) ? (rules as WorkAxisRule[]) : [];
}

/** Règle du bilan de tests (déclenchée) qui rejoint le levier, la première dans l'ordre du §9.2. */
export function leverAxis(key: LeverKey, triggered: readonly WorkAxisRule[]): WorkAxisRule | null {
  for (const id of LEVER_RULES[key]) {
    const r = triggered.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

/** Part d'une station passée au-dessus de SV2 à partir de laquelle la montre l'explique. */
export const HINT_ABOVE_SV2 = 0.5;
/** Baisse de cadence (pas/min vs la croisière) à partir de laquelle la montre l'explique. */
export const HINT_CADENCE_DROP = 4;

const STATION_BEFORE_RUN: Record<number, StationKey> = {
  2: "ski", 3: "sled_push", 4: "sled_pull", 5: "bbj", 6: "row", 7: "farmers", 8: "lunges",
};
const RUNS_OF: Partial<Record<LeverKey, number[]>> = { regularite: [2, 5, 6, 7], apres_sleds: [3, 4], run_8: [8] };

/**
 * Indices de la montre, par levier présent : station au-dessus de SV2 avant un
 * run qui a perdu du temps, cadence du run en baisse, récupération en Roxzone.
 * Aucune seconde propre ; `{}` sans montre.
 */
export function leverHints(input: {
  strategy: StrategyResult;
  analysis: RaceWatchAnalysis | null;
  stream: ActivityStream | null;
  sv2: number | null;
  offset: number;
  /** Récupération moyenne en Roxzone (bpm en 60 s), si mesurée. */
  roxzoneRecoveryBpm: number | null;
}): Partial<Record<LeverKey, string>> {
  const { strategy, analysis, stream, sv2, offset } = input;
  const out: Partial<Record<LeverKey, string>> = {};
  if (!analysis) return out;
  const present = new Set(strategy.levers.map((l) => l.key));
  const label = (k: StationKey) => analysis.segments.find((s) => s.key === k)?.label ?? k;
  const above = (k: StationKey) => shareAboveHr(analysis, stream, sv2, offset, (s) => s.key === k);
  const cad = cadenceDrop(analysis);
  const cruiseCad = cad?.cruiseCadence ?? null;
  const cadOf = (run: number) => {
    const s = analysis.segments.find((x) => x.key === `run_${run}`);
    return cruiseCad != null && s?.avgCadence != null ? cruiseCad - s.avgCadence : null;
  };

  for (const key of ["regularite", "apres_sleds", "run_8"] as const) {
    if (!present.has(key)) continue;
    // Le run qui a le plus perdu dans ce levier, et la station juste avant.
    const run = (RUNS_OF[key] ?? []).filter((i) => (strategy.runLoss[i] ?? 0) >= 1)
      .sort((a, b) => (strategy.runLoss[b] ?? 0) - (strategy.runLoss[a] ?? 0))[0];
    if (run == null) continue;
    const st = STATION_BEFORE_RUN[run];
    const parts: string[] = [];
    const up = above(st);
    if (up != null && up >= HINT_ABOVE_SV2) parts.push(`${label(st)} passé à ${Math.round(up * 100)} % au-dessus de SV2 (${sv2} bpm)`);
    const drop = cadOf(run);
    if (drop != null && drop >= HINT_CADENCE_DROP) parts.push(`cadence du run ${run} −${Math.round(drop)} pas/min vs ta croisière`);
    if (parts.length) out[key] = `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
  }
  if (present.has("depart")) {
    const r1 = shareAboveHr(analysis, stream, sv2, offset, (s) => s.key === "run_1");
    if (r1 != null && r1 >= 0.2) out.depart = `Run 1 à ${Math.round(r1 * 100)} % au-dessus de SV2 (${sv2} bpm).`;
  }
  if (present.has("roxzone") && input.roxzoneRecoveryBpm != null) {
    out.roxzone = `FC qui redescend de ${input.roxzoneRecoveryBpm} bpm en 60 s après les stations, en moyenne.`;
  }
  return out;
}

/** Levier prêt à afficher : proposition, axe du bilan (coach seulement), indice montre. */
export interface LeverView extends StrategyLever {
  proposal: string | null;
  axis: WorkAxisRule | null;
  hint: string | null;
}

export function leverViews(
  strategy: StrategyResult,
  rules: readonly WorkAxisRule[],
  hints: Partial<Record<LeverKey, string>>,
): LeverView[] {
  return strategy.levers.map((l) => ({ ...l, proposal: leverProposal(l), axis: leverAxis(l.key, rules), hint: hints[l.key] ?? null }));
}

export interface CascadeStep {
  key: string;
  label: string;
  gainS: number;
  group: StrategyLever["group"] | "autres";
}

/** Libellés courts de la cascade (la place sous chaque barre est comptée). */
const SHORT: Partial<Record<LeverKey, string>> = {
  depart: "Départ", regularite: "Régularité", apres_sleds: "Après sleds", no_reps: "No reps",
  allure: "Allure", bbj: "Burpees", wall_balls: "Wall balls",
};

/**
 * Marches de la cascade, dans l'ordre des leviers (Stratégie puis Capacité) :
 * au-delà de `max`, les plus petites sont réunies en « Autres » (dernière marche).
 */
export function cascadeSteps(levers: readonly StrategyLever[], max = 6): CascadeStep[] {
  const step = (l: StrategyLever): CascadeStep => ({ key: l.key, label: SHORT[l.key] ?? l.label, gainS: l.gainS, group: l.group });
  if (levers.length <= max) return levers.map(step);
  const kept = new Set([...levers].sort((a, b) => b.gainS - a.gainS).slice(0, max - 1).map((l) => l.key));
  const rest = levers.filter((l) => !kept.has(l.key));
  return [
    ...levers.filter((l) => kept.has(l.key)).map(step),
    { key: "autres", label: `${rest.length} autres`, gainS: rest.reduce((n, l) => n + l.gainS, 0), group: "autres" },
  ];
}
