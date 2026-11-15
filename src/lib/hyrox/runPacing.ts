/**
 * Allure des runs HYROX (décision d'Hugo, 15/11/2026).
 *
 * - Le run 1 n'est jamais une référence : sa longueur et le départ changent
 *   d'une course à l'autre. Il s'affiche, il ne se compare pas.
 * - Le run 8 est parfois différent (arrivée, parcours) : il compte pour le coût
 *   des sandbag lunges, mais il est signalé.
 * - Allure de croisière = médiane des runs 2 à 7 de l'athlète.
 * - Coût d'une station = run qui la suit − croisière, comparé au ralentissement
 *   habituel au même endroit chez les athlètes du même niveau (médianes des
 *   références : run k − médiane des runs 2 à 7).
 *
 * Pur et testé, aucune lecture en base.
 */
import type { StationKey } from "@/features/shared/types/hyrox";

/** Runs qui fixent la croisière. */
export const CRUISE_RUNS = ["run_2", "run_3", "run_4", "run_5", "run_6", "run_7"] as const;

/** Run qui suit chaque station (le wall ball finit la course : aucun). */
export const RUN_AFTER: Record<StationKey, string | null> = {
  ski: "run_2",
  sled_push: "run_3",
  sled_pull: "run_4",
  bbj: "run_5",
  row: "run_6",
  farmers: "run_7",
  lunges: "run_8",
  wall_balls: null,
};

/** Station juste avant chaque run (run 1 : le départ). */
export const STATION_BEFORE: Record<string, StationKey | null> = {
  run_1: null,
  run_2: "ski",
  run_3: "sled_push",
  run_4: "sled_pull",
  run_5: "bbj",
  run_6: "row",
  run_7: "farmers",
  run_8: "lunges",
};

/** Surcoût au-delà de l'habituel (s/km) : orange, puis rouge. */
export const EXCESS_WARN_S = 10;
export const EXCESS_BAD_S = 20;

/** Run comparable à la croisière (pas le run 1). */
export const isComparableRun = (key: string) => key !== "run_1";
/** Run à part : le 1 (jamais comparé) et le 8 (compté, mais signalé). */
export const isSpecialRun = (key: string) => key === "run_1" || key === "run_8";

export type RunLookup = (key: string) => number | null;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Médiane des runs 2 à 7 (au moins 3 connus), en s/km. */
export function cruisePace(run: RunLookup): number | null {
  const v = CRUISE_RUNS.map((k) => run(k)).filter((x): x is number => x != null && x > 0);
  return v.length >= 3 ? median(v) : null;
}

export interface LevelRunPattern {
  /** Croisière médiane du niveau (médiane des p50 des runs 2 à 7). */
  cruiseS: number;
  /** Ralentissement habituel de chaque run par rapport à cette croisière (s/km). */
  usual: Record<string, number>;
}

/** Profil d'allure habituel d'un niveau, tiré des médianes des références. */
export function levelRunPattern(p50: RunLookup): LevelRunPattern | null {
  const cruiseS = cruisePace(p50);
  if (cruiseS == null) return null;
  const usual: Record<string, number> = {};
  for (let i = 2; i <= 8; i++) {
    const v = p50(`run_${i}`);
    if (v != null) usual[`run_${i}`] = v - cruiseS;
  }
  return { cruiseS, usual };
}

export interface StationRunCost {
  station: StationKey;
  run: string;
  /** Run suivant − croisière de l'athlète (s/km), arrondi. */
  costS: number;
  /** Même écart chez les athlètes du niveau, `null` sans références. */
  usualS: number | null;
  /** Surcoût propre à l'athlète : coût − habituel. */
  excessS: number | null;
  /** Run 8 : compté, mais signalé (arrivée, parcours parfois différent). */
  special: boolean;
}

/** Coût de chaque station (ski → lunges) sur le run qui la suit. */
export function stationRunCosts(run: RunLookup, level: LevelRunPattern | null): StationRunCost[] {
  const cruise = cruisePace(run);
  if (cruise == null) return [];
  const out: StationRunCost[] = [];
  for (const [station, next] of Object.entries(RUN_AFTER) as Array<[StationKey, string | null]>) {
    if (!next) continue;
    const v = run(next);
    if (v == null) continue;
    const costS = Math.round(v - cruise);
    const u = level?.usual[next];
    const usualS = u != null ? Math.round(u) : null;
    out.push({ station, run: next, costS, usualS, excessS: usualS != null ? costS - usualS : null, special: next === "run_8" });
  }
  return out;
}

/**
 * Course compromise : écart entre le run le plus rapide et le plus lent parmi
 * les runs 2 à 7 (des runs censés être identiques), comparé au même écart
 * chez les athlètes du niveau.
 */
export function cruiseSpread(run: RunLookup, levelP50: RunLookup | null): {
  spreadS: number;
  usualSpreadS: number | null;
  fastest: string;
  slowest: string;
} | null {
  const known = CRUISE_RUNS.map((k) => ({ k, v: run(k) })).filter((x): x is { k: (typeof CRUISE_RUNS)[number]; v: number } => x.v != null);
  if (known.length < 3) return null;
  const fastest = known.reduce((a, b) => (b.v < a.v ? b : a));
  const slowest = known.reduce((a, b) => (b.v > a.v ? b : a));
  let usualSpreadS: number | null = null;
  if (levelP50) {
    const lv = CRUISE_RUNS.map((k) => levelP50(k)).filter((x): x is number => x != null);
    if (lv.length >= 3) usualSpreadS = Math.round(Math.max(...lv) - Math.min(...lv));
  }
  return { spreadS: Math.round(slowest.v - fastest.v), usualSpreadS, fastest: fastest.k, slowest: slowest.k };
}

/** Couleur d'un surcoût : rien sous 10 s/km, orange, rouge au-delà de 20. */
export function excessLevel(excessS: number | null): "ok" | "warn" | "bad" {
  if (excessS == null || excessS < EXCESS_WARN_S) return "ok";
  return excessS >= EXCESS_BAD_S ? "bad" : "warn";
}
