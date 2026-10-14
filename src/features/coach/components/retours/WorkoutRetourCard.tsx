import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronUp, MessageSquare, Heart, Check, Minus, X as XIcon } from "lucide-react";
import { C } from "@/lib/theme";
import { StatusPill } from "@/features/shared/components/StatusPill";
import { useUpsertExerciseComment } from "@/features/shared/hooks/retoursComments.mutations";
import type { SessionStatus } from "@/features/shared/components/StatusPill";
import type {
  PerformedExercise,
  PlannedExercise,
  PerformedSet,
  WorkoutExerciseComment,
} from "@/features/shared/types/retours.types";

// ── Colors (match programmation) ─────────────────────────────────────────────

const GREEN   = "#22c55e";
const GREEN_S = "rgba(34,197,94,0.10)";
const RED     = "#ef4444";
const RED_S   = "rgba(239,68,68,0.10)";
const AMBER   = "#f59e0b";
const AMBER_S = "rgba(245,158,11,0.10)";
const VIOLET  = "#FFC933";
const VIOLET_S = "rgba(123,111,255,0.12)";

interface WorkoutType {
  id: string;
  session_name: string;
  scheduled_date: string;
  status: string;
  duration_s: number | null;
  notes: string | null;
  rpe_score: number | null;
  wellness_day: number | null;
  exercise_comments: WorkoutExerciseComment[];
  planned_exercises: PlannedExercise[];
  performed_exercises: PerformedExercise[];
  athlete_session_comment?: string | null;
  athlete_exercise_comments?: Record<string, string>;
  athlete_forme?: number | null;
}

interface WorkoutRetourCardProps {
  workout: WorkoutType;
  previousWeekWorkout?: WorkoutType | null;
}

const VALID_STATUSES = ["planned", "in-progress", "completed", "missed", "skipped"];

// ── Chip (same as programmation) ─────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "5px 9px", borderRadius: 7,
      background: C.s1, border: "1px solid " + C.brdL,
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{value}</span>
    </div>
  );
}

// ── SetRow (same style as programmation) ─────────────────────────────────────

function SetRow({ set, index, plannedReps }: {
  set: PerformedSet;
  index: number;
  plannedReps?: number;
}) {
  const hasData = set.kg != null || set.reps != null;

  if (!set.done) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", borderRadius: 7, marginBottom: 3,
        background: RED_S, border: "1px solid " + RED + "40",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.tx3, minWidth: 22 }}>S{set.set_num}</span>
        {hasData ? (
          <>
            {set.kg != null && <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{set.kg} kg</span>}
            {set.reps != null && <span style={{ fontSize: 12, color: C.tx }}>× {set.reps}</span>}
            {set.rir != null && <span style={{ fontSize: 11, color: C.tx3 }}>RIR {set.rir}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: RED }}>✗</span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: RED }}>Non réalisé</span>
        )}
      </div>
    );
  }

  const ok = plannedReps === undefined || (set.reps != null && set.reps >= plannedReps);
  const color = ok ? GREEN : AMBER;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px", borderRadius: 7, marginBottom: 3,
      background: ok ? GREEN_S : AMBER_S,
      border: "1px solid " + color + "40",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.tx3, minWidth: 22 }}>S{set.set_num}</span>
      {set.kg != null && (
        <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{set.kg} kg</span>
      )}
      {set.reps != null && (
        <span style={{ fontSize: 12, color: C.tx }}>× {set.reps}</span>
      )}
      {set.rir != null && (
        <span style={{ fontSize: 11, color: C.tx3 }}>RIR {set.rir}</span>
      )}
      {set.method && (
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: VIOLET_S, color: VIOLET, fontWeight: 600 }}>
          {set.method}
        </span>
      )}
      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color }}>
        {ok ? "✓" : "~"}
      </span>
    </div>
  );
}

// ── Planned chips display ────────────────────────────────────────────────────

function PlannedChips({ planned }: { planned: PlannedExercise }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Chip label="Séries" value={String(planned.sets)} />
      <Chip label="Reps" value={planned.reps_range ?? "—"} />
      {planned.kg != null && <Chip label="Charge" value={`${planned.kg}kg`} />}
      {planned.rir != null && <Chip label="RIR" value={String(planned.rir)} />}
      {planned.method && <Chip label="Méthode" value={planned.method} />}
    </div>
  );
}

// ── Quick summary for collapsed row ──────────────────────────────────────────

function exoSummary(
  planned: PlannedExercise | undefined,
  performed: PerformedExercise | undefined,
  isCompleted: boolean,
): { text: string; color: string } {
  if (performed && performed.sets.length > 0) {
    const doneSets = performed.sets.filter(s => s.done);
    if (doneSets.length > 0) {
      const kgs = doneSets.map(s => s.kg).filter((v): v is number => v != null);
      const reps = doneSets.map(s => s.reps).filter((v): v is number => v != null);
      const maxKg = kgs.length ? Math.max(...kgs) : null;
      const avgReps = reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null;
      const plannedSets = planned?.sets ?? performed.sets.length;
      const parts: string[] = [`${doneSets.length}/${plannedSets} séries`];
      if (maxKg != null && avgReps != null) parts.push(`${maxKg}kg × ${avgReps}`);
      else if (maxKg != null) parts.push(`${maxKg}kg`);
      else if (avgReps != null) parts.push(`${avgReps} reps`);
      return { text: parts.join(" · "), color: doneSets.length >= plannedSets ? GREEN : AMBER };
    }
    // All sets not done
    const p = planned ? ` · ${planned.sets}×${planned.reps_range ?? "—"}` : "";
    return { text: `Non réalisé${p}`, color: RED };
  }
  if (isCompleted) {
    const p = planned ? ` · ${planned.sets}×${planned.reps_range ?? "—"}` : "";
    return { text: `Non réalisé${p}`, color: RED };
  }
  if (planned) {
    return { text: `${planned.sets}×${planned.reps_range ?? "—"}${planned.kg != null ? ` @${planned.kg}kg` : ""}`, color: C.tx3 };
  }
  return { text: "—", color: C.tx3 };
}

// ── Parse planned reps for target comparison ─────────────────────────────────

function parsePlannedReps(planned: PlannedExercise | undefined): number | undefined {
  if (!planned?.reps_range) return undefined;
  // "8-12" → 8 (minimum), "10" → 10
  const match = planned.reps_range.match(/^(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

// ── Exercise accordion ───────────────────────────────────────────────────────

function RetourExoAccordion({ exId, planned, performed, prevPerformed, isCompleted, existingComment, athleteComment, workoutId, onCommentSaved }: {
  exId: string;
  planned: PlannedExercise | undefined;
  performed: PerformedExercise | undefined;
  prevPerformed: PerformedExercise | undefined;
  isCompleted: boolean;
  existingComment: WorkoutExerciseComment | undefined;
  athleteComment?: string;
  workoutId: string;
  onCommentSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const upsertComment = useUpsertExerciseComment();

  const exName = planned?.exercise_name ?? performed?.exercise_name ?? exId;
  const hasSets = performed && performed.sets.length > 0;
  const doneSetsCount = performed ? performed.sets.filter(s => s.done).length : 0;
  const summary = exoSummary(planned, performed, isCompleted);
  const plannedReps = parsePlannedReps(planned);

  const statusIcon = doneSetsCount > 0
    ? (doneSetsCount >= (planned?.sets ?? performed!.sets.length)
      ? <Check size={12} style={{ color: GREEN }} />
      : <Minus size={12} style={{ color: AMBER }} />)
    : (hasSets || isCompleted ? <XIcon size={12} style={{ color: RED }} /> : null);

  const handleSave = () => {
    if (!commentText.trim()) return;
    upsertComment.mutate(
      { workoutLogId: workoutId, exerciseId: exId, exerciseName: exName, comment: commentText },
      { onSuccess: () => { setCommenting(false); setCommentText(""); onCommentSaved(); } }
    );
  };

  return (
    <div style={{
      background: C.s2, borderRadius: 4, border: "1px solid " + C.brd,
      overflow: "hidden",
    }}>
      {/* Collapsed header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        {statusIcon && <span style={{ flexShrink: 0, lineHeight: 0 }}>{statusIcon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {exName}
            {!planned && hasSets && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: C.acS, color: C.ac, fontWeight: 600, verticalAlign: "middle" }}>
                Ajouté
              </span>
            )}
            {planned?.method && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: VIOLET_S, color: VIOLET, fontWeight: 600, verticalAlign: "middle" }}>
                {planned.method}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: summary.color, marginTop: 2 }}>{summary.text}</div>
        </div>
        {open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />}
      </button>

      {/* Expanded details */}
      {open && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid " + C.brd }}>

          {/* ── Prévu (chips style) ── */}
          {planned && (
            <div style={{ paddingTop: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                padding: "4px 0",
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: VIOLET, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Prévu
                </span>
              </div>
              <PlannedChips planned={planned} />
            </div>
          )}

          {/* ── Réalisé (colored set rows) ── */}
          {hasSets ? (
            <div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6, padding: "4px 0",
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Réalisé ({performed.sets.length} série{performed.sets.length > 1 ? "s" : ""})
                </span>
                {planned && (
                  <span style={{ fontSize: 9, color: performed.sets.length >= planned.sets ? GREEN : AMBER, fontWeight: 700 }}>
                    {performed.sets.length}/{planned.sets}
                  </span>
                )}
              </div>
              {performed.sets.map((s, i) => (
                <SetRow key={s.set_num} set={s} index={i} plannedReps={plannedReps} />
              ))}
            </div>
          ) : isCompleted ? (
            <div style={{
              padding: "7px 10px", borderRadius: 7,
              background: RED_S, border: "1px solid " + RED + "40",
              fontSize: 11, color: RED, fontWeight: 600,
            }}>
              Aucune série enregistrée
            </div>
          ) : null}

          {/* ── S-1 (previous week) ── */}
          {prevPerformed && prevPerformed.sets.length > 0 && (
            <div>
              <div style={{ marginBottom: 4, padding: "4px 0" }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  S-1
                </span>
              </div>
              <div style={{
                padding: "6px 8px", borderRadius: 7,
                background: C.s1, border: "1px solid " + C.brdL,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {prevPerformed.sets.map((s) => (
                    <div key={s.set_num} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.tx3 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, minWidth: 22 }}>S{s.set_num}</span>
                      {s.kg != null && <span>{s.kg} kg</span>}
                      {s.reps != null && <span>× {s.reps}</span>}
                      {s.rir != null && <span style={{ fontSize: 10 }}>RIR {s.rir}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Athlete comment on exercise */}
          {athleteComment && (
            <div style={{
              padding: "5px 8px", borderRadius: 6,
              background: AMBER_S, border: "1px solid " + AMBER + "30",
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: AMBER, marginBottom: 2 }}>Commentaire athlète</div>
              <div style={{ fontSize: 11, color: C.tx2, fontStyle: "italic" }}>{athleteComment}</div>
            </div>
          )}

          {/* Coach comment */}
          {existingComment && !commenting && (
            <div style={{ background: C.acS, borderRadius: 6, padding: "5px 8px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.ac, marginBottom: 2 }}>Commentaire coach</div>
              <div style={{ fontSize: 11, color: C.tx2 }}>{existingComment.comment}</div>
            </div>
          )}

          {/* Comment button + form */}
          <div style={{ display: "flex", gap: 6 }}>
            {!commenting && (
              <button
                onClick={() => { setCommenting(true); setCommentText(existingComment?.comment ?? ""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6,
                  border: "1px solid " + C.brdL, background: existingComment ? C.acS : "transparent",
                  color: existingComment ? C.ac : C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <MessageSquare size={10} />
                {existingComment ? "Modifier" : "Commenter"}
              </button>
            )}
          </div>

          {commenting && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                autoFocus placeholder="Ajouter un commentaire…"
                value={commentText} onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                style={{ width: "100%", background: C.s1, border: "1px solid " + C.brdL, borderRadius: 4, padding: "7px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleSave} disabled={!commentText.trim() || upsertComment.isPending}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Enregistrer
                </button>
                <button onClick={() => { setCommenting(false); setCommentText(""); }}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkoutRetourCard({ workout, previousWeekWorkout }: WorkoutRetourCardProps) {
  const [expanded, setExpanded] = useState(false);

  const validStatus = VALID_STATUSES.includes(workout.status) ? (workout.status as SessionStatus) : "planned";
  const isCompleted = workout.status === "completed";

  // Build maps
  const allExerciseIds: string[] = [];
  const seen = new Set<string>();
  const plannedMap = new Map<string, PlannedExercise>();
  const performedMap = new Map<string, PerformedExercise>();

  for (const ex of workout.planned_exercises) {
    plannedMap.set(ex.exercise_id, ex);
    if (!seen.has(ex.exercise_id)) { allExerciseIds.push(ex.exercise_id); seen.add(ex.exercise_id); }
  }
  for (const ex of workout.performed_exercises) {
    performedMap.set(ex.exercise_id, ex);
    if (!seen.has(ex.exercise_id)) { allExerciseIds.push(ex.exercise_id); seen.add(ex.exercise_id); }
  }

  const prevPerformedMap = new Map<string, PerformedExercise>();
  if (previousWeekWorkout) {
    for (const ex of previousWeekWorkout.performed_exercises) prevPerformedMap.set(ex.exercise_id, ex);
  }

  // Stats — count only exercises/sets that were actually done
  const totalDone = workout.performed_exercises.filter(e => e.sets.some(s => s.done)).length;
  const totalPlanned = workout.planned_exercises.length;
  const totalSets = workout.performed_exercises.reduce((acc, e) => acc + e.sets.filter(s => s.done).length, 0);

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {workout.session_name}
          </span>
          <StatusPill status={validStatus} size="sm" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
          {workout.wellness_day != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Heart size={10} color={C.tx3} />
              <span style={{ fontSize: 10, color: C.tx3 }}>{workout.wellness_day}/10</span>
            </div>
          )}
          {workout.rpe_score != null && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: C.s2, color: C.tx2, flexShrink: 0 }}>
              RPE {workout.rpe_score}/10
            </span>
          )}
          <span style={{ fontSize: 10, color: C.tx3 }}>
            {format(new Date(workout.scheduled_date), "EEE d MMM", { locale: fr })}
          </span>
          {expanded ? <ChevronUp size={13} color={C.tx3} /> : <ChevronDown size={13} color={C.tx3} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid " + C.brd, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Meta + stats */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {workout.duration_s != null && (
              <div style={{ fontSize: 11, color: C.tx2 }}>Durée : <span style={{ fontWeight: 600, color: C.tx }}>{Math.round(workout.duration_s / 60)} min</span></div>
            )}
            {workout.rpe_score != null && (
              <div style={{ fontSize: 11, color: C.tx2 }}>RPE : <span style={{ fontWeight: 600, color: C.tx }}>{workout.rpe_score}/10</span></div>
            )}
          </div>

          {/* Quick stats bar (same style as programmation) */}
          {isCompleted && allExerciseIds.length > 0 && (
            <div style={{ display: "flex", gap: 1 }}>
              {[
                { label: "Exercices", value: `${totalDone}/${totalPlanned || allExerciseIds.length}`, color: totalDone >= totalPlanned ? GREEN : AMBER },
                { label: "Séries", value: String(totalSets), color: VIOLET },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: C.s2, borderRadius: 6 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {workout.notes && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Note de séance</div>
              <div style={{ fontSize: 12, color: C.tx2 }}>{workout.notes}</div>
            </div>
          )}

          {/* Athlete session comment + forme (same style as programmation) */}
          {(workout.athlete_session_comment || workout.athlete_forme != null) && (
            <div style={{
              padding: "7px 10px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              {workout.athlete_forme != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Forme</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                    background: workout.athlete_forme >= 4 ? GREEN_S : workout.athlete_forme >= 3 ? AMBER_S : RED_S,
                    color: workout.athlete_forme >= 4 ? GREEN : workout.athlete_forme >= 3 ? AMBER : RED,
                  }}>
                    {workout.athlete_forme}/5
                  </span>
                </div>
              )}
              {workout.athlete_session_comment && (
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
                    Commentaire athlète
                  </div>
                  <div style={{ fontSize: 11, color: C.tx, fontStyle: "italic" }}>« {workout.athlete_session_comment} »</div>
                </div>
              )}
            </div>
          )}

          {/* Exercise accordions */}
          {allExerciseIds.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allExerciseIds.map((exId) => (
                <RetourExoAccordion
                  key={exId}
                  exId={exId}
                  planned={plannedMap.get(exId)}
                  performed={performedMap.get(exId)}
                  prevPerformed={prevPerformedMap.get(exId)}
                  isCompleted={isCompleted}
                  existingComment={workout.exercise_comments.find(c => c.exercise_id === exId || c.exercise_name === (plannedMap.get(exId)?.exercise_name ?? performedMap.get(exId)?.exercise_name ?? exId))}
                  athleteComment={workout.athlete_exercise_comments?.[exId]}
                  workoutId={workout.id}
                  onCommentSaved={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
