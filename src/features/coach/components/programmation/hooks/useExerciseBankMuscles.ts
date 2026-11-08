import { useQuery } from "@tanstack/react-query"
import { exerciseKeys, getExerciseBankMuscles } from "@/api/exercises"
import type { BankMuscles } from "@/lib/muscleVolume"

/**
 * Muscles (principaux + secondaires) des exercices de la banque, par id.
 * Un seul appel pour toute la banque : la table reste petite et la clé est
 * partagée par tous les écrans qui comptent des séries par muscle.
 */
export function useExerciseBankMuscles() {
  return useQuery<Map<string, BankMuscles>>({
    queryKey: exerciseKeys.muscles,
    staleTime: 5 * 60_000,
    queryFn: getExerciseBankMuscles,
  })
}
