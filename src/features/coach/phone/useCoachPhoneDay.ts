import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listWorkoutLogs, type WorkoutLog } from "@/api/workouts";
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";

/**
 * Séances d'un jour pour tous les athlètes suivis (accueil coach téléphone,
 * rubrique « Hier »). Préfixe "coachDashboard" : rafraîchi par
 * `invalidateWorkouts`, comme le reste de l'accueil.
 */
export function useCoachDayWorkouts(day: IsoDay) {
  const { athletes, user } = useAuth();
  const ids = useMemo(() => athletes.map((a) => a.id), [athletes]);
  return useQuery<WorkoutLog[]>({
    queryKey: ["coachDashboard", "day", user?.id ?? "", day, ids.join(",")],
    enabled: !!user && ids.length > 0,
    staleTime: 60_000,
    queryFn: () => listWorkoutLogs({ athleteIds: ids, from: day, to: day, withMods: false }),
  });
}

export const yesterdayIso = (): IsoDay => addDays(localIsoDay(), -1);
