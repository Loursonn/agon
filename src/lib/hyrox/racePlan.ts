/**
 * Plan de course HYROX (`hyrox_race_plans`) : un chrono cible réparti en 17
 * objectifs (8 runs, 8 stations, Roxzone) selon la médiane du niveau visé,
 * chacun modifiable par le coach. Pur et testé, aucune lecture en base.
 *
 * Stockage (`targets`, format `HyroxPlanTargets` historique) : temps des runs
 * et des stations, Roxzone en `roxzone_per_transition` = total / 8 (même
 * convention que `planVsActual`).
 */
import {
  REFERENCE_DIVISION, RUN_KEYS, STATION_KEYS,
  type HyroxDivision, type HyroxPlanTargets, type HyroxResult,
} from "@/features/shared/types/hyrox";
import { bracketOf, type RefLookup } from "./calc";

/** Les 17 segments d'un plan, dans l'ordre de la course (Roxzone en dernier). */
export const PLAN_SEGMENTS = [
  "run_1", "ski", "run_2", "sled_push", "run_3", "sled_pull", "run_4", "bbj",
  "run_5", "row", "run_6", "farmers", "run_7", "lunges", "run_8", "wall_balls", "roxzone_total",
] as const;
export type PlanSegment = typeof PLAN_SEGMENTS[number];

/** Les 17 objectifs (s) d'un plan, Roxzone en total. */
export type PlanSegments = Record<PlanSegment, number>;

/** Objectifs stockés → objectifs par segment (Roxzone en total). */
export function planSegments(t: HyroxPlanTargets): PlanSegments {
  const out = {} as PlanSegments;
  for (const k of PLAN_SEGMENTS) {
    out[k] = k === "roxzone_total" ? Math.round(t.roxzone_per_transition * 8) : t[k];
  }
  return out;
}

/** Objectifs par segment → format stocké. */
export function planTargets(s: PlanSegments): HyroxPlanTargets {
  const t = { roxzone_per_transition: s.roxzone_total / 8 } as HyroxPlanTargets;
  for (const k of [...RUN_KEYS, ...STATION_KEYS]) t[k] = s[k];
  return t;
}

/** Chrono du plan : somme des 17 objectifs. */
export const planTotal = (s: PlanSegments): number => PLAN_SEGMENTS.reduce((n, k) => n + s[k], 0);

/**
 * Répartit un chrono cible sur les 17 segments, au prorata de la médiane du
 * niveau visé (tranche de chrono de la cible). `null` si une médiane manque.
 * Les arrondis sont rattrapés sur le run 8 : la somme vaut la cible.
 */
export function planFromTarget(targetS: number, division: HyroxDivision, refs: RefLookup): PlanSegments | null {
  const div = REFERENCE_DIVISION(division);
  const bracket = bracketOf(targetS);
  const med: Partial<Record<PlanSegment, number>> = {};
  for (const k of PLAN_SEGMENTS) {
    const ref = refs(div, k, bracket) ?? refs(div, k, "all");
    if (!ref?.p50_s) return null;
    med[k] = ref.p50_s;
  }
  const sum = PLAN_SEGMENTS.reduce((n, k) => n + (med[k] as number), 0);
  const out = {} as PlanSegments;
  for (const k of PLAN_SEGMENTS) out[k] = Math.round(((med[k] as number) * targetS) / sum);
  out.run_8 += Math.round(targetS) - planTotal(out);
  return out;
}

/** Ce que l'analyse lit d'un plan. */
export interface PlanLike {
  id: string;
  result_id: string | null;
  competition_id: string | null;
  target_total_s: number;
  targets: HyroxPlanTargets;
  updated_at?: string;
}

/**
 * Plan d'une course : celui rattaché au résultat, sinon celui de la même
 * compétition. Le plus récent l'emporte s'il y en a plusieurs.
 */
export function planForRace<P extends PlanLike>(race: Pick<HyroxResult, "id" | "competition_id">, plans: readonly P[]): P | null {
  const recent = (xs: P[]) => xs.sort((a, b) => ((a.updated_at ?? "") < (b.updated_at ?? "") ? 1 : -1))[0] ?? null;
  const byResult = plans.filter((p) => p.result_id === race.id);
  if (byResult.length) return recent(byResult);
  if (!race.competition_id) return null;
  return recent(plans.filter((p) => p.result_id == null && p.competition_id === race.competition_id));
}

/** « 4:38 » → 278 ; « 1:18:42 » → 4722 ; texte invalide → `null`. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.slice(1).some((x) => x >= 60)) return null;
  const s = n.reduce((acc, x) => acc * 60 + x, 0);
  return s > 0 ? s : null;
}
