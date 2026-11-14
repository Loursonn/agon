/**
 * « Comparer à » de l'analyse de course (planche HyroxAnaCoachOrdi) : la
 * référence de chaque segment selon le choix du coach — course précédente,
 * plan de course ou médiane du niveau. Pur et testé.
 *
 * Clés de segment : `run_1`…`run_8`, les 8 stations, `roxzone_total`, `total`.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { roxzoneTotal } from "./calc";
import type { PlanSegments } from "./racePlan";

export type CompareKind = "previous" | "plan" | "median";

export interface CompareSources {
  previous: HyroxResult | null;
  plan: PlanSegments | null;
  /** Médiane (p50) du niveau de la course, par segment. */
  median: (segment: string) => number | null;
}

const resultValue = (r: HyroxResult, seg: string): number | null => {
  if (seg === "total") return r.total_s;
  if (seg === "roxzone_total") return roxzoneTotal(r);
  const v = (r as unknown as Record<string, number | null | undefined>)[`${seg}_s`];
  return v != null && v > 0 ? v : null;
};

/** Référence d'un segment pour un choix donné ; `null` = pas de donnée (« — »). */
export function compareTarget(kind: CompareKind, src: CompareSources): (segment: string) => number | null {
  if (kind === "previous") return (seg) => (src.previous ? resultValue(src.previous, seg) : null);
  if (kind === "plan") {
    const plan = src.plan;
    return (seg) => {
      if (!plan) return null;
      if (seg === "total") return Object.values(plan).reduce((n, x) => n + x, 0);
      return (plan as Record<string, number>)[seg] ?? null;
    };
  }
  return (seg) => src.median(seg);
}

/** Choix disponible : il faut la donnée correspondante. */
export function compareAvailable(kind: CompareKind, src: CompareSources): boolean {
  if (kind === "previous") return src.previous != null;
  if (kind === "plan") return src.plan != null;
  return src.median("total") != null;
}

/** Choix par défaut : le plan s'il existe, sinon la médiane. */
export const defaultCompare = (src: CompareSources): CompareKind => (src.plan ? "plan" : "median");

/** Intitulé court de la colonne « Écart » / du pointillé d'allure. */
export const COMPARE_SHORT: Record<CompareKind, string> = {
  previous: "Course préc.",
  plan: "Plan",
  median: "Médiane",
};
