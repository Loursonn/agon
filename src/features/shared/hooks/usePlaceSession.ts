import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { placeSession, syncRecurringSession } from "@/api/planning";
import { invalidateWorkouts } from "@/api/workouts";

export function usePlaceSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      session: ProgSession;
      athleteId: string;
      coachId: string;
      date: string;
      cycleId?: string;
      weekNumber?: number;
    }) => placeSession(vars),
    onSuccess: (_, vars) => {
      void invalidateWorkouts(qc, { athleteId: vars.athleteId });
      toast.success("Séance placée dans le planning ✓");
    },
    onError: () => toast.error("Erreur lors du placement"),
  });
}

/**
 * Création / modification d'une séance hebdomadaire dans la programmation :
 * ses séances deviennent concrètes sur tout le cycle (plus de « prévu »
 * projeté), et suivent un changement de jour.
 */
export function useSyncRecurringSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: Parameters<typeof syncRecurringSession>[0]) => syncRecurringSession(vars),
    onSuccess: (res, vars) => {
      void invalidateWorkouts(qc, { athleteId: vars.athleteId });
      const parts: string[] = [];
      if (res.created > 0) parts.push(`${res.created} séance${res.created > 1 ? "s" : ""} ajoutée${res.created > 1 ? "s" : ""} au planning`);
      if (res.moved > 0) parts.push(`${res.moved} déplacée${res.moved > 1 ? "s" : ""}`);
      if (res.keptByAthlete > 0) parts.push(`${res.keptByAthlete} déplacée${res.keptByAthlete > 1 ? "s" : ""} par l'athlète conservée${res.keptByAthlete > 1 ? "s" : ""}`);
      if (res.failed > 0) toast.error(`${res.failed} séance${res.failed > 1 ? "s" : ""} non déplacée${res.failed > 1 ? "s" : ""} (conflit de date)`);
      else if (parts.length) toast.success(`Planning mis à jour : ${parts.join(" · ")}`);
    },
    onError: () => toast.error("Planning non mis à jour : utilise « Placer dans le planning »"),
  });
}
