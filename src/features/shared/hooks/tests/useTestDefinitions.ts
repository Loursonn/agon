import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createTestDefinition,
  deleteTestDefinition,
  invalidateTestDefinitions,
  listTestDefinitions,
  testKeys,
  updateTestDefinition,
} from '@/api/tests';
import type {
  TestDefinitionWithVariables,
  CreateTestDefinitionInput,
  UpdateTestDefinitionInput,
} from '@/features/shared/types/tests';

// ── Lecture ───────────────────────────────────────────────────────────────────

export function useTestDefinitions(coachId: string) {
  return useQuery({
    queryKey: testKeys.definitions(coachId),
    queryFn:  () => listTestDefinitions(coachId),
    staleTime: 5 * 60_000,
    enabled:  !!coachId,
  });
}

// ── Créer un test custom ──────────────────────────────────────────────────────

export function useCreateTestDefinition(coachId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestDefinitionInput) => createTestDefinition(coachId, input),
    onSuccess: () => {
      void invalidateTestDefinitions(qc);
      toast.success('Test créé');
    },
    onError: () => toast.error('Erreur lors de la création du test'),
  });
}

// ── Mettre à jour nom / description / protocole / variables ───────────────────

export function useUpdateTestDefinition(_coachId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTestDefinitionInput) => updateTestDefinition(input),
    onSuccess: () => {
      void invalidateTestDefinitions(qc);
      toast.success('Test mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

// ── Supprimer un test custom (cascade sur variables) ─────────────────────────

export function useDeleteTestDefinition(coachId: string) {
  const qc = useQueryClient();
  const key = testKeys.definitions(coachId);
  return useMutation({
    mutationFn: deleteTestDefinition,
    onMutate: async (testId: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TestDefinitionWithVariables[]>(key);
      qc.setQueryData<TestDefinitionWithVariables[]>(key, (old) => (old ?? []).filter(d => d.id !== testId));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error('Erreur lors de la suppression');
    },
    onSuccess: () => {
      void invalidateTestDefinitions(qc);
      toast.success('Test supprimé');
    },
  });
}
