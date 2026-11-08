import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateWorkouts, listSessionLogsBetween, moveWorkoutToDayByAthlete, planWorkout } from "@/api/workouts";
import { mondayOfISO, planUnplannedStart, type WeekLogLite } from "@/lib/planningProjection";

export interface StartUnplannedInput {
  athleteId: string;
  coachId: string | null;
  sessionId: string;
  sessionName: string;
  /** Date choisie par l'athlète (YYYY-MM-DD) — today par défaut */
  scheduledDate: string;
  weekMondayISO: string;
}

export interface StartUnplannedResult {
  id: string;
  session_name: string;
  action: "open" | "move" | "insert";
}

/**
 * L'athlète démarre une séance aujourd'hui :
 *  - si elle était prévue un autre jour de la semaine (pas encore faite), on
 *    DÉPLACE ce workout_log (rescheduled_by_athlete = true ; original_scheduled_date
 *    reste la date du coach) au lieu de créer un doublon ;
 *  - si un log existe déjà aujourd'hui, on le réutilise ;
 *  - sinon (séance vraiment hors programme) on insère un nouveau log.
 */
export function useStartUnplannedSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      athleteId, coachId, sessionId, sessionName, scheduledDate,
    }: StartUnplannedInput): Promise<StartUnplannedResult> => {
      const monday = mondayOfISO(scheduledDate);
      const sunday = (() => {
        const d = new Date(monday + "T12:00:00");
        d.setDate(d.getDate() + 6);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();

      const weekLogs = await listSessionLogsBetween({ athleteId, sessionId, from: monday, to: sunday });

      const plan = planUnplannedStart(weekLogs as WeekLogLite[], sessionId, scheduledDate);

      if (plan.action === "open") {
        return { id: plan.logId, session_name: sessionName, action: "open" };
      }

      if (plan.action === "move") {
        const moved = await moveWorkoutToDayByAthlete(plan.logId, scheduledDate);
        return { id: moved.id, session_name: moved.session_name, action: "move" };
      }

      const created = await planWorkout({
        athleteId, coachId, sessionId, sessionName, date: scheduledDate, byAthlete: true,
      });
      return { id: created.id, session_name: created.session_name, action: "insert" };
    },

    onSuccess: (data, { athleteId }) => {
      void invalidateWorkouts(qc, { athleteId, logId: data.id });
      if (data.action === "move") toast.success(`Séance déplacée à aujourd'hui : ${data.session_name}`);
      else if (data.action === "insert") toast.success(`Séance ajoutée : ${data.session_name}`);
    },

    onError: () => {
      // Hors ligne, la séance ne peut pas être créée (pas encore d'id en base).
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast.error("Pas de réseau : cette séance doit être ouverte une fois en ligne avant d'être validée.");
        return;
      }
      toast.error("Impossible de démarrer cette séance");
    },
  });
}
