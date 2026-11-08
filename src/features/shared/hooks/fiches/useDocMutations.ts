/**
 * Module Fiches — mutations (upload, métadonnées, archivage, attribution, vu),
 * adaptateurs de `src/api/docs.ts`. Ici : contrôle du fichier, compression des
 * images et messages à l'utilisateur.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  assignDoc, deleteDoc, invalidateDocs, markDocSeen, replaceDocFile, setFamilyArchived, unassignDoc, updateDoc,
  uploadDoc as apiUploadDoc,
  type DocPatch, type UploadDocInput,
} from "@/api/docs";
import { compressFicheImage } from "@/lib/compressImage";
import { DOC_ALLOWED_MIME, DOC_MAX_BYTES } from "../../types/fiches";
import type { Doc } from "../../types/fiches";

export type { DocPatch, UploadDocInput } from "@/api/docs";

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

/** Contrôle + compression, puis upload et insertion (+ attribution 'manuel' si besoin). */
export async function uploadDoc(input: UploadDocInput): Promise<Doc> {
  return apiUploadDoc({ ...input, file: await prepareDocFile(input.file) });
}

export function useUploadDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadDoc,
    onSuccess: (_d, v) => invalidateDocs(qc, v.athleteId ?? v.assignTo),
    onError: (e: unknown) =>
      toast.error(e instanceof DocUploadError ? e.message : "Erreur lors de l'import de la fiche"),
  });
}

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DocPatch }) => updateDoc(id, patch),
    onSuccess: () => invalidateDocs(qc),
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

/** Archive / désarchive une famille (origine + variantes). */
export function useArchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ originId, archived }: { originId: string; archived: boolean }) => setFamilyArchived(originId, archived),
    onSuccess: (_d, v) => {
      void invalidateDocs(qc);
      toast.success(v.archived ? "Fiche archivée" : "Fiche désarchivée");
    },
    onError: () => toast.error("Erreur lors de l'archivage"),
  });
}

/** « Remplacer partout » : nouveau fichier sur la même ligne, ancien objet supprimé. */
export function useReplaceDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc, file }: { doc: Doc; file: File }) => replaceDocFile(doc, await prepareDocFile(file)),
    onSuccess: () => {
      void invalidateDocs(qc);
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
    mutationFn: (doc: Doc) => deleteDoc(doc),
    onSuccess: (_d, doc) => {
      void invalidateDocs(qc, doc.athlete_id);
      toast.success("Fichier supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

/** Attribution manuelle (avec note coach optionnelle). */
export function useAssignDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assignDoc,
    onSuccess: (_d, v) => {
      void invalidateDocs(qc, v.athleteId);
      toast.success("Fiche attribuée");
    },
    onError: () => toast.error("Erreur lors de l'attribution"),
  });
}

export function useUnassignDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, athleteId }: { docId: string; athleteId: string }) => unassignDoc(docId, athleteId),
    onSuccess: (_d, v) => invalidateDocs(qc, v.athleteId),
    onError: () => toast.error("Erreur lors du retrait"),
  });
}

/** Athlète : marque la fiche comme vue (RPC, seule écriture autorisée sur doc_assignments). */
export function useMarkDocSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markDocSeen,
    onSuccess: () => invalidateDocs(qc),
  });
}
