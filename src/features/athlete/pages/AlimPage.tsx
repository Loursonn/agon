import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { headerGlow } from "@/features/athlete/components/headerGlow";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import NutritionView from "@/components/athlete/NutritionView";
import { useNutritionStrategy } from "@/features/shared/hooks/useNutrition";

/**
 * Le journal est lu et écrit par NutritionView via `src/api/nutrition.ts`
 * (une journée à la fois, RPC `nutrition_save_day`). Plus de réécriture du
 * journal complet par le contexte (`setNutritionLog`), qui écrasait la saisie
 * d'un autre appareil.
 */
export default function AlimPage() {
  const { athleteId, viewOnly, athleteProfile, nutritionStrategy, weightLog } = useAthleteContext();
  // Stratégie relue par la couche API (plan du coach à jour) ; le contexte sert
  // le temps du premier chargement.
  const strategyQuery = useNutritionStrategy(athleteId);
  const strategy = strategyQuery.data !== undefined ? strategyQuery.data : nutritionStrategy;
  const bmr = (athleteProfile as { base_metabolism?: number } | null)?.base_metabolism ?? null;

  return (
    <div className="mx-auto w-full max-w-[480px] lg:max-w-none">
    <AthletePageHeader title="Alimentation" dateStyle="long" background={headerGlow("#66F03C", "#FF9500")} />
    <NutritionView
      athleteId={athleteId}
      bmr={bmr}
      nutritionStrategy={strategy}
      weightLog={weightLog}
      viewOnly={viewOnly}
    />
    </div>
  );
}
