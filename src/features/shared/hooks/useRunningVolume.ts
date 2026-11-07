import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { FreeSession } from "@/features/shared/types/athlete";
import { RUNNING_WEEKS, addDays, computeRunningVolume, iso, mondayOf } from "@/lib/runningVolume";
import {
  buildRunLedger,
  summarizeKm,
  type PlannedSessionInput,
  type RunMatch,
  type StrengthRunInput,
  type WatchActivityInput,
} from "@/lib/watchRunMatching";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export { RUNNING_WEEKS, computeRunningVolume } from "@/lib/runningVolume";
export type { RunningVolume, RunningWeek, RunEntry } from "@/lib/runningVolume";
export type { RunMatch } from "@/lib/watchRunMatching";

export const runningVolumeKey = (athleteId: string) => ["runningVolume", athleteId] as const;

/** `numeric` de PostgreSQL arrive en chaîne via PostgREST. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

interface ManualRuns {
  planned: PlannedSessionInput[];
  strength: StrengthRunInput[];
}

interface AssignmentRow {
  id: string;
  scheduled_date: string;
  status: string | null;
  activity_type: string | null;
  distance_km: number | string | null;
  actual_duration_min: number | null;
  energy_sessions: {
    name: string | null;
    session_kind: string | null;
    total_distance_m: number | string | null;
    total_duration_s: number | null;
  } | null;
}

interface ActivityRow {
  id: string;
  source: string;
  started_at: string;
  local_date: string;
  sport: string | null;
  distance_m: number | string | null;
  duration_s: number | null;
  device_name?: string | null;
}

/**
 * Volume de course à pied — la seule source de ces km dans l'app.
 *
 * Lit les sorties de montre / fichiers importés, les séances énergie et
 * spécifiques (prévues et validées), les km courus en séance de muscu et les
 * activités libres « course », puis délègue à `buildRunLedger` le rattachement
 * des sorties aux séances prévues et le dédoublonnage. Le volume de l'athlète,
 * celui de la fiche coach, les km des retours et l'indication « réalisée —
 * montre » lisent tous ce hook : un seul calcul.
 *
 * Les sorties sont lues avec la même requête pour l'athlète et pour son coach ;
 * c'est la base (RLS) qui décide ce que le coach voit. Si elle ne rend rien, le
 * volume retombe sur la saisie manuelle, comme avant.
 */
export function useRunningVolume(
  athleteId: string | undefined,
  freeSessions: FreeSession[] = [],
  /** Début de l'historique chargé (défaut : début des RUNNING_WEEKS semaines) */
  fromISO?: string,
) {
  const defaultFrom = iso(addDays(mondayOf(new Date()), -7 * (RUNNING_WEEKS - 1)));
  const from = fromISO && fromISO < defaultFrom ? fromISO : defaultFrom;

  const manual = useQuery<ManualRuns>({
    queryKey: [...runningVolumeKey(athleteId ?? ""), from],
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const [energy, workouts] = await Promise.all([
        db.from("energy_session_assignments")
          .select("id, scheduled_date, status, activity_type, distance_km, actual_duration_min, energy_sessions(name, session_kind, total_distance_m, total_duration_s)")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", from),
        db.from("workout_logs")
          .select("scheduled_date, run_distance_km")
          .eq("athlete_id", athleteId)
          .not("run_distance_km", "is", null)
          .gte("scheduled_date", from),
      ]);
      if (energy.error) throw energy.error;
      if (workouts.error) throw workouts.error;
      return {
        planned: ((energy.data ?? []) as AssignmentRow[]).map((r) => ({
          id: r.id,
          date: r.scheduled_date,
          status: r.status,
          activityType: r.activity_type,
          sessionKind: r.energy_sessions?.session_kind ?? null,
          label: r.energy_sessions?.name ?? "Séance énergie",
          plannedDistanceM: num(r.energy_sessions?.total_distance_m),
          plannedDurationS: num(r.energy_sessions?.total_duration_s),
          manualKm: num(r.distance_km),
          manualDurationMin: num(r.actual_duration_min),
        })),
        strength: ((workouts.data ?? []) as { scheduled_date: string; run_distance_km: number | string }[])
          .map((r) => ({ date: r.scheduled_date, km: num(r.run_distance_km) ?? 0 })),
      };
    },
  });

  const watch = useQuery<WatchActivityInput[]>({
    queryKey: QK.providerRuns(athleteId ?? "", from),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("provider_activities")
        .select("id, source, started_at, local_date, sport, distance_m, duration_s, device_name")
        .eq("athlete_id", athleteId)
        .gte("local_date", from)
        .order("started_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as ActivityRow[]).map((r) => ({
        id: r.id,
        source: r.source,
        localDate: r.local_date,
        startedAt: r.started_at,
        sport: r.sport,
        distanceM: num(r.distance_m),
        durationS: num(r.duration_s),
        deviceName: r.device_name ?? null,
      }));
    },
  });

  const ledger = useMemo(() => {
    const free = freeSessions
      .filter((f) => f.date && f.date >= from)
      .map((f) => ({
        id: f.id,
        date: f.date as string,
        sport: f.sport ?? null,
        km: num(f.distance_km),
        durationMin: num(f.duration),
      }));
    return buildRunLedger({
      activities: watch.data ?? [],
      planned: manual.data?.planned ?? [],
      free,
      strength: manual.data?.strength ?? [],
    });
  }, [watch.data, manual.data, freeSessions, from]);

  const runs = ledger.entries;
  const volume = useMemo(() => computeRunningVolume(runs), [runs]);

  const { matchByPlanned, matchByActivity } = useMemo(() => {
    const byPlanned = new Map<string, RunMatch>();
    const byActivity = new Map<string, RunMatch>();
    for (const m of ledger.matches) {
      byPlanned.set(m.plannedId, m);
      byActivity.set(m.activityId, m);
    }
    return { matchByPlanned: byPlanned, matchByActivity: byActivity };
  }, [ledger.matches]);

  /** Km courus entre deux dates incluses (yyyy-MM-dd) */
  const kmBetween = (start: string, end: string) => summarizeKm(runs, start, end).km;
  /** Km et part montre entre deux dates incluses (yyyy-MM-dd) */
  const summaryBetween = (start: string, end: string) => summarizeKm(runs, start, end);

  return {
    volume,
    runs,
    kmBetween,
    summaryBetween,
    matchByPlanned,
    matchByActivity,
    isLoading: manual.isLoading || watch.isLoading,
  };
}
