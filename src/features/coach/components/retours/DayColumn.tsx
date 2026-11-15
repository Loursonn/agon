import { sessionPainText } from "@/lib/sessionPain";
import { useState } from "react";
import { WatchRunTag } from "@/features/shared/components/WatchRunTag";
import { isToday, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, X, ChevronDown, ChevronUp, Hourglass } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { getReco } from "@/lib/wellness";
import { wellnessView } from "@/lib/wellness";
import { WELLNESS_ITEMS, WELLNESS_ITEM_LABEL, WELLNESS_ITEM_SHORT } from "@shared/domain/wellness";
import { DayDetailPanel } from "./DayDetailPanel";
import { SessionEvolutionDrawer } from "./SessionEvolutionDrawer";
import { VideoRequestsPill } from "./VideoRequestsList";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/energyLabels";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import type { WeeklyRetourData, WellnessDay, EnergyStepLog, FreeActivityDetail } from "@/features/shared/types/retours.types";

type DayWorkout = WeeklyRetourData["workouts"][number];
type DayEnergy  = WeeklyRetourData["energy_sessions"][number];
type DayTest    = WeeklyRetourData["test_sessions"][number];

/** Type de test : filet 19 % du résultat ouvert, pastille 12,5 %. */
const TEST_TYPE_TONE: Record<string, { border: string; badge: string }> = {
  musculation: { border: "border-agon-accent/[0.188]", badge: "bg-agon-accent/[0.125] text-agon-accent" },
  endurance:   { border: "border-agon-info/[0.188]",   badge: "bg-agon-info/[0.125] text-agon-info" },
  vitesse:     { border: "border-agon-erreur/[0.188]", badge: "bg-agon-erreur/[0.125] text-agon-erreur" },
  puissance:   { border: "border-agon-alerte/[0.188]", badge: "bg-agon-alerte/[0.125] text-agon-alerte" },
  souplesse:   { border: "border-agon-succes/[0.188]", badge: "bg-agon-succes/[0.125] text-agon-succes" },
};
const TEST_TYPE_OTHER = { border: "border-agon-pierre/[0.188]", badge: "bg-agon-pierre/[0.125] text-agon-pierre" };

/** Type de séance d'énergie (texte du type, séance faite). */
const ENERGY_KIND_TEXT: Record<string, string> = {
  vo2: "text-agon-accent", tempo: "text-agon-info", seuil: "text-agon-alerte",
  footing: "text-agon-succes", fartlek: "text-agon-erreur", specifique: "text-agon-type-hyrox",
};

/** Liseré gauche (3 px) d'une carte, couleur de la famille de séance. */
const BAR = {
  muscu:  "shadow-[inset_3px_0_0_var(--agon-accent)]",
  energy: "shadow-[inset_3px_0_0_var(--agon-info)]",
  test:   "shadow-[inset_3px_0_0_var(--agon-amethyste)]",
  free:   "shadow-[inset_3px_0_0_var(--agon-succes)]",
} as const;

const ROW_HEAD = "flex flex-col items-start gap-[7px] py-[9px] pl-3 pr-[9px]";
const MINI = "agon-mono flex-none text-[9.5px]";

/** Douleur de séance (fin de séance) : repère court, détail dans le panneau du jour. */
function PainMini({ levels }: { levels?: Record<string, number> | null }) {
  const text = sessionPainText(levels);
  if (!text) return null;
  return <span title={"Douleur pendant la séance : " + text} className={cn(MINI, "font-semibold text-agon-rouge")}>DOULEUR</span>;
}
const CHECK_DONE = "text-[8px] font-bold text-agon-succes";
const CHECK_PARTIAL = "text-[8px] font-bold text-agon-alerte";

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
  /** Pour ouvrir la vue évolutive (Prévu / Réalisé / Séance +1) */
  athleteId?:             string;
}

// ── Status color helper ───────────────────────────────────────────────────────

type StatusTone = { card: string; pill: string; label: string; filled: boolean };

function statusColors(status: string, rescheduled = false): StatusTone {
  // Planche CoachRetours : aplat 12 %, filet 42 %, pastille pleine.
  if (rescheduled)            return { card: "border-agon-alerte/[0.42] bg-agon-alerte/[0.12]", pill: "bg-agon-alerte", label: "Déplacée", filled: true };
  if (status === "completed") return { card: "border-agon-succes/[0.42] bg-agon-succes/[0.12]", pill: "bg-agon-succes", label: "Faite", filled: true };
  if (status === "missed")    return { card: "border-agon-rouge/[0.42] bg-agon-rouge/[0.12]",   pill: "bg-agon-rouge",  label: "Manquée", filled: true };
  if (status === "skipped")   return { card: "border-agon-brd bg-agon-s2",   pill: "", label: "Sautée", filled: false };
  return                             { card: "border-agon-brd-l bg-agon-s2", pill: "", label: "Planifiée", filled: false };
}

function StatusPill({ cols }: { cols: StatusTone }) {
  return (
    <span className={cn(
      "agon-mono flex-none whitespace-nowrap rounded-full text-[11px] font-medium uppercase tracking-[0.08em]",
      cols.filled
        ? cn("px-[9px] py-1 text-agon-ink", cols.pill)
        : "border border-agon-sable/30 bg-transparent px-2 py-0.5 text-agon-tx2",
      "leading-[1.3]",
    )}>{cols.label}</span>
  );
}

/** Ligne titre d'une carte de séance : point de type + nom sur deux lignes. */
function CardTitle({ dot, done, children }: { dot: string; done: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("flex min-w-0 items-start gap-1.5 text-[12px] font-medium leading-[15.5px]", done ? "text-agon-tx" : "text-agon-tx2")}>
      <span aria-hidden className={cn("mt-[4.5px] size-1.5 flex-none rounded-full", dot)} />
      <span className="line-clamp-2 min-w-0">{children}</span>
    </span>
  );
}

const cardShell = (cols: StatusTone, bar: string) => cn("relative overflow-hidden rounded-[9px] border", cols.card, bar);

/** RPE : rouge à partir de 8, orange à partir de 6. */
const rpeText = (rpe: number) => (rpe >= 8 ? "text-agon-rouge" : rpe >= 6 ? "text-agon-alerte" : "text-agon-tx3");

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <Check size={10} color={C.g} />;
  if (status === "partial")   return <Check size={10} color={C.tx3} />;
  if (status === "planned" || status === "in-progress") return <Hourglass size={10} color={C.tx3} />;
  return <X size={10} color={C.tx3} />;
}

// ── Wellness mini-block ───────────────────────────────────────────────────────

function WellnessBlock({ wellness, onClick }: { wellness: WellnessDay; onClick: () => void }) {
  // Score recalculé par le domaine (le `score` reçu n'est pas lu : il valait 0
  // quand il manquait). Libellés : ceux de la saisie athlète, dans l'ordre.
  const { items, score, reco, injuryNote } = wellnessView(wellness);
  const col = reco.c;
  return (
    <div onClick={onClick} className="flex cursor-pointer flex-col gap-[7px] rounded-[9px] border px-[9px] pb-2 pt-[9px]" style={{ background: alpha(col, 0.12), borderColor: alpha(col, 0.4) }}>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: col }} />
        <span className="agon-mono text-[22px] leading-none" style={{ color: col }}>{score ?? "—"}</span>
        <span className="agon-mono text-[10px] text-agon-tx2">/100</span>
      </div>
      {injuryNote && (
        <div title={injuryNote} className="rounded-[3px] border border-agon-erreur/[0.314] bg-agon-erreur/[0.094] px-[5px] py-[3px]">
          <div className="text-[8px] font-extrabold uppercase text-agon-erreur">Blessé / malade</div>
          <div className="line-clamp-2 text-[9px] text-agon-tx leading-[1.3]">{injuryNote}</div>
        </div>
      )}
      <div className="agon-mono grid gap-0.5 border-t border-white/[0.08] pt-1.5 text-center text-[11px] text-agon-tx" style={{ gridTemplateColumns: `repeat(${WELLNESS_ITEMS.length}, 1fr)` }}>
        {WELLNESS_ITEMS.map((k) => (
          <span key={k} title={`${WELLNESS_ITEM_LABEL[k]} (${WELLNESS_ITEM_SHORT[k]})`}>{items[k] ?? "—"}</span>
        ))}
      </div>
    </div>
  );
}

// ── Workout row ───────────────────────────────────────────────────────────────

function WorkoutRow({ workout, prevWorkout, isRescheduled, onShowDetail, onOpenEvolution }: { workout: DayWorkout; prevWorkout?: DayWorkout | null; isRescheduled?: boolean; onShowDetail: () => void; onOpenEvolution?: () => void }) {
  const [open, setOpen] = useState(false);
  const done = workout.status === "completed";
  const cols = statusColors(workout.status, isRescheduled);
  const perfCount = workout.performed_exercises.length;

  return (
    <div className={cardShell(cols, BAR.muscu)}>
      {/* Header */}
      <div
        onClick={onOpenEvolution ?? (done ? () => setOpen(v => !v) : undefined)}
        title={onOpenEvolution ? "Prévu / Réalisé / Séance +1" : undefined}
        className={cn(ROW_HEAD, onOpenEvolution || done ? "cursor-pointer" : "cursor-default")}
      >
        <CardTitle dot="bg-agon-accent" done={done}>{workout.session_name}</CardTitle>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-[5px]">
        <StatusPill cols={cols} />
        <span className="flex-1" />
        <VideoRequestsPill requests={workout.video_requests} />
        {workout.occurrence != null && (
          <span title={`Séance n°${workout.occurrence}`} className="flex-none text-[8px] font-bold text-agon-tx3">#{workout.occurrence}</span>
        )}
        {done && perfCount > 0 && (
          <span className={cn(MINI, "text-agon-tx3")}>{perfCount} exo{perfCount > 1 ? "s" : ""}</span>
        )}
        {done && workout.rpe_score != null && (
          <span className={cn(MINI, rpeText(workout.rpe_score))}>RPE {workout.rpe_score}</span>
        )}
        <PainMini levels={workout.pain_levels} />
        {done && (
          <span
            onClick={onOpenEvolution ? (e) => { e.stopPropagation(); setOpen(v => !v); } : undefined}
            className={cn("flex flex-none", onOpenEvolution && "-m-0.5 p-0.5")}
          >
            {open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />}
          </span>
        )}
        </div>
      </div>

      {/* Expanded: summary + voir le détail */}
      {done && open && (() => {
        return (
          <div className="flex flex-col gap-1 border-t border-agon-succes/[0.188] px-[7px] py-1.5">
            {workout.duration_s != null && (
              <div className="text-[9px] text-agon-tx3">{Math.round(workout.duration_s / 60)} min</div>
            )}
            {workout.notes && (
              <div className="text-[9px] italic text-agon-tx3">« {workout.notes} »</div>
            )}
            {/* Quick summary of performed exercises */}
            {workout.performed_exercises.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {workout.performed_exercises.slice(0, 4).map((ex) => {
                  const bestSet = ex.sets.reduce((best, s) => (s.kg ?? 0) > (best.kg ?? 0) ? s : best, ex.sets[0]);
                  return (
                    <div key={ex.exercise_id} className="flex items-center gap-1 text-[9px]">
                      <span className="flex-1 truncate font-semibold text-agon-tx">{ex.exercise_name}</span>
                      <span className="flex-none text-agon-tx2">
                        {bestSet.kg != null ? `${bestSet.kg}kg` : "—"} × {bestSet.reps ?? "—"}
                      </span>
                      <span className="flex-none text-agon-tx3">{ex.sets.length}s</span>
                    </div>
                  );
                })}
                {workout.performed_exercises.length > 4 && (
                  <span className="text-[8px] text-agon-tx3">+{workout.performed_exercises.length - 4} autres</span>
                )}
              </div>
            )}
            {/* Comments indicators */}
            {workout.exercise_comments.length > 0 && (
              <div className="text-[8px] text-agon-accent">{workout.exercise_comments.length} com. coach</div>
            )}
            {(workout.athlete_session_comment || Object.keys(workout.athlete_exercise_comments ?? {}).length > 0) && (
              <div className="text-[8px] text-agon-alerte">
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
              className="mt-0.5 cursor-pointer border-t border-agon-brd py-1 text-center text-[9px] font-bold text-agon-accent"
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
    const rc  = ROLE_COLOR[step.role as string] ?? C.pierre;
    const dur = step.duration?.kind === "time"     ? formatS(step.duration.value ?? 0)
              : step.duration?.kind === "distance" ? `${step.duration.value ?? 0} m`
              : "Lap";
    const tgt = step.target ? formatTarget(step.target) : null;

    return (
      <div className="px-1 py-[3px]">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-0.5 flex-none rounded-[1px]" style={{ background: rc }} />
          <span className="text-[9px] font-bold" style={{ color: rc }}>{ROLE_LABEL_FR[step.role as string] ?? step.role}</span>
          <span className="text-[9px] text-agon-tx">{dur}</span>
          {tgt && tgt !== "Libre" && <span className="text-[8px] text-agon-tx3">{tgt}</span>}
          <div className="ml-auto flex-none">
            {entry?.status === "done"    && <span className={CHECK_DONE}>✓</span>}
            {entry?.status === "partial" && <span className={CHECK_PARTIAL}>~</span>}
            {!entry && log !== null      && <span className="text-[8px] text-agon-tx3">—</span>}
          </div>
        </div>
        {entry?.status === "partial" && entry.comment && (
          <div className="mt-0.5 pl-2 text-[8px] italic text-agon-alerte">
            {entry.comment}
          </div>
        )}
      </div>
    );
  }

  // Group
  return (
    <div className="rounded-[4px] bg-agon-info/[0.06] px-1 py-[3px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-extrabold text-agon-info">× {step.repeat}</span>
        <span className="text-[8px] text-agon-tx3">{(step.children as unknown[])?.length ?? 0} étapes</span>
        <div className="ml-auto">
          {entry?.status === "done"    && <span className={CHECK_DONE}>✓</span>}
          {entry?.status === "partial" && <span className={CHECK_PARTIAL}>~</span>}
        </div>
      </div>
      {entry?.status === "partial" && entry.comment && (
        <div className="mt-0.5 text-[8px] italic text-agon-alerte">
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
  const kindText = ENERGY_KIND_TEXT[session.session_kind ?? ""] ?? "text-agon-pierre";

  return (
    <div className={cardShell(cols, BAR.energy)}>
      {/* Header */}
      <div
        onClick={hasDetail ? () => setOpen(v => !v) : undefined}
        className={cn(ROW_HEAD, hasDetail ? "cursor-pointer" : "cursor-default")}
      >
        <CardTitle dot="bg-agon-info" done={done}>{session.session_label}</CardTitle>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-[5px]">
        {session.watch_run ? <WatchRunTag match={session.watch_run} size={8} /> : <StatusPill cols={cols} />}
        <span className="flex-1" />
        {session.rpe_score != null && (
          <span className={cn(MINI, rpeText(session.rpe_score))}>
            RPE {session.rpe_score}
          </span>
        )}
        <PainMini levels={session.pain_levels} />
        {session.session_kind && done && (
          <span className={cn(MINI, kindText)}>
            {session.session_kind.toUpperCase()}
          </span>
        )}
        {hasDetail && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
        </div>
      </div>

      {/* Expanded: step log */}
      {open && (
        <div className={cn("flex flex-col gap-0.5 border-t px-[7px] py-1.5", done ? "border-agon-succes/[0.188]" : "border-agon-brd")}>
          {/* Duration: actual vs planned */}
          {(session.actual_duration_min != null || session.duration_min != null) && (
            <div className="mb-0.5 text-[9px] text-agon-tx3">
              {session.actual_duration_min != null
                ? <>{session.actual_duration_min} min réalisées{session.duration_min != null && session.actual_duration_min !== session.duration_min && <span className="text-agon-tx3"> / {session.duration_min} min prévues</span>}</>
                : <>{session.duration_min} min prévues</>
              }
            </div>
          )}
          {session.distance_m != null && session.distance_m > 0 && (
            <div className="mb-0.5 text-[9px] text-agon-tx3">{(session.distance_m / 1000).toFixed(1)} km</div>
          )}
          {session.note && (
            <div className="mb-0.5 text-[9px] italic text-agon-tx3">« {session.note} »</div>
          )}
          {/* Block logs (new system) */}
          {session.block_logs && Object.entries(session.block_logs).length > 0 ? (
            Object.entries(session.block_logs).map(([key, b], i) => (
              <div key={key} className="flex items-center gap-[5px] text-[9px]">
                <span className={cn(
                  "flex size-[13px] flex-none items-center justify-center rounded-full border text-[7px] text-agon-tx",
                  b.done ? "border-agon-succes bg-agon-succes" : "border-agon-tx3 bg-transparent",
                )}>
                  {b.done ? "✓" : ""}
                </span>
                <span className={b.done ? "text-agon-tx" : "text-agon-tx3"}>Bloc {i + 1}</span>
                {(b as { note?: string }).note && <span className="italic text-agon-tx3">{(b as { note?: string }).note}</span>}
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
            <span className="text-[9px] italic text-agon-tx3">Aucun détail disponible</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test row ──────────────────────────────────────────────────────────────────

function TestRow({ test }: { test: DayTest }) {
  const [open, setOpen] = useState(false);
  const tone = TEST_TYPE_TONE[test.type] ?? TEST_TYPE_OTHER;
  const done = test.completed;

  // Parse structured results if available
  const structuredVars = test.results_structured
    ? (test.results_structured as Record<string, Record<string, number>>).variables ?? null
    : null;
  const hasResults = done && (test.results_note || structuredVars);

  return (
    <div className={cardShell(done ? statusColors("completed") : statusColors("planned"), BAR.test)}>
      {/* Header */}
      <div
        onClick={hasResults ? () => setOpen(v => !v) : undefined}
        className={cn(ROW_HEAD, hasResults ? "cursor-pointer" : "cursor-default")}
      >
        <CardTitle dot="bg-agon-amethyste" done={done}>{test.title}</CardTitle>
        <div className="flex w-full items-center gap-[5px]">
          <StatusPill cols={done ? statusColors("completed") : statusColors("planned")} />
          <span className="flex-1" />
          {hasResults && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
        </div>
      </div>

      {/* Expanded: results */}
      {hasResults && open && (
        <div className={cn("flex flex-col gap-1 border-t px-[7px] py-1.5", tone.border)}>
          {/* Type badge */}
          <span className={cn("self-start rounded-[4px] px-[5px] py-px text-[8px] font-bold capitalize", tone.badge)}>
            {test.type}
          </span>

          {test.results_note && (
            <div className="text-[9px] text-agon-tx2 leading-[1.4]">
              {test.results_note}
            </div>
          )}

          {!test.results_note && !structuredVars && (
            <span className="text-[9px] italic text-agon-tx3">Aucun résultat saisi</span>
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
    <div className={cardShell(statusColors("completed"), BAR.free)}>
      <div
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(ROW_HEAD, hasDetail ? "cursor-pointer" : "cursor-default")}
      >
        <CardTitle dot="bg-agon-succes" done>{activity.sportEmoji ? activity.sportEmoji + " " : ""}{activity.name}</CardTitle>
        <div className="flex w-full items-center gap-[5px]">
          <StatusPill cols={{ ...statusColors("completed"), label: "Activité" }} />
          <span className="flex-1" />
          {activity.intensity != null && (
            <span className={cn(MINI, "text-agon-tx3")}>RPE {activity.intensity}</span>
          )}
          {hasDetail && (open ? <ChevronUp size={9} color={C.tx3} /> : <ChevronDown size={9} color={C.tx3} />)}
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-[3px] border-t border-agon-brd px-[7px] py-[5px]">
          {activity.duration != null && (
            <div className="text-[9px] text-agon-tx2">{activity.duration} min</div>
          )}
          {activity.intensity != null && (
            <div className="text-[9px] text-agon-tx2">RPE {activity.intensity}/10</div>
          )}
          {activity.note && (
            <div className="text-[8px] italic text-agon-tx3">{activity.note}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workout detail modal ──────────────────────────────────────────────────────

const SET_ROW = "mb-[3px] flex items-center gap-2 rounded-[7px] border px-2 py-[5px]";
const SET_NUM = "min-w-[22px] text-[11px] font-bold text-agon-tx3";
const SET_KG = "text-[12px] font-bold text-agon-tx";
const SET_REPS = "text-[12px] text-agon-tx";
const SET_RIR = "text-[11px] text-agon-tx3";
const BLOCK_LABEL = "text-[9px] font-extrabold uppercase tracking-[0.5px]";
const METHOD_CHIP = "bg-agon-accent/[0.12] py-px text-[8px] font-semibold text-agon-accent";

/** Forme déclarée /5 : vert à partir de 4, orange à 3, rouge en dessous. */
const formeTone = (f: number) =>
  f >= 4 ? "bg-agon-succes/10 text-agon-succes" : f >= 3 ? "bg-agon-alerte/10 text-agon-alerte" : "bg-agon-erreur/10 text-agon-erreur";

function WorkoutDetailModal({ workout, prevWorkout, onClose }: { workout: DayWorkout; prevWorkout?: DayWorkout | null; onClose: () => void }) {
  const exIds = [...new Set([
    ...workout.planned_exercises.map((p) => p.exercise_id),
    ...workout.performed_exercises.map((p) => p.exercise_id),
  ])];

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-black/65" />
      <div className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[85vh] animate-[slideUp_200ms_ease-out] flex-col rounded-t-[6px] border border-b-0 border-agon-brd bg-agon-s1">
        <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5">
          <div className="h-1 w-9 rounded-[2px] bg-agon-brd-l" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-agon-brd px-[18px] pb-3 pt-2.5">
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-agon-tx">{workout.session_name}</div>
            <div className="mt-[3px] flex gap-2 text-[10px] text-agon-tx3">
              {workout.status === "completed" && <span className="font-bold text-agon-succes">Terminée</span>}
              {workout.duration_s != null && <span>{Math.round(workout.duration_s / 60)} min</span>}
              {workout.rpe_score != null && <span>RPE {workout.rpe_score}</span>}
            </div>
          </div>
          <button onClick={onClose} className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-agon-brd-l bg-transparent text-agon-tx3">
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] pb-5 pt-3.5">
          {/* Notes */}
          {workout.notes && (
            <div className="rounded-[4px] border border-agon-brd bg-agon-s2 px-3 py-2 text-[11px] text-agon-tx2 leading-normal">
              <span className="mb-[3px] block text-[9px] font-bold uppercase text-agon-tx3">Notes</span>
              {workout.notes}
            </div>
          )}

          {/* Athlete session comment + forme */}
          {(workout.athlete_forme != null || workout.athlete_session_comment) && (
            <div className="flex flex-col gap-1 rounded-[4px] border border-agon-alerte/20 bg-agon-alerte/[0.08] px-3 py-2">
              {workout.athlete_forme != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase text-agon-alerte">Forme athlète</span>
                  <span className={cn("rounded-[5px] px-1.5 py-px text-[11px] font-bold", formeTone(workout.athlete_forme))}>
                    {workout.athlete_forme}/5
                  </span>
                </div>
              )}
              {workout.athlete_session_comment && (
                <div className="text-[11px] italic text-agon-tx2">« {workout.athlete_session_comment} »</div>
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
              <div key={exId} className="rounded-[4px] border border-agon-brd bg-agon-s2 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-[12px] font-bold text-agon-tx">{name}</span>
                  {planned?.method && (
                    <span className={cn("rounded-[4px] px-[5px]", METHOD_CHIP)}>
                      {planned.method}
                    </span>
                  )}
                  {!planned && performed && (
                    <span className="rounded-[4px] bg-agon-accent-doux px-[5px] py-px text-[8px] font-semibold text-agon-accent">
                      Ajouté
                    </span>
                  )}
                </div>

                {/* Planned — chip style */}
                {planned && planned.sets > 0 && (
                  <div className="mb-2">
                    <div className={cn(BLOCK_LABEL, "mb-[5px] text-agon-accent")}>Prévu</div>
                    <div className="flex flex-wrap gap-[5px]">
                      {[
                        { l: "Séries", v: String(planned.sets) },
                        { l: planned.is_iso ? "Durée" : "Reps", v: planned.reps_range ?? "—" },
                        ...(planned.kg != null ? [{ l: "Charge", v: `${planned.kg}kg` }] : []),
                        ...(planned.rir != null ? [{ l: "RIR", v: String(planned.rir) }] : []),
                      ].map(({ l, v }) => (
                        <div key={l} className="flex flex-col gap-px rounded-[6px] border border-agon-brd-l bg-agon-s1 px-2 py-1">
                          <span className="text-[7px] font-bold uppercase tracking-[0.3px] text-agon-tx3">{l}</span>
                          <span className="text-[10px] font-bold text-agon-tx">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performed sets — colored rows */}
                {performed && performed.sets.length > 0 ? (
                  <div>
                    <div className={cn(BLOCK_LABEL, "mb-1 text-agon-succes")}>
                      Réalisé ({performed.sets.length} série{performed.sets.length > 1 ? "s" : ""})
                    </div>
                    {performed.sets.map((s) => {
                      if (!s.done) {
                        const hasData = s.kg != null || s.reps != null;
                        return (
                          <div key={s.set_num} className={cn(SET_ROW, "border-agon-erreur/40 bg-agon-erreur/10")}>
                            <span className={SET_NUM}>S{s.set_num}</span>
                            {hasData ? (
                              <>
                                {s.kg != null && <span className={SET_KG}>{s.kg} kg</span>}
                                {s.reps != null && <span className={SET_REPS}>× {s.reps}</span>}
                                {s.rir != null && <span className={SET_RIR}>RIR {s.rir}</span>}
                                <span className="ml-auto text-[12px] font-bold text-agon-erreur">✗</span>
                              </>
                            ) : (
                              <span className="text-[11px] text-agon-erreur">Non réalisé</span>
                            )}
                          </div>
                        );
                      }
                      const ok = plannedMinReps === undefined || (s.reps != null && s.reps >= plannedMinReps);
                      return (
                        <div key={s.set_num} className={cn(SET_ROW, ok ? "border-agon-succes/25 bg-agon-succes/10" : "border-agon-alerte/25 bg-agon-alerte/10")}>
                          <span className={SET_NUM}>S{s.set_num}</span>
                          {s.kg != null && <span className={SET_KG}>{s.kg} kg</span>}
                          {s.reps != null && <span className={SET_REPS}>× {s.reps}</span>}
                          {s.rir != null && <span className={SET_RIR}>RIR {s.rir}</span>}
                          {s.method && <span className={cn("rounded-[3px] px-1", METHOD_CHIP)}>{s.method}</span>}
                          <span className={cn("ml-auto text-[12px] font-bold", ok ? "text-agon-succes" : "text-agon-alerte")}>{ok ? "✓" : "~"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[7px] border border-agon-erreur/40 bg-agon-erreur/10 px-2.5 py-[7px] text-[11px] font-semibold text-agon-erreur">
                    Aucune série enregistrée
                  </div>
                )}

                {/* S-1 comparison */}
                {prevEx && prevEx.sets.length > 0 && (
                  <div className="mt-1.5">
                    <div className={cn(BLOCK_LABEL, "mb-[3px] text-agon-tx3")}>S-1</div>
                    <div className="rounded-[6px] border border-agon-brd-l bg-agon-s1 px-2 py-[5px]">
                      {prevEx.sets.map((s) => (
                        <div key={s.set_num} className="flex items-center gap-2 py-px text-[11px] text-agon-tx3">
                          <span className="min-w-[22px] text-[10px] font-semibold">S{s.set_num}</span>
                          {s.kg != null && <span>{s.kg} kg</span>}
                          {s.reps != null && <span>× {s.reps}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Athlete comment on exercise */}
                {workout.athlete_exercise_comments?.[exId] && (
                  <div className="mt-1.5 rounded-[5px] border border-agon-alerte/30 bg-agon-alerte/10 px-2 py-[5px] text-[10px] italic text-agon-tx2">
                    {workout.athlete_exercise_comments[exId]}
                  </div>
                )}

                {/* Coach comment */}
                {comment && (
                  <div className="mt-1.5 rounded-[5px] bg-agon-accent-doux px-2 py-[5px] text-[10px] text-agon-accent">
                    {comment.comment}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="p-5 text-center text-[11px] italic text-agon-tx3">
              Aucun exercice enregistré
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DayColumn({ date, workouts, energy, tests, wellness, previousWorkouts, rescheduledWorkoutIds, rescheduledEnergyIds, freeActivities = [], athleteId }: DayColumnProps) {
  const today    = isToday(parseISO(date));
  const dayLabel = format(parseISO(date), "EEE", { locale: fr });
  const dayNum   = format(parseISO(date), "d");
  const [showWellness, setShowWellness] = useState(false);
  const [detailWorkout, setDetailWorkout] = useState<DayWorkout | null>(null);
  const [evolutionWorkout, setEvolutionWorkout] = useState<DayWorkout | null>(null);

  return (
    <>
      <div className={cn("flex min-h-[262px] min-w-[120px] flex-col overflow-hidden rounded-[12px] border bg-agon-s1", today ? "border-agon-accent" : "border-agon-sable/[0.12]")}>
        {/* En-tête : filet de la couleur du wellness du jour */}
        <div className="relative flex items-baseline gap-2 border-b border-agon-brd px-3 pb-2.5 pt-3.5">
          {(wellness || today) && (
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: today ? C.ac : getReco(wellnessView(wellness!).score ?? 0).c }} />
          )}
          <span className={cn("agon-mono text-[11px] uppercase tracking-[0.1em]", today ? "text-agon-accent" : "text-agon-tx3")}>
            {dayLabel}
          </span>
          <span className={cn("agon-mono text-[22px] leading-none", today ? "text-agon-accent" : "text-agon-tx")}>
            {dayNum}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-1.5 p-2">

          {/* Wellness */}
          {wellness ? (
            <WellnessBlock wellness={wellness} onClick={() => setShowWellness(true)} />
          ) : (
            <div className="py-[5px] text-center">
              <div className="mx-auto mb-[3px] size-2 rounded-full bg-agon-brd" />
              <span className="text-[8px] text-agon-tx3">—</span>
            </div>
          )}

          {/* Workouts */}
          {workouts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {workouts.map(w => (
                <WorkoutRow
                  key={w.id}
                  workout={w}
                  prevWorkout={previousWorkouts?.find(pw => pw.session_name === w.session_name) ?? null}
                  isRescheduled={rescheduledWorkoutIds?.has(w.id)}
                  onShowDetail={() => setDetailWorkout(w)}
                  onOpenEvolution={athleteId && w.session_id ? () => setEvolutionWorkout(w) : undefined}
                />
              ))}
            </div>
          )}

          {/* Energy sessions */}
          {energy.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {energy.map(e => (
                <EnergyRow key={e.id} session={e} isRescheduled={rescheduledEnergyIds?.has(e.id)} />
              ))}
            </div>
          )}

          {/* Tests */}
          {tests.length > 0 && (
            <div className="flex flex-col gap-1">
              {tests.map(t => (
                <TestRow key={t.id} test={t} />
              ))}
            </div>
          )}

          {/* Free activities */}
          {freeActivities.length > 0 && (
            <div className="flex flex-col gap-1">
              {freeActivities.map((f) => (
                <FreeActivityRow key={f.id} activity={f} />
              ))}
            </div>
          )}

          {/* Rest day */}
          {workouts.length === 0 && energy.length === 0 && tests.length === 0 && freeActivities.length === 0 && !wellness && (
            <div className="flex flex-1 items-center justify-center">
              <span className="agon-mono rounded-full border border-agon-brd-l bg-agon-s2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-agon-tx2">Repos</span>
            </div>
          )}
        </div>
      </div>

      {/* Wellness detail overlay */}
      {showWellness && wellness && (
        <DayDetailPanel date={date} wellness={wellness} onClose={() => setShowWellness(false)} />
      )}

      {/* Vue évolutive : Prévu / Réalisé / Séance +1 */}
      {evolutionWorkout && athleteId && evolutionWorkout.session_id && (
        <SessionEvolutionDrawer
          athleteId={athleteId}
          sessionId={evolutionWorkout.session_id}
          occurrence={evolutionWorkout.occurrence ?? 1}
          onClose={() => setEvolutionWorkout(null)}
        />
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
