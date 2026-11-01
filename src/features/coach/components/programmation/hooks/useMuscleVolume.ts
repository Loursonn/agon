import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { QK } from "@/lib/queryKeys"
import { computeWeeklyMuscleVolume, weekStartsBetween, type PlannedLog, type WeekVolume } from "@/lib/muscleVolume"
import { useProgrammation } from "./useProgrammation"
import { useExerciseBankMuscles } from "./useExerciseBankMuscles"

export interface MuscleVolumeData {
  /** Lundis des semaines affichées, dans l'ordre */
  weeks: string[]
  byWeek: Record<string, WeekVolume>
  isLoading: boolean
}

/**
 * Séries par muscle et par semaine d'un athlète sur [startISO, endISO] :
 * séances planifiées (workout_logs) × exercices de son programme × muscles
 * de la banque (ou surcharge du programme).
 */
export function useMuscleVolume(athleteId: string | undefined, startISO: string | undefined, endISO: string | undefined): MuscleVolumeData {
  const { data: sessions = [], isLoading: l1 } = useProgrammation(athleteId)
  const { data: bank, isLoading: l2 } = useExerciseBankMuscles()

  // Toutes les occurrences : le rang d'une séance se compte depuis sa 1re planification,
  // pas depuis le début de la plage affichée.
  const { data: logs = [], isLoading: l3 } = useQuery<PlannedLog[]>({
    queryKey: QK.muscleVolumeLogs(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, session_id, scheduled_date, status")
        .eq("athlete_id", athleteId!)
        .neq("status", "skipped")
      if (error) throw error
      return data ?? []
    },
  })

  const weeks = useMemo(
    () => (startISO && endISO ? weekStartsBetween(startISO, endISO) : []),
    [startISO, endISO],
  )

  const byWeek = useMemo(
    () => computeWeeklyMuscleVolume({ sessions, logs, bank: bank ?? new Map(), weekStarts: weeks }),
    [sessions, logs, bank, weeks],
  )

  return { weeks, byWeek, isLoading: l1 || l2 || l3 }
}
