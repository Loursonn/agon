/**
 * « Comparer à » de l'analyse de course (planche HyroxAnaCoachOrdi) : la
 * référence de chaque segment selon le choix du coach — l'objectif de la
 * course (plan de course, sinon run du jour) ou la course précédente.
 * Plus de médiane de catégorie (docs/HYROX_OBJECTIF_CONCEPTION.md §4.4). Pur et testé.
 *
 * Clés de segment : `run_1`…`run_8`, les 8 stations, `roxzone_total`, `total`.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { roxzoneTotal } from "./calc";
import { objectiveLookup } from "./objective/vsObjective";
import type { PlanSegments } from "./racePlan";

export type CompareKind = "objective" | "previous";

export interface CompareSources {
  previous: HyroxResult | null;
  /** Objectif de la course (17 cibles). */
  objective: PlanSegments | null;
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
  return src.objective ? objectiveLookup(src.objective) : () => null;
}

/** Choix disponible : il faut la donnée correspondante. */
export function compareAvailable(kind: CompareKind, src: CompareSources): boolean {
  return kind === "previous" ? src.previous != null : src.objective != null;
}

/** Choix par défaut : l'objectif s'il existe, sinon la course précédente. */
export const defaultCompare = (src: CompareSources): CompareKind => (src.objective || !src.previous ? "objective" : "previous");

/** Intitulé court de la colonne « Écart » / du pointillé d'allure. */
export const COMPARE_SHORT: Record<CompareKind, string> = {
  objective: "Objectif",
  previous: "Course préc.",
};
