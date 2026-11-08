import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { invalidateProgram, isProgramConflict, programKeys, saveProgram } from "@/api/program"
import type { ProgSession } from "../types"
import { syncDocAssignmentsFromProg } from "@/features/shared/hooks/fiches/syncDocAssignments"

/** Programme lu (cache avant la modification) de chaque enregistrement en cours. */
const bases = new WeakMap<ProgSession[], ProgSession[] | undefined>()

/**
 * Enregistre le programme voulu. Seules les séances changées par rapport au
 * cache partent (RPC `program_save_sessions`) : une séance modifiée ailleurs
 * entre-temps (co-coach, assistant) n'est pas écrasée, l'écran recharge.
 * Les enregistrements d'un même athlète passent l'un après l'autre.
 */
export function useUpdateProgrammation(athleteId: string | undefined) {
  const qc = useQueryClient()
  const key = programKeys.sessions(athleteId ?? "")
  return useMutation({
    mutationKey: key,
    scope: { id: `program:${athleteId ?? ""}` },
    mutationFn: (sessions: ProgSession[]) => saveProgram(athleteId!, bases.get(sessions), sessions),
    onMutate: async (sessions) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProgSession[]>(key)
      bases.set(sessions, prev)
      qc.setQueryData(key, sessions)
      return { prev }
    },
    onSuccess: (saved) => {
      // Attributions 'programme' des fiches rattachées (séances, blocs, variantes)
      if (athleteId) void syncDocAssignmentsFromProg(athleteId, saved, qc)
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(key, ctx?.prev)
      if (isProgramConflict(err)) {
        toast.error("Le programme a été modifié ailleurs (co-coach ou assistant) : il vient d'être rechargé, refais ta dernière modification.", { id: "program-conflict", duration: 8000 })
      } else {
        toast.error('Erreur de sauvegarde')
      }
    },
    onSettled: (_data, _err, sessions) => {
      bases.delete(sessions)
      // Pas de rechargement entre deux enregistrements en file : l'écran
      // reviendrait un instant à l'état d'avant.
      if (athleteId && qc.isMutating({ mutationKey: key }) <= 1) void invalidateProgram(qc, athleteId)
    },
  })
}
