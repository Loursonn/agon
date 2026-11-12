import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IsoDay } from "@shared/domain/dates";
import { invalidateActivityDetail } from "@/api/activityDetail";
import { confirmMatch, getPlannedVsDone, invalidatePlanLinks, linkActivityToPlan, planLinkKeys, rejectMatch } from "@/api/plannedVsDone";
import { invalidateWorkouts } from "@/api/workouts";
import { invalidateEnergy } from "@/api/energy";
import type { PlannedKind } from "@/lib/plannedVsDone";

/**
 * Prévu / réalisé / libre d'une plage du planning (cartes P34). Même hook
 * pour l'athlète et son coach : la base décide de ce qui est visible.
 */
export function usePlannedVsDone(athleteId: string | undefined, from: IsoDay | undefined, to: IsoDay | undefined) {
  return useQuery({
    queryKey: planLinkKeys.week(athleteId ?? "none", (from ?? "") as IsoDay, (to ?? "") as IsoDay),
    enabled: !!athleteId && !!from && !!to,
    staleTime: 60_000,
    queryFn: () => getPlannedVsDone(athleteId!, from!, to!),
  });
}

type Decision =
  | { type: "confirm"; linkId: string }
  | { type: "reject"; linkId: string }
  | { type: "associate"; activityId: string; kind: PlannedKind; plannedId: string };

/** « C'est bien cette séance », « Ce n'est pas cette séance », « Associer à une séance prévue ». */
export function usePlanLinkDecision(athleteId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: Decision) => {
      if (d.type === "confirm") await confirmMatch(d.linkId);
      else if (d.type === "reject") await rejectMatch(d.linkId);
      else await linkActivityToPlan(d.activityId, d.kind, d.plannedId);
    },
    onSuccess: (_r, d) => {
      if (!athleteId) return;
      void invalidatePlanLinks(qc, athleteId);
      void invalidateActivityDetail(qc, athleteId);
      // Une séance rattachée devient réalisée dans le planning historique aussi.
      if (d.type !== "reject") {
        void invalidateWorkouts(qc, { athleteId });
        void invalidateEnergy(qc, athleteId);
      }
      toast.success(d.type === "reject" ? "C'est noté : l'activité reste une séance libre." : "Séance réalisée.");
    },
    onError: () => toast.error("Impossible d'enregistrer ce choix. Réessaie."),
  });
}
