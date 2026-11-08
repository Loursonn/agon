import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  deleteTestResult,
  invalidateTests,
  listCurrentValues,
  listTestResults,
  saveTestResult,
  testKeys,
} from '@/api/tests';
import type { AthleteTestResult, CreateTestResultInput } from '@/features/shared/types/tests';

// ── Résultats de test d'un athlète ────────────────────────────────────────────

export function useAthleteTestResults(athleteId: string) {
  return useQuery({
    queryKey: testKeys.results(athleteId),
    queryFn:  () => listTestResults(athleteId),
    staleTime: 30_000,
    enabled:  !!athleteId,
  });
}

// ── Valeurs courantes (PR par variable) ───────────────────────────────────────

export function useAthleteCurrentValues(athleteId: string) {
  return useQuery({
    queryKey: testKeys.currentValues(athleteId),
    queryFn:  () => listCurrentValues(athleteId),
    staleTime: 30_000,
    enabled:  !!athleteId,
  });
}

// ── Créer un résultat ─────────────────────────────────────────────────────────

export function useCreateTestResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestResultInput) => saveTestResult(athleteId, input),
    onSuccess: () => {
      void invalidateTests(qc, athleteId);
      toast.success('Résultat enregistré');
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

// ── Modifier un résultat (date, notes, valeurs) — une transaction ─────────────

export function useUpdateTestResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestResultInput & { resultId: string }) => saveTestResult(athleteId, input),
    onSuccess: () => {
      void invalidateTests(qc, athleteId);
      toast.success('Résultat mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

// ── Supprimer un résultat (cascade sur les valeurs) ───────────────────────────

export function useDeleteTestResult(athleteId: string) {
  const qc = useQueryClient();
  const key = testKeys.results(athleteId);
  return useMutation({
    mutationFn: deleteTestResult,
    onMutate: async (resultId: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AthleteTestResult[]>(key);
      qc.setQueryData<AthleteTestResult[]>(key, (old) => (old ?? []).filter(r => r.id !== resultId));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error('Erreur lors de la suppression');
    },
    onSuccess: () => {
      void invalidateTests(qc, athleteId);
      toast.success('Résultat supprimé');
    },
  });
}
