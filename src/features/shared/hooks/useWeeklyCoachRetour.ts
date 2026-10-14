import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RetourReaction = "like" | "strong" | "fire" | "heart";

export const RETOUR_REACTIONS: { key: RetourReaction; emoji: string; label: string }[] = [
  { key: "like",   emoji: "👍", label: "Bien reçu" },
  { key: "strong", emoji: "💪", label: "Motivé" },
  { key: "fire",   emoji: "🔥", label: "Chaud" },
  { key: "heart",  emoji: "❤️", label: "Merci" },
];

export function reactionEmoji(r: string | null | undefined): string | null {
  return RETOUR_REACTIONS.find((x) => x.key === r)?.emoji ?? null;
}

export interface WeeklyRetour {
  id: string;
  athlete_id: string;
  coach_id: string;
  week_start: string;
  comment: string;
  created_at: string;
  updated_at: string;
  /** Réaction de l'athlète = retour vu. Remise à null quand le coach modifie son retour. */
  athlete_reaction: RetourReaction | null;
  reacted_at: string | null;
}

export function useWeeklyCoachRetour(athleteId: string | undefined, weekStart: string | undefined) {
  return useQuery<WeeklyRetour | null>({
    queryKey: ["weekly-retour", athleteId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_retours")
        .select("*")
        .eq("athlete_id", athleteId!)
        .eq("week_start", weekStart!)
        .maybeSingle();
      if (error) throw error;
      return data as WeeklyRetour | null;
    },
    enabled: !!athleteId && !!weekStart,
    staleTime: 60_000,
  });
}

/** Tous les retours de l'athlète, du plus récent au plus ancien. */
export function useAthleteRetours(athleteId: string | undefined) {
  return useQuery<WeeklyRetour[]>({
    queryKey: ["weekly-retours", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_retours")
        .select("*")
        .eq("athlete_id", athleteId!)
        .neq("comment", "")
        .order("week_start", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as WeeklyRetour[];
    },
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

export function useReactWeeklyRetour() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ retourId, reaction }: { retourId: string; athleteId: string; reaction: RetourReaction }) => {
      const { error } = await supabase.rpc("react_weekly_retour" as never, {
        p_retour_id: retourId,
        p_reaction: reaction,
      } as never);
      if (error) throw error;
    },
    onMutate: async ({ retourId, athleteId, reaction }) => {
      await qc.cancelQueries({ queryKey: ["weekly-retours", athleteId] });
      const prev = qc.getQueryData<WeeklyRetour[]>(["weekly-retours", athleteId]);
      qc.setQueryData<WeeklyRetour[]>(["weekly-retours", athleteId], (old = []) =>
        old.map((r) => (r.id === retourId ? { ...r, athlete_reaction: reaction, reacted_at: new Date().toISOString() } : r)),
      );
      return { prev };
    },
    onError: (_err, vars, ctx) => {
      qc.setQueryData(["weekly-retours", vars.athleteId], ctx?.prev);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-retours", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["weekly-retour", vars.athleteId] });
    },
  });
}

export function useUpsertWeeklyRetour() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      athleteId,
      coachId,
      weekStart,
      comment,
    }: {
      athleteId: string;
      coachId: string;
      weekStart: string;
      comment: string;
    }) => {
      const { data, error } = await supabase
        .from("weekly_retours")
        .upsert(
          {
            athlete_id: athleteId,
            coach_id: coachId,
            week_start: weekStart,
            comment,
            updated_at: new Date().toISOString(),
            // Retour modifié → l'athlète doit le revoir sur son accueil
            athlete_reaction: null,
            reacted_at: null,
          } as never,
          { onConflict: "athlete_id,week_start" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as WeeklyRetour;
    },
    onSuccess: (data) => {
      qc.setQueryData(["weekly-retour", data.athlete_id, data.week_start], data);
      qc.invalidateQueries({ queryKey: ["weekly-retours", data.athlete_id] });
    },
  });
}
