import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteSeasonGoal, hyroxObjectiveKeys, invalidateHyroxObjective, listSeasonGoals, saveSeasonGoal,
  type HyroxSeasonGoal, type HyroxSeasonGoalInput,
} from "@/api/hyroxObjective";

/** Objectifs de saison HYROX d'un athlète (coach et athlète, RLS `hsg_*`). */
export function useHyroxSeasonGoals(athleteId: string | undefined) {
  return useQuery<HyroxSeasonGoal[]>({
    queryKey: hyroxObjectiveKeys.seasonGoals(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => listSeasonGoals(athleteId as string),
  });
}

export function useSaveSeasonGoal(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (goal: HyroxSeasonGoalInput) => saveSeasonGoal(goal, user?.id ?? null),
    onSuccess: () => {
      void invalidateHyroxObjective(qc, athleteId);
      toast.success("Objectif de saison enregistré");
    },
    onError: () => toast.error("Objectif de saison non enregistré"),
  });
}

export function useDeleteSeasonGoal(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSeasonGoal(id),
    onSuccess: () => {
      void invalidateHyroxObjective(qc, athleteId);
      toast.success("Objectif de saison supprimé");
    },
    onError: () => toast.error("Objectif de saison non supprimé"),
  });
}
