import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { appContentKeys, listRecentActivity } from "@/api/appContent";

export type ActivityType = "session" | "wellness" | "pr";

export interface ActivityItem {
  id: string;
  athleteId: string;
  athleteName: string;
  type: ActivityType;
  label: string;
  updatedAt: Date;
}

/**
 * Derniers événements des athlètes du coach (séance validée, wellness rempli),
 * un par athlète et par type (`src/api/appContent.ts`).
 */
export function useRecentActivity(limit = 10) {
  const { athletes, user } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const query = useQuery({
    queryKey: appContentKeys.recentActivity(user?.id, limit),
    queryFn: () => listRecentActivity(athleteIds, limit),
    enabled: athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const activities = useMemo<ActivityItem[]>(() => {
    return (query.data ?? []).flatMap((r) => {
      const athlete = athletes.find((a) => a.id === r.athleteId);
      if (!athlete) return [];
      const label =
        r.type === "session"
          ? `${athlete.full_name} a enregistré une séance`
          : `${athlete.full_name} a rempli son bilan wellness`;
      return [{
        id:          `${r.athleteId}_${r.type}`,
        athleteId:   r.athleteId,
        athleteName: athlete.full_name,
        type:        r.type,
        label,
        updatedAt:   new Date(r.at),
      }];
    });
  }, [query.data, athletes]);

  return { activities, isLoading: query.isLoading };
}
