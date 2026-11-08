import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { listWorkoutLogs } from "@/api/workouts";
import { cycleKeys } from "@/api/cycles";
import { getTimeline, type TimelineData } from "@/api/planning";
import { listMacrocycleTestResults } from "@/api/tests";

// ── Types partagés (définis par la couche données) ───────────────────────────

export type { Macrocycle, Mesocycle, Cycle, Microcycle } from "@/api/cycles";
export type {
  TimelineCompetition as Competition,
  TimelineTestSession as TLTestSession,
  TimelineData,
} from "@/api/planning";
export type { MacrocycleTestResult as TestResult } from "@/api/tests";

export type Level = "macrocycles" | "mesocycles" | "cycles" | "microcycles";
export type AnyItem = TimelineData[Level][number];

// ── Main query ────────────────────────────────────────────────────────────────

export function useTimelineData(athleteId: string, range: { start: Date; end: Date }) {
  const start = format(range.start, "yyyy-MM-dd");
  const end   = format(range.end,   "yyyy-MM-dd");

  return useQuery({
    queryKey: cycleKeys.timeline(athleteId, start, end),
    enabled:  !!athleteId,
    staleTime: 60_000,
    queryFn: (): Promise<TimelineData> => getTimeline(athleteId, start, end),
  });
}

// ── Test results for macro drawer ─────────────────────────────────────────────

export function useTestResults(athleteId: string, macrocycleId: string) {
  return useQuery({
    queryKey: ["test-results", athleteId, macrocycleId],
    enabled:  !!athleteId && !!macrocycleId,
    staleTime: 120_000,
    queryFn: () => listMacrocycleTestResults(athleteId, macrocycleId),
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
      const data = await listWorkoutLogs({ athleteIds: [athleteId], from: startDate, to: endDate, withMods: false });

      const byDate: Record<string, WorkoutDayData[]> = {};
      for (const w of data) {
        // RPE : seule source `rpe_score` (l'embed workout_rpe n'était jamais lu).
        (byDate[w.scheduled_date] ??= []).push({ id: w.id, session_name: w.session_name, status: w.status, rpe: w.rpe_score });
      }
      return byDate;
    },
  });
}
