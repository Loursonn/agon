import { useState, useCallback, useMemo, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, eachDayOfInterval, parseISO, differenceInCalendarWeeks } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cycleKeys, listAthleteCycles } from "@/api/cycles";
import type { BlockConfig, Session, WellnessData } from "@/features/shared/types/athlete";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Dumbbell, Zap, FlaskConical, Ruler } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { WeekLoadPanel } from "@/features/coach/components/load/WeekLoadPanel";
import { useUnifiedCalendar, useAssignWorkout, useRescheduleWorkout, useCreateTestSession, useRescheduleTestSession, toCalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySessions } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession, useUpdateEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignments";
import { useTestDefinitions } from "@/features/shared/hooks/tests/useTestDefinitions";
import { isPickableTest } from "@/features/shared/types/tests";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { indexDayThemesByDate } from "@/lib/dayTheme";
import { DayDetailsDrawer } from "./DayDetailsDrawer";
import { groupScheduleByDate, useDocSchedule } from "@/features/shared/hooks/fiches/useDocSchedule";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";
import { QuickAddDialog } from "./QuickAddDialog";
import { buildProjectionCoverage, isProjectionCovered } from "@/lib/planningProjection";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import { watchCardsOfDay } from "@/lib/planningCard";
import { DOW_LABELS, TEST_COLOR, BIO_COLOR, BIO_BANK_ID, BIO_TITLE, TYPE_COLOR, BankItemType } from "./calendar/calendarConstants";
import { findCurrentCycleId, dayCollisionDetection } from "./calendar/calendarUtils";
import { DroppableDay } from "./calendar/DroppableDay";
import { PlanningBank } from "./calendar/PlanningBank";
import { PlanningBankBand } from "./calendar/PlanningBankBand";

const WEEK_NAV = "flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-agon-brd-l bg-transparent text-agon-tx2";
const MONTH_NAV = "flex size-9 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-agon-tx3";
const FIELD = "rounded-[6px] border bg-agon-s2 px-[7px] py-[3px] text-[11px]";

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
  /** "week" : semaine pleine largeur, banque en bandeau, charge dessous (P24). */
  layout?: "month" | "week";
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
  layout = "month",
}: CalendarMonthViewProps) {
  const isWeek = layout === "week";
  const [month, setMonth]               = useState(new Date());
  const [weekStart, setWeekStart]       = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [drawerDay, setDrawerDay]       = useState<Date | null>(null);
  const [drawerInitialEvent, setDrawerInitialEvent] = useState<CalEvent | null>(null);
  const [quickAddDay, setQuickAddDay]   = useState<Date | null>(null);
  const [activeDragId, setActiveDragId]     = useState<string | null>(null);
  const [activeDragEvent, setActiveDragEvent] = useState<CalEvent | null>(null);

  const { monthRange, gridStartDate, gridEndDate } = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd   = endOfMonth(month);
    const gs = isWeek ? weekStart : startOfWeek(monthStart, { weekStartsOn: 1 });
    const ge = isWeek ? addDays(weekStart, 6) : endOfWeek(monthEnd,   { weekStartsOn: 1 });
    return {
      monthRange:   { start: format(gs, "yyyy-MM-dd"), end: format(ge, "yyyy-MM-dd") },
      gridStartDate: gs,
      gridEndDate:   ge,
    };
  }, [month, isWeek, weekStart]);

  const qc = useQueryClient();
  const { data: rawEvents = [], isLoading } = useUnifiedCalendar(athleteId, monthRange);
  // Montre (P34) : séances rattachées et activités libres du mois affiché.
  const { data: watchMonth } = usePlannedVsDone(athleteId, monthRange.start, monthRange.end);
  const watchByDate = useMemo(() => {
    const now = Date.now();
    return new Map((watchMonth ?? []).map((d) => [d.date, watchCardsOfDay(d, now)]));
  }, [watchMonth]);
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
    queryKey: cycleKeys.athleteCycles(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
    // Tous les cycles portant directement l'athlète (autonomes OU rattachés à un
    // méso avec athlete_id renseigné — cycles de l'assistant) + ceux de ses mésos.
    queryFn: () => listAthleteCycles(athleteId),
  });

  // ── Frise est maître : sync blockConfig depuis le cycle actif ────────────
  // Priorité : dernier cycle resizé/déplacé dans Frise > cycleId stocké > auto-détection (aujourd'hui)
  useEffect(() => {
    if (!allCycles.length || !setBlockConfig) return;
    const lastResizedId = qc.getQueryData<string>(cycleKeys.activeCycleId(athleteId));
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

  // Vue Semaine : « Semaine 2 » dans le bloc en cours, sinon numéro de semaine de l'année.
  const blockWeek = blockConfig?.startDate
    ? differenceInCalendarWeeks(weekStart, parseISO(blockConfig.startDate), { weekStartsOn: 1 }) + 1
    : null;
  const weekTitle = blockWeek != null && blockWeek >= 1 && blockWeek <= (blockConfig?.totalWeeks ?? 0)
    ? `Semaine ${blockWeek}`
    : `Semaine ${format(weekStart, "I")}`;
  const weekEnd = addDays(weekStart, 6);
  const weekRangeLabel = isSameMonth(weekStart, weekEnd)
    ? `${format(weekStart, "d")} → ${format(weekEnd, "d MMM", { locale: fr })}`
    : `${format(weekStart, "d MMM", { locale: fr })} → ${format(weekEnd, "d MMM", { locale: fr })}`;

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
  const dragColor = activeDragIsEnergy ? C.b : activeDragIsTest ? TEST_COLOR : activeDragIsBio ? BIO_COLOR : C.ac;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dayCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3">

          {isWeek ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" aria-label="Semaine précédente" onClick={() => setWeekStart((w) => addDays(w, -7))} className={WEEK_NAV}>
                <ChevronLeft size={18} />
              </button>
              <div className="flex min-w-0 items-baseline gap-2.5">
                <span className="agon-display text-[22px] tracking-[0.06em] text-agon-tx">{weekTitle}</span>
                <span className="agon-mono text-[12px] text-agon-tx2">{weekRangeLabel}</span>
              </div>
              <button type="button" aria-label="Semaine suivante" onClick={() => setWeekStart((w) => addDays(w, 7))} className={WEEK_NAV}>
                <ChevronRight size={18} />
              </button>
              {!isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 })) && (
                <button type="button" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="h-8 cursor-pointer rounded-[10px] border border-agon-brd-l bg-transparent px-3 text-[12px] text-agon-tx2">
                  Cette semaine
                </button>
              )}
              <div className="ml-auto flex flex-wrap gap-3">
                {[
                  { label: "Musculation", dot: "bg-agon-accent" },
                  { label: "Énergie", dot: "bg-agon-info" },
                  { label: "Spécifique", dot: "bg-agon-type-hyrox" },
                  { label: "Test", dot: "bg-agon-type-test" },
                  { label: "Compétition", dot: "bg-agon-erreur" },
                ].map(({ label, dot }) => (
                  <span key={label} className="inline-flex items-center gap-[5px] text-[11.5px] text-agon-tx3">
                    <span className={cn("size-2 rounded-[2px]", dot)} />{label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
          <>
          {/* Month navigation — pleine largeur */}
          <div className="flex items-center justify-between">
            <button onClick={() => setMonth((m) => subMonths(m, 1))} className={MONTH_NAV}>
              <ChevronLeft size={18} />
            </button>

            <div className="text-center">
              <div className="text-[16px] font-extrabold capitalize text-agon-tx">
                {format(month, "MMMM yyyy", { locale: fr })}
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2.5">
                {[
                  { label: "Séance",  dot: "bg-agon-accent" },
                  { label: "Énergie", dot: "bg-agon-info" },
                  { label: "Test",    dot: "bg-agon-type-test" },
                  { label: "Compét",  dot: "bg-agon-erreur" },
                ].map(({ label, dot }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={cn("size-2 rounded-[2px]", dot)} />
                    <span className="text-[9px] text-agon-tx3">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setMonth((m) => addMonths(m, 1))} className={MONTH_NAV}>
              <ChevronRight size={18} />
            </button>
          </div>

          </>
          )}

          {/* Block-program start-date prompt / legend */}
          {blockConfig && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-[4px] border border-agon-brd bg-agon-s1 px-3.5 py-2 text-[11px]">
              <span className="font-semibold text-agon-tx3">Cycle :</span>
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
                className={cn(FIELD, "max-w-[200px] text-agon-tx", blockConfig.cycleId ? "border-agon-accent/50" : "border-agon-brd-l")}
              >
                <option value="">— lier à un cycle —</option>
                {allCycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.start_date.slice(5)} → {c.end_date.slice(5)})
                  </option>
                ))}
              </select>
              {blockConfig.cycleId && (
                <span className="text-[10px] font-semibold text-agon-accent">lié</span>
              )}
              <span className="text-agon-tx3">·</span>
              <label className="flex items-center gap-1.5 text-agon-tx3">
                Début :
                <input
                  type="date"
                  value={blockConfig.startDate ?? ""}
                  onChange={(e) =>
                    setBlockConfig?.((prev) => ({ ...prev, startDate: e.target.value || null, cycleId: undefined }))
                  }
                  className={cn(FIELD, blockConfig.startDate ? "border-agon-brd-l text-agon-tx" : "border-agon-alerte/[0.376] text-agon-alerte")}
                />
              </label>
              {blockConfig.startDate && projectedEvents.length === 0 && (
                <span className="text-[10px] text-agon-tx3">
                  (aucune séance dans ce mois)
                </span>
              )}
              {projectedEvents.length > 0 && (
                <span className="text-[10px] text-agon-tx3">
                  — <span className="italic">prévu</span> = séances du programme
                </span>
              )}
            </div>
          )}

          {isWeek && (
            <PlanningBankBand
              sessions={progSessions}
              energySessions={energySessions}
              testDefinitions={pickableTests}
              activeDragId={activeDragId}
            />
          )}

          {/* ── Rangée : calendrier + banque (alignés en haut) ── */}
          <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">

          {/* Grid */}
          <div className={isWeek ? undefined : "overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1"}>
            {/* DOW header */}
            {!isWeek && <div className="grid grid-cols-7">
              {DOW_LABELS.map((d) => (
                <div
                  key={d}
                  className="border-b border-agon-brd py-2 text-center text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3"
                >
                  {d}
                </div>
              ))}
            </div>}

            {/* Day cells */}
            {isLoading ? (
              <div className="p-10 text-center">
                <div className="mx-auto size-6 animate-[spin_0.7s_linear_infinite] rounded-full border-2 border-agon-brd-l border-t-agon-accent" />
              </div>
            ) : (
              <div className={cn("grid grid-cols-7", isWeek ? "gap-2 p-0" : "gap-0.5 p-0.5")}>
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
                      isCurrentMonth={isWeek || isSameMonth(day, month)}
                      tall={isWeek}
                      isActive={!!(drawerDay && isSameDay(day, drawerDay))}
                      onClick={() => { setDrawerDay(day); setDrawerInitialEvent(null); }}
                      onEventClick={(ev) => handleEventClick(day, ev)}
                      athleteId={athleteId}
                      coachId={coachId}
                      wellnessLogged={wLogged}
                      nutritionLogged={nLogged}
                      dayTheme={dayThemesByDate[dateStr] ?? null}
                      dayFiches={fichesByDate.get(dateStr)}
                      watchCards={watchByDate.get(dateStr)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Stats bar */}
          {!isWeek && events.length > 0 && (
            <div className="flex flex-wrap gap-4 rounded-[6px] border border-agon-brd bg-agon-s1 px-4 py-2.5">
              {[
                { label: "Séances",      count: events.filter((e) => e.type === "workout").length,     tone: "text-agon-accent"    },
                { label: "Énergie",      count: events.filter((e) => e.type === "energy").length,      tone: "text-agon-info"      },
                { label: "Complétées",   count: events.filter((e) => e.status === "completed").length, tone: "text-agon-succes"    },
                { label: "Manquées",     count: events.filter((e) => e.status === "missed").length,    tone: "text-agon-erreur"    },
                { label: "Tests",        count: events.filter((e) => e.type === "test").length,        tone: "text-agon-type-test" },
                { label: "Compétitions", count: events.filter((e) => e.type === "competition").length, tone: "text-agon-erreur"    },
              ].map(({ label, count, tone }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={cn("text-[15px] font-extrabold", tone)}>{count}</span>
                  <span className="text-[10px] text-agon-tx3">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

          {/* ── Bank sidebar (panneau unifié 4 catégories, aligné au calendrier) ── */}
          {!isWeek && (
            <PlanningBank
              sessions={progSessions}
              energySessions={energySessions}
              testDefinitions={pickableTests}
              activeDragId={activeDragId}
            />
          )}
          </div>

          {/* Sous la semaine : séances, km, zones, charge et ratio aigu / chronique (P25, P28) */}
          {isWeek && athleteId && <WeekLoadPanel athleteId={athleteId} weekStart={format(weekStart, "yyyy-MM-dd")} />}
      </div>

      {/* Drag overlay — ghost of the dragged item (couleur du type : valeur calculée) */}
      <DragOverlay dropAnimation={null}>
        {activeDragEvent ? (
          <div
            className="pointer-events-none rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold text-agon-tx"
            style={{ borderColor: alpha(TYPE_COLOR[activeDragEvent.type], 0.376), background: TYPE_COLOR[activeDragEvent.type] }}
          >
            ↕ {activeDragEvent.title}
          </div>
        ) : activeDragSession ? (
          <div
            className="pointer-events-none flex items-center gap-1.5 rounded-[4px] border px-2.5 py-[7px] text-[11px] font-semibold text-agon-tx"
            style={{ borderColor: alpha(dragColor, 0.376), background: dragColor }}
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
