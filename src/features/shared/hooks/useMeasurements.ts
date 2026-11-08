import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '@/lib/queryKeys';
import { compressImage } from '@/lib/compressImage';
import {
  createMeasurementLog, deleteMeasurementLog, getMeasurementLogs, getMeasurementPhotoUrls,
  invalidateProfile, profileKeys, updateMeasurementLog,
} from '@/api/profile';
import type {
  MeasurementLog,
  NewMeasurementInput,
  UpdateMeasurementInput,
  PhotoSlot,
} from '@/features/shared/types/measurements';

/** Compression des photos avant envoi (navigateur uniquement, donc ici et pas dans `src/api`). */
async function compressAll(files: Partial<Record<PhotoSlot, File>>): Promise<Partial<Record<PhotoSlot, File>>> {
  const out: Partial<Record<PhotoSlot, File>> = {};
  for (const [slot, raw] of Object.entries(files) as [PhotoSlot, File | undefined][]) {
    if (raw) out[slot] = await compressImage(raw);
  }
  return out;
}

// ── Liste des logs (athlète ou coach, ordre chronologique décroissant) ────────

export function useMeasurementLogs(athleteId: string) {
  return useQuery({
    queryKey: profileKeys.measurements(athleteId),
    queryFn: (): Promise<MeasurementLog[]> => getMeasurementLogs(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}

// ── Création d'une log (upload photos + insert) ────────────────────────────────

export function useCreateMeasurementLog(athleteId: string) {
  const qc = useQueryClient();

  return useMutation({
    // Ligne, photos ({athleteId}/mensurations/{logId}/{slot}), puis mesures
    // biométriques planifiées par le coach (échues ou du jour) cochées.
    mutationFn: async (input: NewMeasurementInput) =>
      createMeasurementLog(athleteId, { ...input, photoFiles: await compressAll(input.photoFiles) }),
    onSuccess: () => {
      void invalidateProfile(qc, athleteId);
      qc.invalidateQueries({ queryKey: QK.testSessions(athleteId) });
      qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
      qc.invalidateQueries({ queryKey: ['cal', athleteId] });
      qc.invalidateQueries({ queryKey: ['calendar-events', athleteId] });
      qc.invalidateQueries({ queryKey: ['week-schedule', athleteId] });
      toast.success('Mensurations enregistrées ✓');
    },
    onError: (err: unknown) => {
      console.error('[measurement save error]', err);
      const msg = (err as { message?: string })?.message ?? String(err);
      toast.error('Erreur: ' + msg);
    },
  });
}

// ── Modification d'une log ─────────────────────────────────────────────────────

export function useUpdateMeasurementLog(athleteId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMeasurementInput) =>
      updateMeasurementLog(athleteId, { ...input, newPhotoFiles: await compressAll(input.newPhotoFiles) }),
    onSuccess: () => {
      void invalidateProfile(qc, athleteId);
      toast.success('Saisie mise à jour ✓');
    },
    onError: (err: unknown) => {
      console.error('[measurement update error]', err);
      const msg = (err as { message?: string })?.message ?? String(err);
      toast.error('Erreur: ' + msg);
    },
  });
}

// ── Suppression d'une log (+ photos storage) ───────────────────────────────────

export function useDeleteMeasurementLog(athleteId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (log: MeasurementLog) => deleteMeasurementLog(log),
    onSuccess: () => {
      void invalidateProfile(qc, athleteId);
      toast.success('Saisie supprimée');
    },
    onError: (err: unknown) => {
      console.error('[measurement delete error]', err);
      toast.error('Erreur lors de la suppression');
    },
  });
}

// ── Signed URLs pour afficher les photos (bucket privé) ────────────────────────

export function useMeasurementPhotoUrls(paths: string[]) {
  const sorted = [...paths].sort();
  return useQuery({
    queryKey: profileKeys.photoUrls(sorted),
    queryFn: (): Promise<Record<string, string>> => getMeasurementPhotoUrls(sorted),
    enabled: sorted.length > 0,
    staleTime: 50 * 60 * 1000, // < 1h (durée du signed URL)
  });
}
