import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { startOfMonth, addMonths, subMonths, format, parseISO, addWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Plus, Eye } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cycleKeys, invalidateCycles, updatePeriod, type PeriodLevel } from "@/api/cycles";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeleteCompetition } from "@/hooks/useCompetitions";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { snapMonday, snapSunday, keepWeeks, chainNextStart, endFromWeeks } from "./utils/planningHelpers";
import {
  LEVEL_STYLE, CREATE_LEVELS,
  type CreateLevel, type CreateState, type DrawerType, type NoParentDragState, type ParentOption,
  type SnapConflict, type SnapDragDialogState,
} from "./utils/timelineLevels";
import { usePlanningKeyboardShortcuts } from "./hooks/usePlanningKeyboardShortcuts";
import { useTimelineData } from "./hooks/useTimelineData";
import { useCalculatePosition } from "./hooks/useCalculatePosition";
import { useDragCycle } from "./hooks/useDragCycle";
import { useResizeCycle } from "./hooks/useResizeCycle";
import type { Mesocycle, Cycle, Competition, TimelineData } from "./hooks/useTimelineData";
import { TimeAxis } from "./TimeAxis";
import { TimelineRow } from "./TimelineRow";
import type { TLRowItem } from "./TimelineRow";
import { CompetitionMarkers } from "./CompetitionMarkers";
import { TestMarkers } from "./TestMarkers";
import { CompetitionFormModal } from "./CompetitionFormModal";
import { CreateCycleAssistant } from "./CreateCycleAssistant";
import { AddPeriodMenu } from "./AddPeriodMenu";
import { CreatePeriodDialog } from "./dialogs/CreatePeriodDialog";
import { NoParentDragDialog } from "./dialogs/NoParentDragDialog";
import { SnapDragDialog } from "./dialogs/SnapDragDialog";
import { PeriodDrawer, type DrawerState } from "./drawers/PeriodDrawer";

// ── TimelineView ──────────────────────────────────────────────────────────────

interface TimelineViewProps { athleteId: string }

/** Mois affichés : 6 sur téléphone (la frise tient dans l'écran), 18 sur PC. */
const MONTHS_MOBILE = 6;
const MONTHS_DESKTOP = 18;
const LABEL_W_MOBILE = 60;
const LABEL_W_DESKTOP = 88;
const ROW_H = 52;
const TOTAL_ROW_H = ROW_H * 4;

export function TimelineView({ athleteId }: TimelineViewProps) {
  const [windowStart,    setWindowStart]    = useState(() => startOfMonth(new Date()));
  const [drawer,         setDrawer]         = useState<DrawerState | null>(null);
  const [createModal,    setCreateModal]    = useState<CreateState | null>(null);
  const [cycleAssistant, setCycleAssistant] = useState<{
    parentMesoId:  string;
    parentOptions: { id: string; label: string }[];
    defaultStart:  string;
    defaultEnd:    string;
  } | null>(null);
  const [zoomMacro,      setZoomMacro]      = useState<{ start: Date; end: Date; label: string } | null>(null);
  const [editingComp,    setEditingComp]    = useState<Competition | null>(null);
  const [noParentModal,  setNoParentModal]  = useState<NoParentDragState | null>(null);
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [snapDragDialog, setSnapDragDialog] = useState<SnapDragDialogState | null>(null);
  const [cycleRowResetKey, setCycleRowResetKey] = useState(0);
  const isMobile = useIsMobile();

  const qc = useQueryClient();
  const { user } = useAuth();
  const { mutate: deleteComp } = useDeleteCompetition();

  const rangeStart = zoomMacro ? zoomMacro.start : windowStart;
  const monthsShown = isMobile ? MONTHS_MOBILE : MONTHS_DESKTOP;
  const labelW      = isMobile ? LABEL_W_MOBILE : LABEL_W_DESKTOP;
  const rangeEnd    = zoomMacro ? zoomMacro.end : addMonths(windowStart, monthsShown);
  const rsStr      = format(rangeStart, "yyyy-MM-dd");
  const reStr      = format(rangeEnd,   "yyyy-MM-dd");

  const containerRef    = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, entry.contentRect.width));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { data, isLoading, isError, refetch } = useTimelineData(athleteId, { start: rangeStart, end: rangeEnd });
  const calc = useCalculatePosition(rangeStart, rangeEnd, width - labelW);

  const { mutate: _drag }   = useDragCycle();
  const { mutate: _resize } = useResizeCycle();

  // ── Undo stack ────────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<TimelineData[]>([]);

  const pushUndo = useCallback((previous: TimelineData) => {
    setUndoStack((s) => [...s.slice(-9), previous]);
  }, []);

  // Wrap drag/resize to capture snapshots into the undo stack on success
  const drag: typeof _drag = useCallback((vars, opts?) => {
    _drag(vars as never, {
      ...(opts as object),
      onSuccess: (d: unknown, v: unknown, ctx: unknown) => {
        const c = ctx as { previous?: TimelineData } | undefined;
        if (c?.previous) pushUndo(c.previous);
        (opts as { onSuccess?: (...a: unknown[]) => void })?.onSuccess?.(d, v, ctx);
      },
    } as never);
  }, [_drag, pushUndo]);

  const resize: typeof _resize = useCallback((vars, opts?) => {
    _resize(vars as never, {
      ...(opts as object),
      onSuccess: (d: unknown, v: unknown, ctx: unknown) => {
        const c = ctx as { previous?: TimelineData } | undefined;
        if (c?.previous) pushUndo(c.previous);
        (opts as { onSuccess?: (...a: unknown[]) => void })?.onSuccess?.(d, v, ctx);
      },
    } as never);
  }, [_resize, pushUndo]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || !data) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));

    // Restore cache immediately
    qc.setQueryData(cycleKeys.timeline(athleteId, rsStr, reStr), previous);

    // Restore changed items in DB
    const levels = ["macrocycles", "mesocycles", "cycles", "microcycles"] as const;
    try {
      for (const level of levels) {
        const prevItems = previous[level] as Array<{ id: string; start_date: string; end_date: string }>;
        const currItems = (data[level] as Array<{ id: string; start_date: string; end_date: string }>);
        for (const prev of prevItems) {
          const curr = currItems.find((c) => c.id === prev.id);
          if (!curr || curr.start_date !== prev.start_date || curr.end_date !== prev.end_date) {
            await updatePeriod(level, prev.id, { start_date: prev.start_date, end_date: prev.end_date });
          }
        }
      }
    } catch {
      void invalidateCycles(qc, athleteId);
      toast.error("Annulation incomplète");
      return;
    }

    void invalidateCycles(qc, athleteId);
    toast.success("Action annulée");
  }, [undoStack, data, athleteId, rsStr, reStr, qc]);

  const open = useCallback((type: DrawerType, id: string) => { setDrawer({ type, id }); setSelectedId(id); }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  usePlanningKeyboardShortcuts({
    enabled: !createModal && !drawer,
    onNew: () => openCreate("macrocycle", undefined, rsStr, reStr),
    onEscape: () => { setDrawer(null); setSelectedId(null); },
    onDelete: () => {
      if (!selectedId || !drawer) return;
      // Handled via drawer's delete confirm flow — open the drawer if not open
    },
    onPrevPeriod: () => {
      if (!selectedId || !drawer) return;
      const arr = drawer.type === "macrocycle" ? data?.macrocycles
                : drawer.type === "mesocycle"  ? data?.mesocycles
                : drawer.type === "cycle"       ? data?.cycles
                : data?.microcycles;
      if (!arr) return;
      const sorted = [...arr].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const idx = sorted.findIndex((x) => x.id === selectedId);
      if (idx > 0) { const prev = sorted[idx - 1]; open(drawer.type, prev.id); }
    },
    onNextPeriod: () => {
      if (!selectedId || !drawer) return;
      const arr = drawer.type === "macrocycle" ? data?.macrocycles
                : drawer.type === "mesocycle"  ? data?.mesocycles
                : drawer.type === "cycle"       ? data?.cycles
                : data?.microcycles;
      if (!arr) return;
      const sorted = [...arr].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const idx = sorted.findIndex((x) => x.id === selectedId);
      if (idx >= 0 && idx < sorted.length - 1) { const next = sorted[idx + 1]; open(drawer.type, next.id); }
    },
  });

  // ── Drag/resize overlap detection ────────────────────────────────────────

  function detectDragConflict(
    level: "macrocycles" | "mesocycles" | "cycles",
    id: string,
    ns: string, // snapped start
    ne: string, // snapped end
  ): SnapConflict | null {
    if (!data) return null;
    let siblings: Array<{ id: string; name: string; start_date: string; end_date: string }> = [];
    if (level === "macrocycles") {
      siblings = data.macrocycles.filter((m) => m.id !== id);
    } else if (level === "mesocycles") {
      const meso = data.mesocycles.find((m) => m.id === id);
      if (!meso) return null;
      siblings = data.mesocycles.filter((m) => m.macrocycle_id === meso.macrocycle_id && m.id !== id);
    } else {
      const cycle = data.cycles.find((c) => c.id === id);
      if (!cycle) return null;
      siblings = data.cycles.filter((c) => c.mesocycle_id === cycle.mesocycle_id && c.id !== id);
    }
    return siblings.find((s) => s.start_date <= ne && s.end_date >= ns) ?? null;
  }

  // ── Cascade shift helper ─────────────────────────────────────────────────

  async function cascadeShift1Week(
    level: "macrocycles" | "mesocycles" | "cycles",
    conflictStartDate: string,
    parentIdValue: string,
    excludeId?: string,
  ) {
    if (!data) return;
    let allSiblings: Array<{ id: string; start_date: string; end_date: string }>;
    if (level === "macrocycles") {
      allSiblings = data.macrocycles;
    } else if (level === "mesocycles") {
      allSiblings = data.mesocycles.filter((m) => m.macrocycle_id === parentIdValue);
    } else {
      allSiblings = data.cycles.filter((c) => c.mesocycle_id === parentIdValue);
    }
    const toShift = allSiblings
      .filter((s) => s.start_date >= conflictStartDate && s.id !== excludeId)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (const item of toShift) {
      const newStart = format(addWeeks(parseISO(item.start_date), 1), "yyyy-MM-dd");
      const newEnd   = format(addWeeks(parseISO(item.end_date),   1), "yyyy-MM-dd");
      await updatePeriod(level as PeriodLevel, item.id, { start_date: newStart, end_date: newEnd });
    }
    void invalidateCycles(qc, athleteId);
  }

  function buildExistingSiblings(level: CreateLevel): CreateState["existingSiblings"] {
    if (!data) return [];
    if (level === "macrocycle") {
      return data.macrocycles.map((m) => ({ id: m.id, name: m.name, start_date: m.start_date, end_date: m.end_date, parentId: athleteId }));
    }
    if (level === "mesocycle") {
      return data.mesocycles.map((m) => ({ id: m.id, name: m.name, start_date: m.start_date, end_date: m.end_date, parentId: m.macrocycle_id }));
    }
    if (level === "cycle") {
      return data.cycles.map((c) => ({ id: c.id, name: c.name, start_date: c.start_date, end_date: c.end_date, parentId: c.mesocycle_id ?? "" }));
    }
    return [];
  }

  function openCreate(
    level: CreateLevel,
    parentId?: string,
    defaultStart?: string,
    defaultEnd?: string,
    minStart?: string,
    parentOptions?: ParentOption[],
    siblingItems?: Array<{ parentId: string; end_date: string }>,
  ) {
    const levelForCascade = level === "macrocycle" ? "macrocycles"
                          : level === "mesocycle"  ? "mesocycles"
                          : level === "cycle"      ? "cycles"
                          : null;
    setCreateModal({
      level, parentId, parentOptions, siblingItems,
      defaultStart:     defaultStart ?? rsStr,
      defaultEnd:       defaultEnd   ?? reStr,
      minStart,
      existingSiblings: buildExistingSiblings(level),
      cascadeShiftFn:   levelForCascade
        ? (conflictStartDate, parentIdValue) => cascadeShift1Week(levelForCascade, conflictStartDate, parentIdValue)
        : undefined,
    });
  }

  function makeAddHandler(
    childLevel: CreateLevel,
    parentArr: "macrocycles" | "mesocycles" | "cycles",
    childrenArr: "mesocycles" | "cycles" | "microcycles",
    parentKey: string,
  ) {
    return (parentId: string) => {
      if (!parentId) { toast.error("Sélectionne d'abord un parent"); return; }

      const parent = (data?.[parentArr] as Array<{ id: string; start_date: string; end_date: string }>)
        ?.find((i) => i.id === parentId);

      // Find last existing child of this parent → auto-chain
      type AnyItem = { id: string; start_date: string; end_date: string } & Record<string, unknown>;
      const children = (data?.[childrenArr] as unknown as AnyItem[] | undefined)
        ?.filter((i) => i[parentKey] === parentId)
        ?.sort((a, b) => b.start_date.localeCompare(a.start_date));
      const lastChild = children?.[0];

      let defaultStart: string;
      let defaultEnd: string;
      let minStart: string | undefined;

      if (lastChild) {
        // Chain right after last sibling (next Monday)
        defaultStart = chainNextStart(lastChild.end_date);
        minStart     = defaultStart; // cannot start before this
        // preserve last child's week count
        const lastWeeks = Math.max(1, Math.round(
          (new Date(lastChild.end_date).getTime() - new Date(lastChild.start_date).getTime())
          / (7 * 24 * 60 * 60 * 1000)
        ) + 1);
        defaultEnd = endFromWeeks(defaultStart, lastWeeks);
      } else {
        // No siblings yet: start at parent's start, default 4 weeks
        defaultStart = parent ? snapMonday(parent.start_date) : rsStr;
        minStart     = defaultStart;
        defaultEnd   = endFromWeeks(defaultStart, 4);
      }

      openCreate(childLevel, parentId, defaultStart, defaultEnd, minStart);
    };
  }

  function makeDragHandler(level: "macrocycles" | "mesocycles" | "cycles" | "microcycles") {
    return (id: string, ns: string, ne: string, ps?: string, pe?: string) => {
      const item = (data?.[level] as Array<{ id: string; name?: string; start_date: string; end_date: string }>)?.find((i) => i.id === id);
      if (!item) return;
      if (level !== "microcycles") {
        const snappedStart = snapMonday(ns);
        // Preserve original week count — don't snap ne independently (it's newStart+dur, pre-snap)
        const snappedEnd   = keepWeeks(snappedStart, item.start_date, item.end_date);
        const conflict = detectDragConflict(level as "macrocycles" | "mesocycles" | "cycles", id, snappedStart, snappedEnd);
        if (conflict) {
          const cascadeParentId = level === "mesocycles" ? (item as unknown as Mesocycle).macrocycle_id
                                : level === "cycles"     ? ((item as unknown as Cycle).mesocycle_id ?? "")
                                : "";
          setSnapDragDialog({
            movingLabel: item.name ?? id,
            movingStart: snappedStart,
            movingEnd:   snappedEnd,
            conflict,
            onConfirmSnap: (newStart, newEnd) => {
              setSnapDragDialog(null);
              drag({ level, item: item as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
            },
            onCascadeShift: async () => {
              await cascadeShift1Week(level as "macrocycles" | "mesocycles" | "cycles", conflict.start_date, cascadeParentId, id);
              setSnapDragDialog(null);
              drag({ level, item: item as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
            },
            onCancel: () => setSnapDragDialog(null),
          });
          return;
        }
        drag({ level, item: item as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
        return;
      }
      drag({ level, item: item as never, newStart: parseISO(ns), newEnd: parseISO(ne), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
    };
  }

  function makeResizeHandler(level: "macrocycles" | "mesocycles" | "cycles" | "microcycles") {
    return (id: string, ns: string, ne: string, ps?: string, pe?: string) => {
      const item = (data?.[level] as Array<{ id: string; name?: string; start_date: string; end_date: string }>)?.find((i) => i.id === id);
      if (!item) return;
      if (level !== "microcycles") {
        const snappedStart = snapMonday(ns);
        const snappedEnd   = snapSunday(ne);
        const conflict = detectDragConflict(level as "macrocycles" | "mesocycles" | "cycles", id, snappedStart, snappedEnd);
        if (conflict) {
          const cascadeParentId = level === "mesocycles" ? (item as unknown as Mesocycle).macrocycle_id
                                : level === "cycles"     ? ((item as unknown as Cycle).mesocycle_id ?? "")
                                : "";
          setSnapDragDialog({
            movingLabel: item.name ?? id,
            movingStart: snappedStart,
            movingEnd:   snappedEnd,
            conflict,
            onConfirmSnap: (newStart, newEnd) => {
              setSnapDragDialog(null);
              resize({ level, item: item as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
            },
            onCascadeShift: async () => {
              await cascadeShift1Week(level as "macrocycles" | "mesocycles" | "cycles", conflict.start_date, cascadeParentId, id);
              setSnapDragDialog(null);
              resize({ level, item: item as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
            },
            onCancel: () => setSnapDragDialog(null),
          });
          return;
        }
        resize({ level, item: item as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
        return;
      }
      resize({ level, item: item as never, newStart: parseISO(ns), newEnd: parseISO(ne), parentStart: ps, parentEnd: pe, athleteId, rangeStart: rsStr, rangeEnd: reStr });
    };
  }

  // ── Cycle drag/resize with no-parent detection ───────────────────────────

  function handleCycleDrag(id: string, ns: string, _ne: string) {
    const cycle = data?.cycles.find((c) => c.id === id);
    if (!cycle) return;
    const snappedStart = snapMonday(ns);
    // Preserve original week count — ne is newStart+dur (pre-snap), not the intended end
    const snappedEnd   = keepWeeks(snappedStart, cycle.start_date, cycle.end_date);

    // Overlap check with same-meso siblings (current meso)
    const conflict = detectDragConflict("cycles", id, snappedStart, snappedEnd);
    if (conflict) {
      setSnapDragDialog({
        movingLabel: cycle.name,
        movingStart: snappedStart,
        movingEnd:   snappedEnd,
        conflict,
        onConfirmSnap: (newStart, newEnd) => {
          setSnapDragDialog(null);
          const meso = data?.mesocycles.find((m) => newStart >= m.start_date && newStart <= m.end_date);
          if (meso) {
            drag({ level: "cycles", item: cycle as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr,
                   newMesocycleId: cycle.mesocycle_id !== meso.id ? meso.id : undefined });
          } else {
            setNoParentModal({ cycleId: id, newStart, newEnd });
          }
        },
        onCascadeShift: async () => {
          await cascadeShift1Week("cycles", conflict.start_date, cycle.mesocycle_id ?? "", id);
          setSnapDragDialog(null);
          const meso = data?.mesocycles.find((m) => snappedStart >= m.start_date && snappedStart <= m.end_date);
          if (meso) {
            drag({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr,
                   newMesocycleId: cycle.mesocycle_id !== meso.id ? meso.id : undefined });
          } else {
            setNoParentModal({ cycleId: id, newStart: snappedStart, newEnd: snappedEnd });
          }
        },
        onCancel: () => { setSnapDragDialog(null); setCycleRowResetKey((k) => k + 1); },
      });
      return;
    }

    const meso = data?.mesocycles.find((m) => snappedStart >= m.start_date && snappedStart <= m.end_date);

    // Cross-meso overlap check: when cycle moves to a DIFFERENT meso, verify no conflict there
    if (meso && meso.id !== cycle.mesocycle_id) {
      const targetConflict = data?.cycles.find(
        (c) => c.mesocycle_id === meso.id && c.id !== id
            && c.start_date <= snappedEnd && c.end_date >= snappedStart,
      );
      if (targetConflict) {
        setSnapDragDialog({
          movingLabel: cycle.name,
          movingStart: snappedStart,
          movingEnd:   snappedEnd,
          conflict:    targetConflict,
          onConfirmSnap: (newStart, newEnd) => {
            setSnapDragDialog(null);
            drag({ level: "cycles", item: cycle as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr, newMesocycleId: meso.id });
          },
          onCascadeShift: async () => {
            await cascadeShift1Week("cycles", targetConflict.start_date, meso.id, id);
            setSnapDragDialog(null);
            drag({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr, newMesocycleId: meso.id });
          },
          onCancel: () => { setSnapDragDialog(null); setCycleRowResetKey((k) => k + 1); },
        });
        return;
      }
    }

    if (meso) {
      drag({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
             athleteId, rangeStart: rsStr, rangeEnd: reStr,
             newMesocycleId: cycle.mesocycle_id !== meso.id ? meso.id : undefined });
    } else {
      setNoParentModal({ cycleId: id, newStart: snappedStart, newEnd: snappedEnd });
    }
  }

  function handleCycleResize(id: string, ns: string, ne: string) {
    const cycle = data?.cycles.find((c) => c.id === id);
    if (!cycle) return;
    // Date de début VERROUILLÉE : on ignore ns et on garde le début d'origine.
    // Seule la fin peut bouger (rallonger/raccourcir le cycle) sans décaler les
    // semaines déjà réalisées. Le début se modifie via les détails du cycle.
    void ns;
    const snappedStart = cycle.start_date;
    const snappedEnd   = snapSunday(ne);

    // Overlap check with same-meso siblings
    const conflict = detectDragConflict("cycles", id, snappedStart, snappedEnd);
    if (conflict) {
      setSnapDragDialog({
        movingLabel: cycle.name,
        movingStart: snappedStart,
        movingEnd:   snappedEnd,
        conflict,
        onConfirmSnap: (newStart, newEnd) => {
          setSnapDragDialog(null);
          const meso = data?.mesocycles.find((m) => newStart >= m.start_date && newStart <= m.end_date);
          resize({ level: "cycles", item: cycle as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr,
                   newMesocycleId: meso && cycle.mesocycle_id !== meso.id ? meso.id : undefined });
        },
        onCascadeShift: async () => {
          await cascadeShift1Week("cycles", conflict.start_date, cycle.mesocycle_id ?? "", id);
          setSnapDragDialog(null);
          const meso = data?.mesocycles.find((m) => snappedStart >= m.start_date && snappedStart <= m.end_date);
          resize({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
                   athleteId, rangeStart: rsStr, rangeEnd: reStr,
                   newMesocycleId: meso && cycle.mesocycle_id !== meso.id ? meso.id : undefined });
        },
        onCancel: () => { setSnapDragDialog(null); setCycleRowResetKey((k) => k + 1); },
      });
      return;
    }

    const meso = data?.mesocycles.find((m) => snappedStart >= m.start_date && snappedStart <= m.end_date);

    // Cross-meso overlap check for resize
    if (meso && meso.id !== cycle.mesocycle_id) {
      const targetConflict = data?.cycles.find(
        (c) => c.mesocycle_id === meso.id && c.id !== id
             && c.start_date <= snappedEnd && c.end_date >= snappedStart,
      );
      if (targetConflict) {
        setSnapDragDialog({
          movingLabel: cycle.name,
          movingStart: snappedStart,
          movingEnd:   snappedEnd,
          conflict:    targetConflict,
          onConfirmSnap: (newStart, newEnd) => {
            setSnapDragDialog(null);
            resize({ level: "cycles", item: cycle as never, newStart: parseISO(newStart), newEnd: parseISO(newEnd),
                     athleteId, rangeStart: rsStr, rangeEnd: reStr, newMesocycleId: meso.id });
          },
          onCascadeShift: async () => {
            await cascadeShift1Week("cycles", targetConflict.start_date, meso.id, id);
            setSnapDragDialog(null);
            resize({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
                     athleteId, rangeStart: rsStr, rangeEnd: reStr, newMesocycleId: meso.id });
          },
          onCancel: () => { setSnapDragDialog(null); setCycleRowResetKey((k) => k + 1); },
        });
        return;
      }
    }

    resize({ level: "cycles", item: cycle as never, newStart: parseISO(snappedStart), newEnd: parseISO(snappedEnd),
             athleteId, rangeStart: rsStr, rangeEnd: reStr,
             newMesocycleId: meso && cycle.mesocycle_id !== meso.id ? meso.id : undefined });
  }

  // ── Map data → TLRowItem ──────────────────────────────────────────────────

  const macroRows: TLRowItem[] = (data?.macrocycles ?? []).map((m) => ({
    id: m.id, label: m.name, startDate: m.start_date, endDate: m.end_date,
  }));

  const mesoRows: TLRowItem[] = (data?.mesocycles ?? []).map((m) => {
    const parent = data?.macrocycles.find((ma) => ma.id === m.macrocycle_id);
    return { id: m.id, label: m.name, startDate: m.start_date, endDate: m.end_date, parentStart: parent?.start_date, parentEnd: parent?.end_date };
  });

  // No parentStart/parentEnd for cycles: free drag, handled by handleCycleDrag/Resize
  const cycleRows: TLRowItem[] = (data?.cycles ?? []).map((c) => ({
    id: c.id, label: c.name, startDate: c.start_date, endDate: c.end_date,
  }));

  const microRows: TLRowItem[] = (data?.microcycles ?? []).map((mi) => {
    const parent = data?.cycles.find((c) => c.id === mi.cycle_id);
    return { id: mi.id, label: `S${mi.week_number}`, startDate: mi.start_date, endDate: mi.end_date, isDeload: mi.is_deload, parentStart: parent?.start_date, parentEnd: parent?.end_date };
  });

  const sharedRowProps = { calc, labelWidth: labelW, rangeStart: rsStr, rangeEnd: reStr };

  /** Build ParentOption[] for cycle creation (no pre-computed dates, computed dynamically) */
  function buildCycleParentOptions(): ParentOption[] {
    return (data?.mesocycles ?? []).map((m) => ({
      id:         m.id,
      label:      `${m.name} (${m.start_date} → ${m.end_date})`,
      start_date: m.start_date,
    }));
  }

  /** Open the cycle-creation assistant (name/dates/parent + reuse last cycle's sessions) */
  function openCycleAssistant() {
    const opts = buildCycleParentOptions();
    if (!opts.length) { toast.error("Crée d'abord un mésocycle"); return; }
    const first = opts[0];
    const { defaultStart, defaultEnd } = cycleDefaultDates(first.id);
    setCycleAssistant({
      parentMesoId:  first.id,
      parentOptions: opts.map((o) => ({ id: o.id, label: o.label })),
      defaultStart,
      defaultEnd,
    });
  }

  /** Compute initial start/end for a new cycle under a given meso */
  function cycleDefaultDates(mesoId: string): { defaultStart: string; defaultEnd: string } {
    const siblings = (data?.cycles ?? [])
      .filter((c) => c.mesocycle_id === mesoId)
      .sort((a, b) => b.end_date.localeCompare(a.end_date)); // descending
    const last = siblings[0];
    if (last) {
      const s = chainNextStart(last.end_date);
      return { defaultStart: s, defaultEnd: endFromWeeks(s, 4) };
    }
    const meso = data?.mesocycles.find((m) => m.id === mesoId);
    const s = meso ? snapMonday(meso.start_date) : rsStr;
    return { defaultStart: s, defaultEnd: endFromWeeks(s, 4) };
  }


  const NAV_BTN = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-agon-brd-l text-agon-tx3 hover:bg-agon-s2 hover:text-agon-tx md:h-8 md:w-8";
  const monthStep = isMobile ? 3 : 6;

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-agon-brd bg-agon-s1 font-ui text-agon-tx">
        {/* ── En-tête ── */}
        <div className="flex flex-wrap items-center justify-between gap-agon-md border-b border-agon-brd px-agon-md py-agon-md md:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-agon-sm">
            {zoomMacro ? (
              <>
                <div className="flex min-w-0 items-center gap-agon-xs rounded-md border border-agon-accent/50 bg-agon-accent-doux px-agon-sm py-agon-xs">
                  <Eye size={12} className="shrink-0 text-agon-accent" />
                  <span className="text-agon-xs font-bold text-agon-accent">MACROCYCLE EN COURS</span>
                  <span className="text-agon-xs text-agon-tx3">·</span>
                  <span className="truncate text-agon-xs font-semibold">{zoomMacro.label}</span>
                </div>
                <button type="button" title="Quitter le zoom" aria-label="Quitter le zoom" onClick={() => setZoomMacro(null)} className={NAV_BTN}>
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <button type="button" aria-label="Période précédente" onClick={() => setWindowStart((d) => subMonths(d, monthStep))} className={NAV_BTN}>
                  <ChevronLeft size={16} />
                </button>
                <div className="min-w-[130px] text-center text-agon-base font-bold md:min-w-40">
                  {format(rangeStart, "MMM yyyy", { locale: fr })} — {format(rangeEnd, "MMM yyyy", { locale: fr })}
                </div>
                <button type="button" aria-label="Période suivante" onClick={() => setWindowStart((d) => addMonths(d, monthStep))} className={NAV_BTN}>
                  <ChevronRight size={16} />
                </button>
                <Button size="sm" variant="secondary" onClick={() => setWindowStart(startOfMonth(new Date()))}>Auj.</Button>
                {undoStack.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Annuler la dernière action (drag/resize)"
                    className="border-agon-alerte/60 bg-agon-alerte/15 text-agon-alerte hover:bg-agon-alerte/25 hover:text-agon-alerte"
                    onClick={() => void handleUndo()}
                  >
                    ↩ Annuler
                  </Button>
                )}
                <AddPeriodMenu
                  onSelect={(level) => {
                    if (level === "macrocycle") {
                      openCreate("macrocycle", undefined, rsStr, reStr);
                    } else if (level === "mesocycle") {
                      const macros = data?.macrocycles ?? [];
                      if (!macros.length) { toast.error("Crée d'abord un macrocycle"); return; }
                      const first = macros[0];
                      openCreate(
                        "mesocycle", first.id, first.start_date, first.end_date, undefined,
                        macros.map((m) => ({ id: m.id, label: `${m.name} (${m.start_date} → ${m.end_date})`, start_date: m.start_date })),
                      );
                    } else if (level === "cycle") {
                      openCycleAssistant();
                    } else if (level === "microcycle") {
                      const cycles = data?.cycles ?? [];
                      if (!cycles.length) { toast.error("Crée d'abord un cycle"); return; }
                      const first = cycles[0];
                      openCreate(
                        "microcycle", first.id, first.start_date, first.end_date, undefined,
                        cycles.map((c) => ({ id: c.id, label: `${c.name} (${c.start_date} → ${c.end_date})`, start_date: c.start_date })),
                      );
                    }
                  }}
                />
              </>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-agon-md gap-y-agon-xs">
            {CREATE_LEVELS.map((lvl) => (
              <li key={lvl} className="flex items-center gap-agon-xs">
                <span className={cn("h-2.5 w-2.5 rounded-sm", LEVEL_STYLE[lvl].solid)} />
                <span className="text-agon-xs capitalize text-agon-tx3">{lvl}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Fil d'Ariane (période sélectionnée) ── */}
        {drawer && data && (
          <nav aria-label="Contexte" className="flex flex-wrap items-center gap-agon-xs border-b border-agon-brd px-agon-md py-agon-xs md:px-5">
            {(() => {
              let macro: typeof data.macrocycles[number] | undefined;
              let meso: typeof data.mesocycles[number] | undefined;
              let cycle: typeof data.cycles[number] | undefined;
              let micro: typeof data.microcycles[number] | undefined;

              if (drawer.type === "macrocycle") {
                macro = data.macrocycles.find((m) => m.id === drawer.id);
              } else if (drawer.type === "mesocycle") {
                meso = data.mesocycles.find((m) => m.id === drawer.id);
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              } else if (drawer.type === "cycle") {
                cycle = data.cycles.find((c) => c.id === drawer.id);
                meso = cycle?.mesocycle_id ? data.mesocycles.find((m) => m.id === cycle!.mesocycle_id) : undefined;
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              } else if (drawer.type === "microcycle") {
                micro = data.microcycles.find((m) => m.id === drawer.id);
                cycle = micro ? data.cycles.find((c) => c.id === micro!.cycle_id) : undefined;
                meso = cycle?.mesocycle_id ? data.mesocycles.find((m) => m.id === cycle!.mesocycle_id) : undefined;
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              }

              const crumbs: Array<{ label: string; type: DrawerType; id: string }> = [];
              if (macro) crumbs.push({ label: macro.name, type: "macrocycle", id: macro.id });
              if (meso) crumbs.push({ label: meso.name, type: "mesocycle", id: meso.id });
              if (cycle) crumbs.push({ label: cycle.name, type: "cycle", id: cycle.id });
              if (micro) crumbs.push({ label: `S${micro.week_number}`, type: "microcycle", id: micro.id });

              return crumbs.map((crumb, i) => {
                const active = crumb.id === drawer.id;
                return (
                  <span key={crumb.id} className="flex items-center gap-agon-xs">
                    {i > 0 && <span className="text-agon-xs text-agon-tx3">›</span>}
                    <button
                      type="button"
                      onClick={() => open(crumb.type, crumb.id)}
                      className={cn(
                        "min-h-8 rounded-md px-agon-sm text-agon-xs",
                        active ? cn("font-bold", LEVEL_STYLE[crumb.type].crumb, LEVEL_STYLE[crumb.type].text) : "font-normal text-agon-tx3",
                      )}
                    >
                      {crumb.label}
                    </button>
                  </span>
                );
              });
            })()}
          </nav>
        )}

        {/* ── Frise : elle se cale sur la largeur disponible, jamais de défilement horizontal ── */}
        <div className="pb-10">
          <div ref={containerRef} className="w-full">
            <div className="pt-agon-md">
              <TimeAxis rangeStart={rangeStart} rangeEnd={rangeEnd} containerWidth={width} labelWidth={labelW} />
            </div>

            {isLoading ? (
              <div className="py-[60px] text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-agon-brd-l border-t-agon-accent" />
              </div>
            ) : isError && !data ? (
              // Lecture en échec : surtout pas « Aucun macrocycle » (le coach recréerait un doublon).
              <EmptyState
                className="py-12"
                title="La frise n'a pas pu être chargée"
                description="Vérifie ta connexion puis réessaie."
                action={<Button variant="secondary" onClick={() => void refetch()}>Réessayer</Button>}
              />
            ) : (data?.macrocycles ?? []).length === 0 ? (
              <EmptyState
                className="py-12"
                title="Aucun macrocycle sur cette période"
                description="Crée un macrocycle pour visualiser la frise."
                action={
                  <Button className="gap-agon-xs" onClick={() => openCreate("macrocycle", undefined, rsStr, reStr)}>
                    <Plus size={13} /> Créer un macrocycle
                  </Button>
                }
              />
            ) : (
              /* Conteneur relatif pour les repères verticaux en absolu */
              <div className="relative">
                <TimelineRow level="macrocycle" items={macroRows} {...sharedRowProps}
                  onOpen={(id) => open("macrocycle", id)}
                  onZoom={(id) => {
                    const macro = data?.macrocycles.find((m) => m.id === id);
                    if (macro) setZoomMacro({ start: parseISO(macro.start_date), end: parseISO(macro.end_date), label: macro.name });
                  }}
                  onNewRow={() => openCreate("macrocycle", undefined, rsStr, reStr)}
                  onDrag={makeDragHandler("macrocycles")}
                  onResize={makeResizeHandler("macrocycles")}
                />
                <TimelineRow level="mesocycle" items={mesoRows} {...sharedRowProps}
                  onOpen={(id) => open("mesocycle", id)}
                  onNewRow={() => {
                    const macros = data?.macrocycles ?? [];
                    const first = macros[0];
                    openCreate(
                      "mesocycle", first?.id, first?.start_date, first?.end_date, undefined,
                      macros.map((m) => ({ id: m.id, label: `${m.name} (${m.start_date} → ${m.end_date})`, start_date: m.start_date })),
                    );
                  }}
                  onDrag={makeDragHandler("mesocycles")}
                  onResize={makeResizeHandler("mesocycles")}
                />
                <TimelineRow level="cycle" items={cycleRows} {...sharedRowProps}
                  lockStart
                  onOpen={(id) => open("cycle", id)}
                  rowResetKey={cycleRowResetKey}
                  onNewRow={() => openCycleAssistant()}
                  onDrag={handleCycleDrag}
                  onResize={handleCycleResize}
                />
                <TimelineRow level="microcycle" items={microRows} {...sharedRowProps}
                  readOnly
                  onOpen={(id) => open("microcycle", id)}
                />

                {/* Repères verticaux (en absolu sur toutes les lignes) */}
                <CompetitionMarkers
                  competitions={data?.competitions ?? []}
                  calc={calc}
                  labelWidth={labelW}
                  totalRowHeight={TOTAL_ROW_H}
                  onSelect={(c: Competition) => open("competition", c.id)}
                />
                <TestMarkers
                  tests={data?.tests ?? []}
                  calc={calc}
                  labelWidth={labelW}
                  totalRowHeight={TOTAL_ROW_H}
                />
              </div>
            )}
          </div>
        </div>

        <p className="border-t border-agon-brd px-agon-md py-agon-sm text-center text-agon-xs text-agon-tx3 md:px-5">
          <span className="hidden md:inline">Drag axe X pour déplacer · Poignées colorées pour redimensionner · + pour détails · Compétitions: rose(A) violet(B) gris(C)</span>
          <span className="md:hidden">Touche un bloc pour ses détails · poignées pour redimensionner</span>
        </p>
      </div>

      {/* Chevauchement au déplacement / redimensionnement */}
      {snapDragDialog && <SnapDragDialog state={snapDragDialog} />}

      {noParentModal && (
        <NoParentDragDialog
          state={noParentModal}
          macrocycles={data?.macrocycles ?? []}
          mesocycles={data?.mesocycles ?? []}
          athleteId={athleteId}
          onClose={() => { setNoParentModal(null); setCycleRowResetKey((k) => k + 1); }}
        />
      )}

      {createModal && (
        <CreatePeriodDialog
          state={createModal}
          athleteId={athleteId}
          coachId={user?.id ?? ""}
          rangeStart={rsStr}
          onClose={() => setCreateModal(null)}
        />
      )}

      {/* Assistant de création de cycle (réutilise les séances du dernier cycle) */}
      {cycleAssistant && (
        <CreateCycleAssistant
          athleteId={athleteId}
          coachId={user?.id ?? ""}
          parentMesoId={cycleAssistant.parentMesoId}
          parentOptions={cycleAssistant.parentOptions}
          defaultStart={cycleAssistant.defaultStart}
          defaultEnd={cycleAssistant.defaultEnd}
          onClose={() => setCycleAssistant(null)}
        />
      )}

      {drawer && data && (
        <PeriodDrawer
          state={drawer}
          onClose={() => setDrawer(null)}
          data={data}
          athleteId={athleteId}
          rangeStart={rsStr}
          rangeEnd={reStr}
          onEditComp={(c) => { setEditingComp(c); setDrawer(null); }}
          onDeleteComp={(c) => deleteComp({ id: c.id, athlete_id: c.athlete_id ?? athleteId })}
        />
      )}

      {editingComp && (
        <CompetitionFormModal
          athleteId={editingComp.athlete_id ?? athleteId}
          coachId={user?.id ?? ""}
          existing={{
            ...editingComp,
            coach_id:   editingComp.coach_id   ?? user?.id ?? "",
            athlete_id: editingComp.athlete_id ?? athleteId,
            type:       (editingComp.type as import("@/types/planning").CompetitionType) ?? "competition",
            priority:   (editingComp.priority as import("@/types/planning").CompetitionPriority) ?? "C",
            notes:      editingComp.notes    ?? null,
            location:   editingComp.location ?? null,
            created_at: "",
          }}
          onClose={() => setEditingComp(null)}
        />
      )}
    </>
  );
}
