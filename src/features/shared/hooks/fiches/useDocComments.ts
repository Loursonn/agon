/**
 * Module Fiches — fil de commentaires d'une fiche, propre à un athlète.
 * Image optionnelle compressée (WebP) stockée dans le bucket privé 'docs'.
 * Adaptateurs de `src/api/docs.ts`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addDocComment, deleteDocComment, docsKeys, invalidateDocs, listAthleteDocComments, listDocComments,
  type AddDocCommentInput,
} from "@/api/docs";
import { compressFicheImage } from "@/lib/compressImage";
import type { DocComment } from "../../types/fiches";

export type { AddDocCommentInput } from "@/api/docs";

export function useDocComments(docId: string | undefined | null, athleteId: string | undefined | null) {
  return useQuery<DocComment[]>({
    queryKey: docsKeys.comments(docId ?? "", athleteId ?? ""),
    enabled: !!docId && !!athleteId,
    staleTime: 15_000,
    queryFn: () => listDocComments(docId!, athleteId!),
  });
}

export function useAddDocComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ image, ...rest }: AddDocCommentInput) => {
      if (image && !image.type.startsWith("image/")) throw new Error("Image uniquement");
      return addDocComment({ ...rest, image: image ? await compressFicheImage(image) : null });
    },
    onSuccess: (_d, v) => invalidateDocs(qc, v.athleteId),
    onError: () => toast.error("Erreur lors de l'envoi du commentaire"),
  });
}

export function useDeleteDocComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: DocComment) => deleteDocComment(c),
    onSuccess: (_d, c) => invalidateDocs(qc, c.athlete_id),
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

/** Coach : derniers commentaires d'un athlète, toutes fiches confondues. */
export function useAthleteDocComments(athleteId: string | undefined | null, limit = 30) {
  return useQuery<DocComment[]>({
    queryKey: docsKeys.athleteComments(athleteId ?? "", limit),
    enabled: !!athleteId,
    staleTime: 15_000,
    queryFn: () => listAthleteDocComments(athleteId!, limit),
  });
}
