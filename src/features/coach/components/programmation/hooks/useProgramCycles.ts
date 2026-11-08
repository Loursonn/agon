import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  listAthleteCycles,
  listCycleWeeks,
  programCycleKeys,
  rescheduleSessionDay,
  type CycleLite,
  type CycleWeek,
} from "@/api/program"
import { invalidateWorkouts } from "@/api/workouts"

/** Tous les cycles de l'athlète (passés, en cours, futurs), triés par date. */
export function useAthleteCycles(athleteId: string | undefined) {
  return useQuery<CycleLite[]>({
    queryKey: programCycleKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => listAthleteCycles(athleteId!),
  })
}

/** Semaines d'un cycle, dans l'ordre. */
export function useCycleWeeks(cycleId: string | undefined) {
  return useQuery<CycleWeek[]>({
    queryKey: programCycleKeys.weeks(cycleId ?? ""),
    enabled: !!cycleId,
    staleTime: 30_000,
    queryFn: () => listCycleWeeks(cycleId!),
  })
}

/**
 * Nouveau jour d'une séance : ses occurrences à venir suivent (sauf celles
 * déplacées par l'athlète ou déjà faites). `null` : aucune occurrence à venir.
 */
export function useRescheduleSessionDay(athleteId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { sessionId: string; newDay: number }) => rescheduleSessionDay({ athleteId: athleteId!, ...p }),
    onSuccess: (res) => {
      if (res && athleteId) void invalidateWorkouts(qc, { athleteId })
    },
  })
}
