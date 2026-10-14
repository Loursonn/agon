import { useCallback } from "react";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { toast } from "sonner";

/**
 * Mutation: mark a session as completed for the current block week.
 * Wraps context.completeSession with toast feedback.
 */
export function useCompleteWorkout() {
  const { completeSession, currentWeek } = useAthleteContext();

  const mutate = useCallback(
    (sessionId: string) => {
      try {
        completeSession(sessionId, currentWeek);
        if (navigator.vibrate) navigator.vibrate(10);
        toast.success("Séance terminée ! ");
      } catch {
        toast.error("Erreur lors de la complétion");
      }
    },
    [completeSession, currentWeek],
  );

  return { mutate };
}
