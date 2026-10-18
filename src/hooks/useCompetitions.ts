import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calBaseKey } from '@/features/shared/hooks/useUnifiedCalendar';
import { QK } from '@/lib/queryKeys';
import type { Competition, CompetitionInsert } from '@/types/planning';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Charge TOUTES les compétitions d'un athlète (pas de filtre saison).
 * Le filtre par saison se fait côté client pour garantir une clé de cache unique
 * et une synchronisation immédiate entre PlanningEditor et PlanningOverview.
 */
export function useCompetitions(athleteId: string) {
  return useQuery<Competition[]>({
    queryKey: ['competitions', athleteId],
    queryFn: async () => {
      const { data, error } = await db
        .from('competitions')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Competition[];
    },
    enabled: !!athleteId,
    staleTime: 0,           // Toujours considéré comme périmé → refetch à chaque montage
    refetchOnMount: true,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, athleteId: string) {
  qc.invalidateQueries({ queryKey: ['competitions', athleteId] });
  qc.invalidateQueries({ queryKey: ['athlete_next_competition', athleteId] });
  qc.invalidateQueries({ queryKey: calBaseKey(athleteId) });
  // La compétition est un jour du planning : frise coach + semaine athlète
  qc.invalidateQueries({ queryKey: ['timeline-data', athleteId] });
  qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation<Competition, Error, CompetitionInsert>({
    mutationFn: async (comp) => {
      const { data, error } = await db
        .from('competitions')
        .insert(comp)
        .select()
        .single();
      if (error) throw error;
      return data as Competition;
    },
    onSuccess: (data) => {
      invalidate(qc, data.athlete_id);
    },
    onError: (err) => {
      console.error('[useCreateCompetition] Erreur:', err);
    },
  });
}

export function useUpdateCompetition() {
  const qc = useQueryClient();
  return useMutation<Competition, Error, { id: string; updates: Partial<Competition> }>({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await db
        .from('competitions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Competition;
    },
    onSuccess: (data) => {
      invalidate(qc, data.athlete_id);
    },
  });
}

export function useDeleteCompetition() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; athlete_id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await db.from('competitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidate(qc, vars.athlete_id);
    },
  });
}
