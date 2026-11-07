import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { QK } from '@/lib/queryKeys';
import { invalidateReferences } from '@/api/references';
import type { TestVariable } from '@/features/shared/types/tests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PendingCoachTest {
  sessionId: string;
  title: string;
  date: string;
  comment: string | null;
  variables: TestVariable[];
}

/**
 * Tests programmés "mode coach" que l'athlète a validés (séance complétée)
 * mais que le coach n'a pas encore notés (aucune variable saisie).
 */
export function usePendingCoachTests(athleteId: string) {
  return useQuery({
    queryKey: ['pendingCoachTests', athleteId],
    queryFn: async (): Promise<PendingCoachTest[]> => {
      const { data: sessions, error: sErr } = await db
        .from('test_sessions')
        .select('id, title, date, results_structured')
        .eq('athlete_id', athleteId)
        .eq('completed', true)
        .order('date', { ascending: false });
      if (sErr) throw sErr;
      const sess = (sessions ?? []) as { id: string; title: string; date: string; results_structured: { variables?: Record<string, unknown>; comment?: string } | null }[];
      if (sess.length === 0) return [];

      const { data: defs, error: dErr } = await db
        .from('test_definitions')
        .select('id, name, fill_mode, test_variables(*)')
        .eq('fill_mode', 'coach');
      if (dErr) throw dErr;
      const defList = (defs ?? []) as { id: string; name: string; test_variables: TestVariable[] }[];
      const byName = new Map(defList.map(d => [d.name.toLowerCase(), d]));

      const pending: PendingCoachTest[] = [];
      for (const s of sess) {
        const def = byName.get(s.title.toLowerCase());
        if (!def) continue; // pas un test coach
        const vars = s.results_structured?.variables;
        const hasValues = vars && Object.values(vars).some(v => v != null && !isNaN(Number(v)));
        if (hasValues) continue; // déjà rempli
        pending.push({
          sessionId: s.id, title: s.title, date: s.date,
          comment: s.results_structured?.comment ?? null,
          variables: [...def.test_variables].sort((a, b) => a.label.localeCompare(b.label)),
        });
      }
      return pending;
    },
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}

/** Le coach saisit les valeurs → on écrit dans la séance test (le trigger crée le résultat objectif). */
export function useFillCoachTestSession(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, variables }: { sessionId: string; variables: Record<string, number> }) => {
      const { error } = await db
        .from('test_sessions')
        .update({ completed: true, results_structured: { variables } })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendingCoachTests', athleteId] });
      qc.invalidateQueries({ queryKey: QK.athleteTestResults(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteCurrentValues(athleteId) });
      qc.invalidateQueries({ queryKey: QK.articularProfile(athleteId) });
      // Le trigger SQL crée la référence (VMA…) : séances énergie et profil à jour.
      void invalidateReferences(qc, athleteId);
      qc.invalidateQueries({ queryKey: ['categoryTestSeries', athleteId] });
      toast.success('Test noté ✓');
    },
    onError: () => toast.error('Erreur lors de la saisie'),
  });
}
