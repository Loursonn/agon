import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, differenceInWeeks, startOfISOWeek, endOfISOWeek, addWeeks, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Edit3, Check, CheckCircle2, Clock, Circle, FolderOpen } from "lucide-react";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import type { Cycle, Mesocycle } from "../hooks/useTimelineData";
import { snapMonday, snapSunday, computeCascade, chainNextStart } from "../utils/planningHelpers";
import { DateQuickAdjust } from "../DateQuickAdjust";

// ── Microcycle auto-generation ────────────────────────────────────────────────

async function regenerateMicrocycles(cycleId: string, start: string, end: string) {
  const { data: existing } = await supabase
    .from("microcycles").select("id, start_date").eq("cycle_id", cycleId);

  const needed: { cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }[] = [];
  let weekMon = startOfISOWeek(parseISO(start));
  const ed = parseISO(end);
  let week = 1;
  while (weekMon <= ed) {
    needed.push({ cycle_id: cycleId, week_number: week, start_date: format(weekMon, "yyyy-MM-dd"), end_date: format(endOfISOWeek(weekMon), "yyyy-MM-dd"), is_deload: false });
    weekMon = addWeeks(weekMon, 1);
    week++;
  }

  const neededStarts   = new Set(needed.map((m) => m.start_date));
  const existingStarts = new Set((existing ?? []).map((m) => m.start_date));

  const toDelete = (existing ?? []).filter((m) => !neededStarts.has(m.start_date));
  if (toDelete.length > 0) {
    const ids = toDelete.map((m) => m.id);
    await supabase.from("workout_logs").delete().in("microcycle_id", ids);
    await supabase.from("microcycles").delete().in("id", ids);
  }

  const toInsert = needed.filter((m) => !existingStarts.has(m.start_date));
  if (toInsert.length > 0) await supabase.from("microcycles").insert(toInsert);
}

// ── Session list ──────────────────────────────────────────────────────────────

interface WorkoutRow {
  id: string; session_name: string; scheduled_date: string;
  status: string; rpe: number | null;
}

function useCycleSessions(athleteId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["cycle-sessions", athleteId, startDate, endDate],
    enabled:  !!athleteId && !!startDate && !!endDate,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkoutRow[]> => {
      // Scope by the cycle's date span. Cycles are sequential (non-overlapping),
      // and most logs are date-based (microcycle_id null), so date range is the
      // reliable scope here.
      const { data } = await supabase
        .from("workout_logs")
        .select("id, session_name, scheduled_date, status, workout_rpe(rpe_score)")
        .eq("athlete_id", athleteId)
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate)
        .order("scheduled_date");
      return (data ?? []).map((w) => ({
        id: w.id, session_name: w.session_name, scheduled_date: w.scheduled_date,
        status: w.status,
        rpe: Array.isArray(w.workout_rpe) && w.workout_rpe.length > 0
          ? (w.workout_rpe[0] as { rpe_score: number }).rpe_score : null,
      }));
    },
  });
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={13} style={{ color: C.g, flexShrink: 0 }} />;
  if (status === "skipped")   return <Circle size={13} style={{ color: C.r, flexShrink: 0 }} />;
  return <Clock size={13} style={{ color: C.tx3, flexShrink: 0 }} />;
}

// ── Cascade confirm modal ─────────────────────────────────────────────────────

function CascadeModal({
  count, onCascade, onSingle, onCancel,
}: {
  count: number; onCascade: () => void; onSingle: () => void; onCancel: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 71,
        transform: "translate(-50%,-50%)",
        width: 360, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 22px",
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 8 }}>Adapter le planning ?</div>
        <div style={{ fontSize: 13, color: C.tx2, marginBottom: 18, lineHeight: 1.5 }}>
          Modifier ce cycle va décaler{" "}
          <strong style={{ color: C.o }}>{count} cycle{count > 1 ? "s" : ""}</strong>{" "}
          suivant{count > 1 ? "s" : ""}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onCascade} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "none", background: C.oV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Bouger tout le planning
          </button>
          <button onClick={onSingle} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Uniquement ce cycle
          </button>
          <button onClick={onCancel} style={{ width: "100%", padding: "8px 0", borderRadius: 4, border: "none", background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}

// ── Meso reassign modal ───────────────────────────────────────────────────────

function MesoReassignModal({
  currentMeso, newMeso, onReassign, onKeep,
}: {
  currentMeso: Mesocycle | undefined;
  newMeso:     Mesocycle;
  onReassign:  () => void;
  onKeep:      () => void;
}) {
  return (
    <>
      <div onClick={onKeep} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 71,
        transform: "translate(-50%,-50%)",
        width: 380, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 22px",
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 8 }}>Réassigner ce cycle ?</div>
        <div style={{ fontSize: 13, color: C.tx2, marginBottom: 18, lineHeight: 1.5 }}>
          Les nouvelles dates correspondent au mésocycle{" "}
          <strong style={{ color: C.coach }}>"{newMeso.name}"</strong>.
          {currentMeso && (
            <> Il est actuellement dans <strong>"{currentMeso.name}"</strong>.</>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onReassign} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Déplacer dans "{newMeso.name}" ✓
          </button>
          <button onClick={onKeep} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Garder dans "{currentMeso?.name ?? "mésocycle actuel"}"
          </button>
        </div>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  cycle:       Cycle;
  parentMeso?: Mesocycle;
  siblings:    Cycle[];      // cycles in same meso, sorted by start_date
  allMesos:    Mesocycle[];  // all mesos (to detect cross-meso overlap)
  athleteId:   string;
  rangeStart:  string;
  rangeEnd:    string;
  onClose?:    () => void;
}

export function CycleDrawer({
  cycle, parentMeso, siblings, allMesos, athleteId, rangeStart, rangeEnd, onClose,
}: Props) {
  void rangeStart; void rangeEnd;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setOpenCycleId, setBlockConfig } = useAthleteContext();
  const { data: sessions = [], isLoading: loadingSessions } = useCycleSessions(
    athleteId, cycle.start_date, cycle.end_date,
  );

  // Ouvre ce cycle dans Programmation : charge SES exos/séances (stockage par cycle)
  // et cale le bloc legacy (nom, début, nb de semaines) dessus.
  function openThisCycle() {
    setOpenCycleId(cycle.id);
    setBlockConfig((prev) => ({
      ...prev,
      cycleId:    cycle.id,
      blockName:  cycle.name,
      startDate:  cycle.start_date,
      totalWeeks: numWeeks,
      deloadWeek: 0,
    }));
    onClose?.();
    navigate("../programmation");
  }

  const [editingObj,    setEditingObj]    = useState(false);
  const [objective,     setObjective]     = useState(cycle.objective ?? "");
  const [editingDates,  setEditingDates]  = useState(false);
  const [startDate,     setStartDate]     = useState(cycle.start_date);
  const [endDate,       setEndDate]       = useState(cycle.end_date);
  const [savingDates,   setSavingDates]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [parentId,      setParentId]      = useState(cycle.mesocycle_id ?? "");
  const [editingParent, setEditingParent] = useState(false);
  const [savingParent,  setSavingParent]  = useState(false);
  const [confirmStartChange,   setConfirmStartChange]   = useState(false);

  // modals
  const [cascadeModal, setCascadeModal] = useState<{
    newStart: string; newEnd: string;
    later: Cycle[];
    pendingMesoId?: string;
  } | null>(null);
  const [mesoModal, setMesoModal] = useState<{
    newStart: string; newEnd: string;
    newMeso: Mesocycle;
    cascade: boolean;
    later: Cycle[];
  } | null>(null);

  const numWeeks = Math.max(1, differenceInWeeks(parseISO(endDate), parseISO(startDate)) + 1);

  const completed = sessions.filter((s) => s.status === "completed").length;
  const total     = sessions.length;
  const avgRpe    = sessions.filter((s) => s.rpe != null).length > 0
    ? (sessions.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / sessions.filter((s) => s.rpe != null).length).toFixed(1)
    : null;

  // ── date snap ───────────────────────────────────────────────────────────────

  function handleStartChange(raw: string) {
    if (!raw) return;
    setStartDate(snapMonday(raw));
  }
  function handleEndChange(raw: string) {
    if (!raw) return;
    setEndDate(snapSunday(raw));
  }

  // ── save dates core ───────────────────────────────────────────────────────

  async function doSaveDates(
    newStart: string, newEnd: string,
    newMesoId: string | undefined,
    cascade: boolean, laterCycles: Cycle[],
  ) {
    setSavingDates(true);
    const updatePayload: Record<string, string> = { start_date: newStart, end_date: newEnd };
    if (newMesoId) updatePayload.mesocycle_id = newMesoId;

    const oldEnd = cycle.end_date;
    const { error } = await supabase.from("cycles").update(updatePayload).eq("id", cycle.id);
    if (!error) await regenerateMicrocycles(cycle.id, newStart, newEnd);

    // Borne dure : si on raccourcit la fin (sans cascade), on supprime les séances
    // au-delà de la nouvelle fin. Permet de "stopper" un cycle à une date donnée
    // (ex. fin = hier) pour repartir proprement, sans logs résiduels (y compris les
    // logs hérités date-based marqués validés par erreur).
    if (!error && !cascade && newEnd < oldEnd) {
      await supabase.from("workout_logs").delete()
        .eq("athlete_id", athleteId)
        .gt("scheduled_date", newEnd)
        .lte("scheduled_date", oldEnd);
    }

    if (!error && cascade) {
      const updates = computeCascade(newEnd, laterCycles);
      for (const u of updates) {
        await supabase.from("cycles")
          .update({ start_date: u.start_date, end_date: u.end_date }).eq("id", u.id);
        await regenerateMicrocycles(u.id, u.start_date, u.end_date);
      }
    }

    setSavingDates(false);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    qc.invalidateQueries({ queryKey: ["cycle-sessions", athleteId] });
    qc.invalidateQueries({ queryKey: ["athlete-cycles", athleteId] });
    qc.invalidateQueries({ queryKey: ["athlete-cycles-list", athleteId] });
    qc.invalidateQueries({ queryKey: ["active-cycle", athleteId] });
    qc.invalidateQueries({ queryKey: ["calendar-events", athleteId] });
    qc.invalidateQueries({ queryKey: ["micro-days", athleteId] });
    qc.invalidateQueries({ queryKey: ["micro-stats", athleteId] });
    setCascadeModal(null);
    setMesoModal(null);
    setEditingDates(false);
    toast.success([
      "Dates mises à jour · microcycles régénérés",
      cascade ? " · planning décalé" : "",
      newMesoId ? " · mésocycle réassigné" : "",
    ].join(""));
  }

  // ── save flow: cascade → meso reassign ───────────────────────────────────

  // Garde-fou : changer le DÉBUT décale les semaines ; raccourcir la FIN supprime
  // les séances au-delà de la nouvelle fin. On confirme avant d'appliquer.
  const startChanged = snapMonday(startDate) !== cycle.start_date;
  const endShortened = snapSunday(endDate)   <  cycle.end_date;
  function handleSaveDates() {
    if (startChanged || endShortened) {
      setConfirmStartChange(true);
      return;
    }
    runSaveDates();
  }

  function runSaveDates() {
    if (!startDate || !endDate || startDate >= endDate) { toast.error("Dates invalides"); return; }
    let snStart = snapMonday(startDate);
    const snEnd = snapSunday(endDate);

    // Anti-overlap: clamp start to after previous sibling's end
    const sortedSibs = siblings
      .filter((c) => c.id !== cycle.id)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const prev = sortedSibs.filter((c) => c.start_date < cycle.start_date).at(-1);
    if (prev) {
      const minStart = chainNextStart(prev.end_date);
      if (snStart < minStart) {
        snStart = minStart;
        toast.info("Début ajusté pour éviter le chevauchement avec le cycle précédent");
      }
    }
    if (snStart >= snEnd) { toast.error("Dates invalides après ajustement"); return; }

    setStartDate(snStart);
    setEndDate(snEnd);

    const later = siblings
      .filter((c) => c.id !== cycle.id && c.start_date > cycle.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    // Detect if cycle now falls in a different meso
    const overlappingMeso = allMesos.find(
      (m) => m.id !== cycle.mesocycle_id &&
             snStart >= m.start_date && snStart <= m.end_date,
    );

    if (later.length > 0) {
      // First ask cascade, then (inside callback) ask meso reassign if needed
      setCascadeModal({
        newStart: snStart, newEnd: snEnd, later,
        pendingMesoId: overlappingMeso?.id,
      });
    } else if (overlappingMeso) {
      setMesoModal({ newStart: snStart, newEnd: snEnd, newMeso: overlappingMeso, cascade: false, later: [] });
    } else {
      doSaveDates(snStart, snEnd, undefined, false, []);
    }
  }

  function handleCascadeDecision(cascade: boolean) {
    if (!cascadeModal) return;
    const { newStart, newEnd, later, pendingMesoId } = cascadeModal;

    // If not cascading, clamp end to just before next sibling to prevent overlap
    let effectiveEnd = newEnd;
    if (!cascade && later.length > 0) {
      const clampedEnd = format(addDays(parseISO(later[0].start_date), -1), "yyyy-MM-dd");
      if (clampedEnd < newEnd) {
        effectiveEnd = clampedEnd;
        toast.info("Fin ajustée pour ne pas chevaucher le cycle suivant");
      }
    }

    const overlappingMeso = pendingMesoId ? allMesos.find((m) => m.id === pendingMesoId) : undefined;
    if (overlappingMeso) {
      setCascadeModal(null);
      setMesoModal({ newStart, newEnd: effectiveEnd, newMeso: overlappingMeso, cascade, later });
    } else {
      doSaveDates(newStart, effectiveEnd, undefined, cascade, cascade ? later : []);
    }
  }

  // ── save parent meso ─────────────────────────────────────────────────────

  async function saveParent() {
    if (parentId === (cycle.mesocycle_id ?? "")) { setEditingParent(false); return; }
    setSavingParent(true);
    const { error } = await supabase.from("cycles")
      .update({ mesocycle_id: parentId || null })
      .eq("id", cycle.id);
    setSavingParent(false);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    toast.success("Mésocycle parent modifié");
    setEditingParent(false);
  }

  // ── save objective ────────────────────────────────────────────────────────

  async function saveObjective() {
    const { error } = await supabase.from("cycles").update({ objective }).eq("id", cycle.id);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    setEditingObj(false);
    toast.success("Objectif enregistré");
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function deleteCycle() {
    setDeleting(true);
    const { data: micros } = await supabase.from("microcycles").select("id").eq("cycle_id", cycle.id);
    const microIds = (micros ?? []).map((m: { id: string }) => m.id);
    if (microIds.length > 0) await supabase.from("workout_logs").delete().in("microcycle_id", microIds);
    await supabase.from("microcycles").delete().eq("cycle_id", cycle.id);
    const { error } = await supabase.from("cycles").delete().eq("id", cycle.id);
    setDeleting(false);
    if (error) { toast.error("Erreur suppression : " + error.message); return; }
    toast.success("Cycle supprimé");
    qc.invalidateQueries({ queryKey: ["timeline-data"] });
    qc.invalidateQueries({ queryKey: ["active-cycle"] });
    qc.invalidateQueries({ queryKey: ["athlete-cycles-list"] });
    qc.invalidateQueries({ queryKey: ["cal-range"] });
    onClose?.();
  }

  const calMonth = cycle.start_date.slice(0, 7);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Ouvrir ce cycle dans Programmation (charge ses exos/séances) */}
        <button
          onClick={openThisCycle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "12px 0", borderRadius: 4, border: "none",
            background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <FolderOpen size={15} />
          Ouvrir ce cycle (séances & exos)
        </button>

        {/* Dates + duration */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Dates</span>
            <button
              onClick={() => editingDates ? handleSaveDates() : setEditingDates(true)}
              disabled={savingDates}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + (editingDates ? C.g + "60" : C.brdL), background: editingDates ? C.gS : "transparent", color: editingDates ? C.g : C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {editingDates ? <><Check size={11} />{savingDates ? "…" : "Enregistrer"}</> : <><Edit3 size={11} />Modifier</>}
            </button>
          </div>
          {editingDates ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Début (snap lundi)", val: startDate, fn: handleStartChange },
                  { label: "Fin (snap dimanche)", val: endDate, fn: handleEndChange },
                ].map(({ label, val, fn }) => (
                  <div key={label} style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>{label}</div>
                    <input
                      type="date" value={val}
                      onChange={(e) => fn(e.target.value)}
                      style={{ width: "100%", padding: "7px 9px", borderRadius: 4, border: "1px solid " + C.o + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const prev = siblings.filter((s) => s.start_date < cycle.start_date).at(-1);
                return (
                  <DateQuickAdjust
                    endDate={endDate}
                    onEndChange={(v) => setEndDate(v)}
                    prevEndDate={prev?.end_date}
                    onStartChange={(v) => setStartDate(snapMonday(v))}
                  />
                );
              })()}
              <div style={{ fontSize: 10, color: C.tx3, fontStyle: "italic" }}>
                ↳ Début snap au lundi · Fin snap au dimanche
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Début", val: format(parseISO(startDate), "d MMM", { locale: fr }) },
                { label: "Fin",   val: format(parseISO(endDate),   "d MMM", { locale: fr }) },
                { label: "Durée", val: `${numWeeks} sem.` },
              ].map(({ label, val }) => (
                <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: C.tx3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parent mésocycle */}
        {allMesos.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Mésocycle parent</span>
              {editingParent ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setParentId(cycle.mesocycle_id ?? ""); setEditingParent(false); }} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                  <button onClick={saveParent} disabled={savingParent} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.g + "60", background: C.gS, color: C.g, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    <Check size={11} />{savingParent ? "…" : "Enregistrer"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingParent(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  <Edit3 size={11} />Modifier
                </button>
              )}
            </div>
            {editingParent ? (
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.o + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit" }}
              >
                <option value="">— Aucun (cycle autonome) —</option>
                {allMesos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({format(parseISO(m.start_date), "d MMM", { locale: fr })} → {format(parseISO(m.end_date), "d MMM", { locale: fr })})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ background: C.s2, borderRadius: 4, padding: "8px 10px", fontSize: 12, color: C.tx }}>
                {allMesos.find((m) => m.id === parentId)?.name ?? <span style={{ color: C.tx3, fontStyle: "italic" }}>Aucun (autonome)</span>}
              </div>
            )}
          </div>
        )}

        {/* Parent meso objective */}
        {parentMeso?.objective && (
          <div style={{ background: C.coachS, borderRadius: 4, padding: "10px 12px", border: "1px solid " + C.coach + "30" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.coach, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
              Obj. Mésocycle parent
            </div>
            <div style={{ fontSize: 12, color: C.tx2 }}>{parentMeso.objective}</div>
          </div>
        )}

        {/* Objectif */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Objectif du cycle
            </span>
            <button
              onClick={() => editingObj ? saveObjective() : setEditingObj(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + (editingObj ? C.g + "60" : C.brdL), background: editingObj ? C.gS : "transparent", color: editingObj ? C.g : C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {editingObj ? <><Check size={11} /> Enregistrer</> : <><Edit3 size={11} /> Modifier</>}
            </button>
          </div>
          {editingObj ? (
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3} autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.o + "60", background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          ) : (
            <div style={{ background: objective ? C.oS : C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + (objective ? C.o + "30" : C.brd), fontSize: 13, color: objective ? C.tx : C.tx3 }}>
              {objective || "Aucun objectif défini"}
            </div>
          )}
        </div>

        {/* Stats */}
        {total > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Total séances", val: String(total) },
              { label: "Réalisées",     val: `${completed} / ${total}` },
              ...(avgRpe ? [{ label: "RPE moyen", val: avgRpe }] : []),
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: C.tx3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Session list */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
            Séances
          </div>
          {loadingSessions ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
          ) : total === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.tx3, fontSize: 12 }}>Aucune séance planifiée sur cette période.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 4, background: s.status === "completed" ? C.gS : C.s2, border: "1px solid " + (s.status === "completed" ? C.g + "25" : C.brd) }}>
                  <StatusIcon status={s.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.session_name}</div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>{format(parseISO(s.scheduled_date), "EEE d MMM", { locale: fr })}</div>
                  </div>
                  {s.rpe != null && (
                    <div style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.o }}>RPE {s.rpe}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calendar link */}
        <a
          href={`?view=month&month=${calMonth}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.o + "40", background: C.oS, color: C.o, fontSize: 13, fontWeight: 700, textDecoration: "none", gap: 6 }}
        >
          → Ouvrir Calendrier Mois {format(parseISO(cycle.start_date), "MMMM yyyy", { locale: fr })}
        </a>

        {/* Supprimer */}
        <div style={{ paddingTop: 8, borderTop: "1px solid " + C.brd }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.r + "40", background: "transparent", color: C.r, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Supprimer ce cycle
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: C.r, fontWeight: 600, textAlign: "center" }}>
                Supprimer définitivement ? Les séances planifiées seront effacées.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                <button onClick={deleteCycle} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: deleting ? 0.6 : 1 }}>
                  {deleting ? "Suppression…" : "Confirmer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cascade modal */}
      {cascadeModal && (
        <CascadeModal
          count={cascadeModal.later.length}
          onCascade={() => handleCascadeDecision(true)}
          onSingle={() => handleCascadeDecision(false)}
          onCancel={() => setCascadeModal(null)}
        />
      )}

      {/* Meso reassign modal */}
      {mesoModal && (
        <MesoReassignModal
          currentMeso={parentMeso}
          newMeso={mesoModal.newMeso}
          onReassign={() => doSaveDates(mesoModal.newStart, mesoModal.newEnd, mesoModal.newMeso.id, mesoModal.cascade, mesoModal.cascade ? mesoModal.later : [])}
          onKeep={() => doSaveDates(mesoModal.newStart, mesoModal.newEnd, undefined, mesoModal.cascade, mesoModal.cascade ? mesoModal.later : [])}
        />
      )}

      {/* Confirmation changement de date de début */}
      {confirmStartChange && (
        <>
          <div onClick={() => setConfirmStartChange(false)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", zIndex: 71,
            transform: "translate(-50%,-50%)",
            width: 380, maxWidth: "92vw",
            background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
            padding: "20px 22px",
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 8 }}>Modifier les dates du cycle ?</div>
            <div style={{ fontSize: 13, color: C.tx2, marginBottom: 18, lineHeight: 1.5 }}>
              {startChanged && (
                <>Décaler le <strong>début</strong> déplace toutes les semaines ; des séances déjà réalisées peuvent se retrouver au mauvais endroit. </>
              )}
              {endShortened && (
                <>Raccourcir la <strong>fin</strong> <strong style={{ color: C.r }}>supprimera toutes les séances après le {format(parseISO(snapSunday(endDate)), "d MMM", { locale: fr })}</strong> (y compris validées). </>
              )}
              À ne faire que si tu sais ce que tu fais.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { setConfirmStartChange(false); runSaveDates(); }} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "none", background: C.oV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Oui, appliquer
              </button>
              <button onClick={() => setConfirmStartChange(false)} style={{ width: "100%", padding: "9px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
