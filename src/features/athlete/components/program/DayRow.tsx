import { C, alpha } from "@/lib/theme";
import { CompetitionDayCard } from "@/features/athlete/components/CompetitionDayCard";
import { DOW_SHORT_FR } from "@/features/athlete/components/program/programConstants";
import { DayFiches } from "@/features/shared/components/fiches/DayFiches";
import { type DayThemeLike, dayThemeFullLabel, isDayThemeEmpty } from "@/lib/dayTheme";
import { DayThemePill } from "@/features/shared/components/DayThemePill";
import { FreeActivityChip } from "@/features/athlete/components/program/FreeActivityChip";
import type { FreeSession } from "@/features/shared/types/athlete";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { PlannedVsDoneDay } from "@/lib/plannedVsDone";
import { Plus, Trophy } from "lucide-react";
import type { ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { SessionChip } from "@/features/athlete/components/program/SessionChip";
import { TYPE_COLOR } from "@/lib/peps";
import { TestChip } from "@/features/athlete/components/program/TestChip";
import { WatchCard } from "@/features/shared/components/planning/WatchCard";
import type { WeekDay, WeekSession } from "@/features/shared/hooks/useActivePlan";
import { haptic } from "@/features/athlete/components/program/programUtils";
import { useState } from "react";
import { watchCardsOfDay } from "@/lib/planningCard";

// ── Day row ───────────────────────────────────────────────────────────────────

export function DayRow({
  day, today, onSessionPress, onReschedule, onStart, onTestPress,
  freeActivities, onAddActivity, onEditActivity, onAddCompetition, viewOnly,
  dayTheme, dayFiches = [], watch, vertical = false,
}: {
  day: WeekDay;
  today: string;
  onSessionPress: (s: WeekSession) => void;
  onReschedule: (s: WeekSession) => void;
  onStart?: (s: WeekSession) => void;
  onTestPress: (id: string) => void;
  freeActivities: FreeSession[];
  onAddActivity: (date: string) => void;
  onEditActivity: (f: FreeSession) => void;
  /** null = l'athlète n'a pas de coach (compétition impossible à rattacher) */
  onAddCompetition: ((date: string) => void) | null;
  viewOnly: boolean;
  dayTheme?: DayThemeLike | null;
  /** Fiches posées sur ce jour par un pro du staff ou le coach */
  dayFiches?: ScheduledDoc[];
  /** Montre (P34) : prévu / réalisé / libre du jour. */
  watch?: { day: PlannedVsDoneDay | undefined; athleteId: string; now: number };
  /** Ordinateur (planche AthOrdiAProgramme) : une colonne par jour, date en tête. */
  vertical?: boolean;
}) {
  const isToday = day.date === today;
  const isPast  = day.date < today;
  const d       = new Date(day.date + "T12:00:00");
  const dateNum = d.getDate();
  const isCompDay = day.competitions.length > 0;
  // Une séance rattachée à une activité de montre devient sa carte (jamais deux cartes).
  const watchCards = watch ? watchCardsOfDay(watch.day, watch.now) : [];
  const linkedCard = new Map(watchCards.filter((c) => c.planned).map((c) => [`${c.planned!.kind}:${c.planned!.id}`, c]));
  const freeWatch = watchCards.filter((c) => !c.planned);
  const watchCard = (c: (typeof watchCards)[number]) => (
    <WatchCard key={c.key} card={c} day={watch!.day} athleteId={watch!.athleteId} seancePath={(id) => `/athlete/program/activity/${id}`} />
  );
  const [showAdd, setShowAdd] = useState(false);
  const isEmpty = day.sessions.length === 0 && day.tests.length === 0 && freeActivities.length === 0 && dayFiches.length === 0 && freeWatch.length === 0;

  return (
    <div style={vertical
      ? { display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: 8, borderRadius: 14, minHeight: 220, background: isToday ? alpha(C.ac, 0.05) : "transparent", border: `1px solid ${isToday ? alpha(C.ac, 0.45) : C.brd}` }
      : { display: "flex", gap: 10, alignItems: "flex-start" }}>
      {/* Colonne du jour : « Jeu / 5 », pleine en or aujourd'hui ; « + » ouvre l'ajout */}
      <div style={vertical
        ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }
        : { width: 40, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div
          aria-hidden
          style={{
            width: 40, height: 44, borderRadius: 10,
            background: isToday ? C.ac : "transparent",
            color: isToday ? C.bg : isPast ? C.tx3 : C.tx,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          }}
        >
          <span style={{ ...MONO, fontSize: 9.5, color: isToday ? C.bg : C.tx3 }}>{DOW_SHORT_FR[day.dow]}</span>
          <span style={{ ...MONO, fontSize: 16 }}>{dateNum}</span>
        </div>
        {!viewOnly && (
          <button
            type="button"
            aria-expanded={showAdd}
            aria-label={`Ajouter le ${DOW_SHORT_FR[day.dow].toLowerCase()}. ${dateNum} : activité libre ou compétition`}
            onClick={() => { haptic(); setShowAdd((v) => !v); }}
            style={{ width: 28, height: 24, borderRadius: 8, border: "1px solid " + (showAdd ? C.ac : C.brd), background: "transparent", color: showAdd ? C.ac : C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {(isToday || !isDayThemeEmpty(dayTheme)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 16 }}>
            {isToday && <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ac }}>Aujourd’hui</span>}
            {!isDayThemeEmpty(dayTheme) && <DayThemePill theme={dayTheme} title={dayThemeFullLabel(dayTheme)} />}
          </div>
        )}

        {/* Jour de compétition — en tête, séances éventuelles dessous */}
        {isCompDay && day.competitions.map(c => (
          <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
        ))}

        {/* Événements de vie (vacances, stage, examen…) : « Indisponible » si l'athlète ne peut pas s'entraîner. */}
        {(day.lifeEvents ?? []).map((e) => (
          <div key={e.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, fontSize: 12.5, color: C.tx2,
            border: `1px dashed ${e.unavailable ? alpha(C.o, 0.5) : C.brdL}`,
            background: e.unavailable ? `repeating-linear-gradient(135deg, ${alpha(C.o, 0.08)} 0 6px, transparent 6px 12px)` : "transparent",
          }}>
            {e.unavailable && <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.o, flex: "none" }}>Indisponible</span>}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
          </div>
        ))}

        {day.sessions.map(s => {
          const c = linkedCard.get(`${s.kind}:${s.id}`);
          return c ? (
            <div key={s.id}>{watchCard(c)}</div>
          ) : (
            <SessionChip
              key={s.id}
              session={s}
              today={today}
              onPress={onSessionPress}
              onReschedule={viewOnly ? undefined : onReschedule}
              onStart={viewOnly ? undefined : onStart}
            />
          );
        })}

        {day.tests.map(t => <TestChip key={t.id} test={t} onPress={onTestPress} />)}
        {freeActivities.map(f => <FreeActivityChip key={f.id} activity={f} onPress={onEditActivity} />)}
        {freeWatch.map(watchCard)}
        {dayFiches.length > 0 && <DayFiches items={dayFiches} />}

        {isEmpty && !isCompDay && (
          <div style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px dashed rgba(231,211,168,0.16)", display: "flex", alignItems: "center", fontSize: 13, color: C.tx3 }}>
            Repos
          </div>
        )}

        {!viewOnly && showAdd && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { haptic(); setShowAdd(false); onAddActivity(day.date); }}
              style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, border: "1px dashed " + C.brdL, background: "none", color: C.tx2, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
            >
              <Plus size={12} /> Activité libre
            </button>
            {onAddCompetition && !isCompDay && (
              <button
                type="button"
                onClick={() => { haptic(); setShowAdd(false); onAddCompetition(day.date); }}
                style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, border: "1px dashed " + TYPE_COLOR.competition + "73", background: "none", color: TYPE_COLOR.competition, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
              >
                <Trophy size={12} /> Compétition
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
