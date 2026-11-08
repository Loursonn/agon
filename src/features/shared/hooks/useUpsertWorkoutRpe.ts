import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateWorkouts, isWorkoutNotFound, listWorkoutLogs } from "@/api/workouts";
import { classifyWriteError } from "@/lib/offline/writeQueue";
import { notifyQueued, submitWrite } from "@/lib/offline/writes";
import { applyOptimisticWorkout, findCachedWorkoutLogId } from "@/lib/optimisticWorkout";

/** Séance retirée par le coach (refus `P0002`). */
export const WORKOUT_GONE_MESSAGE = "Cette séance n'existe plus : ton coach l'a retirée.";
/** Hors ligne, séance jamais lue sur ce téléphone : pas d'id où ranger la saisie. */
export const RPE_UNKNOWN_OFFLINE_MESSAGE =
  "Pas de réseau : cette séance doit être ouverte une fois en ligne avant d'y noter un RPE.";

const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

class RpeError extends Error {}

/**
 * RPE d'une séance retrouvée par (athlète, séance-type, date).
 *
 * N'invente plus de séance : l'ancienne version créait une séance « Séance »
 * validée à la date du jour quand elle ne trouvait rien (séance fantôme dans
 * l'historique et les stats). Introuvable → erreur claire, rien n'est écrit.
 *
 * Hors ligne : la séance est cherchée dans le cache du téléphone, le RPE est
 * gardé en file (`workout.rpe`) et affiché tout de suite.
 */
export function useUpsertWorkoutRpe(athleteId: string, sessionId: string, scheduledDate?: string) {
  const queryClient = useQueryClient();

  const findLogId = async (): Promise<string | null> => {
    const fromCache = () => findCachedWorkoutLogId(queryClient, { athleteId, sessionId, scheduledDate });
    if (browserOffline()) return fromCache();
    // La validation vient parfois juste d'être écrite : on réessaie un peu.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
      try {
        const rows = await listWorkoutLogs({
          athleteIds: [athleteId],
          sessionId,
          ...(scheduledDate ? { from: scheduledDate, to: scheduledDate } : {}),
          ascending: false,
          limit: 1,
          withMods: false,
        });
        if (rows[0]?.id) return rows[0].id;
      } catch (e) {
        // Coupure réseau : le cache du téléphone, sinon rien.
        if (classifyWriteError(e, browserOffline()) === "network") return fromCache();
        throw e;
      }
    }
    // Pas encore en base : peut-être validée hors ligne (en file) sur ce téléphone.
    return fromCache();
  };

  return useMutation({
    mutationFn: async (rpeScore: number) => {
      const logId = await findLogId();
      if (!logId) {
        throw new RpeError(browserOffline() ? RPE_UNKNOWN_OFFLINE_MESSAGE : "séance introuvable, RPE non enregistré");
      }
      const res = await submitWrite("workout.rpe", { athleteId, logId, rpe: rpeScore });
      return { logId, rpeScore, queued: res.status === "queued" };
    },
    onSuccess: ({ logId, rpeScore, queued }) => {
      if (queued) {
        applyOptimisticWorkout(queryClient, { athleteId, logId }, { rpe: rpeScore });
        notifyQueued();
        return;
      }
      void invalidateWorkouts(queryClient, { athleteId, logId });
      toast.success("RPE enregistré ✓");
    },
    onError: (err: unknown) => {
      if (isWorkoutNotFound(err)) {
        void invalidateWorkouts(queryClient, { athleteId });
        toast.error(WORKOUT_GONE_MESSAGE);
        return;
      }
      if (err instanceof RpeError && err.message === RPE_UNKNOWN_OFFLINE_MESSAGE) {
        toast.error(err.message, { duration: 8000 });
        return;
      }
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Erreur RPE : ${msg}`);
    },
  });
}
