import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteHyroxRacePlan, hyroxKeys, invalidateHyrox, listHyroxRacePlans, saveHyroxRacePlan, type HyroxRacePlanInput,
} from "@/api/hyrox";
import type { HyroxRacePlan } from "@/features/shared/types/hyrox";

/** Plans de course HYROX d'un athlète (coach et athlète, RLS `hrp_*`). */
export function useHyroxRacePlans(athleteId: string | undefined) {
  return useQuery<HyroxRacePlan[]>({
    queryKey: hyroxKeys.plans(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => listHyroxRacePlans(athleteId as string),
  });
}

export function useSaveHyroxRacePlan(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (plan: HyroxRacePlanInput & { id?: string }) => saveHyroxRacePlan(plan, user?.id ?? null),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Plan de course enregistré");
    },
    onError: () => toast.error("Plan de course non enregistré"),
  });
}

export function useDeleteHyroxRacePlan(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHyroxRacePlan(id),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Plan de course supprimé");
    },
    onError: () => toast.error("Plan de course non supprimé"),
  });
}
