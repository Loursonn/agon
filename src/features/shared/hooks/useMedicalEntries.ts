import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { activeInjuries } from '@/lib/injuryDetails';
import { deleteEntry, invalidateMedical, listEntries, medicalKeys, saveEntry } from '@/api/injuries';
import type { MedicalEntry, MedicalEntryInput } from '@/features/shared/types/medical';

/** Blessures d'un athlète (en cours d'abord, puis la plus récente) */
export function useMedicalEntries(athleteId: string | undefined) {
  return useQuery<MedicalEntry[]>({
    queryKey: medicalKeys.entries(athleteId ?? ''),
    enabled: !!athleteId,
    staleTime: 60_000,
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
