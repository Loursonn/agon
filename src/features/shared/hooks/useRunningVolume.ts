import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FreeSession } from "@/features/shared/types/athlete";
import { RUNNING_WEEKS, addDays, computeRunningVolume, iso, mondayOf, type RunEntry } from "@/lib/runningVolume";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export { RUNNING_WEEKS, computeRunningVolume } from "@/lib/runningVolume";
export type { RunningVolume, RunningWeek, RunEntry } from "@/lib/runningVolume";

export const runningVolumeKey = (athleteId: string) => ["runningVolume", athleteId] as const;

/**
 * Volume de course à pied : séances énergie/spécifique validées en « Course »
 * (distance réalisée), km courus en séance de muscu, activités libres « Course ».
 */
export function useRunningVolume(
  athleteId: string | undefined,
  freeSessions: FreeSession[] = [],
  /** Début de l'historique chargé (défaut : début des RUNNING_WEEKS semaines) */
  fromISO?: string,
) {
  const defaultFrom = iso(addDays(mondayOf(new Date()), -7 * (RUNNING_WEEKS - 1)));
  const from = fromISO && fromISO < defaultFrom ? fromISO : defaultFrom;

  const { data: dbRuns = [], isLoading } = useQuery<RunEntry[]>({
    queryKey: [...runningVolumeKey(athleteId ?? ""), from],
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const [energy, workouts] = await Promise.all([
        db.from("energy_session_assignments")
          .select("scheduled_date, distance_km")
          .eq("athlete_id", athleteId)
          .eq("activity_type", "course")
          .not("distance_km", "is", null)
          .gte("scheduled_date", from),
        db.from("workout_logs")
          .select("scheduled_date, run_distance_km")
          .eq("athlete_id", athleteId)
          .not("run_distance_km", "is", null)
          .gte("scheduled_date", from),
      ]);
      if (energy.error) throw energy.error;
      if (workouts.error) throw workouts.error;
      return [
        ...(energy.data ?? []).map((r: { scheduled_date: string; distance_km: number }) => ({ date: r.scheduled_date, km: Number(r.distance_km) })),
        ...(workouts.data ?? []).map((r: { scheduled_date: string; run_distance_km: number }) => ({ date: r.scheduled_date, km: Number(r.run_distance_km) })),
      ];
    },
  });

  const runs = useMemo(() => {
    const free = freeSessions
      .filter((f) => f.sport === "course" && f.date && f.distance_km && f.date >= from)
      .map((f) => ({ date: f.date as string, km: Number(f.distance_km) }));
    return [...dbRuns, ...free];
  }, [dbRuns, freeSessions, from]);

  const volume = useMemo(() => computeRunningVolume(runs), [runs]);

  /** Km courus entre deux dates incluses (yyyy-MM-dd) */
  const kmBetween = (start: string, end: string) =>
    Math.round(runs.reduce((s, r) => (r.date >= start && r.date <= end ? s + r.km : s), 0) * 10) / 10;

  return { volume, runs, kmBetween, isLoading };
}
