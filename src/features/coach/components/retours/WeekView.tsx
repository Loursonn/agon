import { eachDayOfInterval, startOfWeek, endOfWeek, format } from "date-fns";
import { C } from "@/lib/theme";
import { DayColumn } from "./DayColumn";
import type { WeeklyRetourData, WellnessDay } from "@/features/shared/types/retours.types";

interface WeekViewProps {
  weekData:     WeeklyRetourData;
  prevWeekData?: WeeklyRetourData | null;
  athleteId?:   string;
}

export function WeekView({ weekData, prevWeekData, athleteId }: WeekViewProps) {
  const weekStart = startOfWeek(new Date(weekData.start_date + "T12:00:00"), { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Index by date
  const workoutsByDate: Record<string, typeof weekData.workouts> = {};
  for (const w of weekData.workouts) {
    if (!workoutsByDate[w.scheduled_date]) workoutsByDate[w.scheduled_date] = [];
    workoutsByDate[w.scheduled_date].push(w);
  }

  const energyByDate: Record<string, typeof weekData.energy_sessions> = {};
  for (const e of weekData.energy_sessions) {
    if (!energyByDate[e.date]) energyByDate[e.date] = [];
    energyByDate[e.date].push(e);
  }

  const testsByDate: Record<string, typeof weekData.test_sessions> = {};
  for (const t of weekData.test_sessions) {
    if (!testsByDate[t.date]) testsByDate[t.date] = [];
    testsByDate[t.date].push(t);
  }

  const freeByDate: Record<string, typeof weekData.free_activities> = {};
  for (const f of (weekData.free_activities ?? [])) {
    if (!freeByDate[f.date]) freeByDate[f.date] = [];
    freeByDate[f.date].push(f);
  }

  // Detect rescheduled sessions: same session appears completed on another day
  const completedWorkoutSessionIds = new Set(
    weekData.workouts.filter(w => w.status === "completed").map(w => (w as { session_id?: string }).session_id ?? ""),
  );
  const rescheduledWorkoutIds = new Set(
    weekData.workouts
      .filter(w => w.status !== "completed" && completedWorkoutSessionIds.has((w as { session_id?: string }).session_id ?? ""))
      .map(w => w.id),
  );

  const completedEnergyLabels = new Set(
    weekData.energy_sessions.filter(e => e.status === "completed").map(e => e.session_label),
  );
  const rescheduledEnergyIds = new Set(
    weekData.energy_sessions
      .filter(e => e.status !== "completed" && completedEnergyLabels.has(e.session_label))
      .map(e => e.id),
  );

  const prevWorkouts = prevWeekData?.workouts ?? [];

  return (
    /* Horizontal scroll container */
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(130px, 1fr))",
        gap: 6,
        minWidth: 910,
      }}>
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          return (
            <DayColumn
              key={dateStr}
              date={dateStr}
              workouts={workoutsByDate[dateStr] ?? []}
              energy={energyByDate[dateStr]     ?? []}
              tests={testsByDate[dateStr]        ?? []}
              wellness={(weekData.daily_wellness[dateStr] as WellnessDay | null) ?? null}
              previousWorkouts={prevWorkouts}
              rescheduledWorkoutIds={rescheduledWorkoutIds}
              rescheduledEnergyIds={rescheduledEnergyIds}
              freeActivities={freeByDate[dateStr] ?? []}
              athleteId={athleteId}
            />
          );
        })}
      </div>
    </div>
  );
}
