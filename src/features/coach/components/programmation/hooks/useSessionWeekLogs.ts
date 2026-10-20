import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import type { AthleteModifications } from "@/features/shared/types/athlete"
import { computeOccurrences } from "@/lib/sessionOccurrence"
import { localISO } from "@/lib/date"

export interface SessionWeekLog {
  id: string
  scheduledDate: string
  status: string
  rpeScore: number | null
  athleteModifications: AthleteModifications | null
  microcycleId: string | null
  weekNumber: number | null
  notes: string | null
}

export function useSessionWeekLogs(
  athleteId: string | undefined,
  sessionId: string,
) {
  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: ["session-week-logs", athleteId, sessionId],
    enabled: !!athleteId && !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select("id, scheduled_date, status, rpe_score, athlete_modifications, microcycle_id, notes")
        .eq("athlete_id", athleteId!)
        .eq("session_id", sessionId)
        .neq("status", "skipped")
        .order("scheduled_date", { ascending: false })
      return data ?? []
    },
  })

  // Occurrence = rang chronologique parmi les logs non « skipped » de la séance
  // (1re fois planifiée = 1, 2e = 2…), tous cycles confondus — même règle que
  // côté athlète (fetchSessionOccurrence).
  const occ = computeOccurrences(rawLogs.map(l => ({ ...l, session_id: sessionId })))
  const logsWithWeek = rawLogs.map(log => ({
    id:                   log.id,
    scheduledDate:        log.scheduled_date,
    status:               log.status,
    rpeScore:             log.rpe_score,
    athleteModifications: log.athlete_modifications as AthleteModifications | null,
    microcycleId:         log.microcycle_id,
    weekNumber:           occ.get(log.id) ?? null,
    notes:                log.notes,
  }))

  const logs: SessionWeekLog[] = logsWithWeek

  function getLogForWeek(weekNumber: number): SessionWeekLog | null {
    return logs.find(l => l.weekNumber === weekNumber) ?? null
  }

  function getStatusForWeek(weekNumber: number): "completed" | "missed" | "planned" | null {
    const log = getLogForWeek(weekNumber)
    if (!log) return null
    if (log.status === "completed") return "completed"
    if (log.status === "missed")    return "missed"
    // Planifiée mais date passée sans validation = manquée (comme le calendrier)
    if (log.scheduledDate < localISO(new Date())) return "missed"
    return "planned"
  }

  return { logs, getLogForWeek, getStatusForWeek, isLoading }
}
