import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateWorkouts, listWorkoutLogs, setWorkoutRpe } from "@/api/workouts";

/**
 * RPE d'une séance retrouvée par (athlète, séance-type, date).
 *
 * N'invente plus de séance : l'ancienne version créait une séance « Séance »
 * validée à la date du jour quand elle ne trouvait rien (séance fantôme dans
 * l'historique et les stats). Introuvable → erreur claire, rien n'est écrit.
 */
export function useUpsertWorkoutRpe(athleteId: string, sessionId: string, scheduledDate?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rpeScore: number) => {
      // La validation vient parfois juste d'être écrite : on réessaie un peu.
      let logId: string | null = null;
      for (let attempt = 0; attempt < 3 && !logId; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
        const rows = await listWorkoutLogs({
          athleteIds: [athleteId],
          sessionId,
          ...(scheduledDate ? { from: scheduledDate, to: scheduledDate } : {}),
          ascending: false,
          limit: 1,
          withMods: false,
        });
        logId = rows[0]?.id ?? null;
      }
      if (!logId) throw new Error("séance introuvable, RPE non enregistré");
      await setWorkoutRpe(logId, rpeScore);
      return logId;
    },
    onSuccess: (logId) => {
      void invalidateWorkouts(queryClient, { athleteId, logId });
      toast.success("RPE enregistré ✓");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Erreur RPE : ${msg}`);
    },
  });
}
