import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { invalidateProgram, isProgramConflict, programKeys, saveProgram } from "@/api/program"
import type { ProgSession } from "../types"
import { syncDocAssignmentsFromProg } from "@/features/shared/hooks/fiches/syncDocAssignments"

/** Programme de référence (version serveur dont part la modification) de chaque enregistrement en cours. */
const bases = new WeakMap<ProgSession[], ProgSession[] | undefined>()

/**
 * Ce qu'on enregistre : le programme voulu, et de préférence la version
 * serveur dont l'écran est parti (`base`). Sans `base`, le cache sert de
 * référence — à éviter quand l'écran garde un état local pendant une saisie :
 * le cache a pu être rechargé entre-temps avec les changements d'un autre.
 */
export type ProgramSave = ProgSession[] | { base: ProgSession[]; next: ProgSession[] }

const nextOf = (v: ProgramSave) => (Array.isArray(v) ? v : v.next)

/**
 * Enregistre le programme voulu. Seules les séances changées par rapport à la
 * référence partent (RPC `program_save_sessions`) : une séance modifiée
 * ailleurs entre-temps (co-coach, assistant) n'est pas écrasée, et une séance
 * ajoutée ailleurs n'est pas supprimée. Les enregistrements d'un même athlète
 * passent l'un après l'autre.
 */
export function useUpdateProgrammation(athleteId: string | undefined) {
  const qc = useQueryClient()
  const key = programKeys.sessions(athleteId ?? "")
  return useMutation({
    mutationKey: key,
    scope: { id: `program:${athleteId ?? ""}` },
    mutationFn: (v: ProgramSave) => saveProgram(athleteId!, bases.get(nextOf(v)), nextOf(v)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProgSession[]>(key)
      const next = nextOf(v)
      bases.set(next, Array.isArray(v) ? prev : v.base)
      qc.setQueryData(key, next)
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
    onSettled: (_data, _err, v) => {
      bases.delete(nextOf(v))
      // Pas de rechargement entre deux enregistrements en file : l'écran
      // reviendrait un instant à l'état d'avant.
      if (athleteId && qc.isMutating({ mutationKey: key }) <= 1) void invalidateProgram(qc, athleteId)
    },
  })
}
