/**
 * Module Fiches — mutations (upload, métadonnées, archivage, attribution, vu).
 * Un fichier n'est stocké qu'une fois : une attribution = une ligne doc_assignments.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { compressFicheImage } from "@/lib/compressImage";
import {
  DOC_ALLOWED_MIME, DOC_MAX_BYTES, docFilePath, extFor,
} from "../../types/fiches";
import type { Doc, FicheCategory } from "../../types/fiches";

export class DocUploadError extends Error {}

/** Contrôle client (le bucket revérifie mime + taille). Compresse les images. */
export async function prepareDocFile(file: File): Promise<File> {
  if (!(DOC_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    throw new DocUploadError("Format non accepté : PDF, JPG, PNG ou WebP uniquement.");
  }
  const out = file.type.startsWith("image/") ? await compressFicheImage(file) : file;
  if (out.size > DOC_MAX_BYTES) {
    throw new DocUploadError(
      file.type === "application/pdf"
        ? "PDF trop lourd (10 Mo max). Compresse le PDF avant import, ex. ilovepdf."
        : "Image trop lourde (10 Mo max).",
    );
  }
  return out;
}

export interface UploadDocInput {
  file: File;
  coachId: string;
  /** null = banque ; sinon fiche personnelle / ajout athlète */
  athleteId: string | null;
  uploadedBy: string;
  title: string;
  category?: FicheCategory;
  description?: string | null;
  tags?: string[];
  isSelfService?: boolean;
  /** Variante : id de la fiche d'origine */
  originId?: string | null;
  variantLabel?: string | null;
  variantOrder?: number;
}

function invalidateDocs(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QK.docs });
}

/** Upload + insert. Pour une fiche perso importée par le coach, crée aussi l'attribution 'manuel'. */
export async function uploadDoc(input: UploadDocInput): Promise<Doc> {
  const file = await prepareDocFile(input.file);
  const id = crypto.randomUUID();
  const path = docFilePath({
    coachId: input.coachId,
    athleteId: input.athleteId,
    docId: id,
    ext: extFor(file.type, file.name),
  });

  const { error: upErr } = await supabase.storage
    .from("docs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("docs")
    .insert({
      id,
      coach_id: input.coachId,
      athlete_id: input.athleteId,
      uploaded_by: input.uploadedBy,
      origin_id: input.originId ?? null,
      variant_label: input.variantLabel ?? null,
      variant_order: input.variantOrder ?? 0,
      title: input.title.trim() || "Fiche",
      description: input.description ?? null,
      category: input.category ?? "autre",
      tags: input.tags ?? [],
      kind: file.type === "application/pdf" ? "pdf" : "image",
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      is_self_service: input.athleteId ? false : !!input.isSelfService,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("docs").remove([path]);
    throw error;
  }

  if (input.athleteId && input.uploadedBy !== input.athleteId) {
    await supabase.from("doc_assignments").insert({
      doc_id: id,
      athlete_id: input.athleteId,
      assigned_by: input.uploadedBy,
      source: "manuel",
    });
  }
  return data as Doc;
}

export function useUploadDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadDoc,
    onSuccess: () => invalidateDocs(qc),
    onError: (e: unknown) =>
      toast.error(e instanceof DocUploadError ? e.message : "Erreur lors de l'import de la fiche"),
  });
}

export type DocPatch = Partial<Pick<Doc,
  "title" | "description" | "category" | "tags" | "is_self_service" | "variant_label" | "variant_order">>;

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DocPatch }) => {
      const { error } = await supabase.from("docs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateDocs(qc),
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

/** Archive / désarchive une famille (origine + variantes). */
export function useArchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ originId, archived }: { originId: string; archived: boolean }) => {
      const { error } = await supabase
        .from("docs")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .or(`id.eq.${originId},origin_id.eq.${originId}`);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidateDocs(qc);
      toast.success(v.archived ? "Fiche archivée" : "Fiche désarchivée");
    },
    onError: () => toast.error("Erreur lors de l'archivage"),
  });
}

/** « Remplacer partout » : nouveau fichier sur la même ligne, ancien objet supprimé. */
export function useReplaceDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc, file: raw }: { doc: Doc; file: File }) => {
      const file = await prepareDocFile(raw);
      const path = docFilePath({
        coachId: doc.coach_id,
        athleteId: doc.athlete_id,
        // nouveau nom : évite les URL signées en cache sur l'ancien contenu
        docId: `${doc.id}-${Date.now().toString(36)}`,
        ext: extFor(file.type, file.name),
      });
      const { error: upErr } = await supabase.storage
        .from("docs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("docs")
        .update({
          file_path: path,
          file_size: file.size,
          mime_type: file.type,
          kind: file.type === "application/pdf" ? "pdf" : "image",
        })
        .eq("id", doc.id);
      if (error) {
        await supabase.storage.from("docs").remove([path]);
        throw error;
      }
      if (doc.file_path) await supabase.storage.from("docs").remove([doc.file_path]);
    },
    onSuccess: () => {
      invalidateDocs(qc);
      toast.success("Fichier remplacé");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof DocUploadError ? e.message : "Erreur lors du remplacement"),
  });
}

/** Athlète : supprime un de ses ajouts (ligne + objet Storage). Coach : fiche non référencée. */
export function useDeleteOwnDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Doc) => {
      const { error } = await supabase.from("docs").delete().eq("id", doc.id);
      if (error) throw error;
      if (doc.file_path) await supabase.storage.from("docs").remove([doc.file_path]);
    },
    onSuccess: () => {
      invalidateDocs(qc);
      toast.success("Fichier supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

/** Attribution manuelle (avec note coach optionnelle). */
export function useAssignDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, athleteId, assignedBy, coachNote }: {
      docId: string; athleteId: string; assignedBy: string; coachNote?: string | null;
    }) => {
      const { error } = await supabase.from("doc_assignments").upsert(
        { doc_id: docId, athlete_id: athleteId, assigned_by: assignedBy, source: "manuel", coach_note: coachNote || null },
        { onConflict: "doc_id,athlete_id,source" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDocs(qc);
      toast.success("Fiche attribuée");
    },
    onError: () => toast.error("Erreur lors de l'attribution"),
  });
}

export function useUnassignDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, athleteId }: { docId: string; athleteId: string }) => {
      const { error } = await supabase
        .from("doc_assignments")
        .delete()
        .eq("doc_id", docId)
        .eq("athlete_id", athleteId)
        .eq("source", "manuel");
      if (error) throw error;
    },
    onSuccess: () => invalidateDocs(qc),
    onError: () => toast.error("Erreur lors du retrait"),
  });
}

/** Athlète : marque la fiche comme vue (RPC, seule écriture autorisée sur doc_assignments). */
export function useMarkDocSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.rpc("mark_doc_seen", { doc_uuid: docId });
      if (error) throw error;
    },
    onSuccess: () => invalidateDocs(qc),
  });
}
