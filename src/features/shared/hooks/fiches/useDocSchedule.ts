/**
 * Fiches posées sur un jour du planning (table doc_schedule), adaptateurs de
 * `src/api/docs.ts`. Lues par l'athlète, son coach et le staff (fiches: read) ;
 * posées par un pro (fiches: write) ou le coach. La RLS tranche.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { docsKeys, invalidateDocs, listDocSchedule, scheduleDoc, unscheduleDoc, type ScheduledDoc } from "@/api/docs";

export type { ScheduledDoc } from "@/api/docs";

export const docScheduleKey = docsKeys.schedule;

export function useDocSchedule(athleteId: string | null | undefined, range: { start: string; end: string }) {
  return useQuery<ScheduledDoc[]>({
    queryKey: docsKeys.scheduleRange(athleteId ?? "", range.start, range.end),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => listDocSchedule(athleteId!, range),
  });
}

/** Regroupe par date (yyyy-MM-dd). */
export function groupScheduleByDate(rows: ScheduledDoc[]): Map<string, ScheduledDoc[]> {
  const m = new Map<string, ScheduledDoc[]>();
  for (const r of rows) {
    const arr = m.get(r.date) ?? [];
    arr.push(r);
    m.set(r.date, arr);
  }
  return m;
}

export function useScheduleDoc(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { docId: string; dates: string[]; note?: string }) => scheduleDoc({ athleteId, ...vars }),
    onSuccess: () => invalidateDocs(qc, athleteId),
  });
}

export function useUnscheduleDoc(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unscheduleDoc,
    onSuccess: () => invalidateDocs(qc, athleteId),
  });
}
