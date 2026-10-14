import { useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Trophy, FlaskConical, Zap, Footprints } from "lucide-react";
import { C } from "@/lib/theme";
import { DayDetailPanel } from "./DayDetailPanel";
import type { DailyData, WellnessDay, WorkoutDetail, EnergySessionDetail, FreeActivityDetail } from "@/features/shared/types/retours.types";

const FREE_COLOR = "#0D9488";

interface MonthCalendarViewProps {
  month: Date;
  dailyData: Record<string, DailyData>;
  energyByDate?: Record<string, number>; // count of energy sessions per date
  workouts?: WorkoutDetail[];
  energySessions?: EnergySessionDetail[];
  freeActivities?: FreeActivityDetail[];
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function wellnessColor(score: number): string {
  if (score >= 70) return C.g;
  if (score >= 50) return C.o;
  return C.r;
}

export function MonthCalendarView({ month, dailyData, energyByDate = {}, workouts = [], energySessions = [], freeActivities = [] }: MonthCalendarViewProps) {
  const [panelDate, setPanelDate]         = useState<string | null>(null);
  const [panelWellness, setPanelWellness] = useState<WellnessDay | null>(null);

  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 1 });
  const allDays    = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Index workouts, energy sessions, and free activities by date
  const workoutsByDate = workouts.reduce<Record<string, WorkoutDetail[]>>((acc, w) => {
    (acc[w.scheduled_date] ??= []).push(w);
    return acc;
  }, {});
  const energyByDateFull = energySessions.reduce<Record<string, EnergySessionDetail[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});
  const freeCountByDate = freeActivities.reduce<Record<string, number>>((acc, f) => {
    acc[f.date] = (acc[f.date] ?? 0) + 1;
    return acc;
  }, {});
  const freeByDate = freeActivities.reduce<Record<string, FreeActivityDetail[]>>((acc, f) => {
    (acc[f.date] ??= []).push(f);
    return acc;
  }, {});

  const handleDayClick = (dateStr: string, wellness: WellnessDay | null) => {
    setPanelDate(dateStr);
    setPanelWellness(wellness);
  };

  return (
    <>
      <div>
        {/* Day-of-week header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {DAY_LABELS.map((label) => (
            <div key={label} style={{
              textAlign: "center", fontSize: 10, fontWeight: 700,
              color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", padding: "4px 0",
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {allDays.map((day) => {
            const dateStr  = format(day, "yyyy-MM-dd");
            const inMonth  = isSameMonth(day, month);
            const today    = isToday(day);
            const data          = dailyData[dateStr];
            const wellness      = data?.wellness ?? null;
            const dayWorkouts   = workoutsByDate[dateStr] ?? [];
            const dayEnergy     = energyByDateFull[dateStr] ?? [];
            const dayFreeCount  = freeCountByDate[dateStr] ?? data?.free_activity_count ?? 0;
            const clickable     = !!(wellness || dayWorkouts.some(w => w.status === "completed") || dayEnergy.length > 0);

            return (
              <div
                key={dateStr}
                onClick={clickable ? () => handleDayClick(dateStr, wellness) : undefined}
                style={{
                  minHeight: 80,
                  padding: "6px 7px",
                  borderRadius: 4,
                  border: today ? "2px solid " + C.ac : "1px solid " + C.brd,
                  background: inMonth ? C.s1 : C.bg,
                  opacity: inMonth ? 1 : 0.4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  cursor: clickable ? "pointer" : "default",
                  transition: "background 100ms",
                }}
              >
                {/* Day number */}
                <span style={{
                  fontSize: 12, fontWeight: today ? 800 : 500,
                  color: today ? C.ac : inMonth ? C.tx : C.tx3,
                  lineHeight: 1,
                }}>
                  {format(day, "d")}
                </span>

                {/* Wellness dot + score */}
                {wellness && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: wellnessColor(wellness.score), flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 9, color: C.tx3 }}>{wellness.score}</span>
                  </div>
                )}

                {/* Workouts completed */}
                {data && data.workouts_completed > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <CheckCircle2 size={10} color={C.g} />
                    <span style={{ fontSize: 9, color: C.g, fontWeight: 600 }}>
                      {data.workouts_completed}
                    </span>
                  </div>
                )}

                {/* Energy sessions */}
                {energyByDate[dateStr] > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Zap size={9} color={C.o} />
                    <span style={{ fontSize: 9, color: C.o }}>{energyByDate[dateStr]}</span>
                  </div>
                )}

                {/* Free activities */}
                {dayFreeCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Footprints size={9} color={FREE_COLOR} />
                    <span style={{ fontSize: 9, color: FREE_COLOR }}>{dayFreeCount}</span>
                  </div>
                )}

                {/* Competition / Test icons */}
                <div style={{ display: "flex", gap: 4, marginTop: "auto" }}>
                  {data?.has_competition && <Trophy size={10} color={C.y} />}
                  {data?.has_test && <FlaskConical size={10} color={C.b} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { color: C.g, label: "Forme ≥ 70" },
            { color: C.o, label: "Forme 50-69" },
            { color: C.r, label: "Forme < 50" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 9, color: C.tx3 }}>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={9} color={C.g} />
            <span style={{ fontSize: 9, color: C.tx3 }}>Séances muscu</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Zap size={9} color={C.o} />
            <span style={{ fontSize: 9, color: C.tx3 }}>Énergie</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Footprints size={9} color={FREE_COLOR} />
            <span style={{ fontSize: 9, color: C.tx3 }}>Activité libre</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Trophy size={9} color={C.y} />
            <span style={{ fontSize: 9, color: C.tx3 }}>Compétition</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FlaskConical size={9} color={C.b} />
            <span style={{ fontSize: 9, color: C.tx3 }}>Test</span>
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      {panelDate && (
        <DayDetailPanel
          date={panelDate}
          wellness={panelWellness}
          workouts={workoutsByDate[panelDate] ?? []}
          energySessions={energyByDateFull[panelDate] ?? []}
          freeActivities={freeByDate[panelDate] ?? []}
          onClose={() => { setPanelDate(null); setPanelWellness(null); }}
        />
      )}
    </>
  );
}
