import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { calBaseKey } from "@/features/shared/hooks/useUnifiedCalendar";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useUpsertExerciseComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workoutLogId,
      exerciseId,
      exerciseName,
      comment,
    }: {
      workoutLogId: string;
      exerciseId: string | null;
      exerciseName: string;
      comment: string;
    }) => {
      const { data, error } = await db
        .from("workout_exercise_comments")
        .upsert({
          workout_log_id: workoutLogId,
          exercise_id: exerciseId,
          exercise_name: exerciseName,
          comment,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.weeklyRetours() });
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
    mutationFn: async (commentId: string) => {
      const { error } = await db
        .from("workout_exercise_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.weeklyRetours() });
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
    mutationFn: async ({
      competitionId,
      athleteComment,
    }: {
      competitionId: string;
      athleteComment: string;
    }) => {
      const { data, error } = await db
        .from("competitions")
        .update({ athlete_comment: athleteComment })
        .eq("id", competitionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: { athlete_id: string }) => {
      queryClient.invalidateQueries({ queryKey: QK.weeklyRetours() });
      queryClient.invalidateQueries({ queryKey: QK.competitions() });
      // Le bilan s'affiche aussi sur le jour de compétition (semaine / Programme)
      queryClient.invalidateQueries({ queryKey: QK.activePlan(data.athlete_id) });
      queryClient.invalidateQueries({ queryKey: calBaseKey(data.athlete_id) });
      toast.success("Bilan enregistré");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });
}
