/**
 * Plan de course HYROX (`hyrox_race_plans`) : les 17 cibles (8 runs, 8
 * stations, Roxzone) d'un objectif, construit depuis le run moyen par
 * `objective/model.ts`, chacune modifiable par le coach. Pur et testé.
 *
 * Stockage (`targets`, format `HyroxPlanTargets` historique) : temps des runs
 * et des stations, Roxzone en `roxzone_per_transition` = total / 8 (même
 * convention que `planVsActual`).
 */
import { RUN_KEYS, STATION_KEYS, type HyroxPlanTargets, type HyroxResult } from "@/features/shared/types/hyrox";

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
