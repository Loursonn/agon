import { useState, useMemo, useCallback } from "react";
import {
  format, addMonths, subMonths,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isToday, isPast,
  parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { C } from "@/lib/theme";
import type { EnergySessionAssignmentRow, EnergySessionRow, SessionKind } from "@/types/energy";
import { useEnergyAssignments, useUpdateEnergyAssignment, useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { EnergyAssignmentDrawer } from "./EnergyAssignmentDrawer";
import { SessionPickerDialog } from "./SessionPickerDialog";

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Le curseur décide du jour ciblé (cf. CalendarMonthView) : la détection par
// intersection de rectangles visait un jour voisin, ou aucun près des bords.
const dayCollisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : closestCenter(args);
};

const KIND_COLORS: Record<string, string> = {
  vo2:        "#FFC933",
  tempo:      "#33B5FF",
  seuil:      "#FF9500",
  footing:    "#66F03C",
  fartlek:    "#FF9500",
  autre:      "#7D7468",
  custom:     "#FFC933",
  specifique: "#F5A623",
};

const KIND_LABELS: Record<string, string> = {
  vo2:        "VO₂",
  tempo:      "Tempo",
  seuil:      "Seuil",
  footing:    "Footing",
  fartlek:    "Fartlek",
  autre:      "Autre",
  custom:     "Custom",
  specifique: "Spécifique",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  athleteId: string;
  sessionKindFilter?: string;
}

// ── EventBadge (draggable) ────────────────────────────────────────────────────

function EventBadge({
  assignment,
  onClick,
}: {
  assignment: EnergySessionAssignmentRow;
  onClick: (a: EnergySessionAssignmentRow) => void;
}) {
  const kind = (assignment.energy_sessions?.session_kind ?? "autre") as SessionKind;
  const color = KIND_COLORS[kind] ?? C.tx3;
  const kindLabel = KIND_LABELS[kind] ?? kind;
  const name = assignment.energy_sessions?.name ?? "Séance";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
    data: { assignment },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick(assignment);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        borderRadius: 4,
        background: color + "18",
        borderLeft: `2px solid ${color}`,
        cursor: "grab",
        opacity: isDragging ? 0.3 : 1,
        marginBottom: 2,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {name}
      </span>
      <span style={{ fontSize: 9, color: color + "CC", flexShrink: 0 }}>
        {kindLabel}
      </span>
    </div>
  );
}

// ── DayCell ───────────────────────────────────────────────────────────────────

function DayCell({
  day,
  isCurrentMonth,
  assignments,
  onClickAssignment,
  onClickDay,
}: {
  day: Date;
  isCurrentMonth: boolean;
  assignments: EnergySessionAssignmentRow[];
  onClickAssignment: (a: EnergySessionAssignmentRow) => void;
  onClickDay: (date: string) => void;
}) {
  const dateStr = format(day, "yyyy-MM-dd");
  const today = isToday(day);
  const past = isPast(day) && !today;

  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  return (
    <div
      ref={setNodeRef}
      onClick={() => onClickDay(dateStr)}
      style={{
        minHeight: 80,
        background: isOver
          ? C.acS
          : isCurrentMonth
          ? C.bg
          : C.s2,
        borderRadius: 4,
        border: today
          ? `1.5px solid ${C.ac}`
          : `1px solid ${C.brd}`,
        padding: "6px 6px 4px",
        opacity: past && !isCurrentMonth ? 0.4 : past ? 0.6 : 1,
        cursor: "pointer",
        transition: "background 0.1s",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Day number */}
      <div
        style={{
          fontSize: 11,
          fontWeight: today ? 700 : 500,
          color: today ? C.ac : isCurrentMonth ? C.tx2 : C.tx3,
          marginBottom: 4,
          lineHeight: 1,
        }}
      >
        {format(day, "d")}
      </div>

      {/* Events */}
      <div style={{ flex: 1 }}>
        {assignments.map((a) => (
          <EventBadge key={a.id} assignment={a} onClick={onClickAssignment} />
        ))}
      </div>
    </div>
  );
}

// ── DragOverlayBadge ──────────────────────────────────────────────────────────

function DragOverlayBadge({ assignment }: { assignment: EnergySessionAssignmentRow }) {
  const kind = (assignment.energy_sessions?.session_kind ?? "autre") as SessionKind;
  const color = KIND_COLORS[kind] ?? C.tx3;
  const name = assignment.energy_sessions?.name ?? "Séance";

  return (
    <div
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        background: C.s1,
        border: `1px solid ${color}`,
        color,
        fontSize: 11,
        fontWeight: 600,
        pointerEvents: "none",
      }}
    >
      {name}
    </div>
  );
}

// ── Session bank sidebar ──────────────────────────────────────────────────────

function DraggableBankSession({ session }: { session: EnergySessionRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bank_${session.id}`,
    data: { bankSession: session },
  });
  const kc = KIND_COLORS[session.session_kind] ?? "#FFC933";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        padding: "6px 8px", borderRadius: 7,
        border: `1px solid ${kc}30`,
        background: kc + "10",
        cursor: "grab", opacity: isDragging ? 0.4 : 1,
        transition: "opacity 120ms",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {session.name}
      </div>
      <div style={{ fontSize: 9, color: C.tx3, display: "flex", gap: 6, marginTop: 2 }}>
        <span style={{ color: kc, fontWeight: 700 }}>
          {KIND_LABELS[session.custom_kind ?? ""] ?? KIND_LABELS[session.session_kind] ?? session.session_kind}
        </span>
        {session.total_duration_s != null && (
          <span>{Math.round(session.total_duration_s / 60)} min</span>
        )}
      </div>
    </div>
  );
}

function SessionBankSidebar({ sessions, sessionKindFilter }: { sessions: EnergySessionRow[]; sessionKindFilter?: string }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = sessions;
    if (sessionKindFilter) {
      list = list.filter((s) => s.session_kind === sessionKindFilter);
    } else {
      list = list.filter((s) => s.session_kind !== "specifique");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, sessionKindFilter, search]);

  return (
    <div style={{
      width: 200, flexShrink: 0,
      background: C.s1, borderRadius: 6,
      border: `1px solid ${C.brd}`,
      display: "flex", flexDirection: "column",
      overflow: "hidden", maxHeight: "100%",
    }}>
      <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.brd}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          {sessionKindFilter === "specifique" ? "Séances spécifiques" : "Séances énergétiques"}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer..."
          style={{
            width: "100%", padding: "5px 8px", borderRadius: 7,
            border: `1px solid ${C.brdL}`, background: C.s2,
            color: C.tx, fontSize: 11, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{
        flex: 1, overflowY: "auto", padding: 8,
        display: "flex", flexDirection: "column", gap: 5,
        scrollbarWidth: "none",
      }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 11, color: C.tx3, textAlign: "center", padding: "12px 0" }}>
            {search ? "Aucun résultat" : "Aucune séance"}
          </div>
        ) : (
          filtered.map((s) => <DraggableBankSession key={s.id} session={s} />)
        )}
      </div>
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.brd}` }}>
        <div style={{ fontSize: 9, color: C.tx3, textAlign: "center" }}>↕ Glisser sur le calendrier</div>
      </div>
    </div>
  );
}

// ── EnergyCalendarView ────────────────────────────────────────────────────────

export function EnergyCalendarView({ athleteId, sessionKindFilter }: Props) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedAssignment, setSelectedAssignment] = useState<EnergySessionAssignmentRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<EnergySessionAssignmentRow | null>(null);

  const { data: bankSessions = [] } = useEnergySessions();
  const assignMut = useAssignEnergySession();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Grid bounds
  const gridStartDate = useMemo(
    () => startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    [month]
  );
  const gridEndDate = useMemo(
    () => endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    [month]
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStartDate, end: gridEndDate }),
    [gridStartDate, gridEndDate]
  );

  // Fetch assignments
  const { data: assignments = [] } = useEnergyAssignments(athleteId, {
    from: format(gridStartDate, "yyyy-MM-dd"),
    to: format(gridEndDate, "yyyy-MM-dd"),
  });

  const updateMut = useUpdateEnergyAssignment();

  // Filter by session kind if needed, then group by date
  const filteredAssignments = useMemo(() => {
    if (!sessionKindFilter) return assignments;
    return assignments.filter((a) => a.energy_sessions?.session_kind === sessionKindFilter);
  }, [assignments, sessionKindFilter]);

  const byDate = useMemo(() => {
    const map: Record<string, EnergySessionAssignmentRow[]> = {};
    for (const a of filteredAssignments) {
      const d = a.scheduled_date;
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return map;
  }, [filteredAssignments]);

  // Handlers
  const handleClickAssignment = useCallback((a: EnergySessionAssignmentRow) => {
    setSelectedAssignment(a);
    setDrawerOpen(true);
  }, []);

  const handleClickDay = useCallback((dateStr: string) => {
    setPickerDate(dateStr);
  }, []);

  const handleDragStart = useCallback(
    (event: { active: { data: { current?: { assignment?: EnergySessionAssignmentRow } } } }) => {
      const a = event.active.data.current?.assignment ?? null;
      setActiveAssignment(a);
    },
    []
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveAssignment(null);
      const { active, over } = event;
      if (!over) return;
      const activeId = active.id as string;
      const newDate = over.id as string;

      // Bank session drop → create assignment
      if (activeId.startsWith("bank_")) {
        const bankSession = active.data.current?.bankSession as EnergySessionRow | undefined;
        if (bankSession) {
          assignMut.mutate({
            energy_session_id: bankSession.id,
            athlete_id: athleteId,
            scheduled_date: newDate,
            status: "planned",
          });
        }
        return;
      }

      // Existing assignment drag → reschedule
      const found = assignments.find((a) => a.id === activeId);
      if (!found) return;
      if (found.scheduled_date === newDate) return;
      updateMut.mutate({ id: activeId, athleteId, scheduled_date: newDate });
    },
    [assignments, athleteId, updateMut, assignMut]
  );

  const monthLabel = format(month, "MMMM yyyy", { locale: fr });
  const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div style={{ width: "100%", display: "flex", gap: 16 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          style={{
            background: C.s2,
            border: `1px solid ${C.brd}`,
            borderRadius: 4,
            color: C.tx,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Précédent
        </button>

        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
          {monthLabelCapitalized}
        </div>

        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          style={{
            background: C.s2,
            border: `1px solid ${C.brd}`,
            borderRadius: 4,
            color: C.tx,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Suivant →
        </button>
      </div>

      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 4,
        }}
      >
        {DOW_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              color: C.tx3,
              padding: "4px 0",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={dayCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
          }}
        >
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayAssignments = byDate[dateStr] ?? [];
            return (
              <DayCell
                key={dateStr}
                day={day}
                isCurrentMonth={isSameMonth(day, month)}
                assignments={dayAssignments}
                onClickAssignment={handleClickAssignment}
                onClickDay={handleClickDay}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeAssignment ? (
            <DragOverlayBadge assignment={activeAssignment} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Assignment drawer */}
      <EnergyAssignmentDrawer
        assignment={selectedAssignment}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        athleteId={athleteId}
      />

      {/* Session picker */}
      {pickerDate && (
        <SessionPickerDialog
          open={true}
          onClose={() => setPickerDate(null)}
          date={pickerDate}
          athleteId={athleteId}
          sessionKindFilter={sessionKindFilter}
        />
      )}
    </div>

    {/* Session bank sidebar */}
    <SessionBankSidebar sessions={bankSessions} sessionKindFilter={sessionKindFilter} />
    </div>
  );
}

export default EnergyCalendarView;
