import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSessionBank, programKeys, saveSessionBank } from "@/api/program"
import type { ProgSession } from "../types"

// Banque de séances musculaires, scoped coach (clé app_data sur l'id du coach)
export function useSessionBank(coachId: string | undefined) {
  return useQuery<ProgSession[]>({
    queryKey: programKeys.sessionBank(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 30_000,
    queryFn: () => getSessionBank(coachId!),
  })
}

export function useUpdateSessionBank(coachId: string | undefined) {
  const qc = useQueryClient()
  const key = programKeys.sessionBank(coachId ?? "")
  return useMutation({
    mutationFn: async (sessions: ProgSession[]) => {
      await saveSessionBank(coachId!, sessions)
      return sessions
    },
    onMutate: async (sessions) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProgSession[]>(key)
      qc.setQueryData(key, sessions)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(key, ctx?.prev)
      toast.error('Erreur de sauvegarde de la banque de séances')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    }
  })
}
