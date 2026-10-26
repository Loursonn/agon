import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";

/** Nombre de jours entre deux dates ISO (positif si b > a). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86_400_000
  );
}

/** Lundi de la semaine contenant une date ISO. */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface RescheduleInput {
  workoutLogId: string;
  athleteId: string;
  /** Date effective actuelle (pour calcul côté client) */
  currentDate: string;
  /** Nouvelle date choisie par l'athlète */
  newDate: string;
  reason?: string;
  /** mondayISO de la semaine affichée — pour invalidation ciblée */
  weekMondayISO: string;
}

export function useRescheduleWorkout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ workoutLogId, currentDate, newDate, reason }: RescheduleInput) => {
      const currentMonday = mondayOf(currentDate);
      const newMonday     = mondayOf(newDate);
      const daysAhead     = daysBetween(currentDate, newDate);

      // Interdit : au-delà de la semaine suivante (> 14 jours à l'avance ou > 1 semaine de décalage)
      if (daysAhead > 14 || daysAhead < -7) {
        throw new Error("FORBIDDEN_RANGE");
      }

      const coachAlert = newMonday !== currentMonday;

      // Try full update (requires migration 20260507000000_athlete_flexibility).
      // If columns don't exist yet, PostgREST returns error.code "42703" (undefined_column).
      // Fall back to date-only update so reschedule still works pre-migration.
      const fullUpdate = await supabase
        .from("workout_logs")
        .update({
          scheduled_date:         newDate,
          rescheduled_by_athlete: true,
          reschedule_reason:      reason ?? null,
          coach_alert:            coachAlert,
        } as Record<string, unknown>)
        .eq("id", workoutLogId)
        .select("id, scheduled_date")
        .single();

      if (fullUpdate.error) {
        // Unknown column → migration not yet applied, retry with date only
        const fallback = await supabase
          .from("workout_logs")
          .update({ scheduled_date: newDate })
          .eq("id", workoutLogId)
          .select("id, scheduled_date")
          .single();
        if (fallback.error) throw fallback.error;
        return { data: fallback.data, coachAlert };
      }

      return { data: fullUpdate.data, coachAlert };
    },

    onMutate: async ({ athleteId, weekMondayISO, newDate, workoutLogId }) => {
      const key = QK.workoutLogsWeek(athleteId, weekMondayISO);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      // Optimistic: update scheduled_date dans le cache
      qc.setQueryData(key, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((wl: { id: string; scheduled_date: string }) =>
          wl.id === workoutLogId ? { ...wl, scheduled_date: newDate } : wl
        );
      });
      return { previous, key };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(ctx.key, ctx.previous);
      }
      toast.error("Impossible de déplacer la séance");
    },

    onSuccess: ({ coachAlert }, { athleteId, weekMondayISO }) => {
      qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
      qc.invalidateQueries({ queryKey: QK.workoutLogsWeek(athleteId, weekMondayISO) });
      // Planning coach + Retours : le déplacement doit y apparaître tout de suite
      qc.invalidateQueries({ queryKey: QK.cal(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteModifications(athleteId) });
      if (coachAlert) {
        toast.warning("Séance déplacée — ton coach sera notifié", { duration: 4000 });
      } else {
        toast.success("Séance déplacée");
      }
    },
  });
}
