import { useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Trophy, FlaskConical, Zap, Footprints } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { wellnessView } from "@/lib/wellness";
import { DayDetailPanel } from "./DayDetailPanel";
import type { DailyData, WellnessDay, WorkoutDetail, EnergySessionDetail, FreeActivityDetail } from "@/features/shared/types/retours.types";

/** Activité libre : patine de la charte (ancienne sarcelle). */
const FREE_COLOR = C.pat;
const ROW = "flex items-center gap-[3px]";
const LEGEND = "flex items-center gap-1";
const LEGEND_TEXT = "text-[9px] text-agon-tx3";

interface MonthCalendarViewProps {
  month: Date;
  dailyData: Record<string, DailyData>;
  energyByDate?: Record<string, number>; // count of energy sessions per date
  workouts?: WorkoutDetail[];
  energySessions?: EnergySessionDetail[];
  freeActivities?: FreeActivityDetail[];
  athleteId?: string;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function MonthCalendarView({ month, dailyData, energyByDate = {}, workouts = [], energySessions = [], freeActivities = [], athleteId }: MonthCalendarViewProps) {
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
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {DAY_LABELS.map((label) => (
            <div key={label} className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5">
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
                className={cn(
                  "flex min-h-[80px] flex-col gap-1 rounded-[4px] px-[7px] py-1.5 [transition:background_100ms]",
                  today ? "border-2 border-agon-accent" : "border border-agon-brd",
                  inMonth ? "bg-agon-s1" : "bg-agon-bg opacity-40",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                {/* Day number */}
                <span className={cn(
                  "text-[12px]",
                  today ? "font-extrabold text-agon-accent" : inMonth ? "font-medium text-agon-tx" : "font-medium text-agon-tx3",
                  "leading-none",
                )}>
                  {format(day, "d")}
                </span>

                {/* Wellness dot + score */}
                {wellness && (() => {
                  // Score recalculé (domaine wellness) : « — » si la saisie est incomplète, jamais 0.
                  const { score, reco, injuryNote } = wellnessView(wellness);
                  return (
                    <div className={ROW} title={injuryNote ? `Blessé / malade : ${injuryNote}` : undefined}>
                      <div className="size-[7px] flex-none rounded-full" style={{ background: reco.c }} />
                      <span className="text-[9px] text-agon-tx3">{score ?? "—"}</span>
                      {injuryNote && <span className="text-[9px] font-extrabold text-agon-erreur">✚</span>}
                    </div>
                  );
                })()}

                {/* Workouts completed */}
                {data && data.workouts_completed > 0 && (
                  <div className={ROW}>
                    <CheckCircle2 size={10} color={C.g} />
                    <span className="text-[9px] font-semibold text-agon-succes">
                      {data.workouts_completed}
                    </span>
                  </div>
                )}

                {/* Energy sessions */}
                {energyByDate[dateStr] > 0 && (
                  <div className={ROW}>
                    <Zap size={9} color={C.o} />
                    <span className="text-[9px] text-agon-alerte">{energyByDate[dateStr]}</span>
                  </div>
                )}

                {/* Free activities */}
                {dayFreeCount > 0 && (
                  <div className={ROW}>
                    <Footprints size={9} color={FREE_COLOR} />
                    <span className="text-[9px] text-agon-patine">{dayFreeCount}</span>
                  </div>
                )}

                {/* Competition / Test icons */}
                <div className="mt-auto flex gap-1">
                  {data?.has_competition && <Trophy size={10} color={C.y} />}
                  {data?.has_test && <FlaskConical size={10} color={C.b} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex flex-wrap gap-3.5">
          {[
            { dot: "bg-agon-succes", label: "Forme ≥ 70" },
            { dot: "bg-agon-alerte", label: "Forme 50-69" },
            { dot: "bg-agon-erreur", label: "Forme < 50" },
          ].map(({ dot, label }) => (
            <div key={label} className={LEGEND}>
              <div className={cn("size-[7px] rounded-full", dot)} />
              <span className={LEGEND_TEXT}>{label}</span>
            </div>
          ))}
          <div className={LEGEND}>
            <CheckCircle2 size={9} color={C.g} />
            <span className={LEGEND_TEXT}>Séances muscu</span>
          </div>
          <div className={LEGEND}>
            <Zap size={9} color={C.o} />
            <span className={LEGEND_TEXT}>Énergie</span>
          </div>
          <div className={LEGEND}>
            <Footprints size={9} color={FREE_COLOR} />
            <span className={LEGEND_TEXT}>Activité libre</span>
          </div>
          <div className={LEGEND}>
            <Trophy size={9} color={C.y} />
            <span className={LEGEND_TEXT}>Compétition</span>
          </div>
          <div className={LEGEND}>
            <FlaskConical size={9} color={C.b} />
            <span className={LEGEND_TEXT}>Test</span>
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
          athleteId={athleteId}
          onClose={() => { setPanelDate(null); setPanelWellness(null); }}
        />
      )}
    </>
  );
}
