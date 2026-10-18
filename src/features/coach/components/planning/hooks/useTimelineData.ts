import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ── Re-export shared types so drawers import from one place ──────────────────

export interface Macrocycle {
  id: string; athlete_id: string; coach_id: string;
  name: string; start_date: string; end_date: string; objective?: string | null;
}
export interface Mesocycle {
  id: string; macrocycle_id: string;
  name: string; start_date: string; end_date: string;
  objective?: string | null;
  volume_config?: { type?: string; weeks?: number[] } | null;
  intensity_config?: { zones?: string[]; distribution?: number[] } | null;
  frequency?: number | null; deload_week?: number | null;
}
export interface Cycle {
  id: string; mesocycle_id: string | null;
  athlete_id?: string; coach_id?: string;
  name: string; start_date: string; end_date: string;
  objective?: string | null;
}
export interface Microcycle {
  id: string; cycle_id: string;
  week_number: number; start_date: string; end_date: string; is_deload: boolean;
}
export interface Competition {
  id: string; name: string; date: string;
  priority?: string | null; location?: string | null; notes?: string | null;
  athlete_comment?: string | null;
  coach_id?: string; athlete_id?: string;
  type?: string | null; season_id?: string | null;
}
export interface TLTestSession {
  id: string; title: string; date: string; type: string; completed: boolean;
}
export interface TestResult {
  id: string; test_id: string; value: number; test_date: string; notes?: string | null;
  test?: { name: string; unit?: string | null; higher_is_better: boolean } | null;
}

export interface TimelineData {
  macrocycles:  Macrocycle[];
  mesocycles:   Mesocycle[];
  cycles:       Cycle[];
  microcycles:  Microcycle[];
  competitions: Competition[];
  tests:        TLTestSession[];
}

// ── Main query ────────────────────────────────────────────────────────────────

export function useTimelineData(athleteId: string, range: { start: Date; end: Date }) {
  const start = format(range.start, "yyyy-MM-dd");
  const end   = format(range.end,   "yyyy-MM-dd");

  return useQuery({
    queryKey: ["timeline-data", athleteId, start, end],
    enabled:  !!athleteId,
    staleTime: 60_000,
    queryFn: async (): Promise<TimelineData> => {
      const [macroRes, compRes, testRes] = await Promise.all([
        supabase.from("macrocycles").select("*").eq("athlete_id", athleteId)
          .or(`start_date.lte.${end},end_date.gte.${start}`).order("start_date"),
        supabase.from("competitions").select("id,name,date,priority,location,notes,athlete_comment")
          .eq("athlete_id", athleteId).gte("date", start).lte("date", end).order("date"),
        supabase.from("test_sessions").select("id,title,date,type,completed")
          .eq("athlete_id", athleteId).gte("date", start).lte("date", end).order("date"),
      ]);

      const macros   = (macroRes.data ?? []) as Macrocycle[];
      const macroIds = macros.map((m) => m.id);

      let mesos:  Mesocycle[]  = [];
      let cycles: Cycle[]      = [];
      let micros: Microcycle[] = [];

      if (macroIds.length > 0) {
        const mesoRes = await supabase.from("mesocycles").select("*")
          .in("macrocycle_id", macroIds).order("start_date");
        mesos = (mesoRes.data ?? []) as Mesocycle[];
        const mesoIds = mesos.map((m) => m.id);

        if (mesoIds.length > 0) {
          const cycleRes = await supabase.from("cycles").select("*")
            .in("mesocycle_id", mesoIds).order("start_date");
          cycles = (cycleRes.data ?? []) as Cycle[];
          const cycleIds = cycles.map((c) => c.id);

          if (cycleIds.length > 0) {
            const microRes = await supabase.from("microcycles").select("*")
              .in("cycle_id", cycleIds).order("start_date");
            micros = (microRes.data ?? []) as Microcycle[];
          }
        }
      }

      // Cycles standalone (sans mésocycle parent)
      const saRes = await supabase.from("cycles").select("*")
        .eq("athlete_id", athleteId)
        .is("mesocycle_id", null)
        .or(`start_date.lte.${end},end_date.gte.${start}`)
        .order("start_date");
      const standaloneCycles = (saRes.data ?? []) as Cycle[];
      const saIds = standaloneCycles.map((c) => c.id);

      let standaloneMicros: Microcycle[] = [];
      if (saIds.length > 0) {
        const smRes = await supabase.from("microcycles").select("*")
          .in("cycle_id", saIds).order("start_date");
        standaloneMicros = (smRes.data ?? []) as Microcycle[];
      }

      return {
        macrocycles:  macros,
        mesocycles:   mesos,
        cycles:       [...cycles, ...standaloneCycles],
        microcycles:  [...micros, ...standaloneMicros],
        competitions: (compRes.data ?? []) as Competition[],
        tests:        (testRes.data ?? []) as TLTestSession[],
      };
    },
  });
}

// ── Test results for macro drawer ─────────────────────────────────────────────

export function useTestResults(athleteId: string, macrocycleId: string) {
  return useQuery({
    queryKey: ["test-results", athleteId, macrocycleId],
    enabled:  !!athleteId && !!macrocycleId,
    staleTime: 120_000,
    queryFn: async (): Promise<TestResult[]> => {
      const { data } = await supabase
        .from("test_results")
        .select("id, test_id, value, test_date, notes, test:tests(name, unit, higher_is_better)")
        .eq("athlete_id", athleteId)
        .eq("macrocycle_id", macrocycleId)
        .order("test_date");
      return (data ?? []) as unknown as TestResult[];
    },
  });
}

// ── Microcycle day data ───────────────────────────────────────────────────────

export interface WorkoutDayData {
  id: string; session_name: string; status: string; rpe: number | null;
}

export function useMicrocycleDays(
  athleteId: string,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: ["micro-days", athleteId, startDate, endDate],
    enabled:  !!athleteId && !!startDate,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, WorkoutDayData[]>> => {
      const { data } = await supabase
        .from("workout_logs")
        .select("id, session_name, status, scheduled_date, workout_rpe(rpe_score)")
        .eq("athlete_id", athleteId)
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate)
        .order("scheduled_date");

      const byDate: Record<string, WorkoutDayData[]> = {};
      for (const w of data ?? []) {
        const d = w.scheduled_date;
        const rpe = Array.isArray(w.workout_rpe) && w.workout_rpe.length > 0
          ? (w.workout_rpe[0] as { rpe_score: number }).rpe_score
          : null;
        (byDate[d] ??= []).push({ id: w.id, session_name: w.session_name, status: w.status, rpe });
      }
      return byDate;
    },
  });
}
