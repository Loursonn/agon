import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  invalidateWorkouts, listSessionLogsBetween, moveWorkoutToDayByAthlete, planWorkout, type WorkoutLog,
} from "@/api/workouts";
import { classifyWriteError } from "@/lib/offline/writeQueue";
import { QUEUED_TOAST, submitWrite } from "@/lib/offline/writes";
import { findCachedWeekLogs, seedPlannedWorkout } from "@/lib/optimisticWorkout";
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
  /** Séance créée sur le téléphone, envoyée au retour du réseau. */
  queued?: boolean;
}

const OFFLINE_MOVE = "OFFLINE_MOVE";
const CANCELLED = "CANCELLED_BY_COACH";
const cancelledByCoach = () => Object.assign(new Error("séance annulée par le coach"), { code: CANCELLED });
const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * L'athlète démarre une séance aujourd'hui :
 *  - si elle était prévue un autre jour de la semaine (pas encore faite), on
 *    DÉPLACE ce workout_log (rescheduled_by_athlete = true ; original_scheduled_date
 *    reste la date du coach) au lieu de créer un doublon ;
 *  - si un log existe déjà aujourd'hui, on le réutilise ;
 *  - sinon (séance vraiment hors programme) on insère un nouveau log.
 *
 * Sans réseau : la semaine est lue dans le cache ; la séance est créée avec un
 * id choisi sur le téléphone et mise en file (`workout.plan`) AVANT les
 * saisies qui suivront, et l'écran de séance s'ouvre sur elle (cache
 * optimiste). Le déplacement d'une séance d'un autre jour reste à faire en
 * ligne (il change la séance du coach, pas de rejeu à l'aveugle).
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

      let offline = false;
      let weekLogs: WeekLogLite[];
      try {
        weekLogs = await listSessionLogsBetween({ athleteId, sessionId, from: monday, to: sunday });
      } catch (e) {
        if (classifyWriteError(e, browserOffline()) !== "network") throw e;
        offline = true;
        weekLogs = findCachedWeekLogs(qc, { athleteId, sessionId, from: monday, to: sunday });
      }

      const plan = planUnplannedStart(weekLogs, sessionId, scheduledDate);

      if (plan.action === "open") {
        return { id: plan.logId, session_name: sessionName, action: "open" };
      }

      if (plan.action === "move") {
        if (offline) throw Object.assign(new Error("déplacement hors ligne"), { code: OFFLINE_MOVE });
        const moved = await moveWorkoutToDayByAthlete(plan.logId, scheduledDate);
        return { id: moved.id, session_name: moved.session_name, action: "move" };
      }

      // Hors ligne, place déjà connue (séance annulée ce jour-là) : en ligne,
      // la création renverrait cette séance-là ; on l'ouvre directement.
      if (offline) {
        const taken = weekLogs.find((l) => l.session_id === sessionId && l.scheduled_date === scheduledDate);
        if (taken?.status === "skipped") throw cancelledByCoach();
        if (taken) return { id: taken.id, session_name: sessionName, action: "open" };
      }

      // Id choisi ici : la création est rejouable (file hors ligne) sans doublon.
      const logId = crypto.randomUUID();
      const planArgs = { athleteId, logId, coachId, sessionId, sessionName, date: scheduledDate };
      if (!offline) {
        // En ligne : création immédiate, sans attendre d'éventuelles saisies en
        // file (elle n'en dépend pas). Coupure pendant l'appel : file.
        try {
          const created = await planWorkout({ ...planArgs, id: logId, byAthlete: true });
          // La place était prise par une séance annulée par le coach : refus, comme avant.
          if (created.status === "skipped") throw cancelledByCoach();
          return { id: created.id, session_name: created.session_name || sessionName, action: "insert" };
        } catch (e) {
          if ((e as { code?: string } | null)?.code === CANCELLED || classifyWriteError(e, browserOffline()) !== "network") throw e;
        }
      }
      const res = await submitWrite("workout.plan", planArgs);
      if (res.status === "sent") {
        const created = res.result as WorkoutLog;
        if (created.status === "skipped") throw cancelledByCoach();
        return { id: created.id, session_name: created.session_name || sessionName, action: "insert" };
      }
      seedPlannedWorkout(qc, {
        id: logId, athlete_id: athleteId, coach_id: coachId, session_id: sessionId,
        session_name: sessionName, scheduled_date: scheduledDate,
      });
      return { id: logId, session_name: sessionName, action: "insert", queued: true };
    },

    onSuccess: (data, { athleteId }) => {
      if (data.queued) {
        // Pas d'invalidation : hors ligne elle effacerait la séance du cache ;
        // la file rafraîchit tout une fois vidée.
        toast.info(QUEUED_TOAST, { id: "write-queued" });
        return;
      }
      void invalidateWorkouts(qc, { athleteId, logId: data.id });
      if (data.action === "move") toast.success(`Séance déplacée à aujourd'hui : ${data.session_name}`);
      else if (data.action === "insert") toast.success(`Séance ajoutée : ${data.session_name}`);
    },

    onError: (err: unknown) => {
      if ((err as { code?: string } | null)?.code === CANCELLED) {
        toast.error("Ton coach a annulé cette séance aujourd'hui : elle ne peut pas être démarrée.");
        return;
      }
      if ((err as { code?: string } | null)?.code === OFFLINE_MOVE) {
        toast.error("Pas de réseau : cette séance est prévue un autre jour de la semaine. Elle pourra être ramenée à aujourd'hui une fois en ligne.");
        return;
      }
      toast.error("Impossible de démarrer cette séance");
    },
  });
}
