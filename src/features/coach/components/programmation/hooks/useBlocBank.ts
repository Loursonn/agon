import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getBlocBank, programKeys, saveBlocBank } from "@/api/program"
import type { Bloc } from "../types"

// Banque de blocs préconstruits, scoped coach (clé app_data sur l'id du coach)
export function useBlocBank(coachId: string | undefined) {
  return useQuery<Bloc[]>({
    queryKey: programKeys.blocBank(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 30_000,
    queryFn: () => getBlocBank(coachId!),
  })
}

export function useUpdateBlocBank(coachId: string | undefined) {
  const qc = useQueryClient()
  const key = programKeys.blocBank(coachId ?? "")
  return useMutation({
    mutationFn: async (blocs: Bloc[]) => {
      await saveBlocBank(coachId!, blocs)
      return blocs
    },
    onMutate: async (blocs) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Bloc[]>(key)
      qc.setQueryData(key, blocs)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(key, ctx?.prev)
      toast.error('Erreur de sauvegarde de la banque de blocs')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    }
  })
}
