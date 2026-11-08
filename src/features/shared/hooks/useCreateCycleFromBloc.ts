import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BlockConfig, Session } from "@/features/shared/types/athlete";
import { localISO } from "@/lib/date";
import { createCycle, invalidateCycles } from "@/api/cycles";

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Returns the Monday of the week containing `dateStr`. */
function toMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface Params {
  blockConfig: BlockConfig;
  sessions:    Session[];
  athleteId:   string;
  coachId:     string;
}

/**
 * Crée un cycle autonome (sans mésocycle) depuis le bloc : une semaine par
 * semaine du bloc, une séance prévue par séance × semaine (`create_cycle`,
 * atomique). Une séance déjà réalisée ce jour-là n'est pas repassée en
 * « prévue ».
 */
export function useCreateCycleFromBloc() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ blockConfig, sessions, athleteId }: Params) => {
      if (!blockConfig.startDate) throw new Error("Le bloc n'a pas de date de début.");

      const scheduledSessions = sessions.filter((s) => s.day_of_week != null);
      if (scheduledSessions.length === 0)
        throw new Error("Aucune séance n'a de jour assigné. Double-clique sur chaque séance pour définir son jour.");

      const tw      = blockConfig.totalWeeks || 6;
      const monday  = toMonday(blockConfig.startDate);
      const endDate = addDays(monday, tw * 7 - 1);

      const { cycle } = await createCycle({
        athleteId,
        name:       blockConfig.blockName || "Cycle",
        start:      localISO(monday),
        end:        localISO(endDate),
        deloadWeek: blockConfig.deloadWeek || null,
        // day_of_week : 0 = lundi … 6 = dimanche
        sessions: scheduledSessions.map((s) => ({
          sessionId:   s.id,
          sessionName: s.name || s.short || "Séance",
          dayOfWeek:   s.day_of_week!,
        })),
      });
      return cycle;
    },

    onSuccess: (_cycle, vars) => {
      toast.success("Cycle créé depuis le bloc !");
      void invalidateCycles(qc, vars.athleteId);
    },

    onError: (err: Error) => {
      toast.error("Erreur création cycle : " + err.message);
    },
  });
}
