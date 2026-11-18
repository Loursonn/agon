import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invalidateDocs } from '@/api/docs';
import {
  invalidateTests,
  listCoachTestFiches,
  setBiometryLevels,
  setCoachTestFiche,
  testFicheKeys,
  type BiometryLevel,
} from '@/api/tests';

/** Fiche rattachée à chaque test du coach (clé : id du test ou « biometrie »). */
export function useCoachTestFiches(coachId: string | undefined) {
  return useQuery({
    queryKey: testFicheKeys.coach(coachId ?? ''),
    queryFn: () => listCoachTestFiches(coachId!),
    enabled: !!coachId,
    staleTime: 5 * 60_000,
  });
}

export function useSetCoachTestFiche(coachId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ testKey, docId }: { testKey: string; docId: string | null }) =>
      setCoachTestFiche(coachId!, testKey, docId),
    onSuccess: (_d, v) => {
      toast.success(v.docId ? 'Fiche rattachée au test' : 'Fiche retirée du test');
      void qc.invalidateQueries({ queryKey: testFicheKeys.coach(coachId ?? '') });
      void invalidateDocs(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetBiometryLevels(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, levels }: { id: string; levels: BiometryLevel[] }) => setBiometryLevels(id, levels),
    onSuccess: () => { void invalidateTests(qc, athleteId); },
    onError: (e: Error) => toast.error(e.message),
  });
}
