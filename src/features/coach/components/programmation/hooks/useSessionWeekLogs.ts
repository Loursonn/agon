import { STALE_MS } from "@/lib/queryCache";
import { useQuery } from "@tanstack/react-query"
import { listWorkoutLogs, workoutKeys } from "@/api/workouts"
import { listInjuryFollowups, medicalKeys } from "@/api/injuries"
import { sessionPainBySession, sessionPainKey } from "@/lib/sessionPain"
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
  /** Douleur déclarée en fin de séance (blessure / suivi) : zone → note 1-10. */
  painLevels: Record<string, number>
  painNote: string | null
}

export function useSessionWeekLogs(
  athleteId: string | undefined,
  sessionId: string,
) {
  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: workoutKeys.session(athleteId ?? "", sessionId),
    enabled: !!athleteId && !!sessionId,
    staleTime: STALE_MS,
    queryFn: () =>
      listWorkoutLogs({ athleteIds: [athleteId!], sessionId, excludeStatuses: ["skipped"], ascending: false }),
  })

  // Douleurs de fin de séance : suivis de blessure liés à ces séances.
  const logIds = rawLogs.filter(l => l.status === "completed").map(l => l.id)
  const { data: followups = [] } = useQuery({
    queryKey: medicalKeys.followups(athleteId ?? "", `logs:${logIds.join(",")}`),
    enabled: !!athleteId && logIds.length > 0,
    staleTime: STALE_MS,
    queryFn: () => listInjuryFollowups(athleteId!, { workoutLogIds: logIds }),
  })
  const painBySession = sessionPainBySession(followups)

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
    painLevels:           painBySession.get(sessionPainKey.workout(log.id))?.levels ?? {},
    painNote:             painBySession.get(sessionPainKey.workout(log.id))?.note ?? null,
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
