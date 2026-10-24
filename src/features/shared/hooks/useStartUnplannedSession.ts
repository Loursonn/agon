import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
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

      const { data: weekLogs, error: readErr } = await supabase
        .from("workout_logs")
        .select("id, session_id, scheduled_date, status")
        .eq("athlete_id", athleteId)
        .eq("session_id", sessionId)
        .gte("scheduled_date", monday)
        .lte("scheduled_date", sunday);
      if (readErr) throw readErr;

      const plan = planUnplannedStart((weekLogs ?? []) as WeekLogLite[], sessionId, scheduledDate);

      if (plan.action === "open") {
        return { id: plan.logId, session_name: sessionName, action: "open" };
      }

      if (plan.action === "move") {
        const { data, error } = await supabase
          .from("workout_logs")
          .update({
            scheduled_date:         scheduledDate,
            rescheduled_by_athlete: true,
          })
          .eq("id", plan.logId)
          .select("id, session_name")
          .single();
        if (error) throw error;
        return { id: data.id, session_name: data.session_name, action: "move" };
      }

      const { data, error } = await supabase
        .from("workout_logs")
        .insert({
          athlete_id:              athleteId,
          coach_id:                coachId,
          session_id:              sessionId,
          session_name:            sessionName,
          scheduled_date:          scheduledDate,
          original_scheduled_date: scheduledDate,
          status:                  "planned",
          rescheduled_by_athlete:  true,
          coach_alert:             false,
        })
        .select("id, session_name")
        .single();

      if (error) throw error;
      return { id: data.id, session_name: data.session_name, action: "insert" };
    },

    onSuccess: (data, { athleteId, weekMondayISO }) => {
      qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
      qc.invalidateQueries({ queryKey: QK.workoutLogsWeek(athleteId, weekMondayISO) });
      qc.invalidateQueries({ queryKey: QK.cal(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteModifications(athleteId) });
      if (data.action === "move") toast.success(`Séance déplacée à aujourd'hui : ${data.session_name}`);
      else if (data.action === "insert") toast.success(`Séance ajoutée : ${data.session_name}`);
    },

    onError: () => {
      toast.error("Impossible de démarrer cette séance");
    },
  });
}
