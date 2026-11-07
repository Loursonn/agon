import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import {
  getLog, getStrategy, invalidateNutrition, nutritionKeys, saveDay,
  type NutritionDailyLog, type NutritionStrategy,
} from "@/api/nutrition";

/** Stratégie du coach (null si aucune). */
export function useNutritionStrategy(athleteId: string | undefined) {
  return useQuery<NutritionStrategy | null>({
    queryKey: nutritionKeys.strategy(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getStrategy(athleteId!),
  });
}

/** Journal complet de l'athlète, par jour ISO. */
export function useNutritionLog(athleteId: string | undefined) {
  return useQuery<Record<IsoDay, NutritionDailyLog>>({
    queryKey: nutritionKeys.log(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getLog(athleteId!),
  });
}

/** Enregistre une journée (athlète) puis rafraîchit tout ce qui en dépend. */
export function useSaveNutritionDay(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ day, log }: { day: IsoDay; log: NutritionDailyLog }) => saveDay(athleteId, day, log),
    onSuccess: () => invalidateNutrition(qc, athleteId),
  });
}
