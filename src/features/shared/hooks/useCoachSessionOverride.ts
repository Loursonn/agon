/**
 * useCoachSessionOverride — writes/clears a coach per-day adaptation of a
 * session onto a single workout_log (workout_logs.athlete_modifications.coachOverride).
 *
 * The override wins over the shared session template for that one occurrence
 * only (see useWorkoutSession). Passing `null` clears it.
 *
 * Reads the current athlete_modifications first and merges, so the athlete's
 * own fields (logged sets, bonus sets, comments…) are preserved.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { calBaseKey } from "./useUnifiedCalendar";
import type { AthleteModifications } from "../types/athlete";
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
      const { data: current, error: readErr } = await supabase
        .from("workout_logs")
        .select("athlete_modifications")
        .eq("id", workoutLogId)
        .maybeSingle();
      if (readErr) throw readErr;

      const mods: AthleteModifications =
        (current?.athlete_modifications as AthleteModifications | null) ?? {};

      let next: AthleteModifications;
      if (override === null) {
        // Remove coachOverride, keep everything else
        const { coachOverride: _drop, ...rest } = mods;
        void _drop;
        next = rest;
      } else {
        next = {
          ...mods,
          coachOverride: {
            blocs: override.blocs,
            note: override.note,
            ...(override.fiches?.length ? { fiches: override.fiches } : {}),
            createdAt: new Date().toISOString(),
          },
        };
      }

      const { error } = await supabase
        .from("workout_logs")
        .update({ athlete_modifications: next as unknown as import("@/integrations/supabase/types").Json })
        .eq("id", workoutLogId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workout-log-detail", vars.workoutLogId] });
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteModifications(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", vars.athleteId] });
      // Attributions 'programme' : inclut les fiches des overrides d'occurrence
      void syncDocAssignmentsFromProg(vars.athleteId, undefined, qc);
      toast.success(vars.override === null ? "Adaptation retirée" : "Séance adaptée pour ce jour");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}
