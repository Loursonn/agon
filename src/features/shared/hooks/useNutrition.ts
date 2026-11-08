import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import {
  getLog, getStrategy, invalidateNutrition, nutritionKeys,
  type NutritionDailyLog, type NutritionStrategy,
} from "@/api/nutrition";
import { submitWrite } from "@/lib/offline/writes";
import type { SubmitResult } from "@/lib/offline/writeQueue";

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

/**
 * Enregistre une journée (athlète) puis rafraîchit tout ce qui en dépend.
 * Sans réseau : gardée sur le téléphone (`queued`), affichée tout de suite,
 * envoyée au retour du réseau (la file rafraîchit alors les écrans).
 */
export function useSaveNutritionDay(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ day, log }: { day: IsoDay; log: NutritionDailyLog }): Promise<SubmitResult["status"]> => {
      const r = await submitWrite("nutrition.day", { athleteId, day, log });
      if (r.status === "queued") {
        qc.setQueryData<Record<IsoDay, NutritionDailyLog>>(nutritionKeys.log(athleteId), (old) => ({ ...(old ?? {}), [day]: log }));
      }
      return r.status;
    },
    onSuccess: (status) => (status === "sent" ? invalidateNutrition(qc, athleteId) : undefined),
  });
}
