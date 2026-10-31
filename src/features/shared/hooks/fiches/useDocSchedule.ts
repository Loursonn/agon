/**
 * Fiches posées sur un jour du planning (table doc_schedule).
 * Lues par l'athlète, son coach et le staff (fiches: read) ; posées par un
 * pro (fiches: write) ou le coach. La RLS tranche, ces hooks ne filtrent pas.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Doc } from "@/features/shared/types/fiches";

export interface ScheduledDoc {
  id: string;
  doc_id: string;
  athlete_id: string;
  date: string;
  added_by: string | null;
  note: string | null;
  doc: Pick<Doc, "id" | "title" | "category" | "file_path" | "mime_type" | "coach_id" | "uploaded_by"> | null;
}

export const docScheduleKey = (athleteId: string) => ["doc-schedule", athleteId] as const;

export function useDocSchedule(athleteId: string | null | undefined, range: { start: string; end: string }) {
  return useQuery<ScheduledDoc[]>({
    queryKey: [...docScheduleKey(athleteId ?? ""), range.start, range.end],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_schedule")
        .select("id, doc_id, athlete_id, date, added_by, note, doc:docs(id, title, category, file_path, mime_type, coach_id, uploaded_by)")
        .eq("athlete_id", athleteId!)
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledDoc[];
    },
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
    mutationFn: async (vars: { docId: string; dates: string[]; note?: string }) => {
      const { data, error } = await supabase.rpc("schedule_doc", {
        p_athlete: athleteId,
        p_doc: vars.docId,
        p_dates: vars.dates,
        p_note: vars.note ?? undefined,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docScheduleKey(athleteId) });
      qc.invalidateQueries({ queryKey: ["docs"] });
    },
  });
}

export function useUnscheduleDoc(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("doc_schedule").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Tu ne peux pas retirer cette fiche");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: docScheduleKey(athleteId) }),
  });
}
