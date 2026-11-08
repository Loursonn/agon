/**
 * useAppFeedback — retours des athlètes sur l'application (table app_feedback).
 * Athlète : envoie un bug / une idée. Coach certifié / admin : liste + statut.
 * Adaptateurs de `src/api/appContent.ts`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  appContentKeys, deleteAppFeedback, invalidateAppFeedback, listAppFeedback, sendAppFeedback, setAppFeedbackStatus,
  type AppFeedbackKind, type AppFeedbackRow, type AppFeedbackStatus,
} from "@/api/appContent";

export type { AppFeedbackKind, AppFeedbackRow, AppFeedbackStatus } from "@/api/appContent";

export const FEEDBACK_KIND_LABEL: Record<AppFeedbackKind, string> = { bug: "Bug", idea: "Idée", other: "Autre" };
export const FEEDBACK_STATUS_LABEL: Record<AppFeedbackStatus, string> = { new: "Nouveau", in_progress: "En cours", done: "Fait" };

export function useAppFeedbackList() {
  return useQuery<AppFeedbackRow[]>({
    queryKey: appContentKeys.appFeedbackList,
    staleTime: 30_000,
    queryFn: listAppFeedback,
  });
}

export function useSendAppFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { authorId: string; kind: AppFeedbackKind; content: string; page?: string }) =>
      sendAppFeedback({
        ...input,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      }),
    onSuccess: () => invalidateAppFeedback(qc),
  });
}

export function useUpdateAppFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppFeedbackStatus }) => setAppFeedbackStatus(id, status),
    onSuccess: () => invalidateAppFeedback(qc),
  });
}

export function useDeleteAppFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAppFeedback,
    onSuccess: () => invalidateAppFeedback(qc),
  });
}
