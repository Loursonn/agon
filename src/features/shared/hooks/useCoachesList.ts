import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { coachKeys, invalidateCoachesList, listCoaches, setCoachCertified, type CoachRow } from '@/api/coaches';

export type { CoachRow } from '@/api/coaches';

export function useCoachesList() {
  return useQuery({
    queryKey: coachKeys.list,
    queryFn: listCoaches,
    staleTime: 60_000,
  });
}

export function useToggleCertifiedCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, certified }: { targetId: string; certified: boolean }) => setCoachCertified(targetId, certified),
    onMutate: async ({ targetId, certified }) => {
      await qc.cancelQueries({ queryKey: coachKeys.list });
      const previous = qc.getQueryData<CoachRow[]>(coachKeys.list);
      qc.setQueryData<CoachRow[]>(coachKeys.list, (old) =>
        (old ?? []).map(c => c.id === targetId ? { ...c, is_certified_coach: certified } : c),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(coachKeys.list, ctx.previous);
      toast.error('Erreur lors de la mise à jour');
    },
    onSuccess: (_data, { certified }) => {
      void invalidateCoachesList(qc);
      toast.success(certified ? 'Coach certifié' : 'Certification retirée');
    },
  });
}
