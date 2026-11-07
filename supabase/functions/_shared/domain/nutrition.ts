/**
 * Nutrition — types et calculs partagés par l'athlète, le coach et l'IA.
 *
 * Pur, sans dépendance réseau : importé par le front (`@shared/domain/nutrition`,
 * réexporté par `src/lib/nutrition.ts`) et par les Edge Functions.
 *
 * Stockage (inchangé, `app_data`) :
 * - `asp:nutrition_strategy` : un objet `NutritionStrategy` écrit par le coach ;
 * - `asp:nutrition_log` : `{ "YYYY-MM-DD": NutritionDailyLog }` écrit par l'athlète,
 *   un jour à la fois (RPC `nutrition_save_day`).
 *
 * L'objectif du coach est un % SIGNÉ de déficit/surplus vs la dépense de
 * référence (`surplus_deficit_min/max`, déficit < 0), pas des kcal : les Retours
 * lisaient ces % comme des kcal (2026-11-08) — passer par `evaluateNutritionDay`.
 */
import { byIsoDay, type IsoDay } from "./dates.ts";

export type NutritionStrategyType = "maintenance" | "seche" | "prise_de_masse";

export type CalorieMode = "nap" | "active" | "hybrid";

export type DeficitMode = "fixed" | "range";

export interface NutritionStrategy {
  strategy: NutritionStrategyType;
  can_track_calories: boolean; // legacy, remplacé par calorie_mode
  calorie_mode?: CalorieMode | null;
  deficit_mode?: DeficitMode | null;
  nap?: number | null;
  total_calories_coach?: number | null;
  total_calories_min?: number | null; // borne basse fourchette kcal (deficit_mode = range)
  total_calories_max?: number | null; // borne haute fourchette kcal (deficit_mode = range)
  tdee_ref?: number | null;           // dépense de référence BMR × NAP au moment du plan
  target_weight?: number | null;
  surplus_deficit_min?: number | null; // % signé
  surplus_deficit_max?: number | null; // % signé
  weekly_target_kg?: number | null;
  macros_glucides?: number | null;
  macros_lipides?: number | null;
  macros_proteines?: number | null;
  macros_glucides_pct?: number | null;
  macros_lipides_pct?: number | null;
  macros_proteines_pct?: number | null;
}

export interface NutritionDailyLog {
  active_calories?: number | null;
  total_calories_consumed?: number | null;
  glucides_consumed?: number | null;
  lipides_consumed?: number | null;
  proteines_consumed?: number | null;
}

/** Une journée du journal, datée (lignes des Retours et de l'API coach). */
export interface NutritionDay {
  date: IsoDay;
  active_calories: number | null;
  total_calories_consumed: number | null;
  glucides_consumed: number | null;
  lipides_consumed: number | null;
  proteines_consumed: number | null;
}

/** Les seuls champs d'une journée : la RPC `nutrition_save_day` applique la même liste. */
export const NUTRITION_LOG_FIELDS = [
  "active_calories",
  "total_calories_consumed",
  "glucides_consumed",
  "lipides_consumed",
  "proteines_consumed",
] as const;

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Garde les champs connus, en nombres (ou null) : ce qui part à la RPC. */
export function cleanDailyLog(log: NutritionDailyLog | Record<string, unknown> | null | undefined): Required<NutritionDailyLog> {
  const src = (log ?? {}) as Record<string, unknown>;
  const out = {} as Record<(typeof NUTRITION_LOG_FIELDS)[number], number | null>;
  for (const k of NUTRITION_LOG_FIELDS) out[k] = numOrNull(src[k]);
  return out;
}

/**
 * Valeur brute de `asp:nutrition_log` → journées datées, triées, bornées à
 * [from, to] si donnés. Clés non datées écartées, "YYYYMMDD" relu en ISO.
 */
export function nutritionDays(raw: unknown, from?: IsoDay, to?: IsoDay): NutritionDay[] {
  const map = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.entries(byIsoDay(map))
    .filter(([d]) => (!from || d >= from) && (!to || d <= to))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...cleanDailyLog(v as Record<string, unknown>) }));
}

// ── Évaluation du jour vs objectif ──────────────────────────────────────────
// L'objectif est un % de déficit/surplus vs la dépense de référence (pas des
// kcal figées) : l'athlète peut saisir ses calories brûlées, la référence bouge.
// Tolérance : ±2 points de % pour être "dans l'objectif", ±5 pts pour "proche".
export const NUTRITION_TOLERANCE_PCT = 2;
export const NUTRITION_CLOSE_PCT = 5;

export type NutritionDayStatus = "ok" | "close" | "off";

export interface NutritionDayEval {
  status: NutritionDayStatus;
  /** Dépense de référence utilisée (BMR + actives, ou TDEE du plan) */
  reference: number;
  /** % réel de surplus/déficit vs la référence (négatif = déficit) */
  actualPct: number;
  /** Fenêtre de % visée par le coach (wMin = wMax en mode fixe) */
  windowMin: number;
  windowMax: number;
  /** Bornes kcal correspondantes (affichage) */
  targetMin: number;
  targetMax: number;
  /** Milieu kcal de la zone (affichage) */
  target: number;
  isRange: boolean;
  /** Écart en points de % vs la fenêtre (0 si dedans) */
  diffPct: number;
}

/** Dépense de référence quand l'athlète n'a pas saisi ses calories actives. */
function fallbackReference(s: NutritionStrategy): number {
  if (s.tdee_ref && s.tdee_ref > 0) return s.tdee_ref;
  const coach = s.total_calories_coach ?? 0;
  // Legacy : retrouver le TDEE depuis la cible kcal + les %
  if (s.deficit_mode === "range") {
    if (s.total_calories_min != null && s.surplus_deficit_min != null) {
      return Math.round(s.total_calories_min / (1 + s.surplus_deficit_min / 100));
    }
    return coach; // très ancien bug : la cible sauvegardée était le TDEE brut
  }
  const p = s.strategy === "seche" ? (s.surplus_deficit_min ?? 0)
    : s.strategy === "prise_de_masse" ? (s.surplus_deficit_max ?? 0)
    : 0;
  return p !== 0 && coach > 0 ? Math.round(coach / (1 + p / 100)) : coach;
}

/**
 * Évalue la journée vs le plan du coach, en % de déficit/surplus.
 * `activeDepense` = BMR + calories actives saisies par l'athlète (prioritaire).
 */
export function evaluateNutritionDay(
  strategy: NutritionStrategy,
  consumed: number,
  activeDepense?: number | null,
): NutritionDayEval | null {
  if (!consumed || consumed <= 0) return null;

  const reference = (activeDepense && activeDepense > 0) ? activeDepense : fallbackReference(strategy);
  if (!reference || reference <= 0) return null;

  // Fenêtre de % visée (signée : déficit < 0). Fixe → wMin = wMax.
  let wMin = strategy.surplus_deficit_min;
  let wMax = strategy.surplus_deficit_max;
  if (wMin == null || wMax == null) { wMin = 0; wMax = 0; } // pas de % défini → viser la référence
  // Legacy : fourchette sèche saisie en positif ("12" = déficit 12%) → resigner
  if (strategy.strategy === "seche" && wMin > 0 && wMax > 0) { wMin = -wMin; wMax = -wMax; }
  if (wMin > wMax) [wMin, wMax] = [wMax, wMin];
  const isRange = strategy.deficit_mode === "range" && wMin !== wMax;
  // Mode fixe legacy : computeMinMax stockait [-v, -v/2] (sèche) — la vraie cible est la pleine valeur
  if (!isRange && strategy.deficit_mode !== "range") {
    if (strategy.strategy === "seche") wMax = wMin;
    else if (strategy.strategy === "prise_de_masse") wMin = wMax;
  }

  const actualPct = ((consumed - reference) / reference) * 100;

  const status: NutritionDayStatus =
    actualPct >= wMin - NUTRITION_TOLERANCE_PCT && actualPct <= wMax + NUTRITION_TOLERANCE_PCT ? "ok"
    : actualPct >= wMin - NUTRITION_CLOSE_PCT && actualPct <= wMax + NUTRITION_CLOSE_PCT ? "close"
    : "off";

  const diffPct = actualPct < wMin ? actualPct - wMin : actualPct > wMax ? actualPct - wMax : 0;

  const targetMin = Math.round(reference * (1 + wMin / 100));
  const targetMax = Math.round(reference * (1 + wMax / 100));

  return {
    status, reference, actualPct,
    windowMin: wMin, windowMax: wMax,
    targetMin, targetMax,
    target: Math.round((targetMin + targetMax) / 2),
    isRange, diffPct,
  };
}

/** Mode de suivi des calories (les plans anciens n'ont que `can_track_calories`). */
export function calorieMode(s: NutritionStrategy): CalorieMode {
  return s.calorie_mode ?? (s.can_track_calories ? "active" : "nap");
}

/**
 * Dépense du jour quand l'athlète a saisi ses calories actives : MB + actives.
 * null → l'évaluation retombe sur la dépense de référence du plan.
 */
export function dayDepense(s: NutritionStrategy, bmr: number | null | undefined, log: NutritionDailyLog | null | undefined): number | null {
  const active = log?.active_calories ?? 0;
  return calorieMode(s) !== "nap" && active > 0 && bmr ? bmr + active : null;
}

/** Évaluation d'une journée saisie (null si rien de consommé). */
export function evaluateLoggedDay(
  s: NutritionStrategy,
  bmr: number | null | undefined,
  log: NutritionDailyLog | null | undefined,
): NutritionDayEval | null {
  return evaluateNutritionDay(s, log?.total_calories_consumed ?? 0, dayDepense(s, bmr, log));
}

export interface NutritionAdherence {
  /** Jours avec des calories saisies. */
  logged: number;
  /** Jours « dans l'objectif » (±2 pts). */
  ok: number;
  /** Jours « proches » (±5 pts). */
  close: number;
  /** % de jours dans l'objectif, null sans journée évaluable. */
  pctOk: number | null;
}

/** Respect de la stratégie sur une liste de journées (tuile des Retours). */
export function nutritionAdherence(
  s: NutritionStrategy | null,
  bmr: number | null | undefined,
  days: NutritionDailyLog[],
): NutritionAdherence {
  const evals = s ? days.map((d) => evaluateLoggedDay(s, bmr, d)).filter((e): e is NutritionDayEval => e !== null) : [];
  const ok = evals.filter((e) => e.status === "ok").length;
  return {
    logged: days.filter((d) => (d.total_calories_consumed ?? 0) > 0).length,
    ok,
    close: evals.filter((e) => e.status === "close").length,
    pctOk: evals.length ? Math.round((ok / evals.length) * 100) : null,
  };
}
