import { useState } from "react";
import { X, Moon, Sunrise, CheckCircle2, Zap, ChevronDown, ChevronUp, Footprints } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import type { WellnessDay, WorkoutDetail, EnergySessionDetail, FreeActivityDetail } from "@/features/shared/types/retours.types";

const FREE_COLOR = "#0D9488";

interface DayDetailPanelProps {
  date: string;           // "yyyy-MM-dd"
  wellness: WellnessDay | null;
  workouts?: WorkoutDetail[];
  energySessions?: EnergySessionDetail[];
  freeActivities?: FreeActivityDetail[];
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHour(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}h${m === 0 ? "00" : String(m).padStart(2, "0")}`;
}

function decimalHour(h: number, m: number): number {
  return h + m / 60;
}

/** Simulate bedtime/wakeup from sommeil score 0-10 when no real data */
function simulateSleep(sommeil: number): { bedH: number; bedM: number; upH: number; upM: number } {
  const bedDec = 22 + (5 - sommeil) * 0.7;  // 22h–24.8h (sommeil 1-5)
  const upDec  = 6.5 + (5 - sommeil) * 0.3; // 6.5h–7.7h
  const toHM = (dec: number) => {
    const norm = dec >= 24 ? dec - 24 : dec;
    return { h: Math.floor(norm), m: Math.round((norm - Math.floor(norm)) * 60) };
  };
  const bed = toHM(bedDec);
  const up  = toHM(upDec);
  return { bedH: bed.h, bedM: bed.m, upH: up.h, upM: up.m };
}

function scoreColor(v: number, max = 10): string {
  const pct = v / max;
  if (pct >= 0.7) return C.g;
  if (pct >= 0.5) return C.o;
  return C.r;
}

// ── Component bars ────────────────────────────────────────────────────────────

function ComponentBar({ label, value, max = 5, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.tx3 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {value}<span style={{ fontSize: 9, color: C.tx3 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.s2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: color, transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}

// ── Sleep tunnel visualization ────────────────────────────────────────────────

function SleepTunnel({ wellness }: { wellness: WellnessDay }) {
  const hasReal = !!(wellness.coucher && wellness.reveil);

  let bedH: number, bedM: number, upH: number, upM: number;
  if (hasReal) {
    bedH = wellness.coucher!.h; bedM = wellness.coucher!.m;
    upH  = wellness.reveil!.h;  upM  = wellness.reveil!.m;
  } else {
    const sim = simulateSleep(wellness.sommeil);
    bedH = sim.bedH; bedM = sim.bedM; upH = sim.upH; upM = sim.upM;
  }

  const bedDec = decimalHour(bedH, bedM);
  const upDec  = decimalHour(upH,  upM);

  // Sleep duration — prefer exact minute arithmetic when real times are available
  let durH: number, durM: number;
  if (hasReal) {
    const bedMin  = bedH * 60 + bedM;
    const upMin   = upH * 60 + upM;
    const totalMin = upMin <= bedMin ? upMin + 1440 - bedMin : upMin - bedMin;
    durH = Math.floor(totalMin / 60);
    durM = totalMin % 60;
  } else if (wellness.sleepDur != null) {
    durH = Math.floor(wellness.sleepDur);
    durM = Math.round((wellness.sleepDur - durH) * 60);
  } else {
    const upAdjusted = upDec < bedDec ? upDec + 24 : upDec;
    const durDec = upAdjusted - bedDec;
    durH = Math.floor(durDec);
    durM = Math.round((durDec - durH) * 60);
  }

  // Tunnel bar: 20h to 10h(+1) = 14h span
  const RANGE_START = 20;
  const RANGE_END   = 34; // 10h next day
  const RANGE       = RANGE_END - RANGE_START;
  const bedAdj  = bedDec < 12 ? bedDec + 24 : bedDec;  // if ~00h, push to 24h+
  const upAdjusted = upDec  < 12 ? upDec + 24  : upDec;

  const sleepStart = Math.max(RANGE_START, bedAdj);
  const sleepEnd   = Math.min(RANGE_END,   upAdjusted);
  const leftPct    = ((sleepStart - RANGE_START) / RANGE) * 100;
  const widthPct   = Math.max(0, ((sleepEnd - sleepStart) / RANGE) * 100);

  return (
    <div>
      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Moon size={11} color={C.b} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{fmtHour(bedH, bedM)}</span>
          <span style={{ fontSize: 10, color: C.tx3 }}>coucher</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Sunrise size={11} color={C.y} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{fmtHour(upH, upM)}</span>
          <span style={{ fontSize: 10, color: C.tx3 }}>lever</span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.b }}>
          {durH}h{durM > 0 ? String(durM).padStart(2, "0") : "00"}
          <span style={{ fontSize: 9, color: C.tx3, fontWeight: 400, marginLeft: 2 }}>de sommeil</span>
        </div>
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 20, borderRadius: 4, background: C.s1, overflow: "hidden" }}>
        <div style={{
          position: "absolute",
          left: `${leftPct}%`, width: `${widthPct}%`,
          height: "100%", borderRadius: 4,
          background: `linear-gradient(90deg, ${C.b}, ${C.ac})`,
          opacity: 0.85,
        }} />
      </div>

      {/* Ticks */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {["20h", "22h", "00h", "02h", "04h", "06h", "08h", "10h"].map((t) => (
          <span key={t} style={{ fontSize: 8, color: C.tx3 }}>{t}</span>
        ))}
      </div>

      {!hasReal && (
        <div style={{ marginTop: 6, fontSize: 9, color: C.tx3, fontStyle: "italic" }}>
          * Horaires estimés — athlète n'a pas renseigné les heures exactes
        </div>
      )}
    </div>
  );
}

// ── DOMS ──────────────────────────────────────────────────────────────────────

function DomsDisplay({ wellness }: { wellness: WellnessDay }) {
  const zones = wellness.domsZones;
  if (!zones?.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
        Courbatures
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {zones.map((zone) => (
          <span key={zone} style={{
            padding: "3px 9px", borderRadius: 6, fontSize: 10,
            background: C.oS, border: "1px solid " + C.o + "40", color: C.o,
          }}>
            {zone}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Workout section ───────────────────────────────────────────────────────────

function fmtDuration(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, "0") : ""}`;
}

function WorkoutCard({ w }: { w: WorkoutDetail }) {
  const dur = fmtDuration(w.duration_s);

  const exIds = [...new Set([
    ...w.planned_exercises.map((p) => p.exercise_id),
    ...w.performed_exercises.map((p) => p.exercise_id),
  ])];

  return (
    <div style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: exIds.length > 0 ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <CheckCircle2 size={13} color={w.status === "completed" ? C.g : C.tx3} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{w.session_name}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {dur && <span style={{ fontSize: 10, color: C.tx3 }}>{dur}</span>}
          {w.rpe_score != null && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: C.ac + "20", color: C.ac }}>
              RPE {w.rpe_score}
            </span>
          )}
        </div>
      </div>

      {/* Exercises: planned target + actual sets merged */}
      {exIds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {exIds.map((exId) => {
            const planned   = w.planned_exercises.find((p) => p.exercise_id === exId);
            const performed = w.performed_exercises.find((p) => p.exercise_id === exId);
            const name      = planned?.exercise_name ?? performed?.exercise_name ?? "Exercice";
            const plannedMinReps = planned?.reps_range ? parseInt(planned.reps_range.match(/^(\d+)/)?.[1] ?? "0") || undefined : undefined;
            return (
              <div key={exId}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.tx2 }}>{name}</span>
                  {planned?.method && (
                    <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 3, background: "rgba(123,111,255,0.12)", color: "#FFC933", fontWeight: 600 }}>
                      {planned.method}
                    </span>
                  )}
                </div>
                {/* Planned — chips */}
                {planned && planned.sets > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                    {[
                      { l: "Séries", v: String(planned.sets) },
                      { l: "Reps", v: planned.reps_range ?? "—" },
                      ...(planned.kg != null ? [{ l: "Charge", v: `${planned.kg}kg` }] : []),
                      ...(planned.rir != null ? [{ l: "RIR", v: String(planned.rir) }] : []),
                    ].map(({ l, v }) => (
                      <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 6px", borderRadius: 5, background: C.s1, border: "1px solid " + C.brdL }}>
                        <span style={{ fontSize: 7, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{l}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.tx }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Actual sets — colored rows */}
                {performed ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {performed.sets.map((s, i) => {
                      if (!s.done) {
                        const hasData = s.kg != null || s.reps != null;
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "3px 6px", borderRadius: 5,
                            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.40)",
                          }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, minWidth: 18 }}>S{i + 1}</span>
                            {hasData ? (
                              <>
                                {s.kg != null && <span style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{s.kg}kg</span>}
                                {s.reps != null && <span style={{ fontSize: 10, color: C.tx }}>× {s.reps}</span>}
                                {s.rir != null && <span style={{ fontSize: 9, color: C.tx3 }}>RIR {s.rir}</span>}
                                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#ef4444" }}>✗</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 9, color: "#ef4444" }}>Non réalisé</span>
                            )}
                          </div>
                        );
                      }
                      const ok = plannedMinReps === undefined || (s.reps != null && s.reps >= plannedMinReps);
                      const sc = ok ? "#22c55e" : "#f59e0b";
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "3px 6px", borderRadius: 5,
                          background: ok ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)",
                          border: "1px solid " + sc + "40",
                        }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, minWidth: 18 }}>S{i + 1}</span>
                          {s.kg != null && <span style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{s.kg}kg</span>}
                          {s.reps != null && <span style={{ fontSize: 10, color: C.tx }}>× {s.reps}</span>}
                          {s.rir != null && <span style={{ fontSize: 9, color: C.tx3 }}>RIR {s.rir}</span>}
                          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: sc }}>{ok ? "✓" : "~"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: "5px 8px", borderRadius: 5,
                    background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.40)",
                    fontSize: 9, color: "#ef4444", fontWeight: 600,
                  }}>
                    Aucune série enregistrée
                  </div>
                )}
                {/* Athlete comment per exercise */}
                {w.athlete_exercise_comments?.[exId] && (
                  <div style={{ marginTop: 3, padding: "3px 6px", borderRadius: 4, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", fontSize: 9, color: C.tx2, fontStyle: "italic" }}>
                    {w.athlete_exercise_comments[exId]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Athlete session comment + forme */}
      {(w.athlete_forme != null || w.athlete_session_comment) && (
        <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(245,158,11,0.08)" }}>
          {w.athlete_forme != null && (
            <div style={{ fontSize: 10, marginBottom: w.athlete_session_comment ? 3 : 0 }}>
              <span style={{ color: C.tx3 }}>Forme : </span>
              <span style={{ fontWeight: 700, color: w.athlete_forme >= 4 ? C.g : w.athlete_forme >= 3 ? "#f59e0b" : C.r }}>
                {w.athlete_forme}/5
              </span>
            </div>
          )}
          {w.athlete_session_comment && (
            <div style={{ fontSize: 10, color: C.tx2, fontStyle: "italic" }}>« {w.athlete_session_comment} »</div>
          )}
        </div>
      )}

      {/* Note */}
      {w.notes && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.tx3, fontStyle: "italic" }}>"{w.notes}"</div>
      )}
    </div>
  );
}

function EnergyCard({ e }: { e: EnergySessionDetail }) {
  const [open, setOpen] = useState(false);
  const dur      = e.duration_min != null ? `${e.duration_min}min` : null;
  const dist     = e.distance_m != null
    ? e.distance_m >= 1000 ? `${(e.distance_m / 1000).toFixed(1)}km` : `${e.distance_m}m`
    : null;
  const col      = e.partial ? "#33B5FF" : e.completed ? C.g : C.o;
  const blEntries  = e.block_logs ? Object.entries(e.block_logs) : [];
  const doneCount  = blEntries.filter(([, b]) => b.done).length;
  const totalCount = blEntries.length;
  const hasDetail  = blEntries.length > 0 || !!e.note || e.rpe_score != null;

  return (
    <div style={{ background: C.s2, borderRadius: 4, marginBottom: 8, borderLeft: `3px solid ${col}`, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: hasDetail ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Zap size={13} color={col} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.session_label}
          </span>
          {e.session_kind && (
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, background: col + "20", color: col, fontWeight: 700, flexShrink: 0 }}>
              {e.session_kind}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {dur  && <span style={{ fontSize: 10, color: C.tx3 }}>{dur}</span>}
          {dist && <span style={{ fontSize: 10, color: C.tx3 }}>{dist}</span>}
          {e.rpe_score != null && <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3 }}>RPE {e.rpe_score}</span>}
          <span style={{ fontSize: 9, fontWeight: 700, color: col }}>
            {e.partial ? `Partielle ${doneCount}/${totalCount}` : e.completed ? "✓" : "Planifiée"}
          </span>
          {hasDetail && (open ? <ChevronUp size={12} color={C.tx3} /> : <ChevronDown size={12} color={C.tx3} />)}
        </div>
      </div>

      {/* Expanded: blocks */}
      {open && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {blEntries.map(([key, b], i) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: b.done ? C.g : "transparent",
                border: "1px solid " + (b.done ? C.g : C.brd),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#fff",
              }}>
                {b.done ? "✓" : ""}
              </span>
              <span style={{ color: b.done ? C.tx : C.tx3 }}>Bloc {i + 1}</span>
              {b.note && <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>{b.note}</span>}
            </div>
          ))}
          {e.note && (
            <div style={{ marginTop: 4, fontSize: 11, color: C.tx3, fontStyle: "italic" }}>"{e.note}"</div>
          )}
        </div>
      )}
    </div>
  );
}

function FreeActivityCard({ f }: { f: FreeActivityDetail }) {
  const [open, setOpen] = useState(false);
  const hasDetail = f.intensity != null || !!f.note;

  return (
    <div style={{ background: FREE_COLOR + "15", borderRadius: 4, marginBottom: 8, borderLeft: `3px solid ${FREE_COLOR}`, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: hasDetail ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{f.sportEmoji ?? "course"}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
              {f.name}
            </span>
            <span style={{ fontSize: 9, color: FREE_COLOR, fontWeight: 600 }}>{f.sport ?? "Activité libre"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {f.duration != null && <span style={{ fontSize: 10, color: C.tx3 }}>{f.duration} min</span>}
          {f.intensity != null && <span style={{ fontSize: 10, fontWeight: 700, color: FREE_COLOR }}>RPE {f.intensity}/10</span>}
          {hasDetail && (open ? <ChevronUp size={12} color={C.tx3} /> : <ChevronDown size={12} color={C.tx3} />)}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ borderTop: "1px solid " + FREE_COLOR + "30", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {f.intensity != null && (
            <div style={{ fontSize: 11, color: FREE_COLOR, fontWeight: 600 }}>
              RPE {f.intensity}/10
            </div>
          )}
          {f.note && (
            <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>"{f.note}"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DayDetailPanel({ date, wellness, workouts = [], energySessions = [], freeActivities = [], onClose }: DayDetailPanelProps) {
  const dateLabel = format(parseISO(date), "EEEE d MMMM", { locale: fr });
  const titleCase = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const scoreCol  = wellness ? scoreColor(wellness.score, 100) : C.tx3;

  const completedWorkouts = workouts.filter((w) => w.status === "completed");

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx }}>{titleCase}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {[
                wellness ? "Forme" : null,
                completedWorkouts.length > 0 ? `${completedWorkouts.length} séance${completedWorkouts.length > 1 ? "s" : ""}` : null,
                energySessions.length > 0 ? `${energySessions.length} énergie` : null,
                freeActivities.length > 0 ? `${freeActivities.length} activité${freeActivities.length > 1 ? "s" : ""} libre${freeActivities.length > 1 ? "s" : ""}` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Wellness section */}
        {wellness && (
          <>
            {/* Score circle + summary */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                border: `3px solid ${scoreCol}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: scoreCol + "15", flexShrink: 0,
              }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: scoreCol, lineHeight: 1 }}>{wellness.score}</span>
                <span style={{ fontSize: 9, color: C.tx3 }}>/100</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
                  {wellness.score >= 70 ? "Bonne forme" : wellness.score >= 50 ? "Forme correcte" : "Fatigue élevée"}
                </div>
                <div style={{ fontSize: 11, color: C.tx3 }}>
                  Fatigue {wellness.fatigue}/5 · Énergie {wellness.energie}/5
                </div>
              </div>
            </div>

            {/* Component bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
              <ComponentBar label="Fatigue" value={wellness.fatigue} color={C.o} />
              <ComponentBar label="Sommeil" value={wellness.sommeil} color={C.b} />
              <ComponentBar label="Stress"  value={wellness.stress}  color={C.r} />
              <ComponentBar label="Énergie" value={wellness.energie} color={C.g} />
            </div>

            {/* DOMS */}
            <DomsDisplay wellness={wellness} />

            {/* Sleep tunnel */}
            <div style={{ marginTop: 20, background: C.s2, borderRadius: 4, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                Tunnel de sommeil
              </div>
              <SleepTunnel wellness={wellness} />
            </div>
          </>
        )}

        {/* Workouts section */}
        {(completedWorkouts.length > 0 || energySessions.length > 0 || freeActivities.length > 0) && (
          <div style={{ marginTop: wellness ? 20 : 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
              Séances réalisées
            </div>
            {completedWorkouts.map((w) => <WorkoutCard key={w.id} w={w} />)}
            {energySessions.map((e) => <EnergyCard key={e.id} e={e} />)}
            {freeActivities.map((f) => <FreeActivityCard key={f.id} f={f} />)}
          </div>
        )}

      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
  zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: C.s1, borderRadius: "6px 6px 0 0",
  width: "100%", maxWidth: 520,
  maxHeight: "80vh", overflowY: "auto",
  padding: "20px 20px 40px",
};

const closeBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2,
  color: C.tx3, cursor: "pointer", fontFamily: "inherit",
};
