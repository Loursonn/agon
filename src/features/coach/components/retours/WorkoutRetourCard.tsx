import { useState } from "react";
import { SessionPainChip, SessionPainDetail } from "@/features/shared/components/SessionPain";
import { formatPlannedSetsReps } from "@/lib/formatSetsReps";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, MessageSquare, Heart, Check, Minus, X as XIcon, BarChart2 } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SessionEvolutionDrawer } from "./SessionEvolutionDrawer";
import { VideoRequestsList, VideoRequestsPill } from "./VideoRequestsList";
import { StatusPill } from "@/features/shared/components/StatusPill";
import { useUpsertExerciseComment } from "@/features/shared/hooks/retoursComments.mutations";
import type { SessionStatus } from "@/features/shared/components/StatusPill";
import type {
  PerformedExercise,
  PlannedExercise,
  PerformedSet,
  WorkoutExerciseComment,
  VideoRequestStatus,
} from "@/features/shared/types/retours.types";

// ── Colors (match programmation) ─────────────────────────────────────────────

// Réussi = succès, incomplet = alerte, manqué = erreur (charte) ; teinte 10 %, filet 25 %.
const OK_ROW = "border-agon-succes/25 bg-agon-succes/10";
const PART_ROW = "border-agon-alerte/25 bg-agon-alerte/10";
const MISS_ROW = "border-agon-erreur/25 bg-agon-erreur/10";
const METHOD_CHIP = "rounded-[4px] bg-agon-accent/[0.12] px-[5px] py-px font-semibold text-agon-accent";
const SET_ROW = "mb-[3px] flex items-center gap-2 rounded-[7px] border px-2 py-[5px]";
const SET_NUM = "min-w-[22px] text-[11px] font-bold text-agon-tx3";
const BLOCK_LABEL = "text-[9px] font-extrabold uppercase tracking-[0.5px]";
const SMALL_LABEL = "text-[8px] font-bold uppercase tracking-[0.4px] text-agon-tx3";

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
  session_id?: string | null;
  occurrence?: number | null;
  video_requests?: VideoRequestStatus[];
  pain_levels?: Record<string, number>;
  pain_note?: string | null;
}

interface WorkoutRetourCardProps {
  workout: WorkoutType;
  previousWeekWorkout?: WorkoutType | null;
}

const VALID_STATUSES = ["planned", "in-progress", "completed", "missed", "skipped"];

// ── Chip (same as programmation) ─────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[7px] border border-agon-brd-l bg-agon-s1 px-[9px] py-[5px]">
      <span className={SMALL_LABEL}>
        {label}
      </span>
      <span className="text-[11px] font-bold text-agon-tx">{value}</span>
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
      <div className={cn(SET_ROW, MISS_ROW)}>
        <span className={SET_NUM}>S{set.set_num}</span>
        {hasData ? (
          <>
            {set.kg != null && <span className="text-[12px] font-bold text-agon-tx">{set.kg} kg</span>}
            {set.reps != null && <span className="text-[12px] text-agon-tx">× {set.reps}</span>}
            {set.rir != null && <span className="text-[11px] text-agon-tx3">RIR {set.rir}</span>}
            <span className="ml-auto text-[12px] font-bold text-agon-erreur">✗</span>
          </>
        ) : (
          <span className="text-[11px] text-agon-erreur">Non réalisé</span>
        )}
      </div>
    );
  }

  const ok = plannedReps === undefined || (set.reps != null && set.reps >= plannedReps);
  return (
    <div className={cn(SET_ROW, ok ? OK_ROW : PART_ROW)}>
      <span className={SET_NUM}>S{set.set_num}</span>
      {set.kg != null && (
        <span className="text-[12px] font-bold text-agon-tx">{set.kg} kg</span>
      )}
      {set.reps != null && (
        <span className="text-[12px] text-agon-tx">× {set.reps}</span>
      )}
      {set.rir != null && (
        <span className="text-[11px] text-agon-tx3">RIR {set.rir}</span>
      )}
      {set.method && (
        <span className={cn(METHOD_CHIP, "text-[9px]")}>
          {set.method}
        </span>
      )}
      <span className={cn("ml-auto text-[12px] font-bold", ok ? "text-agon-succes" : "text-agon-alerte")}>
        {ok ? "✓" : "~"}
      </span>
    </div>
  );
}

// ── Planned chips display ────────────────────────────────────────────────────

function PlannedChips({ planned }: { planned: PlannedExercise }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip label="Séries" value={String(planned.sets)} />
      <Chip label={planned.is_iso ? "Durée" : "Reps"} value={planned.reps_range ?? "—"} />
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
): { text: string; tone: string } {
  if (performed && performed.sets.length > 0) {
    const doneSets = performed.sets.filter(s => s.done);
    if (doneSets.length > 0) {
      const kgs = doneSets.map(s => s.kg).filter((v): v is number => v != null);
      const reps = doneSets.map(s => s.reps).filter((v): v is number => v != null);
      const maxKg = kgs.length ? Math.max(...kgs) : null;
      const avgReps = reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null;
      const plannedSets = planned?.sets ?? performed.sets.length;
      const parts: string[] = [`${doneSets.length}/${plannedSets} séries`];
      const u = planned?.is_iso ? " s" : "";
      if (maxKg != null && avgReps != null) parts.push(`${maxKg}kg × ${avgReps}${u}`);
      else if (maxKg != null) parts.push(`${maxKg}kg`);
      else if (avgReps != null) parts.push(planned?.is_iso ? `${avgReps} s` : `${avgReps} reps`);
      return { text: parts.join(" · "), tone: doneSets.length >= plannedSets ? "text-agon-succes" : "text-agon-alerte" };
    }
    // All sets not done
    const p = planned ? ` · ${formatPlannedSetsReps(planned.sets, planned.reps_range)}` : "";
    return { text: `Non réalisé${p}`, tone: "text-agon-erreur" };
  }
  if (isCompleted) {
    const p = planned ? ` · ${formatPlannedSetsReps(planned.sets, planned.reps_range)}` : "";
    return { text: `Non réalisé${p}`, tone: "text-agon-erreur" };
  }
  if (planned) {
    return { text: `${formatPlannedSetsReps(planned.sets, planned.reps_range)}${planned.kg != null ? ` @${planned.kg}kg` : ""}`, tone: "text-agon-tx3" };
  }
  return { text: "—", tone: "text-agon-tx3" };
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
      ? <Check size={12} className="text-agon-succes" />
      : <Minus size={12} className="text-agon-alerte" />)
    : (hasSets || isCompleted ? <XIcon size={12} className="text-agon-erreur" /> : null);

  const handleSave = () => {
    if (!commentText.trim()) return;
    upsertComment.mutate(
      { workoutLogId: workoutId, exerciseId: exId, exerciseName: exName, comment: commentText },
      { onSuccess: () => { setCommenting(false); setCommentText(""); onCommentSaved(); } }
    );
  };

  return (
    <div className="overflow-hidden rounded-[4px] border border-agon-brd bg-agon-s2">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2.5 text-left"
      >
        {statusIcon && <span className="flex-none leading-[0]">{statusIcon}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-agon-tx">
            {exName}
            {!planned && hasSets && (
              <span className="ml-[5px] rounded-[4px] bg-agon-accent-doux px-[5px] py-px align-middle text-[8px] font-semibold text-agon-accent">
                Ajouté
              </span>
            )}
            {planned?.method && (
              <span className={cn(METHOD_CHIP, "ml-[5px] align-middle text-[8px]")}>
                {planned.method}
              </span>
            )}
          </div>
          <div className={cn("mt-0.5 text-[10px]", summary.tone)}>{summary.text}</div>
        </div>
        {open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />}
      </button>

      {/* Expanded details */}
      {open && (
        <div className="flex flex-col gap-2 border-t border-agon-brd px-3 pb-2.5">

          {/* ── Prévu (chips style) ── */}
          {planned && (
            <div className="pt-2">
              <div className="mb-1.5 flex items-center gap-1.5 py-1">
                <span className={cn(BLOCK_LABEL, "text-agon-accent")}>
                  Prévu
                </span>
              </div>
              <PlannedChips planned={planned} />
            </div>
          )}

          {/* ── Réalisé (colored set rows) ── */}
          {hasSets ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between py-1">
                <span className={cn(BLOCK_LABEL, "text-agon-succes")}>
                  Réalisé ({performed.sets.length} série{performed.sets.length > 1 ? "s" : ""})
                </span>
                {planned && (
                  <span className={cn("text-[9px] font-bold", performed.sets.length >= planned.sets ? "text-agon-succes" : "text-agon-alerte")}>
                    {performed.sets.length}/{planned.sets}
                  </span>
                )}
              </div>
              {performed.sets.map((s, i) => (
                <SetRow key={s.set_num} set={s} index={i} plannedReps={plannedReps} />
              ))}
            </div>
          ) : isCompleted ? (
            <div className={cn("rounded-[7px] border px-2.5 py-[7px] text-[11px] font-semibold text-agon-erreur", MISS_ROW)}>
              Aucune série enregistrée
            </div>
          ) : null}

          {/* ── S-1 (previous week) ── */}
          {prevPerformed && prevPerformed.sets.length > 0 && (
            <div>
              <div className="mb-1 py-1">
                <span className={cn(BLOCK_LABEL, "text-agon-tx3")}>
                  S-1
                </span>
              </div>
              <div className="rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {prevPerformed.sets.map((s) => (
                    <div key={s.set_num} className="flex items-center gap-2 text-[11px] text-agon-tx3">
                      <span className="min-w-[22px] text-[10px] font-semibold">S{s.set_num}</span>
                      {s.kg != null && <span>{s.kg} kg</span>}
                      {s.reps != null && <span>× {s.reps}</span>}
                      {s.rir != null && <span className="text-[10px]">RIR {s.rir}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Athlete comment on exercise */}
          {athleteComment && (
            <div className="rounded-[6px] border border-agon-alerte/[0.188] bg-agon-alerte/10 px-2 py-[5px]">
              <div className="mb-0.5 text-[9px] font-semibold text-agon-alerte">Commentaire athlète</div>
              <div className="text-[11px] italic text-agon-tx2">{athleteComment}</div>
            </div>
          )}

          {/* Coach comment */}
          {existingComment && !commenting && (
            <div className="rounded-[6px] bg-agon-accent-doux px-2 py-[5px]">
              <div className="mb-0.5 text-[9px] font-semibold text-agon-accent">Commentaire coach</div>
              <div className="text-[11px] text-agon-tx2">{existingComment.comment}</div>
            </div>
          )}

          {/* Comment button + form */}
          <div className="flex gap-1.5">
            {!commenting && (
              <button
                onClick={() => { setCommenting(true); setCommentText(existingComment?.comment ?? ""); }}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-[6px] border border-agon-brd-l px-2 py-[3px] text-[10px]",
                  existingComment ? "bg-agon-accent-doux text-agon-accent" : "bg-transparent text-agon-tx3",
                )}
              >
                <MessageSquare size={10} />
                {existingComment ? "Modifier" : "Commenter"}
              </button>
            )}
          </div>

          {commenting && (
            <div className="flex flex-col gap-1.5">
              <textarea
                autoFocus placeholder="Ajouter un commentaire…"
                value={commentText} onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                className="box-border w-full resize-none rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[7px] text-[12px] text-agon-tx outline-none"
              />
              <div className="flex gap-1.5">
                <button onClick={handleSave} disabled={!commentText.trim() || upsertComment.isPending}
                  className="cursor-pointer rounded-[7px] border-none bg-agon-or-vif px-3 py-[5px] text-[11px] font-bold text-agon-ink">
                  Enregistrer
                </button>
                <button onClick={() => { setCommenting(false); setCommentText(""); }}
                  className="cursor-pointer rounded-[7px] border border-agon-brd-l bg-transparent px-3 py-[5px] text-[11px] text-agon-tx3">
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
  const [showEvolution, setShowEvolution] = useState(false);
  const { athleteId } = useParams<{ athleteId: string }>();

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
    <div className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer items-center justify-between px-3.5 py-2.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[13px] font-bold text-agon-tx">
            {workout.session_name}
          </span>
          {workout.occurrence != null && (
            <span className="flex-none text-[10px] font-bold text-agon-tx3">n°{workout.occurrence}</span>
          )}
          <StatusPill status={validStatus} size="sm" />
          <VideoRequestsPill requests={workout.video_requests} />
        </div>
        <div className="ml-2 flex flex-none items-center gap-2">
          {workout.wellness_day != null && (
            <div className="flex items-center gap-[3px]">
              <Heart size={10} color={C.tx3} />
              <span className="text-[10px] text-agon-tx3">{workout.wellness_day}/10</span>
            </div>
          )}
          {workout.rpe_score != null && (
            <span className="flex-none rounded-[6px] bg-agon-s2 px-1.5 py-0.5 text-[10px] font-semibold text-agon-tx2">
              RPE {workout.rpe_score}/10
            </span>
          )}
          <SessionPainChip levels={workout.pain_levels} />
          <span className="text-[10px] text-agon-tx3">
            {format(new Date(workout.scheduled_date), "EEE d MMM", { locale: fr })}
          </span>
          {athleteId && workout.session_id && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowEvolution(true); }}
              title="Prévu / Réalisé / Séance +1"
              className="flex cursor-pointer items-center gap-1 rounded-[4px] border border-agon-accent/[0.376] bg-agon-accent/[0.078] px-2 py-[3px] text-[10px] font-bold text-agon-accent"
            >
              <BarChart2 size={11} /> Évolution
            </button>
          )}
          {expanded ? <ChevronUp size={13} color={C.tx3} /> : <ChevronDown size={13} color={C.tx3} />}
        </div>
      </div>

      {showEvolution && athleteId && workout.session_id && (
        <SessionEvolutionDrawer
          athleteId={athleteId}
          sessionId={workout.session_id}
          occurrence={workout.occurrence ?? 1}
          onClose={() => setShowEvolution(false)}
        />
      )}

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-agon-brd px-3.5 py-3">
          <VideoRequestsList requests={workout.video_requests} />
          <SessionPainDetail levels={workout.pain_levels} note={workout.pain_note} />
          {/* Meta + stats */}
          <div className="flex flex-wrap gap-2">
            {workout.duration_s != null && (
              <div className="text-[11px] text-agon-tx2">Durée : <span className="font-semibold text-agon-tx">{Math.round(workout.duration_s / 60)} min</span></div>
            )}
            {workout.rpe_score != null && (
              <div className="text-[11px] text-agon-tx2">RPE : <span className="font-semibold text-agon-tx">{workout.rpe_score}/10</span></div>
            )}
          </div>

          {/* Quick stats bar (same style as programmation) */}
          {isCompleted && allExerciseIds.length > 0 && (
            <div className="flex gap-px">
              {[
                { label: "Exercices", value: `${totalDone}/${totalPlanned || allExerciseIds.length}`, tone: totalDone >= totalPlanned ? "text-agon-succes" : "text-agon-alerte" },
                { label: "Séries", value: String(totalSets), tone: "text-agon-accent" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="flex-1 rounded-[6px] bg-agon-s2 px-1 py-1.5 text-center">
                  <div className="text-[8px] font-bold uppercase text-agon-tx3">{label}</div>
                  <div className={cn("mt-px text-[14px] font-extrabold", tone)}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {workout.notes && (
            <div className="rounded-[4px] bg-agon-s2 px-2.5 py-2">
              <div className="mb-[3px] text-[9px] font-bold uppercase tracking-[0.4px] text-agon-tx3">Note de séance</div>
              <div className="text-[12px] text-agon-tx2">{workout.notes}</div>
            </div>
          )}

          {/* Athlete session comment + forme (same style as programmation) */}
          {(workout.athlete_session_comment || workout.athlete_forme != null) && (
            <div className="flex flex-col gap-1 rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-[7px]">
              {workout.athlete_forme != null && (
                <div className="flex items-center gap-1.5">
                  <span className={SMALL_LABEL}>Forme</span>
                  <span className={cn(
                    "rounded-[5px] px-1.5 py-px text-[11px] font-bold",
                    workout.athlete_forme >= 4 ? "bg-agon-succes/10 text-agon-succes" : workout.athlete_forme >= 3 ? "bg-agon-alerte/10 text-agon-alerte" : "bg-agon-erreur/10 text-agon-erreur",
                  )}>
                    {workout.athlete_forme}/5
                  </span>
                </div>
              )}
              {workout.athlete_session_comment && (
                <div>
                  <div className={cn(SMALL_LABEL, "mb-0.5")}>
                    Commentaire athlète
                  </div>
                  <div className="text-[11px] italic text-agon-tx">« {workout.athlete_session_comment} »</div>
                </div>
              )}
            </div>
          )}

          {/* Exercise accordions */}
          {allExerciseIds.length > 0 && (
            <div className="flex flex-col gap-1.5">
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
