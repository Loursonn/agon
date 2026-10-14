import { useState } from "react";
import { isToday, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Zap, Check, X, ChevronDown, ChevronUp, Hourglass } from "lucide-react";
import { C } from "@/lib/theme";
import { DayDetailPanel } from "./DayDetailPanel";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/SessionPreviewModal";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import type { WeeklyRetourData, WellnessDay, EnergyStepLog, FreeActivityDetail } from "@/features/shared/types/retours.types";

type DayWorkout = WeeklyRetourData["workouts"][number];
type DayEnergy  = WeeklyRetourData["energy_sessions"][number];
type DayTest    = WeeklyRetourData["test_sessions"][number];

const TEST_TYPE_COLOR: Record<string, string> = {
  musculation: "#FFC933", endurance: "#33B5FF", vitesse: "#EF4444",
  puissance: "#F59E0B", souplesse: "#10B981", autre: "#6B7280",
};

interface DayColumnProps {
  date:                   string;
  workouts:               DayWorkout[];
  energy:                 DayEnergy[];
  tests:                  DayTest[];
  wellness:               WellnessDay | null;
  previousWorkouts?:      DayWorkout[];
  rescheduledWorkoutIds?: Set<string>;
  rescheduledEnergyIds?:  Set<string>;
  freeActivities?:        FreeActivityDetail[];
}

// ── Status color helper ───────────────────────────────────────────────────────

function statusColors(status: string, rescheduled = false) {
  if (rescheduled)            return { bg: "#8B5CF612", border: "#8B5CF630", accent: "#8B5CF6", label: "Déplacée" };
  if (status === "completed") return { bg: C.g + "12", border: C.g + "40",  accent: C.g,       label: "✓ Faite" };
  if (status === "missed")    return { bg: C.r + "12", border: C.r + "40",  accent: C.r,       label: "Manquée" };
  if (status === "skipped")   return { bg: C.s2,       border: C.brd,       accent: C.tx3,     label: "Skippée" };
  return                             { bg: C.s2,       border: C.brd,       accent: C.tx3,     label: "Planifiée" };
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <Check size={10} color={C.g} />;
  if (status === "partial")   return <Check size={10} color={C.tx3} />;
  if (status === "planned" || status === "in-progress") return <Hourglass size={10} color={C.tx3} />;
  return <X size={10} color={C.tx3} />;
}

// ── Wellness mini-block ───────────────────────────────────────────────────────

function wellnessColor(score: number) {
  if (score >= 70) return C.g;
  if (score >= 50) return C.o;
  return C.r;
}

function WellnessBlock({ wellness, onClick }: { wellness: WellnessDay; onClick: () => void }) {
  const col = wellnessColor(wellness.score);
  return (
    <div onClick={onClick} style={{ cursor: "pointer", background: col + "12", border: "1px solid " + col + "40", borderRadius: 4, padding: "7px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: col, lineHeight: 1 }}>{wellness.score}</span>
        <span style={{ fontSize: 9, color: C.tx3 }}>/100</span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: C.tx3 }}>↗</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[
          { label: "repos", value: wellness.sommeil },
          { label: "sommeil", value: wellness.fatigue },
          { label: "stress", value: wellness.stress  },
          { label: "intensite", value: wellness.energie },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9 }}>{label}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: C.tx2 }}>{value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Workout row ───────────────────────────────────────────────────────────────

function WorkoutRow({ workout, prevWorkout, isRescheduled, onShowDetail }: { workout: DayWorkout; prevWorkout?: DayWorkout | null; isRescheduled?: boolean; onShowDetail: () => void }) {
  const [open, setOpen] = useState(false);
  const done = workout.status === "completed";
  const cols = statusColors(workout.status, isRescheduled);
  const perfCount = workout.performed_exercises.length;

  return (
    <div style={{ background: cols.bg, border: "1px solid " + cols.border, borderRadius: 7, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={done ? () => setOpen(v => !v) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 7px", cursor: done ? "pointer" : "default" }}
      >
        <span style={{ fontSize: 9, color: cols.accent, flexShrink: 0 }}>
          {workout.status === "completed" ? "✓" : workout.status === "missed" ? "✗" : "–"}
        </span>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: done ? C.tx : C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {workout.session_name}
        </span>
        {done && perfCount > 0 && (
          <span style={{ fontSize: 8, color: C.tx3, flexShrink: 0 }}>{perfCount} exo{perfCount > 1 ? "s" : ""}</span>
        )}
        {done && workout.rpe_score != null && (
          <span style={{ fontSize: 8, color: workout.rpe_score >= 8 ? "#EF4444" : workout.rpe_score >= 6 ? "#F59E0B" : C.tx3, flexShrink: 0, fontWeight: 700 }}>RPE {workout.rpe_score}</span>
        )}
        {!done && (
          <span style={{ fontSize: 8, color: cols.accent, flexShrink: 0 }}>{cols.label}</span>
        )}
        {done && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
      </div>

      {/* Expanded: summary + voir le détail */}
      {done && open && (() => {
        return (
          <div style={{ borderTop: "1px solid " + C.g + "30", padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4 }}>
            {workout.duration_s != null && (
              <div style={{ fontSize: 9, color: C.tx3 }}>{Math.round(workout.duration_s / 60)} min</div>
            )}
            {workout.notes && (
              <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>« {workout.notes} »</div>
            )}
            {/* Quick summary of performed exercises */}
            {workout.performed_exercises.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {workout.performed_exercises.slice(0, 4).map((ex) => {
                  const bestSet = ex.sets.reduce((best, s) => (s.kg ?? 0) > (best.kg ?? 0) ? s : best, ex.sets[0]);
                  return (
                    <div key={ex.exercise_id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
                      <span style={{ color: C.tx, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.exercise_name}</span>
                      <span style={{ color: C.tx2, flexShrink: 0 }}>
                        {bestSet.kg != null ? `${bestSet.kg}kg` : "—"} × {bestSet.reps ?? "—"}
                      </span>
                      <span style={{ color: C.tx3, flexShrink: 0 }}>{ex.sets.length}s</span>
                    </div>
                  );
                })}
                {workout.performed_exercises.length > 4 && (
                  <span style={{ fontSize: 8, color: C.tx3 }}>+{workout.performed_exercises.length - 4} autres</span>
                )}
              </div>
            )}
            {/* Comments indicators */}
            {workout.exercise_comments.length > 0 && (
              <div style={{ fontSize: 8, color: C.ac }}>{workout.exercise_comments.length} com. coach</div>
            )}
            {(workout.athlete_session_comment || Object.keys(workout.athlete_exercise_comments ?? {}).length > 0) && (
              <div style={{ fontSize: 8, color: "#f59e0b" }}>
                {[
                  workout.athlete_session_comment ? "séance" : "",
                  Object.keys(workout.athlete_exercise_comments ?? {}).length > 0
                    ? `${Object.keys(workout.athlete_exercise_comments ?? {}).length} exo`
                    : "",
                ].filter(Boolean).join(" + ")} (athlète)
              </div>
            )}
            {/* Voir le détail link */}
            <div
              onClick={(e) => { e.stopPropagation(); onShowDetail(); }}
              style={{ fontSize: 9, fontWeight: 700, color: C.ac, cursor: "pointer", textAlign: "center", padding: "4px 0", borderTop: "1px solid " + C.brd, marginTop: 2 }}
            >
              Voir le détail →
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Energy step row (compact) ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EnergyStepRow({ step, log, index }: { step: any; log: Record<string, EnergyStepLog> | null; index: number }) {
  const id    = step.id ?? String(index);
  const entry = log?.[id];

  if (step.type === "interval") {
    const rc  = ROLE_COLOR[step.role as string] ?? "#6B7280";
    const dur = step.duration?.kind === "time"     ? formatS(step.duration.value ?? 0)
              : step.duration?.kind === "distance" ? `${step.duration.value ?? 0} m`
              : "Lap";
    const tgt = step.target ? formatTarget(step.target) : null;

    return (
      <div style={{ padding: "3px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 2, height: 20, borderRadius: 1, background: rc, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: rc }}>{ROLE_LABEL_FR[step.role as string] ?? step.role}</span>
          <span style={{ fontSize: 9, color: C.tx }}>{dur}</span>
          {tgt && tgt !== "Libre" && <span style={{ fontSize: 8, color: C.tx3 }}>{tgt}</span>}
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {entry?.status === "done"    && <span style={{ fontSize: 8, fontWeight: 700, color: C.g }}>✓</span>}
            {entry?.status === "partial" && <span style={{ fontSize: 8, fontWeight: 700, color: "#F59E0B" }}>~</span>}
            {!entry && log !== null      && <span style={{ fontSize: 8, color: C.tx3 }}>—</span>}
          </div>
        </div>
        {entry?.status === "partial" && entry.comment && (
          <div style={{ fontSize: 8, color: "#F59E0B", fontStyle: "italic", marginTop: 2, paddingLeft: 8 }}>
            {entry.comment}
          </div>
        )}
      </div>
    );
  }

  // Group
  return (
    <div style={{ padding: "3px 4px", background: "rgba(59,141,240,0.06)", borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: C.b }}>× {step.repeat}</span>
        <span style={{ fontSize: 8, color: C.tx3 }}>{(step.children as unknown[])?.length ?? 0} étapes</span>
        <div style={{ marginLeft: "auto" }}>
          {entry?.status === "done"    && <span style={{ fontSize: 8, fontWeight: 700, color: C.g }}>✓</span>}
          {entry?.status === "partial" && <span style={{ fontSize: 8, fontWeight: 700, color: "#F59E0B" }}>~</span>}
        </div>
      </div>
      {entry?.status === "partial" && entry.comment && (
        <div style={{ fontSize: 8, color: "#F59E0B", fontStyle: "italic", marginTop: 2 }}>
          {entry.comment}
        </div>
      )}
    </div>
  );
}

// ── Energy row ────────────────────────────────────────────────────────────────

function EnergyRow({ session, isRescheduled }: { session: DayEnergy; isRescheduled?: boolean }) {
  const [open, setOpen] = useState(false);
  const done     = session.status === "completed";
  const cols     = statusColors(session.status, isRescheduled);
  const hasSteps = (session as { intervals?: unknown[] }).intervals?.length ?? 0 > 0;
  const hasDetail = done || session.note || session.duration_min != null;

  const kindColors: Record<string, string> = {
    vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
    footing: "#10B981", fartlek: "#EF4444", specifique: "#F5A623",
  };
  const kindColor = kindColors[session.session_kind ?? ""] ?? "#6B7280";

  return (
    <div style={{ background: cols.bg, border: "1px solid " + cols.border, borderRadius: 7, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={hasDetail ? () => setOpen(v => !v) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 7px", cursor: hasDetail ? "pointer" : "default" }}
      >
        <Zap size={9} color={done ? kindColor : cols.accent} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: done ? C.tx : C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.session_label}
        </span>
        {session.rpe_score != null && (
          <span style={{ fontSize: 8, color: session.rpe_score >= 8 ? "#EF4444" : session.rpe_score >= 6 ? "#F59E0B" : C.tx3, flexShrink: 0, fontWeight: 700 }}>
            RPE {session.rpe_score}
          </span>
        )}
        {session.session_kind && done && (
          <span style={{ fontSize: 8, color: kindColor, flexShrink: 0, fontWeight: 700 }}>
            {session.session_kind.toUpperCase()}
          </span>
        )}
        {!done && <span style={{ fontSize: 8, color: cols.accent, flexShrink: 0 }}>{cols.label}</span>}
        {hasDetail && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
      </div>

      {/* Expanded: step log */}
      {open && (
        <div style={{ borderTop: "1px solid " + (done ? C.g + "30" : C.brd), padding: "6px 7px", display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Duration: actual vs planned */}
          {(session.actual_duration_min != null || session.duration_min != null) && (
            <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>
              {session.actual_duration_min != null
                ? <>{session.actual_duration_min} min réalisées{session.duration_min != null && session.actual_duration_min !== session.duration_min && <span style={{ color: C.tx3 }}> / {session.duration_min} min prévues</span>}</>
                : <>{session.duration_min} min prévues</>
              }
            </div>
          )}
          {session.distance_m != null && session.distance_m > 0 && (
            <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>{(session.distance_m / 1000).toFixed(1)} km</div>
          )}
          {session.note && (
            <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginBottom: 2 }}>« {session.note} »</div>
          )}
          {/* Block logs (new system) */}
          {session.block_logs && Object.entries(session.block_logs).length > 0 ? (
            Object.entries(session.block_logs).map(([key, b], i) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9 }}>
                <span style={{
                  width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                  background: b.done ? C.g : "transparent",
                  border: "1px solid " + (b.done ? C.g : C.tx3),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 7, color: "#fff",
                }}>
                  {b.done ? "✓" : ""}
                </span>
                <span style={{ color: b.done ? C.tx : C.tx3 }}>Bloc {i + 1}</span>
                {(b as { note?: string }).note && <span style={{ color: C.tx3, fontStyle: "italic" }}>{(b as { note?: string }).note}</span>}
              </div>
            ))
          ) : hasSteps ? (
            ((session as { intervals?: unknown[] }).intervals ?? []).map((step, i) => (
              <EnergyStepRow
                key={(step as { id?: string }).id ?? i}
                step={step}
                log={(session as { step_log?: Record<string, EnergyStepLog> | null }).step_log ?? null}
                index={i}
              />
            ))
          ) : (
            <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>Aucun détail disponible</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test row ──────────────────────────────────────────────────────────────────

function TestRow({ test }: { test: DayTest }) {
  const [open, setOpen] = useState(false);
  const tc = TEST_TYPE_COLOR[test.type] ?? "#6B7280";
  const done = test.completed;

  // Parse structured results if available
  const structuredVars = test.results_structured
    ? (test.results_structured as Record<string, Record<string, number>>).variables ?? null
    : null;
  const hasResults = done && (test.results_note || structuredVars);

  return (
    <div style={{
      background: done ? tc + "12" : C.s2,
      border: "1px solid " + (done ? tc + "40" : C.brd),
      borderRadius: 7, overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={hasResults ? () => setOpen(v => !v) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 7px", cursor: hasResults ? "pointer" : "default" }}
      >
        <span style={{ fontSize: 9, color: tc, flexShrink: 0 }}></span>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: done ? C.tx : C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {test.title}
        </span>
        <span style={{ fontSize: 8, fontWeight: 700, color: done ? tc : C.tx3, flexShrink: 0 }}>
          {done ? "✓" : "—"}
        </span>
        {hasResults && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
      </div>

      {/* Expanded: results */}
      {hasResults && open && (
        <div style={{ borderTop: "1px solid " + tc + "30", padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Type badge */}
          <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: tc + "20", color: tc, textTransform: "capitalize", alignSelf: "flex-start" as const }}>
            {test.type}
          </span>

          {test.results_note && (
            <div style={{ fontSize: 9, color: C.tx2, lineHeight: 1.4 }}>
              {test.results_note}
            </div>
          )}

          {!test.results_note && !structuredVars && (
            <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>Aucun résultat saisi</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Free activity compact row ─────────────────────────────────────────────────

function FreeActivityRow({ activity }: { activity: FreeActivityDetail }) {
  const [open, setOpen] = useState(false);
  const hasDetail = activity.duration != null || activity.intensity != null || !!activity.note;

  return (
    <div style={{ background: C.s2, borderRadius: 7, overflow: "hidden" }}>
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 7px", cursor: hasDetail ? "pointer" : "default" }}
      >
        <Check size={10} color={C.g} />
        <span style={{
          flex: 1, fontSize: 10, fontWeight: 600, color: C.tx,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {activity.sportEmoji ? activity.sportEmoji + " " : ""}{activity.name}
        </span>
        {activity.intensity != null && (
          <span style={{ fontSize: 8, color: C.tx3, flexShrink: 0 }}>RPE {activity.intensity}</span>
        )}
        {hasDetail && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "5px 7px", display: "flex", flexDirection: "column", gap: 3 }}>
          {activity.duration != null && (
            <div style={{ fontSize: 9, color: C.tx2 }}>{activity.duration} min</div>
          )}
          {activity.intensity != null && (
            <div style={{ fontSize: 9, color: C.tx2 }}>RPE {activity.intensity}/10</div>
          )}
          {activity.note && (
            <div style={{ fontSize: 8, color: C.tx3, fontStyle: "italic" }}>{activity.note}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workout detail modal ──────────────────────────────────────────────────────

function WorkoutDetailModal({ workout, prevWorkout, onClose }: { workout: DayWorkout; prevWorkout?: DayWorkout | null; onClose: () => void }) {
  const exIds = [...new Set([
    ...workout.planned_exercises.map((p) => p.exercise_id),
    ...workout.performed_exercises.map((p) => p.exercise_id),
  ])];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
        maxHeight: "85vh", background: C.s1, borderRadius: "6px 6px 0 0",
        border: "1px solid " + C.brd, borderBottom: "none",
        display: "flex", flexDirection: "column",
        animation: "slideUp 200ms ease-out",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL }} />
        </div>

        {/* Header */}
        <div style={{ padding: "10px 18px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid " + C.brd }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{workout.session_name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 10, color: C.tx3 }}>
              {workout.status === "completed" && <span style={{ color: C.g, fontWeight: 700 }}>Terminée</span>}
              {workout.duration_s != null && <span>{Math.round(workout.duration_s / 60)} min</span>}
              {workout.rpe_score != null && <span>RPE {workout.rpe_score}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Notes */}
          {workout.notes && (
            <div style={{ padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brd, fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", display: "block", marginBottom: 3 }}>Notes</span>
              {workout.notes}
            </div>
          )}

          {/* Athlete session comment + forme */}
          {(workout.athlete_forme != null || workout.athlete_session_comment) && (
            <div style={{ padding: "8px 12px", borderRadius: 4, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", flexDirection: "column", gap: 4 }}>
              {workout.athlete_forme != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase" }}>Forme athlète</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                    background: workout.athlete_forme >= 4 ? "rgba(34,197,94,0.1)" : workout.athlete_forme >= 3 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                    color: workout.athlete_forme >= 4 ? "#22c55e" : workout.athlete_forme >= 3 ? "#f59e0b" : "#ef4444",
                  }}>
                    {workout.athlete_forme}/5
                  </span>
                </div>
              )}
              {workout.athlete_session_comment && (
                <div style={{ fontSize: 11, color: C.tx2, fontStyle: "italic" }}>« {workout.athlete_session_comment} »</div>
              )}
            </div>
          )}

          {/* Exercises */}
          {exIds.length > 0 ? exIds.map((exId) => {
            const planned   = workout.planned_exercises.find((p) => p.exercise_id === exId);
            const performed = workout.performed_exercises.find((p) => p.exercise_id === exId);
            const prevEx    = prevWorkout?.performed_exercises.find((p) => p.exercise_id === exId);
            const name      = planned?.exercise_name ?? performed?.exercise_name ?? "Exercice";
            const comment   = workout.exercise_comments.find((c) => c.exercise_id === exId || c.exercise_name === name);
            const plannedMinReps = planned?.reps_range ? parseInt(planned.reps_range.match(/^(\d+)/)?.[1] ?? "0") || undefined : undefined;

            return (
              <div key={exId} style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{name}</span>
                  {planned?.method && (
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(123,111,255,0.12)", color: "#FFC933", fontWeight: 600 }}>
                      {planned.method}
                    </span>
                  )}
                  {!planned && performed && (
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: C.acS, color: C.ac, fontWeight: 600 }}>
                      Ajouté
                    </span>
                  )}
                </div>

                {/* Planned — chip style */}
                {planned && planned.sets > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#FFC933", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Prévu</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {[
                        { l: "Séries", v: String(planned.sets) },
                        { l: "Reps", v: planned.reps_range ?? "—" },
                        ...(planned.kg != null ? [{ l: "Charge", v: `${planned.kg}kg` }] : []),
                        ...(planned.rir != null ? [{ l: "RIR", v: String(planned.rir) }] : []),
                      ].map(({ l, v }) => (
                        <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "4px 8px", borderRadius: 6, background: C.s1, border: "1px solid " + C.brdL }}>
                          <span style={{ fontSize: 7, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{l}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performed sets — colored rows */}
                {performed && performed.sets.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                      Réalisé ({performed.sets.length} série{performed.sets.length > 1 ? "s" : ""})
                    </div>
                    {performed.sets.map((s) => {
                      if (!s.done) {
                        const hasData = s.kg != null || s.reps != null;
                        return (
                          <div key={s.set_num} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "5px 8px", borderRadius: 7, marginBottom: 3,
                            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.40)",
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.tx3, minWidth: 22 }}>S{s.set_num}</span>
                            {hasData ? (
                              <>
                                {s.kg != null && <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{s.kg} kg</span>}
                                {s.reps != null && <span style={{ fontSize: 12, color: C.tx }}>× {s.reps}</span>}
                                {s.rir != null && <span style={{ fontSize: 11, color: C.tx3 }}>RIR {s.rir}</span>}
                                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#ef4444" }}>✗</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: "#ef4444" }}>Non réalisé</span>
                            )}
                          </div>
                        );
                      }
                      const ok = plannedMinReps === undefined || (s.reps != null && s.reps >= plannedMinReps);
                      const sc = ok ? "#22c55e" : "#f59e0b";
                      return (
                        <div key={s.set_num} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 8px", borderRadius: 7, marginBottom: 3,
                          background: ok ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)",
                          border: "1px solid " + sc + "40",
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.tx3, minWidth: 22 }}>S{s.set_num}</span>
                          {s.kg != null && <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{s.kg} kg</span>}
                          {s.reps != null && <span style={{ fontSize: 12, color: C.tx }}>× {s.reps}</span>}
                          {s.rir != null && <span style={{ fontSize: 11, color: C.tx3 }}>RIR {s.rir}</span>}
                          {s.method && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(123,111,255,0.12)", color: "#FFC933", fontWeight: 600 }}>{s.method}</span>}
                          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: sc }}>{ok ? "✓" : "~"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: "7px 10px", borderRadius: 7,
                    background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.40)",
                    fontSize: 11, color: "#ef4444", fontWeight: 600,
                  }}>
                    Aucune série enregistrée
                  </div>
                )}

                {/* S-1 comparison */}
                {prevEx && prevEx.sets.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>S-1</div>
                    <div style={{ padding: "5px 8px", borderRadius: 6, background: C.s1, border: "1px solid " + C.brdL }}>
                      {prevEx.sets.map((s) => (
                        <div key={s.set_num} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.tx3, padding: "1px 0" }}>
                          <span style={{ fontSize: 10, fontWeight: 600, minWidth: 22 }}>S{s.set_num}</span>
                          {s.kg != null && <span>{s.kg} kg</span>}
                          {s.reps != null && <span>× {s.reps}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Athlete comment on exercise */}
                {workout.athlete_exercise_comments?.[exId] && (
                  <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: 5, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", fontSize: 10, color: C.tx2, fontStyle: "italic" }}>
                    {workout.athlete_exercise_comments[exId]}
                  </div>
                )}

                {/* Coach comment */}
                {comment && (
                  <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: 5, background: C.acS, fontSize: 10, color: C.ac }}>
                    {comment.comment}
                  </div>
                )}
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic", textAlign: "center", padding: 20 }}>
              Aucun exercice enregistré
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DayColumn({ date, workouts, energy, tests, wellness, previousWorkouts, rescheduledWorkoutIds, rescheduledEnergyIds, freeActivities = [] }: DayColumnProps) {
  const today    = isToday(parseISO(date));
  const dayLabel = format(parseISO(date), "EEE", { locale: fr });
  const dayNum   = format(parseISO(date), "d");
  const [showWellness, setShowWellness] = useState(false);
  const [detailWorkout, setDetailWorkout] = useState<DayWorkout | null>(null);

  return (
    <>
      <div style={{
        minWidth: 120,
        background: C.s1,
        border: today ? "2px solid " + C.ac + "60" : "1px solid " + C.brd,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "8px 8px 6px",
          background: today ? C.ac + "08" : "transparent",
          borderBottom: "1px solid " + C.brd,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: today ? C.ac : C.tx3, textTransform: "capitalize", marginBottom: 1 }}>
            {dayLabel}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: today ? C.ac : C.tx }}>
            {dayNum}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "8px 6px", display: "flex", flexDirection: "column", gap: 6 }}>

          {/* Wellness */}
          {wellness ? (
            <WellnessBlock wellness={wellness} onClick={() => setShowWellness(true)} />
          ) : (
            <div style={{ textAlign: "center", padding: "5px 0" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.brd, margin: "0 auto 3px" }} />
              <span style={{ fontSize: 8, color: C.tx3 }}>—</span>
            </div>
          )}

          {/* Workouts */}
          {workouts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {workouts.map(w => (
                <WorkoutRow
                  key={w.id}
                  workout={w}
                  prevWorkout={previousWorkouts?.find(pw => pw.session_name === w.session_name) ?? null}
                  isRescheduled={rescheduledWorkoutIds?.has(w.id)}
                  onShowDetail={() => setDetailWorkout(w)}
                />
              ))}
            </div>
          )}

          {/* Energy sessions */}
          {energy.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {energy.map(e => (
                <EnergyRow key={e.id} session={e} isRescheduled={rescheduledEnergyIds?.has(e.id)} />
              ))}
            </div>
          )}

          {/* Tests */}
          {tests.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tests.map(t => (
                <TestRow key={t.id} test={t} />
              ))}
            </div>
          )}

          {/* Free activities */}
          {freeActivities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {freeActivities.map((f) => (
                <FreeActivityRow key={f.id} activity={f} />
              ))}
            </div>
          )}

          {/* Rest day */}
          {workouts.length === 0 && energy.length === 0 && tests.length === 0 && freeActivities.length === 0 && !wellness && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 9, color: C.tx3 }}>Repos</span>
            </div>
          )}
        </div>
      </div>

      {/* Wellness detail overlay */}
      {showWellness && wellness && (
        <DayDetailPanel date={date} wellness={wellness} onClose={() => setShowWellness(false)} />
      )}

      {/* Workout detail modal */}
      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          prevWorkout={previousWorkouts?.find(pw => pw.session_name === detailWorkout.session_name) ?? null}
          onClose={() => setDetailWorkout(null)}
        />
      )}
    </>
  );
}
