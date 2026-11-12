import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activityDetailKeys,
  getActivityDetail,
  invalidateActivityDetail,
  LapsConflictError,
  resetLapsToWatch,
  saveLaps,
  type LapDraft,
} from "@/api/activityDetail";
import { invalidatePlanLinks } from "@/api/plannedVsDone";
import { invalidateZoneModels } from "@/api/zoneModels";
import { toast } from "sonner";

/**
 * Détail d'une séance de montre (onglet « Séance »). Même hook pour l'athlète
 * et son coach : la base décide de ce qui est visible (RLS).
 */
export function useActivityDetail(athleteId: string | undefined, activityId: string | undefined) {
  return useQuery({
    queryKey: activityDetailKeys.detail(athleteId ?? "none", activityId ?? "none"),
    enabled: !!athleteId && !!activityId,
    staleTime: 60_000,
    // Série seconde par seconde : lourde, on ne la garde pas en cache hors ligne longtemps.
    gcTime: 5 * 60_000,
    queryFn: () => getActivityDetail(activityId!),
  });
}

/** Enregistre la liste entière des tours (ou revient à ceux de la montre). */
export function useSaveLaps(athleteId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { version: number; laps: LapDraft[] } | { version: number; reset: "watch" }) =>
      "reset" in args ? resetLapsToWatch(activityId, args.version) : saveLaps(activityId, args.version, args.laps),
    onSuccess: () => {
      void invalidateActivityDetail(qc, athleteId);
      void invalidateZoneModels(qc, athleteId);
      void invalidatePlanLinks(qc, athleteId);
    },
    onError: (e) => {
      if (e instanceof LapsConflictError) {
        toast.error("Les tours ont été modifiés entre-temps (par ton coach ou ton athlète). Recharge pour voir leur version.");
        void invalidateActivityDetail(qc, athleteId);
      } else toast.error("Enregistrement des tours impossible");
    },
  });
}
