import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteExerciseComment, invalidateCoachRetours, upsertExerciseComment } from "@/api/coachRetours";
import { invalidateCompetitions, setCompetitionComment } from "@/api/competitions";
import { QK } from "@/lib/queryKeys";

export function useUpsertExerciseComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertExerciseComment,
    onSuccess: () => {
      void invalidateCoachRetours(queryClient);
      toast.success("Commentaire enregistré");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement du commentaire");
    },
  });
}

export function useDeleteExerciseComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteExerciseComment,
    onSuccess: () => {
      void invalidateCoachRetours(queryClient);
      toast.success("Commentaire supprimé");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });
}

export function useUpdateCompetitionComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ competitionId, athleteComment }: { competitionId: string; athleteComment: string }) =>
      setCompetitionComment(competitionId, athleteComment),
    onSuccess: (data) => {
      // Le bilan s'affiche dans les Retours et sur le jour de compétition (semaine / Programme).
      queryClient.invalidateQueries({ queryKey: QK.weeklyRetours() });
      void invalidateCompetitions(queryClient, data.athlete_id);
      toast.success("Bilan enregistré");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });
}
