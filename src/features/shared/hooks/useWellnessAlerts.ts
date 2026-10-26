/**
 * Alertes wellness du coach : les athlètes dont la dernière saisie s'écarte de
 * leur propre habitude (cf. `src/lib/wellnessBaseline.ts`).
 *
 * Remplace l'ancien `useOverloadedAthletes`, qui testait `fatigue > 7` sur une
 * échelle de 1 à 5 (condition morte) et `sommeil < 5` (vrai presque tous les
 * jours). Ici, le seuil est propre à chaque athlète.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { localISO } from "@/lib/date";
import { QK } from "@/lib/queryKeys";
import { assessWellness, type WellnessAssessment } from "@/lib/wellnessBaseline";
import type { WellnessData } from "../types/athlete";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface WellnessAlert {
  athleteId: string;
  athleteName: string;
  assessment: WellnessAssessment;
}

/** Rouge avant orange, puis l'écart le plus marqué en premier. */
function severity(a: WellnessAlert): number {
  const rank = a.assessment.level === "alerte" ? 0 : 1;
  const worst = a.assessment.deviations[0]?.z ?? 0;
  return rank * 1000 + worst;
}

/**
 * Athlètes en vigilance ou en alerte, les plus critiques d'abord.
 * Les saisies sont lues en un seul appel (clé `asp:wh` de `app_data`).
 */
export function useWellnessAlerts() {
  const { athletes, user } = useAuth();
  const today = localISO(new Date());
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const query = useQuery({
    queryKey: QK.coachDashboard.wellnessAlerts(user?.id ?? "", today),
    enabled: athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await db
        .from("app_data")
        .select("athlete_id, value")
        .in("athlete_id", athleteIds)
        .eq("key", "asp:wh");
      if (error) throw error;
      return (data ?? []) as { athlete_id: string; value: Record<string, WellnessData> }[];
    },
  });

  const alerts = useMemo<WellnessAlert[]>(() => {
    const nameById = new Map(athletes.map((a) => [a.id, a.full_name ?? "Athlète"]));
    return (query.data ?? [])
      .flatMap(({ athlete_id, value }) => {
        const name = nameById.get(athlete_id);
        if (!name) return [];
        const assessment = assessWellness(value, today);
        if (assessment.level === "none") return [];
        return [{ athleteId: athlete_id, athleteName: name, assessment }];
      })
      .sort((a, b) => severity(a) - severity(b));
  }, [query.data, athletes, today]);

  return { alerts, isLoading: query.isLoading };
}
