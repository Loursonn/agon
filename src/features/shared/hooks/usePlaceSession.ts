import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { placeSession } from "@/api/planning";
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
