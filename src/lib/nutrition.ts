/**
 * Nutrition côté front : réexport du calcul partagé (`@shared/domain/nutrition`,
 * le même pour l'athlète, le coach et l'IA).
 *
 * Lectures / écritures : `src/api/nutrition.ts` (stratégie, journal, journées
 * datées, RPC `nutrition_save_day`). Plus aucun accès Supabase ici.
 */

export {
  NUTRITION_CLOSE_PCT,
  NUTRITION_TOLERANCE_PCT,
  calorieMode,
  dayDepense,
  evaluateLoggedDay,
  evaluateNutritionDay,
  nutritionAdherence,
} from "@shared/domain/nutrition";
export type {
  CalorieMode,
  DeficitMode,
  NutritionAdherence,
  NutritionDailyLog,
  NutritionDay,
  NutritionDayEval,
  NutritionDayStatus,
  NutritionStrategy,
  NutritionStrategyType,
} from "@shared/domain/nutrition";
