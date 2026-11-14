import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Trophy } from "lucide-react";
import { competitionDayLabel } from "@/types/planning";
import { useDroppable } from "@dnd-kit/core";
import { C, alpha, H } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { DayThemePill } from "@/features/shared/components/DayThemePill";
import { dayThemeChipLabel, dayThemeColors, dayThemeFullLabel, isDayThemeEmpty, type DayThemeLike } from "@/lib/dayTheme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { DayFiches } from "@/features/shared/components/fiches/DayFiches";
import type { PlanningCardModel } from "@/lib/planningCard";
import { LIFE_EVENT_COLOR, CARD_MONO } from "./calendarConstants";
import { WatchFreeChip } from "./WatchFreeChip";
import { DayThemeMenu } from "./DayThemeMenu";
import { DraggableEventChip } from "./DraggableEventChip";

export function DroppableDay({
  date,
  events,
  isCurrentMonth,
  isActive,
  onClick,
  onEventClick,
  athleteId,
  coachId,
  wellnessLogged,
  nutritionLogged,
  dayTheme,
  dayFiches = [],
  watchCards = [],
  tall = false,
}: {
  /** Vue Semaine : colonne haute, cartes de séance, rien de masqué. */
  tall?: boolean;
  date: Date;
  events: CalEvent[];
  isCurrentMonth: boolean;
  isActive: boolean;
  onClick: () => void;
  onEventClick: (event: CalEvent) => void;
  athleteId: string;
  coachId: string;
  wellnessLogged: boolean;
  nutritionLogged: boolean;
  dayTheme?: DayThemeLike | null;
  /** Fiches posées sur ce jour (staff ou coach) */
  dayFiches?: ScheduledDoc[];
  /** Montre (P34) : séances rattachées et activités libres du jour. */
  watchCards?: PlanningCardModel[];
}) {
  const dateStr = format(date, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const watchByPlanned = new Map(watchCards.filter((c) => c.planned).map((c) => [`${c.planned!.kind}:${c.planned!.id}`, c.state]));
  const watchFree = watchCards.filter((c) => !c.planned);

  const today     = isToday(date);
  const maxVisible = tall ? 99 : 3;
  const comps     = events.filter((e) => e.type === "competition");
  const isCompDay = comps.length > 0;

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={tall ? {
        minHeight: 440,
        background: isOver ? C.acS : "transparent",
        border: "1px solid " + (isOver ? alpha(C.ac, 0.4) : "transparent"),
        borderRadius: 12,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
        minWidth: 0,
      } : {
        height: 110,
        minHeight: tall ? 440 : undefined,
        overflow: "hidden",
        background: isOver
          ? C.acS
          : isCompDay
          ? C.rS
          : today
          ? C.s2
          : isActive
          ? C.s2 + "80"
          : "transparent",
        border: "1px solid " + (isOver ? C.ac + "60" : isCompDay ? C.r + "70" : today ? C.ac + "40" : C.brd),
        borderRadius: tall ? 12 : 4,
        padding: tall ? "10px 8px" : "6px 7px",
        cursor: "pointer",
        transition: "background 120ms, border-color 120ms",
        display: "flex",
        flexDirection: "column",
        gap: tall ? 6 : 3,
        position: "relative",
        opacity: 1,
      }}
    >
      {/* Numéro du jour + thème du jour.
          La pastille partage la ligne du numéro : la case fait 110 px en
          `overflow: hidden`, une ligne de plus chasserait un événement. */}
      {tall ? (() => {
        // En-tête du jour en carte (planche CoachPlanningLarge3) : filet de
        // couleur du thème en haut, jour + numéro, thème en pastille pleine.
        const themed = !isDayThemeEmpty(dayTheme);
        const tc = themed ? dayThemeColors(dayTheme) : null;
        const accent = isCompDay ? C.r : tc?.bg ?? null;
        return (
          <DayThemeMenu athleteId={athleteId} coachId={coachId} date={date} theme={dayTheme} onMoreOptions={onClick}>
          <div title="Thème du jour" style={{
            position: "relative", overflow: "hidden", flexShrink: 0, padding: "12px 12px 10px", borderRadius: 12,
            border: "1px solid " + (today ? alpha(C.ac, 0.45) : C.brd), background: C.s1,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0,
          }}>
            {accent && <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4, background: accent }} />}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: today ? C.ac : C.tx3 }}>
                {format(date, "EEE", { locale: fr }).replace(".", "")}
              </span>
              <span style={{ ...MONO, fontSize: 20, color: today ? C.ac : C.tx }}>{format(date, "d")}</span>
            </div>
            {tc && (
              <span title={dayThemeFullLabel(dayTheme)} style={{
                ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
                borderRadius: 999, padding: "4px 9px", background: tc.bg, color: tc.fg,
                minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{dayThemeChipLabel(dayTheme)}</span>
            )}
            {!tc && (
              <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx3 }}>
                + Thème
              </span>
            )}
          </div>
          </DayThemeMenu>
        );
      })() : (
      <DayThemeMenu athleteId={athleteId} coachId={coachId} date={date} theme={dayTheme} onMoreOptions={onClick}>
      <div title="Thème du jour" style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 24, height: 24, borderRadius: "50%",
            background: today ? C.ac : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: today ? 800 : 500,
            color: today ? C.tx : isCurrentMonth ? C.tx2 : C.tx3,
            flexShrink: 0,
          }}
        >
          {format(date, "d")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayThemePill theme={dayTheme} title={dayThemeFullLabel(dayTheme)} />
        </div>
      </div>
      </DayThemeMenu>
      )}

      {/* Jour de compétition — bandeau en tête du jour */}
      {comps.map((cp) => (
        <div
          key={cp.id}
          title={competitionDayLabel(cp.raw?.type as string | undefined) + " — " + cp.title}
          style={{
            background: C.r, color: C.tx,
            borderRadius: 3, padding: "1px 5px",
            fontSize: 9, fontWeight: 700, lineHeight: "15px",
            display: "flex", alignItems: "center", gap: 4,
            whiteSpace: "nowrap", overflow: "hidden", flexShrink: 0,
          }}
        >
          <Trophy size={9} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cp.title}</span>
        </div>
      ))}

      {/* Life events — subtle informational bands */}
      {events.filter((e) => e.type === "life_event").map((le) => (
        <div
          key={le.id}
          style={{
            background: LIFE_EVENT_COLOR + "18",
            borderLeft: "2px solid " + LIFE_EVENT_COLOR,
            borderRadius: "0 3px 3px 0",
            padding: "0px 5px",
            fontSize: 8,
            fontWeight: 500,
            color: LIFE_EVENT_COLOR,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: "14px",
            flexShrink: 0,
          }}
        >
          {le.title}
        </div>
      ))}

      {/* Events */}
      {(() => {
        const regularEvents = events.filter((e) => e.type !== "life_event" && e.type !== "competition");
        const lifeCount = events.length - regularEvents.length;
        // Les fiches du jour prennent une ligne (la case fait 110 px, overflow caché).
        const ficheLines = dayFiches.length > 0 ? 1 : 0;
        const maxAfterLife = Math.max(1, maxVisible - lifeCount - ficheLines);
        const overflow = Math.max(0, regularEvents.length + watchFree.length - maxAfterLife);
        const freeShown = watchFree.slice(0, Math.max(0, maxAfterLife - regularEvents.length));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: tall ? 10 : 2, flex: 1 }}>
            {regularEvents.slice(0, maxAfterLife).map((ev) => (
              <DraggableEventChip
                key={ev.id} event={ev} compact={!tall} card={tall} athleteId={athleteId} coachId={coachId} onEventClick={onEventClick}
                watch={watchByPlanned.get(`${ev.type}:${ev.id}`)}
              />
            ))}
            {freeShown.map((c) => <WatchFreeChip key={c.key} card={c} athleteId={athleteId} />)}
            {overflow > 0 && (
              <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 4 }}>
                +{overflow} autre{overflow > 1 ? "s" : ""}
              </div>
            )}
            {dayFiches.length === 1 && <DayFiches items={dayFiches} compact />}
            {dayFiches.length > 1 && (
              <div title={dayFiches.map((f) => f.doc?.title).filter(Boolean).join(", ")} style={{ fontSize: 10, color: C.tx2, paddingLeft: 4, whiteSpace: "nowrap" }}>
                📄 {dayFiches.length} fiches
              </div>
            )}
          </div>
        );
      })()}

      {/* Athlete reschedule markers */}
      {(() => {
        const hasAlert     = events.some((e) => e.type === "workout" && (e as { coachAlert?: boolean }).coachAlert);
        const hasRescheduled = events.some((e) => e.type === "workout" && (e as { rescheduledByAthlete?: boolean }).rescheduledByAthlete);
        if (!hasRescheduled && !hasAlert) return null;
        return (
          <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 2 }}>
            {hasAlert && (
              <span
                title="Décalage → semaine suivante (coach requis)"
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: H.ambre,
                  display: "block",
                }}
              />
            )}
            {!hasAlert && hasRescheduled && (
              <span
                title="Déplacé par l'athlète"
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: `${H.ambre}50`,
                  border: `1px solid ${H.ambre}`,
                  display: "block",
                }}
              />
            )}
          </div>
        );
      })()}

      {(wellnessLogged || nutritionLogged) && (
        <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
          {wellnessLogged && <span style={{ fontSize: 10, lineHeight: 1 }}></span>}
          {nutritionLogged && <span style={{ fontSize: 10, lineHeight: 1 }}></span>}
        </div>
      )}

      {/* Drop indicator */}
      {isOver && (
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: tall ? 12 : 4,
            border: "2px dashed " + C.ac,
            pointerEvents: "none",
          }}
        />
      )}
      {tall && isOver && (
        <div style={{ border: "1px dashed " + alpha(C.ac, 0.6), borderRadius: 10, padding: "14px 8px", textAlign: "center", fontFamily: CARD_MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ac }}>
          Déposer ici · {format(date, "EEE d", { locale: fr }).replace(".", "")}
        </div>
      )}
    </div>
  );
}
