import { useQuery } from "@tanstack/react-query";
import { listWorkoutLogs } from "@/api/workouts";
import { listEnergyAssignments } from "@/api/energy";
import { getWellnessHistory } from "@/api/wellness";
import { averageScore, wellnessEntries, wellnessScore } from "@shared/domain/wellness";

export interface MicroStats {
  completed: number;
  planned:   number;
  avg_rpe:   number | null;
  /** Score wellness moyen /100 sur la semaine (domaine wellness) ; null sans saisie. */
  avg_wellness: number | null;
}

export function useMicroStats(
  athleteId: string,
  startDate: string,
  endDate: string,
) {
  return useQuery<MicroStats>({
    queryKey: ["micro-stats", athleteId, startDate, endDate],
    enabled: !!athleteId && !!startDate,
    staleTime: 300_000,
    queryFn: async () => {
      const [logs, wellnessRes, energy] = await Promise.all([
        listWorkoutLogs({ athleteIds: [athleteId], from: startDate, to: endDate, withMods: false }),
        // Wellness : `wellness_logs` n'existe pas (toujours « — ») ; lu par
        // src/api/wellness (asp:wh + archive), même score que partout ailleurs.
        getWellnessHistory(athleteId, { from: startDate, to: endDate }),
        listEnergyAssignments({
          athleteIds: [athleteId], from: startDate, to: endDate, statuses: ["completed"], join: "none",
        }),
      ]);

      const completed = logs.filter((l) => l.status === "completed").length;
      const planned   = logs.length;

      // RPE : seule source `workout_logs.rpe_score` (l'embed workout_rpe arrivait
      // en objet, jamais en tableau : la moyenne restait vide).
      const muscuRpes = logs.flatMap((l) => (l.rpe_score != null ? [l.rpe_score] : []));
      const energyRpes = energy
        .map((e) => e.rpe_score)
        .filter((r): r is number => r != null);
      const allRpes = [...muscuRpes, ...energyRpes];
      const avg_rpe = allRpes.length > 0
        ? allRpes.reduce((s, v) => s + v, 0) / allRpes.length
        : null;

      const avg_wellness = averageScore(wellnessEntries(wellnessRes).map((e) => wellnessScore(e)));

      return { completed, planned, avg_rpe, avg_wellness };
    },
  });
}
