import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateProviders, removeProviderActivity, type RemovedActivity } from "@/api/providers";
import { invalidateActivityDetail } from "@/api/activityDetail";
import { invalidatePlanLinks } from "@/api/plannedVsDone";

/**
 * Retire une activité de montre ou de fichier (P38). Athlète pour lui, coach
 * pour son athlète : `athleteId` est celui de l'athlète concerné.
 */
export function useRemoveProviderActivity(athleteId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<RemovedActivity, Error, string>({
    mutationFn: (activityId) => removeProviderActivity(activityId),
    onSuccess: () => {
      if (!athleteId) return;
      void invalidateProviders(qc, athleteId);
      void invalidateActivityDetail(qc, athleteId);
      void invalidatePlanLinks(qc, athleteId);
      void qc.invalidateQueries({ queryKey: ["runningVolume", athleteId] });
    },
  });
}
