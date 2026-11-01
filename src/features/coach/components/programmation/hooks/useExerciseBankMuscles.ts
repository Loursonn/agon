import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { QK } from "@/lib/queryKeys"
import type { BankMuscles } from "@/lib/muscleVolume"

/**
 * Muscles (principaux + secondaires) des exercices de la banque, par id.
 * Un seul appel pour toute la banque : la table reste petite et la clé est
 * partagée par tous les écrans qui comptent des séries par muscle.
 */
export function useExerciseBankMuscles() {
  return useQuery<Map<string, BankMuscles>>({
    queryKey: QK.exerciseBankMuscles,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, target, target_2, secondary")
      if (error) throw error
      const map = new Map<string, BankMuscles>()
      for (const e of data ?? []) {
        map.set(e.id, {
          primary: [e.target, e.target_2].filter((m): m is string => !!m),
          secondary: e.secondary ?? [],
        })
      }
      return map
    },
  })
}
