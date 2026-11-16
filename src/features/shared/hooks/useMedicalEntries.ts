import { STALE_MS } from "@/lib/queryCache";
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { activeInjuries } from '@/lib/injuryDetails';
import { deleteEntry, invalidateMedical, listEntries, listStageHistory, medicalKeys, saveEntry, setInjuryStage } from '@/api/injuries';
import { RECOVERY_STAGE_LABEL, type InjuryStageEvent, type MedicalEntry, type MedicalEntryInput, type RecoveryStage } from '@/features/shared/types/medical';

/** Blessures d'un athlète (en cours d'abord, puis la plus récente) */
export function useMedicalEntries(athleteId: string | undefined) {
  return useQuery<MedicalEntry[]>({
    queryKey: medicalKeys.entries(athleteId ?? ''),
    enabled: !!athleteId,
    staleTime: STALE_MS,
    queryFn: () => listEntries(athleteId!),
  });
}

/**
 * Blessures en cours d'un athlète — la seule source des badges « blessure
 * active » (header athlète, profil, retours coach). Partage le cache de
 * `useMedicalEntries` : aucune requête de plus.
 */
export function useActiveInjuries(athleteId: string | undefined) {
  const { data = [], isLoading } = useMedicalEntries(athleteId);
  const injuries = useMemo(() => activeInjuries(data), [data]);
  return { injuries, isLoading };
}

/** @param asStaff  Saisie par un professionnel du staff (déclarée comme telle). */
export function useSaveMedicalEntry(athleteId: string, asStaff = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; input: MedicalEntryInput }) => saveEntry(athleteId, v, { asStaff }),
    onSuccess: () => invalidateMedical(qc, athleteId),
    onError: (err: unknown) => {
      console.error('[medical entry save]', err);
      toast.error("Erreur lors de l'enregistrement de la blessure");
    },
  });
}

export function useDeleteMedicalEntry(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: MedicalEntry) => deleteEntry(entry),
    onSuccess: () => {
      void invalidateMedical(qc, athleteId);
      toast.success('Blessure supprimée');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

/** Étapes datées des blessures d'un athlète (frise de résolution). */
export function useInjuryStageHistory(athleteId: string | undefined) {
  return useQuery<InjuryStageEvent[]>({
    queryKey: medicalKeys.stages(athleteId ?? ''),
    enabled: !!athleteId,
    staleTime: STALE_MS,
    queryFn: () => listStageHistory(athleteId!),
  });
}

/** Change l'étape de résolution d'une blessure (athlète, coach ou staff). */
export function useSetInjuryStage(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, stage }: { entryId: string; stage: RecoveryStage }) => setInjuryStage(entryId, stage),
    onSuccess: (_row, { stage }) => {
      void invalidateMedical(qc, athleteId);
      toast.success(`Étape : ${RECOVERY_STAGE_LABEL[stage]}`);
    },
    onError: (err: unknown) => {
      console.error('[injury stage]', err);
      toast.error("L'étape n'a pas été enregistrée");
    },
  });
}
