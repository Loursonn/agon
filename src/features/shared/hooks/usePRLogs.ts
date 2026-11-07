/**
 * Records / 1RM (`exercise_pr_logs`) — adaptateurs React Query de
 * `src/api/records.ts`.
 *
 * source = 'manual'   → saisi par le coach ou l'athlète
 * source = 'computed' → calculé depuis une séance (Epley, arrondi 0,5 kg)
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addRecord,
  deleteRecord,
  getRecordLinks,
  getRecords,
  groupRecords,
  invalidateRecords,
  recordKeys,
  type NewRecord,
  type PRLog,
} from "@/api/records";

export type { PRLog } from "@/api/records";

export function usePRLogs(athleteId: string | undefined) {
  return useQuery({
    queryKey: recordKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => getRecords(athleteId!),
  });
}

/** Records groupés par référence (`rm_ref` ou nom de l'exercice) + le meilleur de chacune. */
export function usePRsByRef(athleteId: string | undefined) {
  const { data: all, ...rest } = usePRLogs(athleteId);
  const grouped = useMemo(() => groupRecords(all ?? ([] as PRLog[])), [all]);
  return { ...grouped, ...rest };
}

/** Liens « exercice → record » posés par le coach (rm_ref). */
export function useRecordLinks(athleteId: string | undefined) {
  return useQuery({
    queryKey: recordKeys.links(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: () => getRecordLinks(athleteId!),
  });
}

export function useAddPRLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewRecord) => addRecord(payload),
    onSuccess: (_, payload) => {
      if (payload.source !== "computed") toast.success("Record enregistré");
    },
    onError: (err: Error) => toast.error("Erreur : " + err.message),
    onSettled: (_r, _e, payload) => invalidateRecords(qc, payload.athleteId),
  });
}

export function useDeletePRLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; athleteId: string }) => deleteRecord(id),
    onSuccess: () => toast.success("Record supprimé"),
    onError: (err: Error) => toast.error("Erreur : " + err.message),
    onSettled: (_r, _e, { athleteId }) => invalidateRecords(qc, athleteId),
  });
}
