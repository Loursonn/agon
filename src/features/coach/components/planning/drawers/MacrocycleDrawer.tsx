import { useState } from "react";
import { format, parseISO, differenceInWeeks, startOfISOWeek, endOfISOWeek, addWeeks, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { X, Edit3, Check } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Macrocycle } from "../hooks/useTimelineData";
import { useTestResults } from "../hooks/useTimelineData";
import { snapMonday, snapSunday, computeCascade, chainNextStart, endFromWeeks } from "../utils/planningHelpers";
import { DateQuickAdjust } from "../DateQuickAdjust";

// ── Re-chain cycles inside a meso after its dates change ─────────────────────

async function rechainCyclesInMeso(mesoId: string, newStart: string, newEnd: string) {
  const { data: cycles } = await supabase
    .from("cycles").select("id, start_date, end_date")
    .eq("mesocycle_id", mesoId).order("start_date");
  if (!cycles?.length) return;

  let cursor = snapMonday(newStart);
  for (const c of cycles) {
    if (cursor > newEnd) break;
    const weeks = Math.max(1, differenceInWeeks(parseISO(c.end_date), parseISO(c.start_date)) + 1);
    let end = endFromWeeks(cursor, weeks);
    if (end > newEnd) end = format(endOfISOWeek(parseISO(newEnd)), "yyyy-MM-dd");
    await supabase.from("cycles").update({ start_date: cursor, end_date: end }).eq("id", c.id);
    await supabase.from("microcycles").delete().eq("cycle_id", c.id);
    const rows: Array<{ cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }> = [];
    let wMon = startOfISOWeek(parseISO(cursor));
    const ed = parseISO(end); let week = 1;
    while (wMon <= ed) {
      rows.push({ cycle_id: c.id, week_number: week, start_date: format(wMon, "yyyy-MM-dd"), end_date: format(endOfISOWeek(wMon), "yyyy-MM-dd"), is_deload: false });
      wMon = addWeeks(wMon, 1); week++;
    }
    if (rows.length > 0) await supabase.from("microcycles").insert(rows);
    cursor = chainNextStart(end);
  }
}

// ── Recharts tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 4, padding: "8px 12px" }}>
      <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ fontSize: 12, fontWeight: 600, color: p.color }}>
          {p.name} : {p.value}
        </div>
      ))}
    </div>
  );
}

// ── Cascade confirm modal ─────────────────────────────────────────────────────

function CascadeModal({
  count, onCascade, onSingle, onCancel,
}: {
  count: number;
  onCascade: () => void;
  onSingle:  () => void;
  onCancel:  () => void;
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
          Modifier ce macrocycle va décaler <strong style={{ color: C.ac }}>{count} macrocycle{count > 1 ? "s" : ""}</strong> suivant{count > 1 ? "s" : ""}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onCascade} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Bouger tout le planning
          </button>
          <button onClick={onSingle} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Uniquement ce macrocycle (fin ajustée)
          </button>
          <button onClick={onCancel} style={{ width: "100%", padding: "8px 0", borderRadius: 4, border: "none", background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  macro:      Macrocycle;
  siblings:   Macrocycle[];   // all macros for the athlete, sorted by start_date
  athleteId:  string;
  rangeStart: string;
  rangeEnd:   string;
  onClose:    () => void;
}

export function MacrocycleDrawer({ macro, siblings, athleteId, rangeStart, rangeEnd, onClose }: Props) {
  void rangeStart; void rangeEnd;
  const qc = useQueryClient();
  const { data: testResults = [] } = useTestResults(athleteId, macro.id);

  const [editingObj,   setEditingObj]   = useState(false);
  const [objective,    setObjective]    = useState(macro.objective ?? "");
  const [editingDates, setEditingDates] = useState(false);
  const [startDate,    setStartDate]    = useState(macro.start_date);
  const [endDate,      setEndDate]      = useState(macro.end_date);
  const [savingDates,  setSavingDates]  = useState(false);

  // cascade state
  const [cascadeModal, setCascadeModal] = useState<{
    newStart: string; newEnd: string;
    later: Macrocycle[];
  } | null>(null);

  // ── date snap handlers ────────────────────────────────────────────────────

  function handleStartChange(raw: string) {
    if (!raw) return;
    setStartDate(snapMonday(raw));
  }
  function handleEndChange(raw: string) {
    if (!raw) return;
    setEndDate(snapSunday(raw));
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function saveObjective() {
    const { error } = await supabase.from("macrocycles").update({ objective }).eq("id", macro.id);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    setEditingObj(false);
    toast.success("Objectif enregistré");
  }

  async function rechainMesosInMacro(macroId: string, newStart: string, newEnd: string) {
    const { data: mesos } = await supabase
      .from("mesocycles").select("id, start_date, end_date")
      .eq("macrocycle_id", macroId).order("start_date");
    if (!mesos?.length) return;

    let cursor = snapMonday(newStart);
    for (const m of mesos) {
      if (cursor > newEnd) break;
      const weeks = Math.max(1, differenceInWeeks(parseISO(m.end_date), parseISO(m.start_date)) + 1);
      let end = endFromWeeks(cursor, weeks);
      if (end > newEnd) end = format(endOfISOWeek(parseISO(newEnd)), "yyyy-MM-dd");
      await supabase.from("mesocycles").update({ start_date: cursor, end_date: end }).eq("id", m.id);
      await rechainCyclesInMeso(m.id, cursor, end);
      cursor = chainNextStart(end);
    }
  }

  async function doSaveDates(newStart: string, newEnd: string, cascade: boolean) {
    setSavingDates(true);
    const { error } = await supabase
      .from("macrocycles").update({ start_date: newStart, end_date: newEnd }).eq("id", macro.id);
    if (error) { toast.error("Erreur"); setSavingDates(false); return; }

    // Re-chain mesos (and their cycles) inside this macro
    await rechainMesosInMacro(macro.id, newStart, newEnd);

    if (cascade && cascadeModal) {
      const updates = computeCascade(newEnd, cascadeModal.later);
      for (const u of updates) {
        await supabase.from("macrocycles")
          .update({ start_date: u.start_date, end_date: u.end_date }).eq("id", u.id);
        await rechainMesosInMacro(u.id, u.start_date, u.end_date);
      }
    }

    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    setSavingDates(false);
    setCascadeModal(null);
    setEditingDates(false);
    toast.success(cascade ? "Dates mises à jour · planning décalé · cycles ajustés" : "Dates mises à jour · cycles ajustés");
    onClose();
  }

  function handleSaveDates() {
    if (!startDate || !endDate || startDate >= endDate) { toast.error("Dates invalides"); return; }
    let snStart = snapMonday(startDate);
    const snEnd = snapSunday(endDate);

    // Anti-overlap: clamp start to after previous sibling's end
    const sortedSibs = siblings
      .filter((m) => m.id !== macro.id)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const prev = sortedSibs.filter((m) => m.start_date < macro.start_date).at(-1);
    if (prev) {
      const minStart = chainNextStart(prev.end_date);
      if (snStart < minStart) {
        snStart = minStart;
        toast.info("Début ajusté pour éviter le chevauchement avec le macrocycle précédent");
      }
    }
    if (snStart >= snEnd) { toast.error("Dates invalides après ajustement"); return; }

    setStartDate(snStart);
    setEndDate(snEnd);

    // Find later siblings
    const later = siblings
      .filter((m) => m.id !== macro.id && m.start_date > macro.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    if (later.length > 0) {
      setCascadeModal({ newStart: snStart, newEnd: snEnd, later });
    } else {
      doSaveDates(snStart, snEnd, false);
    }
  }

  // ── chart ─────────────────────────────────────────────────────────────────

  const testNames = [...new Set(testResults.map((r) => r.test?.name ?? "Test"))];
  const chartData = testResults.reduce<Record<string, Record<string, number>>>((acc, r) => {
    const dateKey = format(parseISO(r.test_date), "dd/MM", { locale: fr });
    (acc[dateKey] ??= {})[r.test?.name ?? "Test"] = r.value;
    return acc;
  }, {});
  const chartRows = Object.entries(chartData).map(([date, vals]) => ({ date, ...vals }));
  const LINE_COLORS = [C.ac, C.coach, C.o, C.g, C.b];

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Dates */}
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
                      style={{ width: "100%", padding: "7px 9px", borderRadius: 4, border: "1px solid " + C.ac + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
              {/* Quick date adjustments */}
              {(() => {
                const sortedSibs = siblings
                  .filter((m) => m.id !== macro.id)
                  .sort((a, b) => a.start_date.localeCompare(b.start_date));
                const prev = sortedSibs.filter((m) => m.start_date < macro.start_date).at(-1);
                return (
                  <DateQuickAdjust
                    endDate={endDate}
                    onEndChange={(v) => setEndDate(v)}
                    prevEndDate={prev?.end_date}
                    onStartChange={(v) => setStartDate(v)}
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
                { label: "Début", val: format(parseISO(startDate), "d MMM yyyy", { locale: fr }) },
                { label: "Fin",   val: format(parseISO(endDate),   "d MMM yyyy", { locale: fr }) },
              ].map(({ label, val }) => (
                <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: C.tx3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Objectif */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Objectif
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
              rows={3}
              autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 4, border: "1px solid " + C.ac + "60", background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          ) : (
            <div style={{ background: objective ? C.acS : C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + (objective ? C.ac + "30" : C.brd), fontSize: 13, color: objective ? C.tx : C.tx3 }}>
              {objective || "Aucun objectif défini"}
            </div>
          )}
        </div>

        {/* Test progression chart */}
        {chartRows.length > 0 ? (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 12 }}>
              Progression Tests
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.brd} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: C.tx3 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: C.tx3 }} />
                  {testNames.map((name, i) => (
                    <Line
                      key={name} type="monotone" dataKey={name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2}
                      dot={{ fill: LINE_COLORS[i % LINE_COLORS.length], r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.tx3, fontSize: 12 }}>
            Aucun résultat de test lié à ce macrocycle.
          </div>
        )}
      </div>

      {/* Cascade modal */}
      {cascadeModal && (
        <CascadeModal
          count={cascadeModal.later.length}
          onCascade={() => doSaveDates(cascadeModal.newStart, cascadeModal.newEnd, true)}
          onSingle={() => {
            const clampedEnd = cascadeModal.later.length > 0
              ? format(addDays(parseISO(cascadeModal.later[0].start_date), -1), "yyyy-MM-dd")
              : cascadeModal.newEnd;
            if (clampedEnd < cascadeModal.newEnd) toast.info("Fin ajustée pour ne pas chevaucher le macrocycle suivant");
            doSaveDates(cascadeModal.newStart, clampedEnd, false);
          }}
          onCancel={() => setCascadeModal(null)}
        />
      )}
    </>
  );
}
