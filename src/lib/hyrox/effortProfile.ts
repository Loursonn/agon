/**
 * Profil d'effort d'une course (« l'araignée », décision d'Hugo du 16/11/2026,
 * qui remplace Q8 de docs/HYROX_OBJECTIF_CONCEPTION.md) : sur chaque axe
 * (course, 8 stations, Roxzone), deux lectures superposées.
 * - Rang : position dans toute la catégorie de la course (percentiles
 *   `hyrox_reference_segments`, toutes tranches de chrono), avec le temps du
 *   top 1 % et la médiane.
 * - Niveau : objectif de la course ÷ temps réalisé. 100 % = la médiane des
 *   athlètes qui courent comme l'athlète (grille de l'objectif) ; au-dessus,
 *   plus fort que sa course sur ce segment.
 * Sur le radar, plus loin du centre = plus rapide, l'anneau du milieu = la
 * médiane pour les deux lectures. Pur et testé.
 */
import { STATION_KEYS, STATION_META, type HyroxResult, type StationKey } from "@/features/shared/types/hyrox";
import { POSITION_BRACKET, percentile, roxzoneTotal, runTotal, type RefLookup } from "./calc";
import { raceCategory } from "./categories";
import type { PlanSegments } from "./racePlan";

export type EffortAxisKey = "run" | StationKey | "roxzone";

export interface EffortAxis {
  key: EffortAxisKey;
  label: string;
  /** Temps réalisé (s) ; course : allure moyenne par km. */
  actualS: number | null;
  /** Temps du top 1 % et médiane de la catégorie (même unité). */
  top1S: number | null;
  medianS: number | null;
  /** Position dans la catégorie, 1 = le plus rapide (« top 1 % »). */
  pct: number | null;
  /** Rayon du rang sur le radar, 0-100 (100 − position). */
  rankValue: number | null;
  /** Objectif ÷ réalisé, en % arrondi. */
  levelPct: number | null;
  /** Rayon du niveau sur le radar, 0-100 (50 = 100 %) ; borné. */
  levelValue: number | null;
  /** Le niveau sort de l'échelle du radar (< 60 % ou > 140 %). */
  levelClipped: boolean;
}

/** Points de radar par point de % de niveau : 60 % → bord intérieur, 140 % → bord extérieur. */
export const LEVEL_SCALE = 1.25;

export function levelRadius(levelPct: number): { value: number; clipped: boolean } {
  const raw = 50 + (levelPct - 100) * LEVEL_SCALE;
  return { value: Math.min(100, Math.max(0, raw)), clipped: raw < 0 || raw > 100 };
}

const RUNS = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"] as const;

export function effortProfile(race: HyroxResult, refs: RefLookup, objective: PlanSegments | null): EffortAxis[] {
  const cat = raceCategory(race);
  const seg = (k: string): number | null => {
    const v = (race as unknown as Record<string, number | null | undefined>)[`${k}_s`];
    return typeof v === "number" && v > 0 ? v : null;
  };
  const target = (k: string): number | null => {
    const v = objective ? (objective as unknown as Record<string, number | undefined>)[k] : undefined;
    return typeof v === "number" && v > 0 ? v : null;
  };
  const runTarget = objective && RUNS.every((k) => target(k) != null) ? RUNS.reduce((n, k) => n + (target(k) as number), 0) : null;
  const axes: Array<{ key: EffortAxisKey; label: string; total: number | null; ref: string; target: number | null; per: number }> = [
    { key: "run", label: "Course", total: runTotal(race), ref: "run_total", target: runTarget, per: RUNS.length },
    ...STATION_KEYS.map((k) => ({ key: k as EffortAxisKey, label: STATION_META[k].label, total: seg(k), ref: k as string, target: target(k), per: 1 })),
    { key: "roxzone", label: "Roxzone", total: roxzoneTotal(race), ref: "roxzone_total", target: target("roxzone_total"), per: 1 },
  ];
  return axes.map(({ key, label, total, ref: refKey, target: t, per }) => {
    const ref = refs(cat, refKey, POSITION_BRACKET);
    const pct = total != null && ref ? percentile(total, ref) : null;
    const levelPct = total != null && t != null ? Math.round((t / total) * 100) : null;
    const lv = levelPct != null ? levelRadius(levelPct) : null;
    const div = (v: number | null | undefined) => (v != null ? Math.round(v / per) : null);
    return {
      key,
      label,
      actualS: div(total),
      top1S: div(ref?.p1_s),
      medianS: div(ref?.p50_s),
      pct,
      rankValue: pct != null ? 100 - pct : null,
      levelPct,
      levelValue: lv?.value ?? null,
      levelClipped: lv?.clipped ?? false,
    };
  });
}

/** Axes classés du meilleur rang au moins bon (sans rang : à la fin). */
export function byRank(axes: readonly EffortAxis[]): EffortAxis[] {
  return [...axes].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
}
