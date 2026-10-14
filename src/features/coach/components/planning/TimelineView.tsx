import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { startOfMonth, addMonths, subMonths, format, parseISO, startOfISOWeek, endOfISOWeek, addWeeks, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Plus, Eye, Pencil, Trash2, Check, ChevronDown } from "lucide-react";
import { snapMonday, snapSunday, keepWeeks, chainNextStart, endFromWeeks, computeCascade, buildMicrocycles } from "./utils/planningHelpers";
import { PERIOD_DEFAULTS } from "@/types/planning";
import { PeriodConflictDialog } from "./dialogs/PeriodConflictDialog";
import { ChildOverflowDialog } from "./dialogs/ChildOverflowDialog";
import { ChangeParentDialog } from "./dialogs/ChangeParentDialog";
import { usePlanningKeyboardShortcuts } from "./hooks/usePlanningKeyboardShortcuts";
import { C } from "@/lib/theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteCompetition } from "@/hooks/useCompetitions";
import { CompetitionFormModal } from "./CompetitionFormModal";
import { CreateCycleAssistant } from "./CreateCycleAssistant";

import { useTimelineData }      from "./hooks/useTimelineData";
import { useCalculatePosition } from "./hooks/useCalculatePosition";
import { useDragCycle }         from "./hooks/useDragCycle";
import { useResizeCycle }       from "./hooks/useResizeCycle";
import type {
  Macrocycle, Mesocycle, Cycle, Microcycle, Competition, TimelineData,
} from "./hooks/useTimelineData";

import { TimeAxis }            from "./TimeAxis";
import { TimelineRow }         from "./TimelineRow";
import type { TLRowItem }      from "./TimelineRow";
import { CompetitionMarkers }  from "./CompetitionMarkers";
import { TestMarkers }         from "./TestMarkers";

import { MacrocycleDrawer }    from "./drawers/MacrocycleDrawer";
import { MesocycleDrawer }     from "./drawers/MesocycleDrawer";
import { CycleDrawer }         from "./drawers/CycleDrawer";
import { MicrocycleDrawer }    from "./drawers/MicrocycleDrawer";
import { CompetitionDrawer }   from "./drawers/CompetitionDrawer";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH    = 600;
const ROW_H        = 52;
const ROWS_COUNT   = 4;
const TOTAL_ROW_H  = ROW_H * ROWS_COUNT;

const LEVEL_COLORS = {
  macrocycle: C.ac,
  mesocycle:  C.coach,
  cycle:      C.o,
  microcycle: C.tx3,
} as const;

// ── Drawer host ───────────────────────────────────────────────────────────────

type DrawerType = "macrocycle" | "mesocycle" | "cycle" | "microcycle" | "competition";

interface DrawerState {
  type:  DrawerType;
  id:    string;
}

function DrawerShell({
  state, onClose, data, athleteId, rangeStart, rangeEnd, onEditComp, onDeleteComp,
}: {
  state:          DrawerState;
  onClose:        () => void;
  data:           ReturnType<typeof useTimelineData>["data"];
  athleteId:      string;
  rangeStart:     string;
  rangeEnd:       string;
  onEditComp?:    (comp: Competition) => void;
  onDeleteComp?:  (comp: Competition) => void;
}) {
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [working, setWorking] = useState(false);

  if (!data) return null;

  const canRename = state.type !== "competition" && state.type !== "microcycle";
  const canDelete = state.type !== "competition";

  const TABLE_MAP: Partial<Record<DrawerType, string>> = {
    macrocycle: "macrocycles",
    mesocycle:  "mesocycles",
    cycle:      "cycles",
    microcycle: "microcycles",
  };

  async function handleRename() {
    if (!renameDraft.trim() || !canRename) return;
    setWorking(true);
    const table = TABLE_MAP[state.type];
    if (!table) { setWorking(false); return; }
    const { error } = await supabase.from(table as never).update({ name: renameDraft.trim() }).eq("id", state.id);
    setWorking(false);
    if (error) { toast.error("Erreur lors du renommage"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    toast.success("Renommé");
    setRenaming(false);
  }

  async function handleDelete() {
    setWorking(true);
    try {
      if (state.type === "macrocycle") {
        const mesoIds = data.mesocycles.filter((m) => m.macrocycle_id === state.id).map((m) => m.id);
        const cycleIds = data.cycles.filter((c) => mesoIds.includes(c.mesocycle_id)).map((c) => c.id);
        if (cycleIds.length > 0) {
          await supabase.from("microcycles").delete().in("cycle_id", cycleIds);
          await supabase.from("cycles").delete().in("id", cycleIds);
        }
        if (mesoIds.length > 0) await supabase.from("mesocycles").delete().in("id", mesoIds);
        const { error } = await supabase.from("macrocycles").delete().eq("id", state.id);
        if (error) throw error;
      } else if (state.type === "mesocycle") {
        const cycleIds = data.cycles.filter((c) => c.mesocycle_id === state.id).map((c) => c.id);
        if (cycleIds.length > 0) {
          await supabase.from("microcycles").delete().in("cycle_id", cycleIds);
          await supabase.from("cycles").delete().in("id", cycleIds);
        }
        const { error } = await supabase.from("mesocycles").delete().eq("id", state.id);
        if (error) throw error;
      } else if (state.type === "cycle") {
        await supabase.from("microcycles").delete().eq("cycle_id", state.id);
        const { error } = await supabase.from("cycles").delete().eq("id", state.id);
        if (error) throw error;
      } else if (state.type === "microcycle") {
        const { error } = await supabase.from("microcycles").delete().eq("id", state.id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
      qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
      toast.success("Supprimé");
      onClose();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setWorking(false);
    }
  }

  const LEVEL_COLOR: Record<DrawerType, string> = {
    macrocycle:  C.ac,
    mesocycle:   C.coach,
    cycle:       C.o,
    microcycle:  C.tx3,
    competition: C.coach,
  };
  const color = LEVEL_COLOR[state.type];

  let title    = "";
  let subtitle = "";
  let content: React.ReactNode = null;

  switch (state.type) {
    case "macrocycle": {
      const m = data.macrocycles.find((x) => x.id === state.id);
      if (!m) return null;
      title    = m.name;
      subtitle = `${format(parseISO(m.start_date), "d MMM yyyy", { locale: fr })} → ${format(parseISO(m.end_date), "d MMM yyyy", { locale: fr })}`;
      content  = (
        <MacrocycleDrawer
          macro={m}
          siblings={[...data.macrocycles].sort((a, b) => a.start_date.localeCompare(b.start_date))}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onClose={onClose}
        />
      );
      break;
    }
    case "mesocycle": {
      const m = data.mesocycles.find((x) => x.id === state.id);
      if (!m) return null;
      title    = m.name;
      subtitle = `${format(parseISO(m.start_date), "d MMM", { locale: fr })} → ${format(parseISO(m.end_date), "d MMM", { locale: fr })}`;
      const mesoSiblings = [...data.mesocycles]
        .filter((s) => s.macrocycle_id === m.macrocycle_id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      content  = (
        <MesocycleDrawer
          meso={m}
          siblings={mesoSiblings}
          allMacros={[...data.macrocycles].sort((a, b) => a.start_date.localeCompare(b.start_date))}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
        />
      );
      break;
    }
    case "cycle": {
      const c = data.cycles.find((x) => x.id === state.id);
      if (!c) return null;
      const parentMeso = data.mesocycles.find((m) => m.id === c.mesocycle_id);
      const cycleSiblings = [...data.cycles]
        .filter((s) => s.mesocycle_id === c.mesocycle_id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      title    = c.name;
      subtitle = `${format(parseISO(c.start_date), "d MMM", { locale: fr })} → ${format(parseISO(c.end_date), "d MMM", { locale: fr })}`;
      content  = (
        <CycleDrawer
          cycle={c}
          parentMeso={parentMeso}
          siblings={cycleSiblings}
          allMesos={data.mesocycles}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onClose={onClose}
        />
      );
      break;
    }
    case "microcycle": {
      const mi = data.microcycles.find((x) => x.id === state.id);
      if (!mi) return null;
      const siblings = data.microcycles
        .filter((m) => m.cycle_id === mi.cycle_id)
        .sort((a, b) => a.week_number - b.week_number);
      const idx       = siblings.findIndex((m) => m.id === mi.id);
      const prevMicro = idx > 0 ? siblings[idx - 1] : undefined;
      title    = `Semaine ${mi.week_number}`;
      subtitle = `${format(parseISO(mi.start_date), "d MMM", { locale: fr })} → ${format(parseISO(mi.end_date), "d MMM", { locale: fr })}`;
      content  = <MicrocycleDrawer micro={mi} prevMicro={prevMicro} athleteId={athleteId} />;
      break;
    }
    case "competition": {
      const c = data.competitions.find((x) => x.id === state.id);
      if (!c) return null;
      title    = c.name;
      subtitle = format(parseISO(c.date), "d MMMM yyyy", { locale: fr });
      content  = (
        <CompetitionDrawer
          comp={c}
          onEdit={onEditComp ? () => onEditComp(c) : undefined}
          onDelete={onDeleteComp ? () => { onDeleteComp(c); onClose(); } : undefined}
        />
      );
      break;
    }
  }

  const btnBase: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 4,
    border: "1px solid " + C.brdL, background: "transparent",
    color: C.tx3, cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }} />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 480, maxWidth: "92vw",
          background: C.s1, borderLeft: "1px solid " + C.brd,
          display: "flex", flexDirection: "column",
          animation: "tlDrawerIn 200ms ease-out",
        }}
      >
        <style>{`@keyframes tlDrawerIn { from { transform:translateX(100%); opacity:0 } to { transform:translateX(0); opacity:1 } }`}</style>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 6, height: 36, borderRadius: 4, background: color, flexShrink: 0 }} />

          {/* Title / rename area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {state.type === "competition" ? "Compétition" : state.type.charAt(0).toUpperCase() + state.type.slice(1)}
            </div>
            {renaming ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
                  style={{
                    flex: 1, padding: "5px 9px", borderRadius: 7,
                    border: "1px solid " + color + "60", background: C.s2,
                    color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none",
                  }}
                />
                <button onClick={handleRename} disabled={working} style={{ ...btnBase, border: "none", background: color, color: "#fff" }}>
                  {working ? "…" : <Check size={14} />}
                </button>
                <button onClick={() => setRenaming(false)} style={btnBase}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </div>
                {canRename && (
                  <button
                    onClick={() => { setRenameDraft(title); setRenaming(true); setDeleteConfirm(false); }}
                    title="Renommer"
                    style={{ ...btnBase, width: 22, height: 22, border: "none", background: "transparent", color: C.tx3, flexShrink: 0 }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.tx3 }}>{subtitle}</div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {canDelete && !renaming && (
              <button
                onClick={() => { setDeleteConfirm((v) => !v); setRenaming(false); }}
                title="Supprimer"
                style={{ ...btnBase, color: deleteConfirm ? C.r : C.tx3, borderColor: deleteConfirm ? C.r + "60" : C.brdL }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={onClose} style={btnBase}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Delete confirm banner */}
        {deleteConfirm && (
          <div style={{
            padding: "10px 20px", borderBottom: "1px solid " + C.r + "30",
            background: C.r + "12", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 12, color: C.tx2, flex: 1 }}>
              Supprimer ce bloc et tous ses sous-blocs ?
            </span>
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={working}
              style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: working ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: working ? 0.7 : 1 }}
            >
              {working ? "…" : "Supprimer"}
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", scrollbarWidth: "none" }}>
          {content}
        </div>
      </div>
    </>
  );
}

// ── Microcycle auto-generation helper ─────────────────────────────────────────

// Generates one microcycle per ISO week (Mon→Sun) covering the cycle range.
// First week = Monday of the week containing startDate.
// Last week = week whose Monday is still ≤ endDate.
// ── Create modal ──────────────────────────────────────────────────────────────

type CreateLevel = "macrocycle" | "mesocycle" | "cycle" | "microcycle";

interface ParentOption {
  id:         string;
  label:      string;
  start_date: string; // parent start, used as fallback
}

interface CreateState {
  level:          CreateLevel;
  parentId?:      string;
  parentOptions?: ParentOption[]; // if set: show parent picker
  siblingItems?:  Array<{ parentId: string; end_date: string }>; // all children across all parents (for auto-chain)
  defaultStart:   string;
  defaultEnd:     string;
  minStart?:      string; // hard floor: prevent overlapping with previous sibling
  /** All same-level periods with parentId for client-side overlap detection */
  existingSiblings?: Array<{ id: string; name: string; start_date: string; end_date: string; parentId: string }>;
  /** Cascade shift fn: shift conflict + all subsequent same-parent periods +1 week */
  cascadeShiftFn?: (conflictStartDate: string, parentId: string) => Promise<void>;
}

function CreateModal({
  state, athleteId, coachId, rangeStart, rangeEnd, onClose,
}: {
  state:      CreateState;
  athleteId:  string;
  coachId:    string;
  rangeStart: string;
  rangeEnd:   string;
  onClose:    () => void;
}) {
  const qc = useQueryClient();

  const [name,      setName]      = useState("");
  const [weekNum,   setWeekNum]   = useState(1);
  const [isDeload,  setIsDeload]  = useState(false);
  const [startDate, setStartDate] = useState(() =>
    state.defaultStart ? snapMonday(state.defaultStart) : state.defaultStart,
  );
  const [endDate, setEndDate] = useState(() =>
    state.defaultEnd ? snapSunday(state.defaultEnd) : state.defaultEnd,
  );
  const [saving,    setSaving]    = useState(false);
  const [selectedParentId, setSelectedParentId] = useState(state.parentId ?? state.parentOptions?.[0]?.id ?? "");
  const [snapPrompt, setSnapPrompt] = useState<{
    conflict:         SnapConflict;
    snapAfterStart:   string;
    snapAfterEnd:     string;
    snapBeforeEnd:    string | null;
    movingStart:      string;
    onCascadeShift?:  () => Promise<void>;
  } | null>(null);

  const defaultWeeks = PERIOD_DEFAULTS[state.level as keyof typeof PERIOD_DEFAULTS] ?? 4;

  function handleParentChange(newParentId: string) {
    setSelectedParentId(newParentId);
    if (state.siblingItems) {
      const siblings = state.siblingItems
        .filter((s) => s.parentId === newParentId)
        .sort((a, b) => b.end_date.localeCompare(a.end_date));
      const last = siblings[0];
      if (last) {
        const autoStart = chainNextStart(last.end_date);
        setStartDate(autoStart);
        setEndDate(endFromWeeks(autoStart, defaultWeeks));
      } else {
        const opt = state.parentOptions?.find((o) => o.id === newParentId);
        const fallback = opt ? snapMonday(opt.start_date) : rangeStart;
        setStartDate(fallback);
        setEndDate(endFromWeeks(fallback, defaultWeeks));
      }
    }
  }

  /** Adjust endDate by adding/subtracting weeks from current startDate */
  function shiftEnd(weeks: number) {
    if (!startDate) return;
    const current = endDate ? endDate : startDate;
    const diffWeeks = Math.max(1, Math.round(
      (new Date(current).getTime() - new Date(startDate).getTime()) / (7 * 86400_000)
    ) + 1 + weeks);
    setEndDate(endFromWeeks(startDate, diffWeeks));
  }

  const LEVEL_COLOR: Record<CreateLevel, string> = {
    macrocycle: C.ac, mesocycle: C.coach, cycle: C.o, microcycle: C.tx3,
  };
  const color = LEVEL_COLOR[state.level];

  const LEVEL_LABEL: Record<CreateLevel, string> = {
    macrocycle: "Macrocycle", mesocycle: "Mésocycle", cycle: "Cycle", microcycle: "Microcycle",
  };

  async function handleSubmit(opts?: { start: string; end: string }) {
    const sDate = opts?.start ?? startDate;
    const eDate = opts?.end   ?? endDate;

    if (!sDate || !eDate) { toast.error("Dates requises"); return; }
    if (state.level !== "microcycle" && !name.trim()) { toast.error("Nom requis"); return; }
    if ((state.level === "mesocycle" || state.level === "cycle" || state.level === "microcycle") && !selectedParentId) {
      toast.error("Sélectionne un parent"); return;
    }
    // Hard overlap guard: start must be ≥ minStart (next sibling floor)
    if (state.minStart && sDate < state.minStart) {
      toast.error(`Début doit être ≥ ${state.minStart} (pas de chevauchement)`);
      return;
    }

    // Client-side overlap check (skip if called with explicit snap overrides)
    if (!opts && state.existingSiblings) {
      const sameParent = state.level === "macrocycle"
        ? state.existingSiblings
        : state.existingSiblings.filter((s) => s.parentId === selectedParentId);
      const conflicts = sameParent.filter((s) => s.start_date <= eDate && s.end_date >= sDate);
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        const originalWeeks = Math.max(1, Math.round(
          (parseISO(eDate).getTime() - parseISO(sDate).getTime()) / (7 * 86400_000),
        ) + 1);
        const afterStart = chainNextStart(conflict.end_date);
        const afterEnd   = endFromWeeks(afterStart, originalWeeks);
        const beforeEnd  = format(addDays(parseISO(conflict.start_date), -1), "yyyy-MM-dd");
        const capturedParentId = selectedParentId;
        setSnapPrompt({
          conflict:       { name: conflict.name, start_date: conflict.start_date, end_date: conflict.end_date },
          snapAfterStart: afterStart,
          snapAfterEnd:   afterEnd,
          snapBeforeEnd:  beforeEnd >= sDate ? beforeEnd : null,
          movingStart:    sDate,
          onCascadeShift: state.cascadeShiftFn
            ? async () => {
                await state.cascadeShiftFn!(conflict.start_date, capturedParentId);
                setSnapPrompt(null);
                await handleSubmit({ start: sDate, end: eDate });
              }
            : undefined,
        });
        return;
      }
    }

    setSaving(true);
    let error: unknown = null;
    switch (state.level) {
      case "macrocycle":
        ({ error } = await supabase.from("macrocycles").insert({
          athlete_id: athleteId, coach_id: coachId,
          name: name.trim(), start_date: sDate, end_date: eDate,
        }));
        break;
      case "mesocycle":
        ({ error } = await supabase.from("mesocycles").insert({
          macrocycle_id: selectedParentId, name: name.trim(),
          start_date: sDate, end_date: eDate,
        }));
        break;
      case "cycle": {
        const { data: newCycle, error: cycleErr } = await supabase
          .from("cycles")
          .insert({ mesocycle_id: selectedParentId, name: name.trim(), start_date: sDate, end_date: eDate })
          .select("id")
          .single();
        error = cycleErr;
        if (!cycleErr && newCycle) {
          const micros = buildMicrocycles(newCycle.id, sDate, eDate);
          if (micros.length > 0) {
            const { error: microErr } = await supabase.from("microcycles").insert(micros);
            if (microErr) console.error("[auto-microcycles]", microErr.message);
          }
        }
        break;
      }
      case "microcycle":
        ({ error } = await supabase.from("microcycles").insert({
          cycle_id: selectedParentId, week_number: weekNum,
          start_date: sDate, end_date: eDate, is_deload: isDeload,
        }));
        break;
    }
    setSaving(false);
    if (error) { toast.error("Erreur lors de la création"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    toast.success(`${LEVEL_LABEL[state.level]} créé`);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 400, maxWidth: "92vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "20px 24px",
          animation: "fadeScaleIn 150ms ease-out",
        }}
      >
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Nouveau
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{LEVEL_LABEL[state.level]}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Snap prompt banner */}
        {snapPrompt && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 4, background: C.oS, border: "1px solid " + C.o + "50" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.o, marginBottom: 6 }}>
              Chevauche « {snapPrompt.conflict.name} »
            </div>
            <div style={{ fontSize: 10, color: C.tx3, marginBottom: 10 }}>
              {snapPrompt.conflict.start_date} → {snapPrompt.conflict.end_date}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                onClick={() => { setSnapPrompt(null); handleSubmit({ start: snapPrompt.snapAfterStart, end: snapPrompt.snapAfterEnd }); }}
                style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: C.oV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Coller après ({snapPrompt.snapAfterStart})
              </button>
              {snapPrompt.snapBeforeEnd && (
                <button
                  type="button"
                  onClick={() => { setSnapPrompt(null); handleSubmit({ start: snapPrompt.movingStart, end: snapPrompt.snapBeforeEnd! }); }}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Coller avant (→ {snapPrompt.snapBeforeEnd})
                </button>
              )}
              {snapPrompt.onCascadeShift && (
                <button
                  type="button"
                  onClick={snapPrompt.onCascadeShift}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx2, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Décaler « {snapPrompt.conflict.name} » +1 sem.
                </button>
              )}
              <button
                type="button"
                onClick={() => setSnapPrompt(null)}
                style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >
                Modifier manuellement
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Parent picker */}
          {state.parentOptions && state.parentOptions.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>
                {state.level === "mesocycle" ? "Macrocycle parent" : state.level === "cycle" ? "Mésocycle parent" : "Parent"}
              </label>
              <select
                value={selectedParentId}
                onChange={(e) => handleParentChange(e.target.value)}
                style={{ ...inputStyle }}
              >
                {state.parentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {state.level === "microcycle" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 11, color: C.tx3, flexShrink: 0 }}>Semaine n°</label>
              <input
                type="number" min={1} max={52}
                value={weekNum}
                onChange={(e) => setWeekNum(parseInt(e.target.value) || 1)}
                style={{ ...inputStyle, width: 80 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.tx3, cursor: "pointer" }}>
                <input
                  type="checkbox" checked={isDeload}
                  onChange={(e) => setIsDeload(e.target.checked)}
                  style={{ accentColor: C.b }}
                />
                Deload
              </label>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>Nom</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder={`Nom du ${LEVEL_LABEL[state.level].toLowerCase()}…`}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>
                Début <span style={{ fontSize: 9, opacity: 0.6 }}>(snap lundi)</span>
              </label>
              <input
                type="date" value={startDate}
                min={state.minStart}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const snapped = snapMonday(e.target.value);
                  // enforce no-overlap: clamp to minStart
                  const clamped = state.minStart && snapped < state.minStart ? state.minStart : snapped;
                  setStartDate(clamped);
                }}
                style={inputStyle}
              />
              {state.minStart && (
                <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>
                  ≥ {state.minStart} (pas de chevauchement)
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>
                Fin <span style={{ fontSize: 9, opacity: 0.6 }}>(snap dimanche)</span>
              </label>
              <input
                type="date" value={endDate}
                onChange={(e) => { if (e.target.value) setEndDate(snapSunday(e.target.value)); }}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Quick duration buttons */}
          <div>
            <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>Ajuster la durée</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {([-4, -1, 1, 4, 13, 26, 52] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => shiftEnd(w)}
                  style={{
                    padding: "3px 8px", borderRadius: 6,
                    border: "1px solid " + C.brdL, background: C.s2,
                    color: C.tx3, fontSize: 10, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {w > 0 ? "+" : ""}{w}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "…" : "Créer"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Add dropdown ─────────────────────────────────────────────────────────────

function AddDropdown({
  onSelect,
}: {
  onSelect: (level: CreateLevel) => void;
}) {
  const [open, setOpen] = useState(false);

  const items: Array<{ level: CreateLevel; label: string; color: string }> = [
    { level: "macrocycle", label: "Macrocycle",  color: C.ac    },
    { level: "mesocycle",  label: "Mésocycle",   color: C.coach },
    { level: "cycle",      label: "Cycle",        color: C.o     },
    { level: "microcycle", label: "Microcycle",   color: C.tx3   },
  ];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 12px", borderRadius: 4,
          border: "1px solid " + C.ac + "60", background: C.ac,
          color: "#fff", fontSize: 11, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <Plus size={12} />
        Ajouter
        <ChevronDown size={10} style={{ opacity: 0.8 }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 31,
            background: C.s1, border: "1px solid " + C.brd, borderRadius: 4,
            padding: "4px", minWidth: 160,
          }}>
            {items.map(({ level, label, color }) => (
              <button
                key={level}
                onClick={() => { setOpen(false); onSelect(level); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 7, border: "none",
                  background: "transparent", color: C.tx,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.s2)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── No-parent drag modal ──────────────────────────────────────────────────────

interface NoParentDragState {
  cycleId:  string;
  newStart: string;
  newEnd:   string;
}

function NoParentDragModal({
  state, macrocycles, mesocycles, athleteId, onClose,
}: {
  state:       NoParentDragState;
  macrocycles: Macrocycle[];
  mesocycles:  Mesocycle[];
  athleteId:   string;
  onClose:     () => void;
}) {
  const qc = useQueryClient();
  const [mesoName, setMesoName] = useState(() =>
    format(parseISO(state.newStart), "MMMM yyyy", { locale: fr }),
  );
  const [saving, setSaving] = useState(false);

  // Existing meso whose dates contain newStart (reassign without creating)
  const overlappingMeso = mesocycles.find(
    (m) => state.newStart >= m.start_date && state.newStart <= m.end_date,
  );
  // Macro that contains newStart
  const targetMacro = macrocycles.find(
    (m) => state.newStart >= m.start_date && state.newStart <= m.end_date,
  );

  async function handleCreateAndMove() {
    if (!mesoName.trim()) { toast.error("Nom requis"); return; }
    if (!targetMacro) { toast.error("Crée d'abord un macrocycle pour cette période"); return; }
    setSaving(true);

    const { data: newMeso, error: mesoErr } = await supabase
      .from("mesocycles")
      .insert({ macrocycle_id: targetMacro.id, name: mesoName.trim(), start_date: state.newStart, end_date: state.newEnd })
      .select("id")
      .single();

    if (mesoErr || !newMeso) { toast.error("Erreur création mésocycle"); setSaving(false); return; }

    const { error: cycleErr } = await supabase
      .from("cycles")
      .update({ mesocycle_id: newMeso.id, start_date: state.newStart, end_date: state.newEnd })
      .eq("id", state.cycleId);
    if (cycleErr) { toast.error("Erreur mise à jour cycle"); setSaving(false); return; }

    await supabase.from("microcycles").delete().eq("cycle_id", state.cycleId);
    const micros = buildMicrocycles(state.cycleId, state.newStart, state.newEnd);
    if (micros.length > 0) await supabase.from("microcycles").insert(micros);

    qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    toast.success("Mésocycle créé — cycle déplacé");
    setSaving(false);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };
  const btnBase: React.CSSProperties = {
    padding: "8px 16px", borderRadius: 4, fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", border: "none",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%, -50%)",
        width: 420, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 24px",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: C.coach, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.coach, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Aucun mésocycle ici
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Que faire ?</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: C.tx2, marginBottom: 16 }}>
          Nouvelle position :{" "}
          <b style={{ color: C.tx }}>
            {format(parseISO(state.newStart), "d MMM", { locale: fr })} → {format(parseISO(state.newEnd), "d MMM yyyy", { locale: fr })}
          </b>
        </div>

        {overlappingMeso ? (
          // Existing meso covers this range — just confirm reassign
          <div style={{ fontSize: 12, color: C.tx2, marginBottom: 16, padding: "10px 12px", borderRadius: 4, background: C.s2 }}>
            Mésocycle existant trouvé : <b style={{ color: C.coach }}>{overlappingMeso.name}</b>
            <br />Le cycle sera rattaché à ce mésocycle.
          </div>
        ) : targetMacro ? (
          // No meso but a macro exists — offer to create meso
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4 }}>
              Nom du nouveau mésocycle
            </label>
            <input
              autoFocus
              value={mesoName}
              onChange={(e) => setMesoName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateAndMove()}
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>
              Parent macrocycle : <b>{targetMacro.name}</b>
            </div>
          </div>
        ) : (
          // No macro either
          <div style={{ fontSize: 12, color: C.o, padding: "10px 12px", borderRadius: 4, background: C.oS, marginBottom: 16 }}>
            Aucun macrocycle pour cette période. Crée d'abord un macrocycle puis déplace à nouveau ce cycle.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnBase, background: "transparent", border: "1px solid " + C.brdL, color: C.tx2 }}>
            Annuler
          </button>
          {overlappingMeso && (
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await supabase.from("cycles").update({ mesocycle_id: overlappingMeso.id, start_date: state.newStart, end_date: state.newEnd }).eq("id", state.cycleId);
                await supabase.from("microcycles").delete().eq("cycle_id", state.cycleId);
                const micros = buildMicrocycles(state.cycleId, state.newStart, state.newEnd);
                if (micros.length > 0) await supabase.from("microcycles").insert(micros);
                qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
                qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
                toast.success("Cycle déplacé");
                setSaving(false);
                onClose();
              }}
              style={{ ...btnBase, background: C.acV, color: "#0E0C0A", opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "…" : "Déplacer"}
            </button>
          )}
          {targetMacro && !overlappingMeso && (
            <button
              onClick={handleCreateAndMove}
              disabled={saving}
              style={{ ...btnBase, background: C.acV, color: "#0E0C0A", opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "…" : "Créer et déplacer"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Snap-to-adjacent dialog (overlap detected on drag/resize/create) ──────────

interface SnapConflict {
  name:       string;
  start_date: string;
  end_date:   string;
}

interface SnapDragDialogState {
  movingLabel: string;
  movingStart: string;  // snapped tentative start
  movingEnd:   string;  // snapped tentative end
  conflict:    SnapConflict;
  onConfirmSnap:    (newStart: string, newEnd: string) => void;
  /** Shift conflict + all subsequent siblings +1 week, then place moving item */
  onCascadeShift?:  () => Promise<void>;
  onCancel:         () => void;
}

function SnapDragDialog({ state }: { state: SnapDragDialogState }) {
  const [cascading, setCascading] = useState(false);

  const originalWeeks = Math.max(1, Math.round(
    (parseISO(state.movingEnd).getTime() - parseISO(state.movingStart).getTime()) / (7 * 86400_000),
  ) + 1);

  const afterStart = chainNextStart(state.conflict.end_date);
  const afterEnd   = endFromWeeks(afterStart, originalWeeks);

  // "Coller avant" = end right before conflict.start (conflict starts Monday → Sunday before)
  const beforeEnd   = format(addDays(parseISO(state.conflict.start_date), -1), "yyyy-MM-dd");
  const beforeValid = beforeEnd >= state.movingStart; // needs at least 1 week of room

  const btnBase: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", border: "none",
  };

  return (
    <>
      <div onClick={state.onCancel} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 71,
        transform: "translate(-50%,-50%)",
        width: 420, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 24px",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: C.o, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 9, color: C.o, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Chevauchement
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Que faire ?</div>
          </div>
          <button onClick={state.onCancel} style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: "10px 12px", borderRadius: 4, background: C.oS, marginBottom: 16, fontSize: 12, color: C.tx2 }}>
          <b style={{ color: C.tx }}>{state.movingLabel}</b> chevauche{" "}
          <b style={{ color: C.tx }}>{state.conflict.name}</b>
          <div style={{ marginTop: 4, fontSize: 10, color: C.tx3 }}>
            {state.conflict.start_date} → {state.conflict.end_date}
          </div>
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => state.onConfirmSnap(afterStart, afterEnd)}
            style={{ ...btnBase, background: C.oV, color: "#0E0C0A", textAlign: "left", padding: "10px 14px" }}
          >
            <div style={{ fontSize: 11, opacity: 0.85 }}>Coller après</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{state.conflict.name}</div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{afterStart} → {afterEnd}</div>
          </button>

          {beforeValid && (
            <button
              onClick={() => state.onConfirmSnap(state.movingStart, beforeEnd)}
              style={{ ...btnBase, background: C.s2, color: C.tx, border: "1px solid " + C.brdL, textAlign: "left", padding: "10px 14px" }}
            >
              <div style={{ fontSize: 11, color: C.tx3 }}>Coller avant</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{state.conflict.name}</div>
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>{state.movingStart} → {beforeEnd}</div>
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Cascade shift option */}
          {state.onCascadeShift && (
            <button
              onClick={async () => {
                setCascading(true);
                await state.onCascadeShift!();
                setCascading(false);
              }}
              disabled={cascading}
              style={{
                ...btnBase, background: C.s2, color: C.tx2,
                border: "1px solid " + C.brdL, fontSize: 11,
                opacity: cascading ? 0.6 : 1, cursor: cascading ? "not-allowed" : "pointer",
              }}
              title="Décale « conflict » et tous les blocs suivants de 1 semaine, puis place la période à sa nouvelle position"
            >
              {cascading ? "…" : `Décaler « ${state.conflict.name} » +1 sem. → cascade`}
            </button>
          )}

          <button
            onClick={state.onCancel}
            style={{ ...btnBase, background: "transparent", border: "1px solid " + C.brdL, color: C.tx3 }}
          >
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}

// ── TimelineView ──────────────────────────────────────────────────────────────

interface TimelineViewProps { athleteId: string }

const MONTHS_SHOWN = 18;

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

  const qc = useQueryClient();
  const { user } = useAuth();
  const { mutate: deleteComp } = useDeleteCompetition();

  const rangeStart = zoomMacro ? zoomMacro.start : windowStart;
  const rangeEnd   = zoomMacro ? zoomMacro.end   : addMonths(windowStart, MONTHS_SHOWN);
  const rsStr      = format(rangeStart, "yyyy-MM-dd");
  const reStr      = format(rangeEnd,   "yyyy-MM-dd");

  const containerRef    = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_WIDTH);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setWidth(Math.max(MIN_WIDTH, entry.contentRect.width));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { data, isLoading } = useTimelineData(athleteId, { start: rangeStart, end: rangeEnd });
  const calc = useCalculatePosition(rangeStart, rangeEnd, width - 88); // subtract label col

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
    const qKey = ["timeline-data", athleteId, rsStr, reStr];
    qc.setQueryData(qKey, previous);

    // Restore changed items in DB
    const levels = ["macrocycles", "mesocycles", "cycles", "microcycles"] as const;
    for (const level of levels) {
      const prevItems = previous[level] as Array<{ id: string; start_date: string; end_date: string }>;
      const currItems = (data[level] as Array<{ id: string; start_date: string; end_date: string }>);
      for (const prev of prevItems) {
        const curr = currItems.find((c) => c.id === prev.id);
        if (!curr || curr.start_date !== prev.start_date || curr.end_date !== prev.end_date) {
          await supabase.from(level).update({ start_date: prev.start_date, end_date: prev.end_date }).eq("id", prev.id);
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
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
      await supabase.from(level as never).update({ start_date: newStart, end_date: newEnd }).eq("id", item.id);
    }
    qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
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
      const children = (data?.[childrenArr] as AnyItem[] | undefined)
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
    return (id: string, ns: string, _ne: string, ps?: string, pe?: string) => {
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

  const sharedRowProps = { calc, athleteId, rangeStart: rsStr, rangeEnd: reStr };

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

  return (
    <>
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
        {/* ── Header ── */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {zoomMacro ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 4, background: C.acS, border: "1px solid " + C.ac + "50" }}>
                  <Eye size={12} color={C.ac} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.ac }}>MACROCYCLE EN COURS</span>
                  <span style={{ fontSize: 11, color: C.tx3 }}>·</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>{zoomMacro.label}</span>
                </div>
                <button
                  onClick={() => setZoomMacro(null)}
                  title="Quitter le zoom"
                  style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setWindowStart((d) => subMonths(d, 6))} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={16} />
                </button>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, minWidth: 160, textAlign: "center" }}>
                  {format(rangeStart, "MMM yyyy", { locale: fr })} — {format(rangeEnd, "MMM yyyy", { locale: fr })}
                </div>
                <button onClick={() => setWindowStart((d) => addMonths(d, 6))} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setWindowStart(startOfMonth(new Date()))}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Auj.
                </button>
                {undoStack.length > 0 && (
                  <button
                    onClick={handleUndo}
                    title="Annuler la dernière action (drag/resize)"
                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + C.o + "60", background: C.o + "15", color: C.o, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    ↩ Annuler
                  </button>
                )}
                <AddDropdown
                  onSelect={(level) => {
                    if (level === "macrocycle") {
                      openCreate("macrocycle", undefined, rsStr, reStr);
                    } else if (level === "mesocycle") {
                      const macros = data?.macrocycles ?? [];
                      if (!macros.length) { toast.error("Crée d'abord un macrocycle"); return; }
                      const first = macros[0];
                      openCreate(
                        "mesocycle", first.id, first.start_date, first.end_date, undefined,
                        macros.map((m) => ({ id: m.id, label: `${m.name} (${m.start_date} → ${m.end_date})` })),
                      );
                    } else if (level === "cycle") {
                      openCycleAssistant();
                    } else if (level === "microcycle") {
                      const cycles = data?.cycles ?? [];
                      if (!cycles.length) { toast.error("Crée d'abord un cycle"); return; }
                      const first = cycles[0];
                      openCreate(
                        "microcycle", first.id, first.start_date, first.end_date, undefined,
                        cycles.map((c) => ({ id: c.id, label: `${c.name} (${c.start_date} → ${c.end_date})` })),
                      );
                    }
                  }}
                />
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(["macrocycle", "mesocycle", "cycle", "microcycle"] as const).map((lvl) => (
              <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: LEVEL_COLORS[lvl] }} />
                <span style={{ fontSize: 9, color: C.tx3, textTransform: "capitalize" }}>{lvl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Breadcrumb (contexte période sélectionnée) ── */}
        {drawer && data && (
          <div style={{ padding: "6px 20px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* Macrocycle */}
            {(() => {
              let macro: typeof data.macrocycles[number] | undefined;
              let meso: typeof data.mesocycles[number] | undefined;
              let cycle: typeof data.cycles[number] | undefined;
              let micro: typeof data.microcycles[number] | undefined;

              if (drawer.type === "macrocycle") {
                macro = data.macrocycles.find((m) => m.id === drawer.id);
              } else if (drawer.type === "mesocycle") {
                meso  = data.mesocycles.find((m) => m.id === drawer.id);
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              } else if (drawer.type === "cycle") {
                cycle = data.cycles.find((c) => c.id === drawer.id);
                meso  = cycle?.mesocycle_id ? data.mesocycles.find((m) => m.id === cycle!.mesocycle_id) : undefined;
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              } else if (drawer.type === "microcycle") {
                micro = data.microcycles.find((m) => m.id === drawer.id);
                cycle = micro ? data.cycles.find((c) => c.id === micro!.cycle_id) : undefined;
                meso  = cycle?.mesocycle_id ? data.mesocycles.find((m) => m.id === cycle!.mesocycle_id) : undefined;
                macro = meso ? data.macrocycles.find((m) => m.id === meso!.macrocycle_id) : undefined;
              }

              const crumbs: Array<{ label: string; type: DrawerType; id: string; color: string }> = [];
              if (macro) crumbs.push({ label: macro.name, type: "macrocycle", id: macro.id, color: LEVEL_COLORS.macrocycle });
              if (meso)  crumbs.push({ label: meso.name,  type: "mesocycle",  id: meso.id,  color: LEVEL_COLORS.mesocycle });
              if (cycle) crumbs.push({ label: cycle.name, type: "cycle",      id: cycle.id, color: LEVEL_COLORS.cycle });
              if (micro) crumbs.push({ label: `S${micro.week_number}`, type: "microcycle", id: micro.id, color: LEVEL_COLORS.microcycle });

              return crumbs.map((crumb, i) => (
                <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span style={{ fontSize: 9, color: C.tx3 }}>›</span>}
                  <button
                    onClick={() => open(crumb.type, crumb.id)}
                    style={{
                      padding: "2px 8px", borderRadius: 5,
                      border: "none", background: crumb.id === drawer.id ? crumb.color + "30" : "transparent",
                      color: crumb.id === drawer.id ? crumb.color : C.tx3,
                      fontSize: 10, fontWeight: crumb.id === drawer.id ? 700 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {crumb.label}
                  </button>
                </span>
              ));
            })()}
          </div>
        )}

        {/* ── Scrollable area ── */}
        <div style={{ overflowX: "auto", paddingBottom: 40 }}>
          <div ref={containerRef} style={{ width: "100%" }}>
            {/* TimeAxis */}
            <div style={{ padding: "10px 0 0" }}>
              <TimeAxis rangeStart={rangeStart} rangeEnd={rangeEnd} containerWidth={width} />
            </div>

            {isLoading ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ width: 24, height: 24, border: "2px solid " + C.brdL, borderTopColor: C.ac, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (data?.macrocycles ?? []).length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}></div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Aucun macrocycle sur cette période</div>
                <div style={{ fontSize: 12, color: C.tx3, marginTop: 4, marginBottom: 16 }}>Crée un macrocycle pour visualiser la frise.</div>
                <button
                  onClick={() => openCreate("macrocycle", undefined, rsStr, reStr)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "9px 18px", borderRadius: 4,
                    border: "none", background: C.ac,
                    color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Plus size={13} /> Créer un macrocycle
                </button>
              </div>
            ) : (
              /* Relative container for absolute markers */
              <div style={{ position: "relative" }}>
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
                      macros.map((m) => ({ id: m.id, label: `${m.name} (${m.start_date} → ${m.end_date})` })),
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

                {/* Vertical markers (position absolute over all rows) */}
                <CompetitionMarkers
                  competitions={data?.competitions ?? []}
                  calc={calc}
                  totalRowHeight={TOTAL_ROW_H}
                  onSelect={(c: Competition) => open("competition", c.id)}
                />
                <TestMarkers
                  tests={data?.tests ?? []}
                  calc={calc}
                  totalRowHeight={TOTAL_ROW_H}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 20px", borderTop: "1px solid " + C.brd, fontSize: 9, color: C.tx3, textAlign: "center" }}>
          Drag axe X pour déplacer · Poignées colorées pour redimensionner · + pour détails · Compétitions: rose(A) violet(B) gris(C)
        </div>
      </div>

      {/* Snap-to-adjacent dialog (overlap on drag/resize) */}
      {snapDragDialog && <SnapDragDialog state={snapDragDialog} />}

      {/* No-parent drag modal */}
      {noParentModal && (
        <NoParentDragModal
          state={noParentModal}
          macrocycles={data?.macrocycles ?? []}
          mesocycles={data?.mesocycles ?? []}
          athleteId={athleteId}
          onClose={() => { setNoParentModal(null); setCycleRowResetKey((k) => k + 1); }}
        />
      )}

      {/* Create modal */}
      {createModal && (
        <CreateModal
          state={createModal}
          athleteId={athleteId}
          coachId={user?.id ?? ""}
          rangeStart={rsStr}
          rangeEnd={reStr}
          onClose={() => setCreateModal(null)}
        />
      )}

      {/* Cycle creation assistant (reuse last cycle's sessions/exos) */}
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

      {/* Drawer */}
      {drawer && data && (
        <DrawerShell
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

      {/* Competition edit modal */}
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
