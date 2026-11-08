import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  competitionKeys,
  createCompetition,
  deleteCompetition,
  invalidateCompetitions,
  listCompetitions,
  updateCompetition,
  type CompetitionPatch,
} from '@/api/competitions';
import type { Competition, CompetitionInsert } from '@/types/planning';

/**
 * Charge TOUTES les compétitions d'un athlète (pas de filtre saison).
 * Le filtre par saison se fait côté client pour garantir une clé de cache unique
 * et une synchronisation immédiate entre PlanningEditor et PlanningOverview.
 */
export function useCompetitions(athleteId: string) {
  return useQuery<Competition[]>({
    queryKey: competitionKeys.list(athleteId),
    queryFn: () => listCompetitions(athleteId),
    enabled: !!athleteId,
    staleTime: 0,           // Toujours considéré comme périmé → refetch à chaque montage
    refetchOnMount: true,
  });
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation<Competition, Error, CompetitionInsert>({
    mutationFn: createCompetition,
    onSuccess: (data) => invalidateCompetitions(qc, data.athlete_id),
    onError: (err) => {
      console.error('[useCreateCompetition] Erreur:', err);
    },
  });
}

export function useUpdateCompetition() {
  const qc = useQueryClient();
  return useMutation<Competition, Error, { id: string; updates: CompetitionPatch }>({
    mutationFn: ({ id, updates }) => updateCompetition(id, updates),
    onSuccess: (data) => invalidateCompetitions(qc, data.athlete_id),
  });
}

export function useDeleteCompetition() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; athlete_id: string }>({
    mutationFn: ({ id }) => deleteCompetition(id),
    onSuccess: (_data, vars) => invalidateCompetitions(qc, vars.athlete_id),
  });
}
