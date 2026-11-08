import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { addProgramSessions, cloneProgSession, invalidateProgram } from "@/api/program"
import type { ProgSession } from "../types"
import {
  stripForeignPersonalFiches,
  syncDocAssignmentsFromProg,
} from "@/features/shared/hooks/fiches/syncDocAssignments"

/**
 * Copie une séance dans le programme d'un autre athlète (nouveaux ids), à la
 * fin, sans relire ni réécrire le reste de son programme.
 */
export function useDuplicateProgSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ session, targetAthleteId }: { session: ProgSession; targetAthleteId: string }) => {
      // Les fiches de banque suivent ; une fiche personnelle d'un autre athlète non
      const { session: clean, removed } = await stripForeignPersonalFiches(cloneProgSession(session), targetAthleteId)
      const next = await addProgramSessions(targetAthleteId, [clean])
      await syncDocAssignmentsFromProg(targetAthleteId, next, qc)
      return { removed }
    },
    onSuccess: ({ removed }, vars) => {
      void invalidateProgram(qc, vars.targetAthleteId)
      if (removed > 0) toast.info(`${removed} fiche(s) personnelle(s) non copiée(s)`)
    },
    onError: () => toast.error("Erreur lors de la duplication"),
  })
}
