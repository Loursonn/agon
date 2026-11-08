import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appContentKeys, appendUserFeedback, getCoachFeedbacks, listUserFeedback } from "@/api/appContent";
import type { CoachFeedbacks, AppFeedbackEntry } from "../types/athlete";

export function useFeedbacks(athleteId: string) {
  const qc = useQueryClient();

  const { data: coachFeedbacks = {} } = useQuery<CoachFeedbacks>({
    queryKey: appContentKeys.coachFeedback(athleteId),
    queryFn: () => getCoachFeedbacks(athleteId),
    staleTime: 30_000,
  });

  const { data: appFeedbacks = [] } = useQuery<AppFeedbackEntry[]>({
    queryKey: appContentKeys.userFeedback(athleteId),
    queryFn: () => listUserFeedback(athleteId),
    staleTime: 60_000,
  });

  const addFeedbackMutation = useMutation({
    // Relit la liste en base avant d'ajouter : jamais la copie en mémoire.
    mutationFn: (entry: AppFeedbackEntry) => appendUserFeedback(athleteId, entry),
    onMutate: async (entry) => {
      await qc.cancelQueries({ queryKey: appContentKeys.userFeedback(athleteId) });
      const previous = qc.getQueryData<AppFeedbackEntry[]>(appContentKeys.userFeedback(athleteId));
      qc.setQueryData(appContentKeys.userFeedback(athleteId), (old: AppFeedbackEntry[] = []) => [...old, entry]);
      return { previous };
    },
    onSuccess: (newList) => {
      qc.setQueryData(appContentKeys.userFeedback(athleteId), newList);
    },
    onError: (_err, _entry, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(appContentKeys.userFeedback(athleteId), ctx.previous);
      }
    },
  });

  return { coachFeedbacks, appFeedbacks, addAppFeedback: addFeedbackMutation.mutateAsync };
}
