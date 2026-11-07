import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { QK } from '@/lib/queryKeys';
import { invalidateReferences } from '@/api/references';
import type {
  AthleteTestResult,
  AthleteCurrentValue,
  CreateTestResultInput,
} from '@/features/shared/types/tests';

// ── Résultats de test d'un athlète ────────────────────────────────────────────

async function fetchAthleteTestResults(athleteId: string): Promise<AthleteTestResult[]> {
  const { data, error } = await supabase
    .from('athlete_test_results')
    .select(`
      *,
      test_definitions (
        id, name, kind, category, description,
        test_variables (id, key, label, unit, value_type, better_when)
      ),
      athlete_test_values (
        id, result_id, variable_id, value,
        test_variables (id, key, label, unit, value_type, better_when)
      )
    `)
    .eq('athlete_id', athleteId)
    .order('performed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AthleteTestResult[];
}

export function useAthleteTestResults(athleteId: string) {
  return useQuery({
    queryKey: QK.athleteTestResults(athleteId),
    queryFn:  () => fetchAthleteTestResults(athleteId),
    staleTime: 30_000,
    enabled:  !!athleteId,
  });
}

// ── Valeurs courantes (PR par variable) ───────────────────────────────────────

async function fetchAthleteCurrentValues(athleteId: string): Promise<AthleteCurrentValue[]> {
  const { data, error } = await supabase
    .from('athlete_current_values')
    .select('*')
    .eq('athlete_id', athleteId);
  if (error) throw error;
  return (data ?? []) as AthleteCurrentValue[];
}

export function useAthleteCurrentValues(athleteId: string) {
  return useQuery({
    queryKey: QK.athleteCurrentValues(athleteId),
    queryFn:  () => fetchAthleteCurrentValues(athleteId),
    staleTime: 30_000,
    enabled:  !!athleteId,
  });
}

// ── Créer un résultat ─────────────────────────────────────────────────────────

export function useCreateTestResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTestResultInput) => {
      const { data: result, error: rErr } = await supabase
        .from('athlete_test_results')
        .insert({
          athlete_id:         athleteId,
          test_definition_id: input.test_definition_id,
          performed_at:       input.performed_at,
          notes:              input.notes.trim() || null,
        })
        .select()
        .single();
      if (rErr) throw rErr;

      const valuesToInsert = Object.entries(input.values)
        .filter(([, v]) => v !== undefined && !isNaN(v))
        .map(([variable_id, value]) => ({ result_id: result.id, variable_id, value }));

      if (valuesToInsert.length > 0) {
        const { error: vErr } = await supabase
          .from('athlete_test_values')
          .insert(valuesToInsert);
        if (vErr) {
          await supabase.from('athlete_test_results').delete().eq('id', result.id);
          throw vErr;
        }
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.athleteTestResults(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteCurrentValues(athleteId) });
      // Le trigger SQL crée la référence (VMA…) : séances énergie et profil à jour.
      void invalidateReferences(qc, athleteId);
      qc.invalidateQueries({ queryKey: ['categoryTestSeries', athleteId] });
      qc.invalidateQueries({ queryKey: ['articularProfile', athleteId] });
      toast.success('Résultat enregistré');
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

// ── Modifier un résultat (date, notes, valeurs) ───────────────────────────────

export function useUpdateTestResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTestResultInput & { resultId: string }) => {
      const { error: rErr } = await supabase
        .from('athlete_test_results')
        .update({
          performed_at: input.performed_at,
          notes:        input.notes.trim() || null,
          updated_at:   new Date().toISOString(),
        })
        .eq('id', input.resultId);
      if (rErr) throw rErr;

      // Remplace les valeurs
      const { error: delErr } = await supabase
        .from('athlete_test_values')
        .delete()
        .eq('result_id', input.resultId);
      if (delErr) throw delErr;

      const valuesToInsert = Object.entries(input.values)
        .filter(([, v]) => v !== undefined && !isNaN(v))
        .map(([variable_id, value]) => ({ result_id: input.resultId, variable_id, value }));
      if (valuesToInsert.length > 0) {
        const { error: vErr } = await supabase.from('athlete_test_values').insert(valuesToInsert);
        if (vErr) throw vErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.athleteTestResults(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteCurrentValues(athleteId) });
      // Le trigger SQL crée la référence (VMA…) : séances énergie et profil à jour.
      void invalidateReferences(qc, athleteId);
      qc.invalidateQueries({ queryKey: ['categoryTestSeries', athleteId] });
      qc.invalidateQueries({ queryKey: ['articularProfile', athleteId] });
      toast.success('Résultat mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

// ── Supprimer un résultat (cascade sur les valeurs) ───────────────────────────

export function useDeleteTestResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resultId: string) => {
      const { error } = await supabase
        .from('athlete_test_results')
        .delete()
        .eq('id', resultId);
      if (error) throw error;
    },
    onMutate: async (resultId) => {
      await qc.cancelQueries({ queryKey: QK.athleteTestResults(athleteId) });
      const previous = qc.getQueryData<AthleteTestResult[]>(QK.athleteTestResults(athleteId));
      qc.setQueryData<AthleteTestResult[]>(
        QK.athleteTestResults(athleteId),
        (old) => (old ?? []).filter(r => r.id !== resultId),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(QK.athleteTestResults(athleteId), ctx.previous);
      toast.error('Erreur lors de la suppression');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.athleteCurrentValues(athleteId) });
      toast.success('Résultat supprimé');
    },
  });
}
