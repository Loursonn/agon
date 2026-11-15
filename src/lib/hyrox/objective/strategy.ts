/**
 * « Et avec une meilleure stratégie ? » (docs/HYROX_OBJECTIF_CONCEPTION.md §9).
 *
 * Du chrono réalisé au chrono possible, levier par levier, en secondes,
 * contre l'objectif de la course. Chaque seconde de retard n'est comptée
 * qu'une fois ; les avances ne sont jamais retirées.
 *
 * - Niveau de course : si l'athlète a couru tous ses runs plus lentement que
 *   l'objectif, ce décalage est de la **capacité** (« Allure de course »),
 *   pas de la stratégie. Il se lit sur le quart le plus rapide des écarts des
 *   runs 2 à 7 : un ralentissement en fin de course reste de la stratégie.
 * - Stratégie (gagnable le jour J) : départ trop rapide, régularité des runs,
 *   course après les sleds, run 8, Roxzone, no reps aux wall balls.
 * - Capacité (à l'entraînement) : chaque station, l'allure de course.
 *
 * La FC de la montre n'a pas de secondes propres : elle explique un levier
 * (indice, lot 3). Pur et testé.
 */
import type { HyroxResult, StationKey } from "@/features/shared/types/hyrox";
import { roxzoneTotal } from "../calc";
import { wallBallNoReps } from "../noReps";
import type { PlanSegments } from "../racePlan";
import { segmentTolerance } from "./vsObjective";
import { GRID_STATIONS } from "./gridData";

/** Un levier sous ce seuil n'est pas cité (bruit de chronométrage). */
export const LEVER_MIN_S = 10;
/** ROXFIT : chaque seconde prise d'avance au départ en coûte ~2,5 à l'arrivée, soit 1,5 nette. */
export const FAST_START_NET_COST = 1.5;

export type LeverGroup = "strategie" | "capacite";
export type LeverKey =
  | "depart" | "regularite" | "apres_sleds" | "run_8" | "roxzone" | "no_reps"
  | "allure" | StationKey;

export interface StrategyLever {
  key: LeverKey;
  group: LeverGroup;
  label: string;
  gainS: number;
  /** Phrase calculée, sans jargon. */
  detail: string;
}

export interface StrategyResult {
  currentS: number;
  possibleS: number;
  levers: StrategyLever[];
}

const STATION_LABEL: Record<StationKey, string> = {
  ski: "SkiErg", sled_push: "Sled push", sled_pull: "Sled pull", bbj: "Burpees broad jumps",
  row: "Rameur", farmers: "Farmers", lunges: "Fentes", wall_balls: "Wall balls",
};

const seg = (r: HyroxResult, k: string): number | null => {
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};

/** Écart tenu sur les runs les plus réguliers : quart le plus rapide (2ᵉ plus petit sur 6). */
function sustainedGap(xs: number[]): number | null {
  if (xs.length < 3) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 4)];
}

const runName = (ks: number[]) => (ks.length === 1 ? `run ${ks[0]}` : `runs ${ks.slice(0, -1).join(", ")} et ${ks[ks.length - 1]}`);

export function raceStrategy(r: HyroxResult, objective: PlanSegments): StrategyResult {
  const levers: StrategyLever[] = [];
  const push = (l: StrategyLever) => { if (l.gainS >= LEVER_MIN_S) levers.push({ ...l, gainS: Math.round(l.gainS) }); };

  // ── Runs ──
  const run = (i: number) => seg(r, `run_${i}`);
  const target = (i: number) => objective[`run_${i}` as keyof PlanSegments];
  const gaps = [2, 3, 4, 5, 6, 7].map((i) => (run(i) != null ? (run(i) as number) - target(i) : null)).filter((x): x is number => x != null);
  const level = Math.max(0, sustainedGap(gaps) ?? 0);

  // Perte de chaque run au-delà du niveau de course et de la tolérance.
  const loss: Record<number, number> = {};
  let levelLoss = 0;
  for (let i = 1; i <= 8; i++) {
    const a = run(i);
    if (a == null) continue;
    const d = a - target(i);
    levelLoss += Math.min(Math.max(0, d), level);
    loss[i] = Math.max(0, d - level - segmentTolerance(target(i)));
  }

  // Départ trop rapide : avance du run 1 (corrigée du niveau), coût net plafonné par les pertes suivantes.
  const a1 = run(1);
  if (a1 != null) {
    const advance = target(1) + level - a1;
    const later = [2, 3, 4, 5, 6, 7, 8].reduce((n, i) => n + (loss[i] ?? 0), 0);
    if (advance > segmentTolerance(target(1)) && later > 0) {
      let gain = Math.min(FAST_START_NET_COST * advance, later);
      const g = gain;
      // La facture arrive en fin de course : on la prend du run 8 vers le run 2.
      for (let i = 8; i >= 2 && gain > 0; i--) {
        const take = Math.min(loss[i] ?? 0, gain);
        loss[i] = (loss[i] ?? 0) - take;
        gain -= take;
      }
      push({ key: "depart", group: "strategie", label: "Départ trop rapide", gainS: g,
        detail: `Run 1 ${Math.round(advance)} s sous l'objectif : chaque seconde prise au départ se paie environ 2,5 fois plus tard.` });
    }
  }

  const sumOf = (ks: number[]) => ks.reduce((n, i) => n + (loss[i] ?? 0), 0);
  const slow = (ks: number[]) => ks.filter((i) => (loss[i] ?? 0) >= 1);
  const reg = [2, 5, 6, 7];
  push({ key: "regularite", group: "strategie", label: "Régularité des runs", gainS: sumOf(reg),
    detail: `${runName(slow(reg))} au-dessus de l'objectif.` });
  push({ key: "apres_sleds", group: "strategie", label: "Course après les sleds", gainS: sumOf([3, 4]),
    detail: `${runName(slow([3, 4]))}, après le sled push et le sled pull, au-delà du ralentissement habituel.` });
  push({ key: "run_8", group: "strategie", label: "Run 8", gainS: sumOf([8]),
    detail: "Après les fentes (parcours du run 8 parfois différent)." });

  // ── Roxzone ──
  const rox = roxzoneTotal(r);
  if (rox != null) {
    const d = rox - objective.roxzone_total;
    push({ key: "roxzone", group: "strategie", label: "Roxzone", gainS: Math.max(0, d - segmentTolerance(objective.roxzone_total)),
      detail: `Transitions : ${Math.round(d)} s de plus que l'objectif.` });
  }

  // ── No reps (chaque no rep coûte une répétition, au rythme de la station) ──
  const wb = seg(r, "wall_balls");
  const nr = wallBallNoReps(r);
  const n = nr ? (nr.target ?? 0) + (nr.depth ?? 0) : 0;
  const noRepS = wb != null && n > 0 ? (n * wb) / (100 + n) : 0;
  push({ key: "no_reps", group: "strategie", label: "No reps aux wall balls", gainS: noRepS,
    detail: `${n} no rep${n > 1 ? "s" : ""} : autant de répétitions en plus.` });

  // ── Capacité : stations ──
  for (const k of GRID_STATIONS) {
    const a = seg(r, k);
    if (a == null) continue;
    const own = k === "wall_balls" ? a - noRepS : a;
    const d = own - objective[k];
    push({ key: k, group: "capacite", label: STATION_LABEL[k], gainS: Math.max(0, d - segmentTolerance(objective[k])),
      detail: `${Math.round(d)} s au-dessus de l'objectif${k === "wall_balls" && noRepS > 0 ? ", no reps déduits" : ""}.` });
  }

  // ── Capacité : allure de course ──
  push({ key: "allure", group: "capacite", label: "Allure de course", gainS: levelLoss,
    detail: `Runs ${Math.round(level)} s plus lents que l'objectif en moyenne.` });

  const order: Record<LeverGroup, number> = { strategie: 0, capacite: 1 };
  levers.sort((a, b) => order[a.group] - order[b.group] || b.gainS - a.gainS);
  const total = levers.reduce((s, l) => s + l.gainS, 0);
  return { currentS: r.total_s, possibleS: r.total_s - total, levers };
}

