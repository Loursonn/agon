/**
 * Données de l'onglet Programme du pro : événements du planning sur une
 * période, contenu des séances (asp:prog), rang d'occurrence de chaque séance
 * (pour les paramètres semaine par semaine) et fiches posées sur les jours.
 * Tout passe par la RLS staff : un domaine fermé renvoie simplement du vide.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedCalendar } from "@/features/shared/hooks/useUnifiedCalendar";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { groupScheduleByDate, useDocSchedule } from "@/features/shared/hooks/fiches/useDocSchedule";
import { computeOccurrences } from "@/lib/sessionOccurrence";
import type { ProgSession } from "@/features/coach/components/programmation/types";

/** Rang (1-based) de chaque workout_log dans sa séance, tous cycles confondus. */
function useOccurrences(athleteId: string) {
  return useQuery({
    queryKey: ["staff", "occurrences", athleteId],
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, session_id, scheduled_date, status")
        .eq("athlete_id", athleteId)
        .neq("status", "skipped")
        .limit(2000);
      if (error) throw error;
      return computeOccurrences(data ?? []);
    },
  });
}

export function useStaffProgram(athleteId: string, range: { start: string; end: string }) {
  const events = useUnifiedCalendar(athleteId, range);
  const prog = useProgrammation(athleteId);
  const occ = useOccurrences(athleteId);
  const schedule = useDocSchedule(athleteId, range);

  const sessionsById = useMemo(() => {
    const m = new Map<string, ProgSession>();
    for (const s of prog.data ?? []) m.set(s.id, s);
    return m;
  }, [prog.data]);

  const eventRows = events.data;
  const eventsByDate = useMemo(() => {
    const m = new Map<string, NonNullable<typeof eventRows>>();
    for (const e of eventRows ?? []) {
      // Séances sautées : masquées, comme dans le planning du coach.
      if (e.status === "skipped") continue;
      if (e.type === "life_event" && e.dateEnd) {
        // Événement sur plusieurs jours : affiché seulement au premier jour visible.
        const d = e.date < range.start ? range.start : e.date;
        m.set(d, [...(m.get(d) ?? []), e]);
        continue;
      }
      m.set(e.date, [...(m.get(e.date) ?? []), e]);
    }
    return m;
  }, [eventRows, range.start]);

  const scheduleByDate = useMemo(() => groupScheduleByDate(schedule.data ?? []), [schedule.data]);

  return {
    isLoading: events.isLoading || prog.isLoading,
    eventsByDate,
    sessionsById,
    occurrences: occ.data ?? new Map<string, number>(),
    scheduleByDate,
  };
}
