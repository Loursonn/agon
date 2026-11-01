import { useState, useCallback, useMemo, useEffect } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday,
  eachDayOfInterval, parseISO, differenceInCalendarWeeks,
} from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BlockConfig, Session, WellnessData } from "@/features/shared/types/athlete";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Dumbbell, Zap, FlaskConical, Target, Ruler, Trophy, X as XIcon } from "lucide-react";
import { competitionDayLabel } from "@/types/planning";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { C } from "@/lib/theme";
import {
  useUnifiedCalendar,
  useAssignWorkout,
  useRescheduleWorkout,
  useCreateTestSession,
  useRescheduleTestSession,
  toCalEvent,
} from "@/features/shared/hooks/useUnifiedCalendar";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession, useUpdateEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignments";
import { useDeleteCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useTestDefinitions } from "@/features/shared/hooks/tests/useTestDefinitions";
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_COLOR, TEST_CATEGORY_ORDER, isPickableTest } from "@/features/shared/types/tests";
import type { EnergySessionRow } from "@/types/energy";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { DayThemePill } from "@/features/shared/components/DayThemePill";
import { dayThemeFullLabel, indexDayThemesByDate, type DayThemeLike } from "@/lib/dayTheme";
import { DayDetailsDrawer } from "./DayDetailsDrawer";
import { groupScheduleByDate, useDocSchedule, type ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { DayFiches } from "@/features/shared/components/fiches/DayFiches";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";
import { QuickAddDialog } from "./QuickAddDialog";
import { buildProjectionCoverage, isProjectionCovered } from "@/lib/planningProjection";
import { athleteMoveTitle } from "@/lib/athleteChoices";

// ── Cycle auto-detection ──────────────────────────────────────────────────────

function findCurrentCycleId(cycles: Array<{ id: string; start_date: string; end_date: string }>): string | null {
  if (!cycles.length) return null;
  const today = format(new Date(), "yyyy-MM-dd");
  const current  = cycles.find(c => c.start_date <= today && today <= c.end_date);
  if (current) return current.id;
  const upcoming = cycles.find(c => c.start_date > today);
  if (upcoming) return upcoming.id;
  return cycles[cycles.length - 1].id;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const FREE_COLOR    = "#1FF0B0";   // patine (DA)
const TEST_COLOR    = "#A67C52";   // bronze (DA)
const BIO_COLOR     = "#66F03C";   // olivier (DA)
const BIO_BANK_ID   = "bio-mensurations";
const BIO_TITLE     = "Mensurations / Photos";

function isBiometric(event: CalEvent): boolean {
  return event.type === "test" && event.raw?.type === "biometric";
}

function energyChipColor(_event: CalEvent): string {
  return C.b;  // ardoise — distinct from muscu (or)
}

// Le curseur décide du jour ciblé, pas le rectangle de la vignette déplacée :
// une vignette (~230px) est plus large qu'une case jour (~160px), donc la
// détection par intersection de rectangles (défaut dnd-kit) visait un jour
// voisin — ou aucun jour près des bords, et le drop était alors ignoré.
const dayCollisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : closestCenter(args);
};

const LIFE_EVENT_COLOR = "#9194A0";

const TYPE_COLOR: Record<CalEvent["type"], string> = {
  workout:       C.ac,            // or — muscu
  test:          TEST_COLOR,      // bronze — tests
  competition:   C.r,             // terracotta — compétitions
  energy:        C.b,             // ardoise — énergie
  free_activity: FREE_COLOR,      // patine — activités libres
  life_event:    LIFE_EVENT_COLOR, // gris — événements vie
};

const TYPE_BG: Record<CalEvent["type"], string> = {
  workout:       C.acS,
  test:          TEST_COLOR + "20",
  competition:   C.rS,
  energy:        C.bS,
  free_activity: FREE_COLOR + "20",
  life_event:    LIFE_EVENT_COLOR + "20",
};

const STATUS_OPACITY: Record<string, number> = {
  planned:     1,
  in_progress: 1,
  completed:   0.6,
  missed:      0.4,
  skipped:     0.5,
};

// ── EventChip ─────────────────────────────────────────────────────────────────

function EventChip({
  event,
  compact = false,
}: {
  event: CalEvent;
  compact?: boolean;
}) {
  const isProjected = event.raw?.source === "block_plan";
  const st = event.status;

  // Energy events use session_kind color; biometric tests get their own color
  const bio = isBiometric(event);
  const baseColor = event.type === "energy" ? energyChipColor(event) : bio ? BIO_COLOR : TYPE_COLOR[event.type];
  const baseBg    = event.type === "energy" ? energyChipColor(event) + "20" : bio ? BIO_COLOR + "20" : TYPE_BG[event.type];

  // Status overrides base type color — partial takes priority over completed
  const isPartialEnergy = event.type === "energy" && event.partial;
  const color = isPartialEnergy     ? "#33B5FF"
              : st === "completed"  ? C.g
              : st === "missed"     ? C.r
              : baseColor;
  const bg    = isPartialEnergy     ? "#33B5FF20"
              : st === "completed"  ? C.gS
              : st === "missed"     ? C.rS
              : baseBg;

  const blockLogs = isPartialEnergy
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined)
    : null;
  const blVals     = blockLogs ? Object.values(blockLogs) : [];
  const doneCount  = blVals.filter(b => b.done).length;
  const totalCount = blVals.length;

  return (
    <div
      style={{
        background: isProjected ? (st === "completed" ? C.gS : st === "missed" ? C.rS : "transparent") : bg,
        borderLeft: `2px ${isProjected && st !== "completed" && st !== "missed" ? "dashed" : "solid"} ${color}`,
        borderRadius: "0 4px 4px 0",
        padding: compact ? "1px 5px" : "2px 6px",
        fontSize: compact ? 9 : 10,
        fontWeight: isProjected ? 400 : 600,
        color: color,
        cursor: "pointer",
        maxWidth: "100%",
        fontStyle: isProjected && st !== "completed" && st !== "missed" ? "italic" : "normal",
        display: "flex",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {event.type === "workout" ? "" : event.type === "competition" ? "" : event.type === "test" ? (bio ? "" : "") : event.type === "energy" ? "" : event.type === "free_activity" ? (event.sportEmoji ? event.sportEmoji + " " : "") : ""}
        {event.title}
        {isPartialEnergy && totalCount > 0 && (
          <span style={{ opacity: 0.45, fontWeight: 500, marginLeft: 3 }}>{doneCount}/{totalCount}</span>
        )}
        {isProjected && st !== "completed" && st !== "missed" && (
          <span style={{ opacity: 0.5, marginLeft: 3, fontSize: 8 }}>prévu</span>
        )}
      </span>
      {event.type === "workout" && event.rescheduledByAthlete && (
        <span
          title={athleteMoveTitle(event.date, event.originalScheduledDate)}
          style={{ flexShrink: 0, marginLeft: 2, fontSize: 8, fontWeight: 800, color: "#F59E0B" }}
        >
          ↷
        </span>
      )}
      {event.type === "workout" && !!(event.raw?.athlete_modifications as { coachOverride?: unknown } | null)?.coachOverride && (
        <span title="Séance adaptée pour ce jour" style={{ flexShrink: 0, marginLeft: 2, color: "#F59E0B" }}></span>
      )}
      {event.rpe != null && (
        <span style={{ flexShrink: 0, opacity: 0.85, fontWeight: 700, marginLeft: 2 }}>RPE {event.rpe}</span>
      )}
    </div>
  );
}

// ── DraggableEventChip ───────────────────────────────────────────────────────

function DraggableEventChip({
  event, compact = false, athleteId = "", coachId = "", onEventClick,
}: {
  event: CalEvent;
  compact?: boolean;
  athleteId?: string;
  coachId?: string;
  onEventClick?: (event: CalEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const draggable = event.type === "workout" || event.type === "energy" || event.type === "test";
  const deletable = event.type === "workout" || event.type === "energy" || event.type === "test";
  const { mutate: del } = useDeleteCalendarEvent();
  // Pas de `transform` ici : le fantôme est rendu par <DragOverlay>. Déplacer
  // aussi la vignette source fausserait le rectangle utilisé au drop.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-event-${event.id}`,
    data: { type: "calendar_event", event },
    disabled: !draggable,
  });

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{
          opacity: isDragging ? 0.35 : 1,
          cursor: draggable ? "grab" : "pointer",
          paddingRight: hovered && deletable ? 14 : 0,
        }}
      >
        <EventChip event={event} compact={compact} />
      </div>
      {hovered && deletable && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            del({
              id:          event.id,
              type:        event.type,
              athleteId,
              coachId,
              sessionId:   event.raw?.session_id as string | undefined,
              sessionName: event.title,
              date:        event.date,
              status:      event.status,
            });
          }}
          style={{
            position: "absolute", top: 0, right: 0,
            width: 14, height: "100%", minHeight: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: C.r + "cc", border: "none",
            borderRadius: "0 4px 4px 0",
            cursor: "pointer", padding: 0,
            color: "#fff",
            zIndex: 1,
          }}
        >
          <XIcon size={8} />
        </button>
      )}
    </div>
  );
}

// ── DraggableSession ─────────────────────────────────────────────────────────

type BankItemType = "workout" | "energy" | "specifique" | "test" | "biometric";

function DraggableSession({
  session,
  sessionType,
  isDragging,
}: {
  session: { id: string; name?: string; label?: string };
  sessionType: BankItemType;
  isDragging: boolean;
}) {
  const color  = sessionType === "energy" ? C.b : sessionType === "specifique" ? "#F5A623" : sessionType === "test" ? TEST_COLOR : sessionType === "biometric" ? BIO_COLOR : C.ac;
  const colorS = sessionType === "energy" ? C.bS : sessionType === "specifique" ? "#F5A62320" : sessionType === "test" ? TEST_COLOR + "20" : sessionType === "biometric" ? BIO_COLOR + "20" : C.acS;

  // Idem : le fantôme est rendu par <DragOverlay>, la vignette source reste en place.
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: session.id,
    data: { ...session, sessionType },
  });
  const name = session.name ?? session.label ?? "Séance";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        padding: "7px 10px",
        borderRadius: 4,
        border: "1px solid " + color + "40",
        background: isDragging ? color : colorS,
        color: isDragging ? "#fff" : color,
        fontSize: 11, fontWeight: 600,
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 120ms",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {sessionType === "energy" ? <Zap size={11} /> : sessionType === "test" ? <FlaskConical size={11} /> : sessionType === "biometric" ? <Ruler size={11} /> : <Dumbbell size={11} />}
      {name}
    </div>
  );
}

// ── DroppableDay ──────────────────────────────────────────────────────────────

function DroppableDay({
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
}: {
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
}) {
  const dateStr = format(date, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  const today     = isToday(date);
  const maxVisible = 3;
  const comps     = events.filter((e) => e.type === "competition");
  const isCompDay = comps.length > 0;

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{
        height: 110,
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
        borderRadius: 4,
        padding: "6px 7px",
        cursor: "pointer",
        transition: "background 120ms, border-color 120ms",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        position: "relative",
        opacity: 1,
      }}
    >
      {/* Numéro du jour + thème du jour.
          La pastille partage la ligne du numéro : la case fait 110 px en
          `overflow: hidden`, une ligne de plus chasserait un événement. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 24, height: 24, borderRadius: "50%",
            background: today ? C.ac : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: today ? 800 : 500,
            color: today ? "#fff" : isCurrentMonth ? C.tx2 : C.tx3,
            flexShrink: 0,
          }}
        >
          {format(date, "d")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayThemePill theme={dayTheme} title={dayThemeFullLabel(dayTheme)} />
        </div>
      </div>

      {/* Jour de compétition — bandeau en tête du jour */}
      {comps.map((cp) => (
        <div
          key={cp.id}
          title={competitionDayLabel(cp.raw?.type as string | undefined) + " — " + cp.title}
          style={{
            background: C.r, color: "#fff",
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
        const overflow = Math.max(0, regularEvents.length - maxAfterLife);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            {regularEvents.slice(0, maxAfterLife).map((ev) => (
              <DraggableEventChip key={ev.id} event={ev} compact athleteId={athleteId} coachId={coachId} onEventClick={onEventClick} />
            ))}
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
                  background: "#F59E0B",
                  display: "block",
                }}
              />
            )}
            {!hasAlert && hasRescheduled && (
              <span
                title="Déplacé par l'athlète"
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#F59E0B50",
                  border: "1px solid #F59E0B",
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
            position: "absolute", inset: 0, borderRadius: 4,
            border: "2px dashed " + C.ac,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ── Session bank sidebar ──────────────────────────────────────────────────────

const ENERGY_KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", autre: "#6B7280", custom: "#6B7280",
};
const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

type BankTab = "workout" | "energy" | "specifique" | "tests";

const BANK_TABS: { key: BankTab; label: string; Icon: typeof Dumbbell; color: string }[] = [
  { key: "workout",    label: "Muscu",      Icon: Dumbbell,     color: "#FFC933" },
  { key: "energy",     label: "Énergie",    Icon: Zap,          color: "#FFC933" },
  { key: "specifique", label: "Spécifique", Icon: Target,       color: "#F5A623" },
  { key: "tests",      label: "Tests",      Icon: FlaskConical, color: TEST_COLOR },
];

function BankGroupTitle({ label, color, count }: { label: string; color: string; count?: number }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, color,
      textTransform: "uppercase", letterSpacing: "0.06em",
      display: "flex", alignItems: "center", gap: 5,
      margin: "4px 0 2px",
    }}>
      <span style={{ width: 10, height: 2, borderRadius: 1, background: color, flexShrink: 0 }} />
      {label}
      {count != null && <span style={{ fontWeight: 500, opacity: 0.6 }}>{count}</span>}
      <span style={{ flex: 1, height: 1, background: C.brd }} />
    </div>
  );
}

function PlanningBank({
  sessions,
  energySessions,
  testDefinitions,
  activeDragId,
}: {
  sessions: Array<{ id: string; name: string }>;
  energySessions: EnergySessionRow[];
  testDefinitions: Array<{ id: string; name: string; kind?: string; category?: string | null }>;
  activeDragId: string | null;
}) {
  const [tab, setTab]       = useState<BankTab>("workout");
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  function toggleCat(cat: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.toLowerCase();
  const filteredMuscu      = sessions.filter((s) => s.name.toLowerCase().includes(q));
  const filteredEnergy     = energySessions.filter((s) => s.session_kind !== "specifique" && s.name.toLowerCase().includes(q));
  const filteredSpecifique = energySessions.filter((s) => s.session_kind === "specifique" && s.name.toLowerCase().includes(q));
  const filteredTests      = testDefinitions.filter((t) => t.name.toLowerCase().includes(q));

  const testGroups = TEST_CATEGORY_ORDER
    .map((cat) => ({ cat, tests: filteredTests.filter((t) => t.category === cat) }))
    .filter((g) => g.tests.length > 0);
  const uncategorized = filteredTests.filter((t) => !t.category);

  const empty = (msg: string) => (
    <div style={{ fontSize: 11, color: C.tx3, textAlign: "center", padding: "14px 0" }}>
      {search ? "Aucun résultat" : msg}
    </div>
  );

  return (
    <div
      style={{
        width: 252, flexShrink: 0,
        background: C.s1,
        borderRadius: 6,
        border: "1px solid " + C.brd,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        alignSelf: "stretch",
        maxHeight: 720,
      }}
    >
      {/* Header : 4 catégories distinctes */}
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid " + C.brd }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Programmer
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {BANK_TABS.map(({ key, label, Icon, color }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  padding: "10px 0", borderRadius: 4,
                  border: "1px solid " + (active ? color + "70" : C.brd),
                  background: active ? color + "1A" : C.s2,
                  color: active ? color : C.tx3,
                  fontSize: 10.5, fontWeight: active ? 700 : 500,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 130ms",
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: "100%", padding: "6px 9px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Contenu */}
      <div
        style={{
          flex: 1, overflowY: "auto", padding: "8px",
          display: "flex", flexDirection: "column", gap: 5,
          scrollbarWidth: "none",
        }}
      >
        {tab === "workout" && (
          filteredMuscu.length === 0 ? empty("Aucune séance dans la banque") :
          filteredMuscu.map((s) => (
            <DraggableSession key={s.id} session={s} sessionType="workout" isDragging={activeDragId === s.id} />
          ))
        )}

        {tab === "energy" && (
          filteredEnergy.length === 0 ? empty("Aucune séance énergétique") :
          filteredEnergy.map((s) => {
            const kc = ENERGY_KIND_COLOR[s.session_kind] ?? "#FFC933";
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DraggableSession session={{ id: s.id, name: s.name }} sessionType="energy" isDragging={activeDragId === s.id} />
                <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: kc, fontWeight: 700 }}>{ENERGY_KIND_LABEL[s.session_kind] ?? s.session_kind}</span>
                  {s.total_duration_s != null && <span>{Math.round(s.total_duration_s / 60)} min</span>}
                </div>
              </div>
            );
          })
        )}

        {tab === "specifique" && (
          filteredSpecifique.length === 0 ? empty("Aucune séance spécifique") :
          filteredSpecifique.map((s) => {
            const isClassique = s.format === "classique";
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DraggableSession session={{ id: s.id, name: s.name }} sessionType="specifique" isDragging={activeDragId === s.id} />
                <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: "#F5A623", fontWeight: 700 }}>{isClassique ? "Blocs" : "WOD"}</span>
                  {s.total_duration_s != null && s.total_duration_s > 0 && <span>{Math.round(s.total_duration_s / 60)} min</span>}
                </div>
              </div>
            );
          })
        )}

        {tab === "tests" && (
          <>
            {/* Biométrie — épinglée en tête */}
            <BankGroupTitle label="Biométrie" color={BIO_COLOR} />
            <DraggableSession
              session={{ id: BIO_BANK_ID, name: BIO_TITLE }}
              sessionType="biometric"
              isDragging={activeDragId === BIO_BANK_ID}
            />
            <div style={{ fontSize: 9, color: C.tx3, paddingLeft: 6, marginBottom: 4 }}>
              L'athlète saisit mensurations &amp; photos
            </div>

            {/* Tests : catégories repliables (menu déroulant) */}
            {filteredTests.length === 0 ? empty("Aucun test dans la banque") : (
              <>
                {[...testGroups.map((g) => ({ ...g, label: TEST_CATEGORY_LABEL[g.cat], color: TEST_CATEGORY_COLOR[g.cat] })),
                  ...(uncategorized.length > 0 ? [{ cat: "__autres__", tests: uncategorized, label: "Autres", color: C.tx3 }] : []),
                ].map(({ cat, tests, label, color }) => {
                  const isOpen = openCats.has(cat) || !!search.trim();
                  return (
                    <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button
                        onClick={() => toggleCat(cat)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 9px", borderRadius: 4,
                          border: "1px solid " + (isOpen ? color + "50" : C.brd),
                          background: isOpen ? color + "10" : C.s2,
                          color, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                          textTransform: "uppercase", letterSpacing: "0.04em",
                          transition: "all 130ms",
                        }}
                      >
                        <ChevronRight
                          size={12}
                          style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 130ms", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                        <span style={{ fontWeight: 500, opacity: 0.6, fontSize: 10 }}>{tests.length}</span>
                      </button>
                      {isOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 6, marginBottom: 2 }}>
                          {tests.map((t) => (
                            <DraggableSession key={t.id} session={{ id: t.id, name: t.name }} sessionType="test" isDragging={activeDragId === t.id} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderTop: "1px solid " + C.brd }}>
        <div style={{ fontSize: 9, color: C.tx3, textAlign: "center" }}>
          ↕ Glisser sur le calendrier
        </div>
      </div>
    </div>
  );
}

// ── CalendarMonthView ─────────────────────────────────────────────────────────

interface CalendarMonthViewProps {
  athleteId: string;
  coachId: string;
  sessions?: Session[]; // legacy — kept for projected events fallback only
  blockConfig?: BlockConfig;
  setBlockConfig?: (fn: (prev: BlockConfig) => BlockConfig) => void;
  exos?: Record<string, unknown[]>;
  sets?: Record<string, unknown[]>;
  completedSessions?: Record<number, string[]>;
  currentWeek?: number;
  wellnessHistory?: Record<string, WellnessData>;
  nutritionLog?: Record<string, unknown>;
}

export function CalendarMonthView({
  athleteId,
  coachId,
  sessions,
  blockConfig,
  setBlockConfig,
  exos,
  sets,
  completedSessions = {},
  currentWeek = 1,
  wellnessHistory,
  nutritionLog,
}: CalendarMonthViewProps) {
  const [month, setMonth]               = useState(new Date());
  const [drawerDay, setDrawerDay]       = useState<Date | null>(null);
  const [drawerInitialEvent, setDrawerInitialEvent] = useState<CalEvent | null>(null);
  const [quickAddDay, setQuickAddDay]   = useState<Date | null>(null);
  const [activeDragId, setActiveDragId]     = useState<string | null>(null);
  const [activeDragEvent, setActiveDragEvent] = useState<CalEvent | null>(null);

  const { monthRange, gridStartDate, gridEndDate } = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd   = endOfMonth(month);
    const gs = startOfWeek(monthStart, { weekStartsOn: 1 });
    const ge = endOfWeek(monthEnd,   { weekStartsOn: 1 });
    return {
      monthRange:   { start: format(gs, "yyyy-MM-dd"), end: format(ge, "yyyy-MM-dd") },
      gridStartDate: gs,
      gridEndDate:   ge,
    };
  }, [month]);

  const qc = useQueryClient();
  const { data: rawEvents = [], isLoading } = useUnifiedCalendar(athleteId, monthRange);
  // Un seul appel pour toute la grille, indexé par date : la case ne requête pas.
  const { data: dayThemeRows = [] } = useDayThemesRange(athleteId, monthRange.start, monthRange.end);
  const dayThemesByDate = useMemo(() => indexDayThemesByDate(dayThemeRows), [dayThemeRows]);
  const { data: scheduledDocs = [] } = useDocSchedule(athleteId, monthRange);
  const fichesByDate = useMemo(() => groupScheduleByDate(scheduledDocs), [scheduledDocs]);
  const realEvents = useMemo(() => rawEvents.map(toCalEvent), [rawEvents]);
  const { mutate: assignWorkout }       = useAssignWorkout();
  const { mutate: reschedule }          = useRescheduleWorkout();
  const { data: progSessions = [] }     = useProgrammation(athleteId);
  const { data: energySessions = [] }   = useEnergySessions({ created_by: coachId });
  const { mutate: assignEnergy }        = useAssignEnergySession();
  const { mutate: rescheduleEnergy }    = useUpdateEnergyAssignment();
  const { data: testDefinitions = [] }  = useTestDefinitions(coachId);
  const pickableTests = useMemo(() => testDefinitions.filter(isPickableTest), [testDefinitions]);
  const { mutate: createTestSession }   = useCreateTestSession();
  const { mutate: rescheduleTest }      = useRescheduleTestSession();

  // ── Fetch all cycles for athlete (to link blockConfig to a Frise cycle) ──
  const { data: allCycles = [] } = useQuery({
    queryKey: ["athlete-cycles", athleteId],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      type CycleRow = { id: string; name: string; start_date: string; end_date: string };

      // Tous les cycles portant directement l'athlète (standalone OU rattachés à un
      // méso mais avec athlete_id renseigné — cas des cycles créés par l'assistant).
      const { data: sa } = await supabase
        .from("cycles").select("id, name, start_date, end_date")
        .eq("athlete_id", athleteId).order("start_date");

      const { data: macros } = await supabase
        .from("macrocycles").select("id").eq("athlete_id", athleteId);

      let nested: CycleRow[] = [];
      if (macros?.length) {
        const macroIds = (macros as { id: string }[]).map(m => m.id);
        const { data: mesos } = await supabase
          .from("mesocycles").select("id").in("macrocycle_id", macroIds);
        if (mesos?.length) {
          const mesoIds = (mesos as { id: string }[]).map(m => m.id);
          const { data: cycles } = await supabase
            .from("cycles").select("id, name, start_date, end_date")
            .in("mesocycle_id", mesoIds).order("start_date");
          nested = (cycles ?? []) as CycleRow[];
        }
      }

      const all = [...(sa ?? []), ...nested] as CycleRow[];
      const seen = new Set<string>();
      return all
        .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
    },
  });

  // ── Frise est maître : sync blockConfig depuis le cycle actif ────────────
  // Priorité : dernier cycle resizé/déplacé dans Frise > cycleId stocké > auto-détection (aujourd'hui)
  useEffect(() => {
    if (!allCycles.length || !setBlockConfig) return;
    const lastResizedId = qc.getQueryData<string>(["active-cycle-id", athleteId]);
    const targetId = lastResizedId ?? blockConfig?.cycleId ?? findCurrentCycleId(allCycles);
    if (!targetId) return;
    const cycle = allCycles.find(c => c.id === targetId);
    if (!cycle) return;
    const newStart = cycle.start_date;
    const newWeeks = Math.max(1,
      differenceInCalendarWeeks(parseISO(cycle.end_date), parseISO(cycle.start_date), { weekStartsOn: 1 }) + 1
    );
    if (blockConfig?.cycleId === targetId && blockConfig.startDate === newStart && blockConfig.totalWeeks === newWeeks) return;
    setBlockConfig(prev => ({ ...prev, cycleId: targetId, startDate: newStart, totalWeeks: newWeeks, blockName: cycle.name }));
  }, [allCycles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enrich realEvents: le statut vient des vrais workout_logs (source de vérité).
  // On NE dérive PLUS la complétion de completedSessions (carte par semaine, globale,
  // non scopée au cycle) : elle marquait des séances futures/non faites comme validées.
  // Une séance n'est "réalisée" que si son log DB l'est. Une séance planifiée passée
  // (non loggée) est affichée "manquée".
  const enrichedRealEvents = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return realEvents.map(e => {
      if (e.type !== "workout") return e;
      if (e.status === "skipped" || e.status === "completed") return e;
      if (e.status === "planned" && e.date < todayStr) return { ...e, status: "missed" };
      return e;
    });
  }, [realEvents]);

  // ── Project ProgSessions onto calendar dates (recurring sessions with day_of_week) ──
  const projectedEvents = useMemo<CalEvent[]>(() => {
    if (!blockConfig?.startDate || !progSessions.length) return [];

    // Snap to Monday of the week containing startDate
    const blockStart = startOfWeek(parseISO(blockConfig.startDate), { weekStartsOn: 1 });

    const activeCyc = allCycles.find((c) => c.id === blockConfig?.cycleId)
      ?? [...allCycles].sort((a, b) => b.end_date.localeCompare(a.end_date))[0];

    // Occurrences déjà couvertes par un vrai log (même date, même semaine
    // d'origine ou même n° d'occurrence) : workout_logs est la source de vérité,
    // une séance déplacée par l'athlète ne doit pas réapparaître à l'ancienne date.
    const coverage = buildProjectionCoverage(
      enrichedRealEvents
        .filter((e) => e.type === "workout")
        .map((e) => ({
          session_id:              e.raw?.session_id as string | undefined,
          scheduled_date:          e.date,
          original_scheduled_date: e.raw?.original_scheduled_date as string | null | undefined,
          // N° d'occurrence comparable seulement à l'intérieur du cycle affiché
          week_number: activeCyc && e.date >= activeCyc.start_date && e.date <= activeCyc.end_date
            ? (e.raw?.week_number as number | null | undefined)
            : null,
        })),
    );

    const out: CalEvent[] = [];
    // Only project recurring sessions that have a day_of_week
    const recurring = progSessions.filter(
      (s) => s.recurrence === "weekly" && s.day_of_week != null
    );
    for (let w = 0; w < (blockConfig.totalWeeks ?? 8); w++) {
      for (const sess of recurring) {
        const dow = sess.day_of_week as number;
        const d   = addDays(blockStart, w * 7 + dow);
        if (d < gridStartDate || d > gridEndDate) continue;

        const dateStr = format(d, "yyyy-MM-dd");
        if (activeCyc && (dateStr < activeCyc.start_date || dateStr > activeCyc.end_date)) continue;
        const weekNum = w + 1;
        if (isProjectionCovered(coverage, sess.id, dateStr, weekNum)) continue;

        const todayStr = format(new Date(), "yyyy-MM-dd");
        const projStatus = dateStr < todayStr ? "missed" : "planned";

        out.push({
          id:     `block-${sess.id}-w${weekNum}`,
          title:  sess.name,
          date:   dateStr,
          type:   "workout",
          status: projStatus,
          raw:    { session_id: sess.id, source: "block_plan", week: weekNum },
        });
      }
    }
    return out;
  }, [blockConfig, progSessions, gridStartDate, gridEndDate, enrichedRealEvents, allCycles]);

  const events = useMemo(
    () => [...enrichedRealEvents.filter(e => e.status !== "skipped"), ...projectedEvents],
    [enrichedRealEvents, projectedEvents],
  );

  const handleEventClick = useCallback((day: Date, event: CalEvent) => {
    setDrawerDay(day);
    setDrawerInitialEvent(event);
  }, []);

  // Sensors : require 8px of movement before drag starts (prevent accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Build calendar grid — includes days from adjacent months to complete the ISO weeks
  const gridDays = eachDayOfInterval({ start: gridStartDate, end: gridEndDate });

  // Group events by date
  const eventsByDate = events.reduce<Record<string, CalEvent[]>>((acc, ev) => {
    (acc[ev.date] ??= []).push(ev);
    return acc;
  }, {});

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const data = e.active.data.current as Record<string, unknown> | undefined;
    if (data?.type === "calendar_event") {
      setActiveDragEvent(data.event as CalEvent);
      setActiveDragId(null);
    } else {
      setActiveDragId(String(e.active.id));
      setActiveDragEvent(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveDragId(null);
      setActiveDragEvent(null);
      if (!over) return;

      const dateStr = String(over.id); // "yyyy-MM-dd"
      const data    = active.data.current as Record<string, unknown> | undefined;

      // ── Reschedule existing calendar event ────────────────────────────────
      if (data?.type === "calendar_event") {
        const event = data.event as CalEvent;
        if (event.date === dateStr) return;

        if (event.type === "energy") {
          rescheduleEnergy({ id: event.id, athleteId, scheduled_date: dateStr });
        } else if (event.type === "test") {
          rescheduleTest({ id: event.id, date: dateStr, athleteId });
        } else {
          reschedule({ event, newDate: dateStr, athleteId, coachId });
        }
        return;
      }

      // ── Bank drag → assign ─────────────────────────────────────────────────
      const sess = active.data.current as { id: string; name?: string; label?: string; sessionType?: BankItemType };
      if (!sess) return;

      if (sess.sessionType === "energy" || sess.sessionType === "specifique") {
        assignEnergy({
          energy_session_id: sess.id,
          athlete_id: athleteId,
          coach_id: coachId,
          scheduled_date: dateStr,
          status: "planned",
        });
      } else if (sess.sessionType === "test") {
        createTestSession({
          athleteId,
          coachId,
          title: sess.name ?? "Test",
          type:  "musculation",
          date:  dateStr,
        });
      } else if (sess.sessionType === "biometric") {
        createTestSession({
          athleteId,
          coachId,
          title: BIO_TITLE,
          type:  "biometric",
          date:  dateStr,
        });
      } else {
        assignWorkout({
          sessionId: sess.id,
          sessionName: sess.name ?? sess.label ?? "Séance",
          athleteId,
          coachId,
          date: dateStr,
        });
      }
    },
    [assignWorkout, assignEnergy, createTestSession, reschedule, rescheduleEnergy, rescheduleTest, athleteId, coachId],
  );

  const activeDragSession = activeDragId
    ? (progSessions.find((s) => s.id === activeDragId)
        ?? energySessions.find((s) => s.id === activeDragId)
        ?? testDefinitions.find((s) => s.id === activeDragId)
        ?? (activeDragId === BIO_BANK_ID ? { id: BIO_BANK_ID, name: BIO_TITLE } : null))
    : null;
  const activeDragIsEnergy = activeDragId ? energySessions.some((s) => s.id === activeDragId) : false;
  const activeDragIsTest   = activeDragId ? testDefinitions.some((s) => s.id === activeDragId) : false;
  const activeDragIsBio    = activeDragId === BIO_BANK_ID;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dayCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Month navigation — pleine largeur */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={() => setMonth((m) => subMonths(m, 1))}
              style={{
                width: 36, height: 36, borderRadius: 4,
                border: "1px solid " + C.brdL, background: "transparent",
                color: C.tx3, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, textTransform: "capitalize" }}>
                {format(month, "MMMM yyyy", { locale: fr })}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
                {[
                  { label: "Séance",  color: C.ac      },
                  { label: "Énergie", color: C.b        },
                  { label: "Test",    color: TEST_COLOR  },
                  { label: "Compét",  color: C.r         },
                ].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 9, color: C.tx3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setMonth((m) => addMonths(m, 1))}
              style={{
                width: 36, height: 36, borderRadius: 4,
                border: "1px solid " + C.brdL, background: "transparent",
                color: C.tx3, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Block-program start-date prompt / legend */}
          {blockConfig && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px", borderRadius: 4,
                background: C.s1, border: "1px solid " + C.brd,
                fontSize: 11, flexWrap: "wrap",
              }}
            >
              <span style={{ color: C.tx3, fontWeight: 600 }}>Cycle :</span>
              {/* Cycle selector — links month view to a Frise cycle so resize auto-syncs dates */}
              <select
                value={blockConfig.cycleId ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setBlockConfig?.((prev) => ({ ...prev, cycleId: undefined }));
                    return;
                  }
                  const cycle = allCycles.find(c => c.id === id);
                  if (!cycle || !setBlockConfig) return;
                  const weeks = Math.max(1,
                    differenceInCalendarWeeks(parseISO(cycle.end_date), parseISO(cycle.start_date), { weekStartsOn: 1 }) + 1
                  );
                  setBlockConfig(prev => ({
                    ...prev,
                    cycleId: id,
                    startDate: cycle.start_date,
                    totalWeeks: weeks,
                    blockName: cycle.name,
                  }));
                }}
                style={{
                  padding: "3px 7px", borderRadius: 6,
                  border: "1px solid " + (blockConfig.cycleId ? C.ac + "80" : C.brdL),
                  background: C.s2, color: C.tx, fontSize: 11, fontFamily: "inherit",
                  maxWidth: 200,
                }}
              >
                <option value="">— lier à un cycle —</option>
                {allCycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.start_date.slice(5)} → {c.end_date.slice(5)})
                  </option>
                ))}
              </select>
              {blockConfig.cycleId && (
                <span style={{ color: C.ac, fontSize: 10, fontWeight: 600 }}>lié</span>
              )}
              <span style={{ color: C.tx3 }}>·</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: C.tx3 }}>
                Début :
                <input
                  type="date"
                  value={blockConfig.startDate ?? ""}
                  onChange={(e) =>
                    setBlockConfig?.((prev) => ({ ...prev, startDate: e.target.value || null, cycleId: undefined }))
                  }
                  style={{
                    padding: "3px 7px", borderRadius: 6,
                    border: "1px solid " + (blockConfig.startDate ? C.brdL : C.o + "60"),
                    background: C.s2,
                    color: blockConfig.startDate ? C.tx : C.o,
                    fontSize: 11, fontFamily: "inherit",
                  }}
                />
              </label>
              {blockConfig.startDate && projectedEvents.length === 0 && (
                <span style={{ color: C.tx3, fontSize: 10 }}>
                  (aucune séance dans ce mois)
                </span>
              )}
              {projectedEvents.length > 0 && (
                <span style={{ color: C.tx3, fontSize: 10 }}>
                  — <span style={{ fontStyle: "italic" }}>prévu</span> = séances du programme
                </span>
              )}
            </div>
          )}

          {/* ── Rangée : calendrier + banque (alignés en haut) ── */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Grid */}
          <div
            style={{
              background: C.s1, borderRadius: 6,
              border: "1px solid " + C.brd, overflow: "hidden",
            }}
          >
            {/* DOW header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {DOW_LABELS.map((d) => (
                <div
                  key={d}
                  style={{
                    padding: "8px 0", textAlign: "center",
                    fontSize: 10, fontWeight: 700, color: C.tx3,
                    textTransform: "uppercase", letterSpacing: "0.4px",
                    borderBottom: "1px solid " + C.brd,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div
                  style={{
                    width: 24, height: 24, border: "2px solid " + C.brdL,
                    borderTopColor: C.ac, borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    margin: "0 auto",
                  }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: 2 }}>
                {gridDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const wKey = dateStr.replace(/-/g, "");
                  const wLogged = !!(wellnessHistory?.[wKey] ?? wellnessHistory?.[dateStr]);
                  const nLogged = !!(nutritionLog?.[dateStr] ?? nutritionLog?.[wKey]);
                  return (
                    <DroppableDay
                      key={dateStr}
                      date={day}
                      events={eventsByDate[dateStr] ?? []}
                      isCurrentMonth={isSameMonth(day, month)}
                      isActive={!!(drawerDay && isSameDay(day, drawerDay))}
                      onClick={() => { setDrawerDay(day); setDrawerInitialEvent(null); }}
                      onEventClick={(ev) => handleEventClick(day, ev)}
                      athleteId={athleteId}
                      coachId={coachId}
                      wellnessLogged={wLogged}
                      nutritionLogged={nLogged}
                      dayTheme={dayThemesByDate[dateStr] ?? null}
                      dayFiches={fichesByDate.get(dateStr)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Stats bar */}
          {events.length > 0 && (
            <div
              style={{
                display: "flex", gap: 16,
                background: C.s1, borderRadius: 6, padding: "10px 16px",
                border: "1px solid " + C.brd, flexWrap: "wrap",
              }}
            >
              {[
                { label: "Séances",      count: events.filter((e) => e.type === "workout").length,     color: C.ac        },
                { label: "Énergie",      count: events.filter((e) => e.type === "energy").length,      color: C.b         },
                { label: "Complétées",   count: events.filter((e) => e.status === "completed").length, color: C.g         },
                { label: "Manquées",     count: events.filter((e) => e.status === "missed").length,    color: C.r         },
                { label: "Tests",        count: events.filter((e) => e.type === "test").length,        color: TEST_COLOR  },
                { label: "Compétitions", count: events.filter((e) => e.type === "competition").length, color: C.r         },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color }}>{count}</span>
                  <span style={{ fontSize: 10, color: C.tx3 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

          {/* ── Bank sidebar (panneau unifié 4 catégories, aligné au calendrier) ── */}
          <PlanningBank
            sessions={progSessions}
            energySessions={energySessions}
            testDefinitions={pickableTests}
            activeDragId={activeDragId}
          />
          </div>
      </div>

      {/* Drag overlay — ghost of the dragged item */}
      <DragOverlay dropAnimation={null}>
        {activeDragEvent ? (
          <div
            style={{
              padding: "4px 10px", borderRadius: 6,
              border: "1px solid " + TYPE_COLOR[activeDragEvent.type] + "60",
              background: TYPE_COLOR[activeDragEvent.type], color: "#fff",
              fontSize: 11, fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            ↕ {activeDragEvent.title}
          </div>
        ) : activeDragSession ? (
          <div
            style={{
              padding: "7px 10px", borderRadius: 4,
              border: "1px solid " + (activeDragIsEnergy ? C.b : activeDragIsTest ? TEST_COLOR : activeDragIsBio ? BIO_COLOR : C.ac) + "60",
              background: activeDragIsEnergy ? C.b : activeDragIsTest ? TEST_COLOR : activeDragIsBio ? BIO_COLOR : C.ac,
              color: "#fff",
              fontSize: 11, fontWeight: 600,
              pointerEvents: "none",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {activeDragIsEnergy ? <Zap size={12} /> : activeDragIsTest ? <FlaskConical size={12} /> : activeDragIsBio ? <Ruler size={12} /> : <Dumbbell size={12} />}
            {activeDragSession.name ?? "Séance"}
          </div>
        ) : null}
      </DragOverlay>

      {/* Fiche ouverte depuis une case (fiches posées sur un jour) */}
      <FicheViewerHost athleteId={athleteId} viewOnly />

      {/* Day details drawer */}
      <DayDetailsDrawer
        open={!!drawerDay}
        onClose={() => { setDrawerDay(null); setDrawerInitialEvent(null); }}
        day={drawerDay}
        events={events}
        athleteId={athleteId}
        coachId={coachId}
        onQuickAdd={(day) => setQuickAddDay(day)}
        exos={exos}
        sets={sets}
        initialSelectedEvent={drawerInitialEvent}
        wellnessHistory={wellnessHistory}
        nutritionLog={nutritionLog}
      />

      {/* Quick-add dialog (also from empty slot click) */}
      <QuickAddDialog
        open={!!quickAddDay}
        onClose={() => setQuickAddDay(null)}
        date={quickAddDay}
        athleteId={athleteId}
        coachId={coachId}
        sessions={progSessions}
      />

      {/* Empty slot click → quick-add (secondary trigger via drawer "+" button works,
          but user can also long-press on empty day — handled in DroppableDay click
          when there are no events) */}
    </DndContext>
  );
}
