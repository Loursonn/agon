import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { compressFicheImage } from '@/lib/compressImage';
import type { MedicalAttachment, MedicalEntry, MedicalEntryInput } from '@/features/shared/types/medical';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const MEDICAL_BUCKET = 'medical';
export const MEDICAL_MAX_BYTES = 10 * 1024 * 1024;
export const MEDICAL_ACCEPT = 'image/*,application/pdf';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const QK_ENTRIES = (athleteId: string) => ['medicalEntries', athleteId];

/** Antécédents d'un athlète (plus récent d'abord) avec leurs pièces jointes */
export function useMedicalEntries(athleteId: string | undefined) {
  return useQuery<MedicalEntry[]>({
    queryKey: QK_ENTRIES(athleteId ?? ''),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('medical_entries')
        .select('*, medical_attachments(*)')
        .eq('athlete_id', athleteId)
        .order('status', { ascending: false }) // en_cours avant gueri
        .order('date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MedicalEntry[];
    },
  });
}

export function useSaveMedicalEntry(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: MedicalEntryInput }): Promise<MedicalEntry> => {
      const { data: auth } = await supabase.auth.getUser();
      const q = id
        ? db.from('medical_entries').update(input).eq('id', id)
        : db.from('medical_entries').insert({ ...input, athlete_id: athleteId, created_by: auth.user?.id ?? null });
      const { data, error } = await q.select('*, medical_attachments(*)').single();
      if (error) throw error;
      return data as MedicalEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_ENTRIES(athleteId) }),
    onError: (err: unknown) => {
      console.error('[medical entry save]', err);
      toast.error("Erreur lors de l'enregistrement de l'antécédent");
    },
  });
}

export function useDeleteMedicalEntry(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: MedicalEntry) => {
      // Fichiers d'abord : la RLS Storage exige qu'ils soient encore accessibles
      const paths = entry.medical_attachments.map((a) => a.file_path);
      if (paths.length) await supabase.storage.from(MEDICAL_BUCKET).remove(paths);
      const { error } = await db.from('medical_entries').delete().eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_ENTRIES(athleteId) });
      toast.success('Antécédent supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

function extFor(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/png') return 'png';
  return 'jpg';
}

/** Ajoute une photo (compressée) ou un PDF à un antécédent */
export function useAddMedicalAttachment(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, file }: { entryId: string; file: File }) => {
      const isPdf = file.type === 'application/pdf';
      if (!isPdf && !file.type.startsWith('image/')) throw new Error('Format non pris en charge (photo ou PDF)');
      const ready = isPdf ? file : await compressFicheImage(file);
      if (!ALLOWED_TYPES.includes(ready.type)) throw new Error('Format non pris en charge (JPEG, PNG, WebP ou PDF)');
      if (ready.size > MEDICAL_MAX_BYTES) throw new Error('Fichier trop lourd (10 Mo max)');

      const id = crypto.randomUUID();
      const path = `${athleteId}/${entryId}/${id}.${extFor(ready)}`;
      const { error: upErr } = await supabase.storage
        .from(MEDICAL_BUCKET)
        .upload(path, ready, { contentType: ready.type, upsert: false });
      if (upErr) throw upErr;

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from('medical_attachments').insert({
        id, entry_id: entryId, athlete_id: athleteId, file_path: path,
        file_name: file.name, mime_type: ready.type, file_size: ready.size,
        created_by: auth.user?.id ?? null,
      });
      if (error) {
        await supabase.storage.from(MEDICAL_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_ENTRIES(athleteId) }),
    onError: (err: unknown) => {
      console.error('[medical attachment]', err);
      toast.error(err instanceof Error && err.message.includes('(') ? err.message : "Erreur lors de l'ajout du fichier");
    },
  });
}

export function useDeleteMedicalAttachment(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: MedicalAttachment) => {
      await supabase.storage.from(MEDICAL_BUCKET).remove([att.file_path]);
      const { error } = await db.from('medical_attachments').delete().eq('id', att.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_ENTRIES(athleteId) }),
    onError: () => toast.error('Erreur lors de la suppression du fichier'),
  });
}

/** URLs signées (1 h) des pièces jointes, par chemin */
export function useMedicalSignedUrls(paths: string[]) {
  return useQuery<Record<string, string>>({
    queryKey: ['medicalSignedUrls', ...paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(MEDICAL_BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
  });
}
