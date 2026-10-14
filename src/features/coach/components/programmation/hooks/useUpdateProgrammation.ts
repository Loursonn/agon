import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/integrations/supabase/client"
import type { ProgSession } from "../types"
import { syncDocAssignmentsFromProg } from "@/features/shared/hooks/fiches/syncDocAssignments"

export function useUpdateProgrammation(athleteId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessions: ProgSession[]) => {
      const { error } = await supabase
        .from('app_data')
        .upsert({ athlete_id: athleteId!, key: 'asp:prog', value: sessions as unknown as Record<string, unknown>[] })
      if (error) throw error
      return sessions
    },
    onMutate: async (sessions) => {
      await qc.cancelQueries({ queryKey: ['asp-prog', athleteId] })
      const prev = qc.getQueryData<ProgSession[]>(['asp-prog', athleteId])
      qc.setQueryData(['asp-prog', athleteId], sessions)
      return { prev }
    },
    onSuccess: (sessions) => {
      // Attributions 'programme' des fiches rattachées (séances, blocs, variantes)
      if (athleteId) void syncDocAssignmentsFromProg(athleteId, sessions, qc)
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(['asp-prog', athleteId], ctx?.prev)
      toast.error('Erreur de sauvegarde')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['asp-prog', athleteId] })
    }
  })
}
