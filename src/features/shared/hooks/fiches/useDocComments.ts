/**
 * Module Fiches — fil de commentaires d'une fiche, propre à un athlète.
 * Image optionnelle compressée (WebP) stockée dans le bucket privé 'docs'.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { compressFicheImage } from "@/lib/compressImage";
import { commentImagePath, extFor } from "../../types/fiches";
import type { DocComment } from "../../types/fiches";

export function useDocComments(docId: string | undefined | null, athleteId: string | undefined | null) {
  return useQuery<DocComment[]>({
    queryKey: QK.docComments(docId ?? "", athleteId ?? ""),
    enabled: !!docId && !!athleteId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_comments")
        .select("*")
        .eq("doc_id", docId!)
        .eq("athlete_id", athleteId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocComment[];
    },
  });
}

export interface AddDocCommentInput {
  docId: string;
  athleteId: string;
  authorId: string;
  /** Coach propriétaire du dossier Storage de l'athlète */
  coachId: string;
  body: string;
  image?: File | null;
}

export function useAddDocComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, athleteId, authorId, coachId, body, image }: AddDocCommentInput) => {
      const id = crypto.randomUUID();
      let imagePath: string | null = null;
      if (image) {
        if (!image.type.startsWith("image/")) throw new Error("Image uniquement");
        const file = await compressFicheImage(image);
        imagePath = commentImagePath({ coachId, athleteId, commentId: id, ext: extFor(file.type, file.name) });
        const { error: upErr } = await supabase.storage
          .from("docs")
          .upload(imagePath, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("doc_comments").insert({
        id,
        doc_id: docId,
        athlete_id: athleteId,
        author_id: authorId,
        body: body.trim(),
        image_path: imagePath,
      });
      if (error) {
        if (imagePath) await supabase.storage.from("docs").remove([imagePath]);
        throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: QK.docComments(v.docId, v.athleteId) });
      qc.invalidateQueries({ queryKey: QK.docComments("all", v.athleteId) });
    },
    onError: () => toast.error("Erreur lors de l'envoi du commentaire"),
  });
}

export function useDeleteDocComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: DocComment) => {
      const { error } = await supabase.from("doc_comments").delete().eq("id", c.id);
      if (error) throw error;
      if (c.image_path) await supabase.storage.from("docs").remove([c.image_path]);
    },
    onSuccess: (_d, c) => {
      qc.invalidateQueries({ queryKey: QK.docComments(c.doc_id, c.athlete_id) });
      qc.invalidateQueries({ queryKey: QK.docComments("all", c.athlete_id) });
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

/** Coach : derniers commentaires d'un athlète, toutes fiches confondues. */
export function useAthleteDocComments(athleteId: string | undefined | null, limit = 30) {
  return useQuery<DocComment[]>({
    queryKey: [...QK.docComments("all", athleteId ?? ""), limit],
    enabled: !!athleteId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_comments")
        .select("*")
        .eq("athlete_id", athleteId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as DocComment[];
    },
  });
}
