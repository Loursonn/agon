import { STALE_SLOW_MS } from "@/lib/queryCache";
import { useQuery } from "@tanstack/react-query";
import { exerciseKeys, getExerciseVideos } from "@/api/exercises";

/** Map exercise_id → youtube_id pour les exercices de la banque ayant une vidéo. */
export function useExerciseVideos(exerciseIds: string[]) {
  const key = [...exerciseIds].sort().join(",");
  return useQuery<Record<string, string>>({
    queryKey: exerciseKeys.videos(key),
    enabled: exerciseIds.length > 0,
    staleTime: STALE_SLOW_MS,
    queryFn: () => getExerciseVideos(exerciseIds),
  });
}
