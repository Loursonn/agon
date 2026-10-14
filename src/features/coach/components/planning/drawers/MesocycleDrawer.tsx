import { useState } from "react";
import { Edit3, Check } from "lucide-react";
import { format, parseISO, differenceInWeeks, addWeeks, addDays, startOfISOWeek, endOfISOWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Macrocycle, Mesocycle } from "../hooks/useTimelineData";
import { snapMonday, snapSunday, computeCascade, chainNextStart, endFromWeeks } from "../utils/planningHelpers";
import { DateQuickAdjust } from "../DateQuickAdjust";

// ── Rechain cycles within a meso after its dates change ───────────────────────

async function rechainCyclesInMeso(mesoId: string, newStart: string, newEnd: string) {
  const { data: cycles } = await supabase
    .from("cycles")
    .select("id, start_date, end_date")
    .eq("mesocycle_id", mesoId)
    .order("start_date");

  if (!cycles?.length) return;

  let cursor = snapMonday(newStart);

  for (const c of cycles) {
    if (cursor > newEnd) {
      // Cycle falls entirely outside new meso bounds — skip (don't delete, let coach handle)
      break;
    }
    const weeks = Math.max(1, differenceInWeeks(parseISO(c.end_date), parseISO(c.start_date)) + 1);
    let end = endFromWeeks(cursor, weeks);
    // Clamp to meso end
    if (end > newEnd) end = format(endOfISOWeek(parseISO(newEnd)), "yyyy-MM-dd");

    await supabase.from("cycles").update({ start_date: cursor, end_date: end }).eq("id", c.id);

    // Regenerate microcycles for this cycle
    await supabase.from("microcycles").delete().eq("cycle_id", c.id);
    const microRows: Array<{ cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }> = [];
    let wMon = startOfISOWeek(parseISO(cursor));
    const ed  = parseISO(end);
    let week  = 1;
    while (wMon <= ed) {
      microRows.push({
        cycle_id: c.id, week_number: week,
        start_date: format(wMon, "yyyy-MM-dd"),
        end_date:   format(endOfISOWeek(wMon), "yyyy-MM-dd"),
        is_deload: false,
      });
      wMon = addWeeks(wMon, 1);
      week++;
    }
    if (microRows.length > 0) await supabase.from("microcycles").insert(microRows);

    cursor = chainNextStart(end);
  }
}

// ── Volume chart helpers ───────────────────────────────────────────────────────

function buildVolumeData(meso: Mesocycle) {
  const numWeeks = Math.max(
    1,
    differenceInWeeks(parseISO(meso.end_date), parseISO(meso.start_date)) + 1,
  );
  const deload = meso.deload_week ?? 0;

  if (meso.volume_config?.weeks?.length) {
    return meso.volume_config.weeks.map((v, i) => ({
      week: `S${i + 1}`, volume: v, isDeload: i + 1 === deload,
    }));
  }

  const type = meso.volume_config?.type ?? "progressive";
  const base  = 65;
  return Array.from({ length: numWeeks }, (_, i) => {
    const w = i + 1;
    const isDeload = w === deload;
    let volume = base;
    if (type === "progressive")     volume = isDeload ? 50 : base + i * (30 / Math.max(numWeeks - 1, 1));
    else if (type === "ondulant")    volume = isDeload ? 50 : base + (i % 2 === 0 ? 0 : 15);
    else if (type === "constant")    volume = isDeload ? 50 : base;
    else if (type === "polarize")    volume = isDeload ? 50 : i % 2 === 0 ? 45 : 90;
    return { week: `S${w}`, volume: Math.round(volume), isDeload };
  });
}

// ── Cascade confirm modal ─────────────────────────────────────────────────────

function CascadeModal({
  count, level, onCascade, onSingle, onCancel,
}: {
  count: number;
  level: string;
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
          Modifier ce mésocycle va décaler <strong style={{ color: C.coach }}>{count} {level}{count > 1 ? "s" : ""}</strong> suivant{count > 1 ? "s" : ""}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onCascade} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Bouger tout le planning
          </button>
          <button onClick={onSingle} style={{ width: "100%", padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Uniquement ce mésocycle (fin ajustée)
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
  meso:       Mesocycle;
  siblings:   Mesocycle[];  // other mesos in same macrocycle, sorted by start_date
  allMacros:  Macrocycle[];
  athleteId:  string;
  rangeStart: string;
  rangeEnd:   string;
}

const VOLUME_TYPES = [
  { value: "progressive", label: "Progressif" },
  { value: "ondulant",    label: "Ondulant"   },
  { value: "plateau",     label: "Plateau"    },
  { value: "polarize",    label: "Polarisé"   },
];
const ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

export function MesocycleDrawer({ meso, siblings, allMacros, athleteId, rangeStart, rangeEnd }: Props) {
  void rangeStart; void rangeEnd;
  const qc = useQueryClient();

  const [volumeType,    setVolumeType]    = useState(meso.volume_config?.type ?? "progressive");
  const [zones,         setZones]         = useState<string[]>(meso.intensity_config?.zones ?? []);
  const [frequency,     setFrequency]     = useState(meso.frequency ?? 3);
  const [deloadWeek,    setDeloadWeek]    = useState(meso.deload_week ?? 4);
  const [saving,        setSaving]        = useState(false);
  const [editingDates,  setEditingDates]  = useState(false);
  const [startDate,     setStartDate]     = useState(meso.start_date);
  const [endDate,       setEndDate]       = useState(meso.end_date);
  const [savingDates,   setSavingDates]   = useState(false);
  const [parentId,      setParentId]      = useState(meso.macrocycle_id);
  const [editingParent, setEditingParent] = useState(false);
  const [savingParent,  setSavingParent]  = useState(false);

  const [cascadeModal, setCascadeModal] = useState<{
    newStart: string; newEnd: string;
    later: Mesocycle[];
  } | null>(null);

  const numWeeks = Math.max(1, differenceInWeeks(parseISO(meso.end_date), parseISO(meso.start_date)) + 1);

  const chartData = buildVolumeData({
    ...meso,
    volume_config: { type: volumeType },
    deload_week:   deloadWeek,
  });

  // ── date snap ───────────────────────────────────────────────────────────────

  function handleStartChange(raw: string) {
    if (!raw) return;
    setStartDate(snapMonday(raw));
  }
  function handleEndChange(raw: string) {
    if (!raw) return;
    setEndDate(snapSunday(raw));
  }

  // ── save dates ───────────────────────────────────────────────────────────────

  async function doSaveDates(newStart: string, newEnd: string, cascade: boolean) {
    setSavingDates(true);
    const { error } = await supabase
      .from("mesocycles").update({ start_date: newStart, end_date: newEnd }).eq("id", meso.id);
    if (error) { toast.error("Erreur"); setSavingDates(false); return; }

    // Re-chain cycles inside this meso
    await rechainCyclesInMeso(meso.id, newStart, newEnd);

    if (cascade && cascadeModal) {
      const updates = computeCascade(newEnd, cascadeModal.later);
      for (const u of updates) {
        await supabase.from("mesocycles")
          .update({ start_date: u.start_date, end_date: u.end_date }).eq("id", u.id);
        // Re-chain cycles inside each cascaded meso too
        await rechainCyclesInMeso(u.id, u.start_date, u.end_date);
      }
    }

    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    setSavingDates(false);
    setCascadeModal(null);
    setEditingDates(false);
    toast.success(cascade ? "Dates mises à jour · planning décalé · cycles ajustés" : "Dates mises à jour · cycles ajustés");
  }

  async function saveParent() {
    if (parentId === meso.macrocycle_id) { setEditingParent(false); return; }
    setSavingParent(true);
    const { error } = await supabase.from("mesocycles").update({ macrocycle_id: parentId }).eq("id", meso.id);
    setSavingParent(false);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    toast.success("Macrocycle parent modifié");
    setEditingParent(false);
  }

  function handleSaveDates() {
    if (!startDate || !endDate || startDate >= endDate) { toast.error("Dates invalides"); return; }
    let snStart = snapMonday(startDate);
    const snEnd = snapSunday(endDate);

    // Anti-overlap: clamp start to after previous sibling's end
    const sortedSibs = siblings
      .filter((m) => m.id !== meso.id)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const prev = sortedSibs.filter((m) => m.start_date < meso.start_date).at(-1);
    if (prev) {
      const minStart = chainNextStart(prev.end_date);
      if (snStart < minStart) {
        snStart = minStart;
        toast.info("Début ajusté pour éviter le chevauchement avec le mésocycle précédent");
      }
    }
    if (snStart >= snEnd) { toast.error("Dates invalides après ajustement"); return; }

    setStartDate(snStart);
    setEndDate(snEnd);

    const later = siblings
      .filter((m) => m.id !== meso.id && m.start_date > meso.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    if (later.length > 0) {
      setCascadeModal({ newStart: snStart, newEnd: snEnd, later });
    } else {
      doSaveDates(snStart, snEnd, false);
    }
  }

  // ── save config ──────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("mesocycles")
      .update({
        volume_config:    { type: volumeType },
        intensity_config: { zones },
        frequency,
        deload_week: deloadWeek,
      })
      .eq("id", meso.id);
    setSaving(false);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    toast.success("Mésocycle mis à jour");
  }

  const numWeeksLocal = Math.max(1, differenceInWeeks(parseISO(endDate), parseISO(startDate)) + 1);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

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
                      style={{ width: "100%", padding: "7px 9px", borderRadius: 4, border: "1px solid " + C.coach + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const prev = siblings.filter((s) => s.start_date < meso.start_date).at(-1);
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
                { label: "Durée", val: `${numWeeksLocal} sem.` },
              ].map(({ label, val }) => (
                <div key={label} style={{ flex: 1, background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: C.tx3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parent macrocycle */}
        {allMacros.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Macrocycle parent</span>
              {editingParent ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setParentId(meso.macrocycle_id); setEditingParent(false); }} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
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
                style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.coach + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit" }}
              >
                {allMacros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({format(parseISO(m.start_date), "d MMM yyyy", { locale: fr })} → {format(parseISO(m.end_date), "d MMM yyyy", { locale: fr })})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ background: C.s2, borderRadius: 4, padding: "8px 10px", fontSize: 12, color: C.tx }}>
                {allMacros.find((m) => m.id === parentId)?.name ?? "—"}
              </div>
            )}
          </div>
        )}

        {/* Volume type */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Volume</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {VOLUME_TYPES.map(({ value, label }) => (
              <button key={value} onClick={() => setVolumeType(value)} style={{ padding: "5px 11px", borderRadius: 4, border: "1px solid " + (volumeType === value ? C.coach + "60" : C.brdL), background: volumeType === value ? C.coachS : "transparent", color: volumeType === value ? C.coach : C.tx3, fontSize: 11, fontWeight: volumeType === value ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 120ms" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Volume preview chart */}
        <div style={{ height: 130 }}>
          <div style={{ fontSize: 9, color: C.tx3, marginBottom: 6 }}>Charge planifiée (%)</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 4, left: -24, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.brd} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 8, fill: C.tx3 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: C.tx3 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 6, fontSize: 10 }}
                labelStyle={{ color: C.tx3 }}
                itemStyle={{ color: C.coach }}
                formatter={(v: number) => [`${v}%`, "Volume"]}
              />
              <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isDeload ? C.b : C.coach} opacity={entry.isDeload ? 0.5 : 0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Intensity zones */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Zones d'intensité</div>
          <div style={{ display: "flex", gap: 5 }}>
            {ZONES.map((z) => {
              const active = zones.includes(z);
              return (
                <button key={z} onClick={() => setZones((p) => active ? p.filter((x) => x !== z) : [...p, z])} style={{ width: 40, height: 34, borderRadius: 4, border: "1px solid " + (active ? C.ac + "60" : C.brdL), background: active ? C.acS : "transparent", color: active ? C.ac : C.tx3, fontSize: 11, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 120ms" }}>
                  {z}
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
            Fréquence — {frequency} séances/sem
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} onClick={() => setFrequency(n)} style={{ width: 34, height: 34, borderRadius: 4, border: "1px solid " + (frequency === n ? C.ac + "60" : C.brdL), background: frequency === n ? C.acS : "transparent", color: frequency === n ? C.ac : C.tx3, fontSize: 12, fontWeight: frequency === n ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Deload */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Semaine deload</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Array.from({ length: numWeeks }, (_, i) => i + 1).map((w) => (
              <button key={w} onClick={() => setDeloadWeek(w === deloadWeek ? 0 : w)} style={{ width: 40, height: 34, borderRadius: 4, border: "1px solid " + (deloadWeek === w ? C.b + "60" : C.brdL), background: deloadWeek === w ? C.bS : "transparent", color: deloadWeek === w ? C.b : C.tx3, fontSize: 11, fontWeight: deloadWeek === w ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                S{w}
              </button>
            ))}
          </div>
        </div>

        {/* Save config */}
        <button
          onClick={save} disabled={saving}
          style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", background: saving ? C.s2 : C.coach, color: saving ? C.tx3 : "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
        >
          {saving ? "Enregistrement..." : "Enregistrer config"}
        </button>
      </div>

      {/* Cascade modal */}
      {cascadeModal && (
        <CascadeModal
          count={cascadeModal.later.length}
          level="mésocycle"
          onCascade={() => doSaveDates(cascadeModal.newStart, cascadeModal.newEnd, true)}
          onSingle={() => {
            const clampedEnd = cascadeModal.later.length > 0
              ? format(addDays(parseISO(cascadeModal.later[0].start_date), -1), "yyyy-MM-dd")
              : cascadeModal.newEnd;
            if (clampedEnd < cascadeModal.newEnd) toast.info("Fin ajustée pour ne pas chevaucher le mésocycle suivant");
            doSaveDates(cascadeModal.newStart, clampedEnd, false);
          }}
          onCancel={() => setCascadeModal(null)}
        />
      )}
    </>
  );
}
