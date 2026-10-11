import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface WeeklyRetour {
  id: string;
  athlete_id: string;
  coach_id: string;
  week_start: string;
  comment: string;
  created_at: string;
  updated_at: string;
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
          },
          { onConflict: "athlete_id,week_start" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as WeeklyRetour;
    },
    onSuccess: (data) => {
      qc.setQueryData(["weekly-retour", data.athlete_id, data.week_start], data);
    },
  });
}
