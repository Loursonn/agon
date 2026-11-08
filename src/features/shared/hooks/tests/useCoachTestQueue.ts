import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fillCoachTestSession, invalidateTests, listPendingCoachTests, testKeys } from '@/api/tests';

export type { PendingCoachTest } from '@/api/tests';

/**
 * Tests programmés "mode coach" que l'athlète a validés (séance complétée)
 * mais que le coach n'a pas encore notés (aucune variable saisie).
 */
export function usePendingCoachTests(athleteId: string) {
  return useQuery({
    queryKey: testKeys.pendingCoach(athleteId),
    queryFn: () => listPendingCoachTests(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}

/** Le coach saisit les valeurs → on écrit dans la séance test (le trigger crée le résultat objectif). */
export function useFillCoachTestSession(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, variables }: { sessionId: string; variables: Record<string, number> }) =>
      fillCoachTestSession(sessionId, variables),
    onSuccess: () => {
      void invalidateTests(qc, athleteId);
      toast.success('Test noté ✓');
    },
    onError: () => toast.error('Erreur lors de la saisie'),
  });
}
