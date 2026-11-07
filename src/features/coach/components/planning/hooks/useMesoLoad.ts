import { useQuery } from "@tanstack/react-query";
import { listWorkoutLogs } from "@/api/workouts";
import type { SummaryMesocycle } from "./usePlanningSummary";

export interface WeekLoad {
  week: string;   // "S1", "S2", ...
  load: number;
}

export function useMesoLoad(meso: SummaryMesocycle, athleteId: string) {
  return useQuery<WeekLoad[]>({
    queryKey: ["meso-load", meso.id, athleteId],
    enabled: !!meso.id && !!athleteId,
    staleTime: 300_000,
    queryFn: async () => {
      // Fetch all workout_logs + RPE for this meso date range
      const data = await listWorkoutLogs({
        athleteIds: [athleteId], from: meso.start_date, to: meso.end_date, withMods: false,
      });

      // Bucket by microcycle week_number using meso.cycles > microcycles
      const allMicros = meso.cycles.flatMap((c) => c.microcycles);

      if (allMicros.length === 0) {
        // Fallback: synthetic from volume_config
        return buildSynthetic(meso);
      }

      const weekMap: Record<string, { completed: number; rpe: number[] }> = {};
      for (const micro of allMicros) {
        weekMap[micro.id] = { completed: 0, rpe: [] };
      }

      for (const log of data) {
        // Find which microcycle this date falls into
        const micro = allMicros.find(
          (m) => log.scheduled_date >= m.start_date && log.scheduled_date <= m.end_date,
        );
        if (!micro) continue;
        const bucket = weekMap[micro.id];
        if (!bucket) continue;
        if (log.status === "completed") {
          bucket.completed++;
          if (log.rpe_score != null) bucket.rpe.push(log.rpe_score);
        }
      }

      return allMicros.map((micro, i) => {
        const b = weekMap[micro.id] ?? { completed: 0, rpe: [] };
        const avgRpe = b.rpe.length > 0 ? b.rpe.reduce((s, v) => s + v, 0) / b.rpe.length : 5;
        // load = sessions × avgRpe (normalized to ~100 scale)
        const load = Math.round(b.completed * avgRpe * 10);
        return { week: `S${micro.week_number ?? i + 1}`, load };
      });
    },
  });
}

function buildSynthetic(meso: SummaryMesocycle): WeekLoad[] {
  const type = meso.volume_config?.type ?? "progressive";
  const weeks = meso.volume_config?.weeks;
  if (weeks?.length) {
    return weeks.map((v, i) => ({ week: `S${i + 1}`, load: v }));
  }
  // Generate 4 weeks from type
  const count = 4;
  const deload = meso.deload_week ?? 0;
  const base = 60;
  return Array.from({ length: count }, (_, i) => {
    const w = i + 1;
    const isDeload = w === deload;
    let load = base;
    if (isDeload) { load = 40; }
    else if (type === "progressive") { load = base + i * 10; }
    else if (type === "ondulant")    { load = base + (i % 2 === 0 ? 0 : 15); }
    else if (type === "polarize")    { load = i % 2 === 0 ? 45 : 90; }
    return { week: `S${w}`, load: Math.round(load) };
  });
}
