import { useState } from "react";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, Minus, Edit3 } from "lucide-react";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Microcycle } from "../hooks/useTimelineData";
import { useMicrocycleDays } from "../hooks/useTimelineData";

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({
  day,
  workouts,
}: {
  day: Date;
  workouts: Array<{ id: string; session_name: string; status: string; rpe: number | null }>;
}) {
  const today   = format(new Date(), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
  const done    = workouts.filter((w) => w.status === "completed");
  const missed  = workouts.filter((w) => w.status === "missed");
  const planned = workouts.filter((w) => w.status === "planned");
  const avgRpe  = done.filter((w) => w.rpe != null).reduce((s, w, _, a) => s + w.rpe! / a.length, 0) || null;

  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid " + (today ? C.ac + "40" : C.brd),
        background: today ? C.acS : C.s2,
        padding: "7px 7px 8px",
        display: "flex", flexDirection: "column", gap: 4,
        minHeight: 72,
      }}
    >
      {/* Day header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, color: today ? C.ac : C.tx3, textTransform: "uppercase" }}>
            {format(day, "EEE", { locale: fr })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: today ? C.ac : C.tx, lineHeight: 1 }}>
            {format(day, "d")}
          </div>
        </div>
        {workouts.length > 0 && (
          <div style={{ fontSize: 8, color: done.length > 0 ? C.g : missed.length > 0 ? C.r : C.tx3, fontWeight: 700 }}>
            {done.length > 0 ? "✓" : missed.length > 0 ? "✕" : "—"}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        {done.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            <Check size={9} color={C.g} />
            {avgRpe != null && (
              <span style={{ fontSize: 8, fontWeight: 700, background: C.acS, color: C.ac, borderRadius: 4, padding: "1px 5px" }}>
                RPE {Math.round(avgRpe)}
              </span>
            )}
          </div>
        )}
        {planned.length > 0 && done.length === 0 && (
          <div style={{ fontSize: 8, color: C.tx3 }}>
            {planned.length} planif.
          </div>
        )}
        {missed.length > 0 && (
          <div style={{ fontSize: 8, color: C.r }}>✕ manquée</div>
        )}
        {workouts.length === 0 && (
          <Minus size={9} color={C.tx3} style={{ opacity: 0.4 }} />
        )}
      </div>
    </div>
  );
}

// ── Week grid ─────────────────────────────────────────────────────────────────

function WeekGrid({
  label,
  startDate,
  endDate,
  isDeload,
  athleteId,
}: {
  label:     string;
  startDate: string;
  endDate:   string;
  isDeload?: boolean;
  athleteId: string;
}) {
  const { data: byDate = {} } = useMicrocycleDays(athleteId, startDate, endDate);
  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });

  const allWorkouts = Object.values(byDate).flat();
  const completed   = allWorkouts.filter((w) => w.status === "completed").length;
  const missed      = allWorkouts.filter((w) => w.status === "missed").length;
  const total       = allWorkouts.length;
  const rpes        = allWorkouts.filter((w) => w.rpe != null).map((w) => w.rpe!);
  const avgRpe      = rpes.length > 0 ? rpes.reduce((s, v) => s + v, 0) / rpes.length : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: isDeload ? C.b : C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {label}{isDeload ? " · Deload" : ""}
        </div>
        {total > 0 && (
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 9, color: C.g, fontWeight: 600 }}>{completed}/{total} ✓</span>
            {missed > 0 && <span style={{ fontSize: 9, color: C.r, fontWeight: 600 }}>{missed} ✕</span>}
            {avgRpe != null && (
              <span style={{ fontSize: 9, background: C.acS, color: C.ac, borderRadius: 4, padding: "0 5px", fontWeight: 700 }}>
                RPE ~{avgRpe.toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((day) => (
          <DayCard
            key={format(day, "yyyy-MM-dd")}
            day={day}
            workouts={byDate[format(day, "yyyy-MM-dd")] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  micro:      Microcycle;
  prevMicro?: Microcycle;
  athleteId:  string;
}

export function MicrocycleDrawer({ micro, prevMicro, athleteId }: Props) {
  const qc = useQueryClient();
  const [showPrev,     setShowPrev]     = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [startDate,    setStartDate]    = useState(micro.start_date);
  const [endDate,      setEndDate]      = useState(micro.end_date);
  const [isDeload,     setIsDeload]     = useState(micro.is_deload);
  const [savingDates,  setSavingDates]  = useState(false);

  async function saveDates() {
    if (!startDate || !endDate || startDate > endDate) { toast.error("Dates invalides"); return; }
    setSavingDates(true);
    const { error } = await supabase
      .from("microcycles")
      .update({ start_date: startDate, end_date: endDate, is_deload: isDeload })
      .eq("id", micro.id);
    setSavingDates(false);
    if (error) { toast.error("Erreur"); return; }
    qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
    qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
    setEditingDates(false);
    toast.success("Microcycle mis à jour");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Dates + deload */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.tx3 }}>
              {format(parseISO(startDate), "d MMM", { locale: fr })} → {format(parseISO(endDate), "d MMM", { locale: fr })}
            </span>
            {isDeload && (
              <span style={{ fontSize: 10, fontWeight: 700, background: C.bS, color: C.b, borderRadius: 6, padding: "2px 8px" }}>DELOAD</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {prevMicro && (
              <button onClick={() => setShowPrev((p) => !p)} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: showPrev ? C.s2 : "transparent", color: C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {showPrev ? "Masquer S-1" : "Voir S-1"}
              </button>
            )}
            <button
              onClick={() => editingDates ? saveDates() : setEditingDates((p) => !p)}
              disabled={savingDates}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid " + (editingDates ? C.g + "60" : C.brdL), background: editingDates ? C.gS : "transparent", color: editingDates ? C.g : C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {editingDates ? <><Check size={11} />{savingDates ? "…" : "OK"}</> : <><Edit3 size={11} />Modifier</>}
            </button>
          </div>
        </div>
        {editingDates && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ label: "Début", val: startDate, set: setStartDate }, { label: "Fin", val: endDate, set: setEndDate }].map(({ label, val, set }) => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: C.tx3, marginBottom: 4 }}>{label}</div>
                  <input type="date" value={val} onChange={(e) => set(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 4, border: "1px solid " + C.tx3 + "60", background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: C.tx3 }}>
              <input type="checkbox" checked={isDeload} onChange={(e) => setIsDeload(e.target.checked)} style={{ accentColor: C.b, width: 14, height: 14 }} />
              Semaine de deload
            </label>
          </div>
        )}
      </div>

      {/* S-1 week */}
      {showPrev && prevMicro && (
        <WeekGrid
          label={`S${prevMicro.week_number} · ${format(parseISO(prevMicro.start_date), "d MMM", { locale: fr })}`}
          startDate={prevMicro.start_date}
          endDate={prevMicro.end_date}
          isDeload={prevMicro.is_deload}
          athleteId={athleteId}
        />
      )}

      {/* Current week */}
      <WeekGrid
        label={`S${micro.week_number} · ${format(parseISO(micro.start_date), "d MMM", { locale: fr })}`}
        startDate={micro.start_date}
        endDate={micro.end_date}
        isDeload={micro.is_deload}
        athleteId={athleteId}
      />
    </div>
  );
}
