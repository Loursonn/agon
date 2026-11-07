/**
 * useCoachSessionOverride — pose / retire l'adaptation du coach pour UNE
 * occurrence d'une séance (workout_logs.athlete_modifications.coachOverride).
 *
 * L'adaptation l'emporte sur la séance-type pour ce seul jour (voir
 * useWorkoutSession). `null` la retire.
 *
 * Écriture atomique côté serveur (RPC `set_coach_override`) : la saisie de
 * l'athlète (séries, commentaires…) n'est jamais relue puis réécrite, donc
 * plus perdue si l'athlète enregistre au même moment.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateWorkouts, setCoachOverride } from "@/api/workouts";
import type { Bloc } from "@/features/coach/components/programmation/types";
import type { FicheAttachment } from "../types/fiches";
import { syncDocAssignmentsFromProg } from "./fiches/syncDocAssignments";

interface OverridePayload {
  workoutLogId: string;
  athleteId: string;
  /** Flattened single-week blocs, or `null` to clear the override. */
  override: { blocs: Bloc[]; note?: string; fiches?: FicheAttachment[] } | null;
}

export function useCoachSessionOverride() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ workoutLogId, override }: OverridePayload) => {
      await setCoachOverride(
        workoutLogId,
        override === null
          ? null
          : {
              blocs: override.blocs,
              ...(override.note !== undefined ? { note: override.note } : {}),
              ...(override.fiches?.length ? { fiches: override.fiches } : {}),
            },
      );
    },
    onSuccess: (_data, vars) => {
      void invalidateWorkouts(qc, { athleteId: vars.athleteId, logId: vars.workoutLogId });
      // Attributions 'programme' : inclut les fiches des overrides d'occurrence
      void syncDocAssignmentsFromProg(vars.athleteId, undefined, qc);
      toast.success(vars.override === null ? "Adaptation retirée" : "Séance adaptée pour ce jour");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}
