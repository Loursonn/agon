import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calBaseKey } from '@/features/shared/hooks/useUnifiedCalendar';
import type { LifeEvent, LifeEventInsert } from '@/types/planning';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useLifeEvents(athleteId: string) {
  return useQuery<LifeEvent[]>({
    queryKey: ['life_events', athleteId],
    queryFn: async () => {
      const { data, error } = await db
        .from('athlete_life_events')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('date_start', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LifeEvent[];
    },
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, athleteId: string) {
  qc.invalidateQueries({ queryKey: ['life_events', athleteId] });
  qc.invalidateQueries({ queryKey: calBaseKey(athleteId) });
}

export function useCreateLifeEvent() {
  const qc = useQueryClient();
  return useMutation<LifeEvent, Error, LifeEventInsert>({
    mutationFn: async (evt) => {
      const { data, error } = await db
        .from('athlete_life_events')
        .insert(evt)
        .select()
        .single();
      if (error) throw error;
      return data as LifeEvent;
    },
    onSuccess: (data) => invalidate(qc, data.athlete_id),
  });
}

export function useDeleteLifeEvent() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; athlete_id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await db.from('athlete_life_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidate(qc, vars.athlete_id),
  });
}
