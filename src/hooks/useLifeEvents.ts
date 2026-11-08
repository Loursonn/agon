import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createLifeEvent,
  deleteLifeEvent,
  invalidateLifeEvents,
  lifeEventKeys,
  listLifeEvents,
} from '@/api/lifeEvents';
import type { LifeEvent, LifeEventInsert } from '@/types/planning';

export function useLifeEvents(athleteId: string) {
  return useQuery<LifeEvent[]>({
    queryKey: lifeEventKeys.list(athleteId),
    queryFn: () => listLifeEvents(athleteId),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

export function useCreateLifeEvent() {
  const qc = useQueryClient();
  return useMutation<LifeEvent, Error, LifeEventInsert>({
    mutationFn: createLifeEvent,
    onSuccess: (data) => invalidateLifeEvents(qc, data.athlete_id),
  });
}

export function useDeleteLifeEvent() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; athlete_id: string }>({
    mutationFn: ({ id }) => deleteLifeEvent(id),
    onSuccess: (_data, vars) => invalidateLifeEvents(qc, vars.athlete_id),
  });
}
