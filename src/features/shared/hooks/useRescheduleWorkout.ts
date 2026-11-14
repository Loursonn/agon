import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QK } from "@/lib/queryKeys";
import { invalidateWorkouts, rescheduleWorkoutByAthlete } from "@/api/workouts";
import { localIsoDay } from "@shared/domain/dates";

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

      // Interdit : au-delà de la semaine suivante (> 14 jours après aujourd'hui)
      // ou plus d'une semaine en arrière. Une séance manquée ancienne peut
      // revenir à aujourd'hui ou plus tard.
      const fromToday = daysBetween(localIsoDay(), newDate);
      if (fromToday > 14 || daysAhead < -7) {
        throw new Error("FORBIDDEN_RANGE");
      }

      const coachAlert = newMonday !== currentMonday;

      // `reason` n'a pas de colonne en base : elle n'est pas stockée. (L'ancienne
      // version l'écrivait dans `reschedule_reason`, inexistante : la requête
      // échouait et le repli n'écrivait que la date — le coach ne voyait ni le
      // déplacement ni l'alerte.)
      void reason;
      const data = await rescheduleWorkoutByAthlete({ logId: workoutLogId, newDate, coachAlert });
      return { data, coachAlert };
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

    onSuccess: ({ coachAlert }, { athleteId, workoutLogId }) => {
      // Planning coach + Retours : le déplacement doit y apparaître tout de suite
      void invalidateWorkouts(qc, { athleteId, logId: workoutLogId });
      if (coachAlert) {
        toast.warning("Séance déplacée — ton coach sera notifié", { duration: 4000 });
      } else {
        toast.success("Séance déplacée");
      }
    },
  });
}
