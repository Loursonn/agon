import { useState } from "react";
import {
  eachWeekOfInterval, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isToday, isSameMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronUp, Heart } from "lucide-react";
import { C } from "@/lib/theme";
import { WorkoutRetourCard } from "./WorkoutRetourCard";
import { EnergyRetourCard } from "./EnergyRetourCard";
import { TestRetourCard } from "./TestRetourCard";
import { DayDetailPanel } from "./DayDetailPanel";
import type { MonthlyRetourData, WellnessDay } from "@/features/shared/types/retours.types";

interface MonthlyWeeklyViewProps {
  month: Date;
  data: MonthlyRetourData;
}

function wellnessColor(score: number): string {
  if (score >= 70) return C.g;
  if (score >= 50) return C.o;
  return C.r;
}

interface WeekSectionProps {
  weekStart: Date;
  month: Date;
  data: MonthlyRetourData;
  onDayClick: (date: string, wellness: WellnessDay) => void;
}

function WeekSection({ weekStart, month, data, onDayClick }: WeekSectionProps) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days    = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekLabel = `${format(weekStart, "d MMM", { locale: fr })} → ${format(weekEnd, "d MMM", { locale: fr })}`;

  // count sessions + check if any data this week
  const workoutsByDate: Record<string, typeof data.workouts> = {};
  const energyByDate:  Record<string, typeof data.energy_sessions> = {};
  const testsByDate:   Record<string, typeof data.test_sessions>   = {};

  for (const w of data.workouts) {
    const d = w.scheduled_date;
    if (!workoutsByDate[d]) workoutsByDate[d] = [];
    workoutsByDate[d].push(w);
  }
  for (const e of data.energy_sessions) {
    const d = e.date;
    if (!energyByDate[d]) energyByDate[d] = [];
    energyByDate[d].push(e);
  }
  for (const t of data.test_sessions) {
    if (!testsByDate[t.date]) testsByDate[t.date] = [];
    testsByDate[t.date].push(t);
  }

  const weekDates = days.map((d) => format(d, "yyyy-MM-dd"));
  const totalSessions = weekDates.reduce(
    (acc, d) =>
      acc + (workoutsByDate[d]?.length ?? 0) + (energyByDate[d]?.length ?? 0) + (testsByDate[d]?.length ?? 0),
    0,
  );
  const hasWellness = weekDates.some((d) => data.daily_data[d]?.wellness != null);

  const [open, setOpen] = useState(true);

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      {/* Week header */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", cursor: "pointer",
          background: open ? "transparent" : C.s2 + "50",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{weekLabel}</span>
          {totalSessions > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
              background: C.ac + "20", color: C.ac,
            }}>
              {totalSessions} séance{totalSessions > 1 ? "s" : ""}
            </span>
          )}
          {hasWellness && (
            <Heart size={10} color={C.tx3} />
          )}
        </div>
        {open ? <ChevronUp size={13} color={C.tx3} /> : <ChevronDown size={13} color={C.tx3} />}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid " + C.brd }}>
          {days.map((day) => {
            const dateStr    = format(day, "yyyy-MM-dd");
            const today      = isToday(day);
            const inMonth    = isSameMonth(day, month);
            const dayLabel   = format(day, "EEE d MMM", { locale: fr });
            const wellness   = data.daily_data[dateStr]?.wellness as WellnessDay | null ?? null;
            const dayWorkouts = workoutsByDate[dateStr] ?? [];
            const dayEnergy   = energyByDate[dateStr]   ?? [];
            const dayTests    = testsByDate[dateStr]    ?? [];
            const hasContent  = dayWorkouts.length > 0 || dayEnergy.length > 0 || dayTests.length > 0;

            return (
              <div
                key={dateStr}
                style={{
                  borderBottom: "1px solid " + C.brd,
                  opacity: inMonth ? 1 : 0.45,
                }}
              >
                {/* Day header */}
                <div
                  onClick={() => wellness && onDayClick(dateStr, wellness)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 14px",
                    cursor: wellness ? "pointer" : "default",
                    background: today ? C.ac + "08" : "transparent",
                  }}
                >
                  <span style={{
                    fontSize: 12, fontWeight: today ? 800 : 600,
                    color: today ? C.ac : inMonth ? C.tx : C.tx3,
                    textTransform: "capitalize",
                  }}>
                    {dayLabel}
                  </span>

                  {wellness ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: wellnessColor(wellness.score) + "18",
                      padding: "2px 8px", borderRadius: 6,
                      border: "1px solid " + wellnessColor(wellness.score) + "40",
                    }}>
                      <Heart size={9} color={wellnessColor(wellness.score)} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: wellnessColor(wellness.score) }}>
                        {wellness.score}
                      </span>
                      <span style={{ fontSize: 9, color: C.tx3 }}>/100</span>
                      <span style={{ fontSize: 9, color: C.tx3 }}>↗</span>
                    </div>
                  ) : (
                    !hasContent && (
                      <span style={{ fontSize: 10, color: C.tx3 }}>Repos</span>
                    )
                  )}
                </div>

                {/* Sessions */}
                {hasContent && (
                  <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {dayWorkouts.map((w) => (
                      <WorkoutRetourCard key={w.id} workout={w} />
                    ))}
                    {dayEnergy.map((e) => (
                      <EnergyRetourCard key={e.id} session={e} />
                    ))}
                    {dayTests.map((t) => (
                      <TestRetourCard key={t.id} test={t} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MonthlyWeeklyView({ month, data }: MonthlyWeeklyViewProps) {
  const [selectedDay, setSelectedDay]         = useState<string | null>(null);
  const [selectedWellness, setSelectedWellness] = useState<WellnessDay | null>(null);

  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);

  const weeks = eachWeekOfInterval(
    { start: monthStart, end: monthEnd },
    { weekStartsOn: 1 },
  );

  const handleDayClick = (date: string, wellness: WellnessDay) => {
    setSelectedDay(date);
    setSelectedWellness(wellness);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {weeks.map((weekStart) => (
        <WeekSection
          key={format(weekStart, "yyyy-MM-dd")}
          weekStart={weekStart}
          month={month}
          data={data}
          onDayClick={handleDayClick}
        />
      ))}

      {selectedDay && selectedWellness && (
        <DayDetailPanel
          date={selectedDay}
          wellness={selectedWellness}
          onClose={() => { setSelectedDay(null); setSelectedWellness(null); }}
        />
      )}
    </div>
  );
}
