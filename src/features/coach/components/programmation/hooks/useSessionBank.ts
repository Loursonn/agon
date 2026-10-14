import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/integrations/supabase/client"
import type { ProgSession } from "../types"

// Banque de séances musculaires, scoped coach (clé app_data sur l'id du coach)
const KEY = 'asp:session-bank'

export function useSessionBank(coachId: string | undefined) {
  return useQuery<ProgSession[]>({
    queryKey: ['asp-session-bank', coachId],
    enabled: !!coachId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_data')
        .select('value')
        .eq('athlete_id', coachId!)
        .eq('key', KEY)
        .maybeSingle()
      if (error) throw error
      return (data?.value ?? []) as ProgSession[]
    }
  })
}

export function useUpdateSessionBank(coachId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessions: ProgSession[]) => {
      const { error } = await supabase
        .from('app_data')
        .upsert({ athlete_id: coachId!, key: KEY, value: sessions as unknown as Record<string, unknown>[] })
      if (error) throw error
      return sessions
    },
    onMutate: async (sessions) => {
      await qc.cancelQueries({ queryKey: ['asp-session-bank', coachId] })
      const prev = qc.getQueryData<ProgSession[]>(['asp-session-bank', coachId])
      qc.setQueryData(['asp-session-bank', coachId], sessions)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(['asp-session-bank', coachId], ctx?.prev)
      toast.error('Erreur de sauvegarde de la banque de séances')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['asp-session-bank', coachId] })
    }
  })
}
