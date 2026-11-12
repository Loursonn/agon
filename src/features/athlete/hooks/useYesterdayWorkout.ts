import { useQuery } from "@tanstack/react-query";
import { listWorkoutLogs, workoutKeys, type WorkoutListParams, type WorkoutLog } from "@/api/workouts";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { yesterdayWorkoutOf } from "@/lib/yesterdayWorkout";

/**
 * Séance réalisée la veille (carte « Séance d'hier » du wellness). null sans
 * séance faite ou commencée hier.
 */
export function useYesterdayWorkout(athleteId: string | null | undefined) {
  const day = addDays(localIsoDay(), -1);
  const params: WorkoutListParams = {
    athleteIds: athleteId ? [athleteId] : [],
    from: day,
    to: day,
    statuses: ["completed", "in_progress"],
  };
  return useQuery<WorkoutLog[], Error, ReturnType<typeof yesterdayWorkoutOf>>({
    queryKey: workoutKeys.list(params),
    queryFn: () => listWorkoutLogs(params),
    enabled: !!athleteId,
    select: yesterdayWorkoutOf,
  });
}
