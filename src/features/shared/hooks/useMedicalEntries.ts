import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { compressFicheImage } from '@/lib/compressImage';
import { activeInjuries } from '@/lib/injuryDetails';
import {
  addAttachment, deleteAttachment, deleteEntry, invalidateMedical, listEntries, medicalKeys, saveEntry, signedUrls,
} from '@/api/injuries';
import type { MedicalAttachment, MedicalEntry, MedicalEntryInput } from '@/features/shared/types/medical';

export { MEDICAL_ACCEPT, MEDICAL_BUCKET, MEDICAL_MAX_BYTES } from '@/api/injuries';

/** Antécédents d'un athlète (en cours d'abord, puis le plus récent) avec leurs pièces jointes */
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
      toast.error("Erreur lors de l'enregistrement de l'antécédent");
    },
  });
}

export function useDeleteMedicalEntry(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: MedicalEntry) => deleteEntry(entry),
    onSuccess: () => {
      void invalidateMedical(qc, athleteId);
      toast.success('Antécédent supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

/** Ajoute une photo (compressée) ou un PDF à un antécédent */
export function useAddMedicalAttachment(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, file }: { entryId: string; file: File }) => {
      const isPdf = file.type === 'application/pdf';
      if (!isPdf && !file.type.startsWith('image/')) throw new Error('Format non pris en charge (photo ou PDF)');
      const ready = isPdf ? file : await compressFicheImage(file);
      await addAttachment(athleteId, entryId, ready, file.name);
    },
    onSuccess: () => invalidateMedical(qc, athleteId),
    onError: (err: unknown) => {
      console.error('[medical attachment]', err);
      toast.error(err instanceof Error && err.message.includes('(') ? err.message : "Erreur lors de l'ajout du fichier");
    },
  });
}

export function useDeleteMedicalAttachment(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (att: MedicalAttachment) => deleteAttachment(att),
    onSuccess: () => invalidateMedical(qc, athleteId),
    onError: () => toast.error('Erreur lors de la suppression du fichier'),
  });
}

/** URLs signées (1 h) des pièces jointes, par chemin */
export function useMedicalSignedUrls(athleteId: string, paths: string[]) {
  return useQuery<Record<string, string>>({
    queryKey: medicalKeys.signedUrls(athleteId, paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: () => signedUrls(paths),
  });
}
