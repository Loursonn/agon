import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getHistory, invalidateMedical, medicalKeys, upsertHistory } from '@/api/injuries';
import type { MedicalHistory, MedicalHistoryInput } from '@/features/shared/types/medical';

export function useMedicalHistory(athleteId: string | undefined) {
  return useQuery<MedicalHistory | null>({
    queryKey: medicalKeys.history(athleteId ?? ''),
    queryFn: () => getHistory(athleteId!),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

export function useUpsertMedicalHistory(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<MedicalHistoryInput, 'athlete_id'>) => upsertHistory(athleteId, input),
    onSuccess: () => {
      void invalidateMedical(qc, athleteId);
      toast.success('Antécédents médicaux enregistrés');
    },
    onError: (err: unknown) => {
      console.error('[medical save error]', err);
      toast.error('Erreur lors de la sauvegarde');
    },
  });
}
