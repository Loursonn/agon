import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trophy, X, Zap } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import { MONO, DISPLAY } from "@/features/shared/components/seance/seanceUi";
import { ProgramSessionCard } from "@/features/athlete/components/program/ProgramSessionCard";
import { cn } from "@/lib/utils";
import { ProgramHeader } from "@/features/athlete/components/program/ProgramHeader";
import { ProgramSkeleton } from "@/features/athlete/components/program/ProgramSkeleton";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { DayThemePill } from "@/features/shared/components/DayThemePill";
import { dayThemeFullLabel, indexDayThemesByDate, isDayThemeEmpty, type DayThemeLike } from "@/lib/dayTheme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useRescheduleWorkout } from "@/features/shared/hooks/useRescheduleWorkout";
import { formatReps, hasIso, isAllIso } from "@/lib/formatSetsReps";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { SessionPreviewModal, ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/SessionPreviewModal";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { invalidateEnergy, moveEnergyAssignment, reopenEnergyAssignment, restEnergyAssignment } from "@/api/energy";
import { RescheduleSheet } from "@/features/athlete/components/program/RescheduleSheet";
import { invalidateWorkouts, restWorkoutByAthlete } from "@/api/workouts";
import { useCompleteEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignments";
import { formatS, formatTarget, formatExerciseStep } from "@/lib/energy/formatTarget";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import { TestEntryPage } from "@/features/athlete/components/TestEntryPage";
import { CompetitionDayCard } from "@/features/athlete/components/CompetitionDayCard";
import { CompetitionFormModal } from "@/features/coach/components/planning/CompetitionFormModal";
import type { ActiveMesocycle, PastCycle, WeekDay, WeekSession, TestBrief } from "@/features/shared/hooks/useActivePlan";
import type { EnergyStep, EnergySessionRow } from "@/types/energy";
import type { FreeSession } from "@/features/shared/types/athlete";
import { formatClusterReps } from "@/features/coach/components/programmation/clusterFormat";
import { FreeActivityModal, SPORTS } from "@/features/athlete/components/FreeActivityModal";
import { AthleteFichesView } from "@/features/athlete/components/fiches/AthleteFichesView";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";
import { groupScheduleByDate, useDocSchedule, type ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { DayFiches } from "@/features/shared/components/fiches/DayFiches";
import { WatchCard } from "@/features/shared/components/planning/WatchCard";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import { watchCardsOfDay } from "@/lib/planningCard";
import type { PlannedVsDoneDay } from "@/lib/plannedVsDone";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEK_NAV_BTN = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-agon-brd-l bg-agon-s2 text-agon-tx";
const MONTHS_FR    = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];

const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function haptic() { if (navigator.vibrate) navigator.vibrate(10); }


// ── Energy active session — interactive step validation ───────────────────────

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

// ── Per-step state ────────────────────────────────────────────────────────────

type StepStatus = "done" | "partial";
interface StepState { status: StepStatus; comment: string; }

// ── Step card (done / partial + comment) ──────────────────────────────────────

function StepCheckRow({
  step, state, vma, onDone, onPartial, onComment,
}: {
  step: EnergyStep;
  state: StepState | undefined;
  vma?: number | null;
  onDone: () => void;
  onPartial: () => void;
  onComment: (v: string) => void;
}) {
  const status    = state?.status;
  const isDone    = status === "done";
  const isPartial = status === "partial";
  const comment   = state?.comment ?? "";
  const bg        = isDone ? C.g + "18" : isPartial ? "#F59E0B18" : C.s2;
  const borderCol = isDone ? C.g + "40" : isPartial ? "#F59E0B50" : "transparent";

  // ── shared step-info block ──────────────────────────────────────────────────
  let infoNode: React.ReactNode;
  if (step.type === "interval") {
    const rc  = ROLE_COLOR[step.role] ?? "#6B7280";
    const dur = step.duration.kind === "time"
      ? formatS(step.duration.value ?? 0)
      : step.duration.kind === "distance"
      ? `${step.duration.value ?? 0} m`
      : step.duration.kind === "calories"
      ? `${step.duration.value ?? 0} kcal`
      : "Lap";
    const tgt = formatTarget(step.target);
    infoNode = (
      <>
        <div style={{ width: 3, height: 34, borderRadius: 2, background: rc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: rc }}>{ROLE_LABEL_FR[step.role] ?? step.role}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{dur}</span>
          </div>
          {tgt && tgt !== "Libre" && (
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{tgt}</div>
          )}
          <PaceEquivalents
            target={step.target}
            repDistanceM={stepDistanceM(step.duration)}
            vma={vma}
            omitPrimary
            fontSize={9}
          />
          {step.equipment && step.equipment !== "none" && (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: C.tx2 }}>
                {EQUIPMENT_LABEL[step.equipment] ?? step.equipment}
              </span>
            </div>
          )}
          {step.notes && (
            <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginTop: 1 }}>{step.notes}</div>
          )}
        </div>
      </>
    );
  } else if (step.type === "exercise") {
    // Step exercice (séance spécifique / MetCon) : pas de `children` ni de `repeat`.
    // Sans cette branche, on tombait dans le cas "groupe" → step.children undefined → crash.
    const rc = ROLE_COLOR[step.role] ?? "#6B7280";
    const detail = formatExerciseStep(step);
    infoNode = (
      <>
        <div style={{ width: 3, height: 34, borderRadius: 2, background: rc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {step.exercise_name}
          </div>
          {detail && <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{detail}</div>}
          {step.notes && (
            <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginTop: 1 }}>{step.notes}</div>
          )}
        </div>
      </>
    );
  } else {
    const previewChildren = (step.children ?? [])
      .filter((c): c is Extract<EnergyStep, { type: "interval" }> => c.type === "interval")
      .slice(0, 3);
    const childSummary = previewChildren.map(c =>
      c.duration.kind === "time" ? formatS(c.duration.value ?? 0) : `${c.duration.value ?? 0}m`
    ).join(" + ");
    infoNode = (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.b }}>× {step.repeat}</span>
          <span style={{ fontSize: 10, color: C.tx3 }}>répétitions</span>
        </div>
        {childSummary && (
          <div style={{ fontSize: 10, color: C.tx2, marginTop: 1 }}>
            {childSummary}{(step.children?.length ?? 0) > 3 ? " …" : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 6, background: bg, border: "1px solid " + borderCol, overflow: "hidden" }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        {infoNode}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {/* ✓ Fait */}
          <button
            onClick={onDone}
            title="Bloc fait"
            style={{
              width: 32, height: 32, borderRadius: 4, border: "none",
              background: isDone ? C.g : "rgba(255,255,255,0.07)",
              color: isDone ? "#fff" : C.tx3,
              cursor: "pointer", fontFamily: "inherit", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}
          >✓</button>

          {/* ~ Incomplet */}
          <button
            onClick={onPartial}
            title="Bloc non terminé"
            style={{
              width: 32, height: 32, borderRadius: 4, border: "none",
              background: isPartial ? "#F59E0B" : "rgba(255,255,255,0.07)",
              color: isPartial ? "#fff" : C.tx3,
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}
          >~</button>
        </div>
      </div>

      {/* Comment — mandatory when partial */}
      {isPartial && (
        <div style={{ padding: "0 14px 12px" }}>
          <input
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="Commentaire obligatoire…"
            autoFocus
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 4,
              border: "1.5px solid " + (comment.trim() ? C.brdL : "#F59E0B80"),
              background: "rgba(245,158,11,0.06)",
              color: C.tx, fontSize: 12, fontFamily: "inherit",
              boxSizing: "border-box" as const, outline: "none",
            }}
          />
          {!comment.trim() && (
            <div style={{ fontSize: 9, color: "#F59E0B", marginTop: 3 }}>
              Requis avant de terminer la séance
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnergyActiveSession({
  session, athleteId, onTerminate, onClose,
}: {
  session: EnergySessionRow;
  athleteId: string;
  onTerminate: (log: Map<string, StepState>) => void;
  onClose: () => void;
}) {
  const steps = session.intervals ?? [];
  const [stepStates, setStepStates] = useState<Map<string, StepState>>(new Map());
  const { data: refs } = useAthleteReferences(athleteId);
  const vma = refs?.VMA ?? null;

  const kc = session.session_kind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie;

  function setStatus(id: string, status: StepStatus) {
    setStepStates(prev => {
      const n = new Map(prev);
      const cur = n.get(id);
      // Toggle: same status → remove (back to pending)
      if (cur?.status === status) { n.delete(id); }
      else { n.set(id, { status, comment: cur?.comment ?? "" }); }
      return n;
    });
  }
  function setComment(id: string, comment: string) {
    setStepStates(prev => {
      const n = new Map(prev);
      const cur = n.get(id);
      if (cur) n.set(id, { ...cur, comment });
      return n;
    });
  }

  const validatedCount = stepStates.size;
  const total          = steps.length;
  const hasUnsavedPartial = Array.from(stepStates.values()).some(
    s => s.status === "partial" && !s.comment.trim()
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.7)" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: C.s1, borderRadius: "6px 6px 0 0", border: "1px solid " + C.brd,
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: kc + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={14} color={kc} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session.name}
            </div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
              {validatedCount}/{total} blocs validés · En cours…
            </div>
            {session.notes && (
              <div style={{ fontSize: 11, color: C.tx2, marginTop: 4, fontStyle: "italic", whiteSpace: "pre-line" }}>
                {session.notes}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ height: "100%", background: C.g, width: total > 0 ? `${(validatedCount / total) * 100}%` : "0%", transition: "width 0.3s ease", borderRadius: "0 2px 2px 0" }} />
        </div>

        {/* Steps */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step, i) => {
            const id = step.id ?? String(i);
            return (
              <StepCheckRow
                key={id}
                step={step}
                state={stepStates.get(id)}
                vma={vma}
                onDone={() => setStatus(id, "done")}
                onPartial={() => setStatus(id, "partial")}
                onComment={(v) => setComment(id, v)}
              />
            );
          })}
        </div>

        {/* Terminer */}
        <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
          {hasUnsavedPartial && (
            <div style={{ fontSize: 11, color: "#F59E0B", textAlign: "center", marginBottom: 8 }}>
              Remplis les commentaires des blocs non terminés
            </div>
          )}
          <button
            onClick={() => onTerminate(stepStates)}
            disabled={hasUnsavedPartial}
            style={{
              width: "100%", padding: "16px 0", borderRadius: 6, border: "none",
              background: hasUnsavedPartial ? C.s2 : C.g,
              color: hasUnsavedPartial ? C.tx3 : "#fff",
              fontSize: 15, fontWeight: 800,
              cursor: hasUnsavedPartial ? "default" : "pointer",
              fontFamily: "inherit",
              boxShadow: hasUnsavedPartial ? "none" : "0 4px 20px rgba(16,185,129,0.35)",
              transition: "all 0.2s ease",
            }}
          >
            Terminer la séance ✓
          </button>
        </div>
      </div>
    </>
  );
}

// ── Energy preview overlay ────────────────────────────────────────────────────

function EnergyPreviewOverlay({
  energySessionId, assignmentId, scheduledDate, initialStatus, today,
  athleteId, onClose,
  onRescheduleToToday, onComplete, onCancel,
}: {
  energySessionId: string;
  assignmentId: string;
  scheduledDate: string;
  initialStatus: string;
  today: string;
  athleteId: string;
  onClose: () => void;
  onRescheduleToToday: () => void;
  onComplete: (log: Map<string, StepState>) => void;
  onCancel: () => void;
}) {
  const { data: session, isLoading, isError } = useEnergySession(energySessionId);
  const [isNowToday,    setIsNowToday]    = useState(scheduledDate === today);
  const [sessionActive, setSessionActive] = useState(false);

  if (!energySessionId || isError || (!isLoading && !session)) return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%,-50%)", width: 420, maxWidth: "96vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: 40, textAlign: "center", color: C.tx3, fontSize: 13,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <span>Séance introuvable</span>
        <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
      </div>
    </>
  );
  if (isLoading) return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%,-50%)", width: 420, maxWidth: "96vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: 40, textAlign: "center", color: C.tx3, fontSize: 13,
      }}>Chargement…</div>
    </>
  );
  if (!session) return null;
  void assignmentId;

  const isCompleted = initialStatus === "completed";

  // — Active mode: interactive step-by-step validation —
  if (sessionActive) {
    return (
      <EnergyActiveSession
        session={session}
        athleteId={athleteId}
        onTerminate={(log) => onComplete(log)}
        onClose={onClose}
      />
    );
  }

  // — Preview mode —
  const startLabel = !isCompleted
    ? (isNowToday ? "Faire la séance ▶" : "Faire la séance aujourd'hui")
    : undefined;

  const onStartFn = !isCompleted
    ? isNowToday
      ? () => setSessionActive(true)
      : () => { onRescheduleToToday(); setIsNowToday(true); }
    : undefined;

  return (
    <SessionPreviewModal
      session={session}
      athleteId={athleteId}
      onClose={onClose}
      onStart={onStartFn}
      startLabel={startLabel}
      onCancel={isCompleted ? onCancel : undefined}
    />
  );
}

// ── Plan actif card ───────────────────────────────────────────────────────────

function ActivePlanCard({ meso }: { meso: ActiveMesocycle }) {
  const total = Math.max(1, meso.totalWeeks);
  return (
    <div style={{ borderRadius: 14, border: "1px solid " + C.brd, background: C.s1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>Plan actif</div>
          <div style={{ fontSize: 14, color: C.tx, marginTop: 2 }}>{meso.name}</div>
          {(meso.macroName || meso.objective) && (
            <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{[meso.macroName, meso.objective].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <span style={{ ...MONO, fontSize: 13, color: C.tx, flex: "none" }}>
          S{meso.currentWeek} <span style={{ color: C.tx3 }}>/ {meso.totalWeeks}</span>
        </span>
      </div>
      <div aria-label={`Semaine ${meso.currentWeek} sur ${meso.totalWeeks}`} style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(total, 24)}, 1fr)`, gap: 4 }}>
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <span key={i} style={{ height: 4, borderRadius: 2, background: i + 1 < meso.currentWeek ? C.ac : i + 1 === meso.currentWeek ? "rgba(255,201,51,0.5)" : "rgba(231,211,168,0.12)" }} />
        ))}
      </div>
      <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>
        {meso.completionPct} % des séances faites{meso.frequency != null ? ` · ${meso.frequency} par semaine` : ""}
      </div>
    </div>
  );
}

// ── Past cycle card (historique athlète) ───────────────────────────────────────

function fmtShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

function PastCycleCard({ cycle }: { cycle: PastCycle }) {
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cycle.name}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
          {fmtShort(cycle.startDate)} → {fmtShort(cycle.endDate)} · {cycle.totalWeeks} sem.
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: cycle.completionPct >= 80 ? C.g : C.tx2 }}>
          {cycle.completionPct}%
        </div>
        <div style={{ fontSize: 9, color: C.tx3 }}>{cycle.completedLogs}/{cycle.totalLogs} séances</div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOW_SHORT_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── Reschedule drawer ─────────────────────────────────────────────────────────

/** Séance ratée : manquée, ou prévue un jour passé (le cron ne l'a pas encore marquée). */
function isMissedWeekSession(s: WeekSession, today: string): boolean {
  return s.status === "missed" || (s.status === "planned" && s.scheduledDate < today);
}

// ── Workout preview drawer ────────────────────────────────────────────────────


function WorkoutPreviewDrawer({
  session,
  today,
  onStart,
  onReschedule,
  onClose,
}: {
  session: WeekSession;
  today: string;
  onStart?: () => void;
  onReschedule: () => void;
  onClose: () => void;
}) {
  const workout = useWorkoutSession(session.id);
  const isPast = session.scheduledDate < today;
  const canMove = !isPast || isMissedWeekSession(session, today);

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: 0, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px", flexShrink: 0 }}>
          <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {session.sessionName}
          </DrawerTitle>
        </DrawerHeader>

        {/* Blocs — scrollable */}
        {workout.isLoading ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: C.tx3, fontSize: 12 }}>
            Chargement…
          </div>
        ) : workout.blocs.length > 0 ? (
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0 16px" }}>
            {workout.blocs.map((bloc, blocIdx) => (
              <div key={bloc.id} style={{ marginBottom: 14 }}>
                {/* Bloc header */}
                <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Bloc {String.fromCharCode(65 + blocIdx)}{bloc.name ? " — " + bloc.name : ""}
                </div>
                <div style={{ background: C.s2, borderRadius: 6, overflow: "hidden" }}>
                  {bloc.exercices.map((ex, idx) => {
                    // Superset : chaîne d'exercices liés (superset_with_next), comme en séance
                    const prevLinked = idx > 0 && !!bloc.exercices[idx - 1].superset_with_next;
                    const inSuperset = prevLinked || !!ex.superset_with_next;
                    let chainLen = 0;
                    if (inSuperset && !prevLinked) {
                      chainLen = 1;
                      while (bloc.exercices[idx + chainLen - 1]?.superset_with_next && bloc.exercices[idx + chainLen]) chainLen++;
                    }
                    const nb = ex.params?.nb_series ?? 0;
                    const reps = ex.params?.cluster
                      ? formatClusterReps(ex.params.cluster)
                      : ex.params?.reps?.mode === "global" ? ex.params.reps.value : "?";
                    const rir = ex.params?.rir?.mode === "global" ? ex.params.rir.value : null;
                    const tempo = ex.params?.tempo?.mode === "global" && ex.params.tempo.value ? ex.params.tempo.value : null;
                    return (
                      <div key={ex.id}>
                      {chainLen > 1 && (
                        <div style={{
                          padding: "6px 14px 0", borderTop: idx > 0 ? "1px solid " + C.brd : "none",
                          borderLeft: "3px solid #F5A623",
                          fontSize: 9, fontWeight: 800, color: "#F5A623", letterSpacing: "0.5px",
                        }}>
                          SUPERSET ×{chainLen} · ENCHAÎNÉS SANS REPOS
                        </div>
                      )}
                      <div
                        style={{
                          padding: "10px 14px",
                          borderTop: idx > 0 && !prevLinked && chainLen <= 1 ? "1px solid " + C.brd : "none",
                          borderLeft: inSuperset ? "3px solid #F5A623" : "3px solid transparent",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          background: C.ac + "20", color: C.ac,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800,
                        }}>
                          {String.fromCharCode(65 + blocIdx)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, display: "block" }}>
                            {ex.exercise_name}
                          </span>
                          <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: C.tx3 }}>{nb} séries × {ex.params ? formatReps(ex.params) : reps}{ex.params?.cluster || isAllIso(ex.params) ? "" : " reps"}{hasIso(ex.params) ? " · Iso" : ""}</span>
                            {rir != null && (
                              <span style={{ fontSize: 10, color: C.tx3 }}>· RIR {rir}</span>
                            )}
                            {tempo && (
                              <span style={{ fontSize: 10, color: C.tx3 }}>· T {tempo}</span>
                            )}
                          </div>
                        </div>
                        {ex.superset_with_next && bloc.exercices[idx + 1] && (
                          <span title="Lié à l'exercice suivant" style={{ fontSize: 12, color: "#F5A623", flexShrink: 0 }}>↓</span>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Actions — sticky */}
        <div style={{ padding: "12px 16px 24px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {onStart && (
            <button
              onClick={onStart}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 6, border: "none",
                background: C.acV, color: "#0E0C0A",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 44,
              }}
            >
              Démarrer la séance ▶
            </button>
          )}

          {canMove && (
            <button
              onClick={onReschedule}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 6,
                border: "1px solid " + C.brd, background: "transparent",
                color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Déplacer à une autre date
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Session chip (within a day) ───────────────────────────────────────────────

function SessionChip({
  session,
  today,
  onPress,
  onReschedule,
  onStart,
}: {
  session: WeekSession;
  today: string;
  onPress: (s: WeekSession) => void;
  onReschedule?: (s: WeekSession) => void;
  /** Jour même, séance de musculation à faire : démarre directement. */
  onStart?: (s: WeekSession) => void;
}) {
  const isDone   = session.status === "completed";
  const isMissed = isMissedWeekSession(session, today);
  const hyrox    = session.kind === "energy" && session.sessionKind === "specifique";
  const color    = session.kind === "workout" ? TYPE_COLOR.muscu : hyrox ? TYPE_COLOR.hyrox : TYPE_COLOR.energie;
  const typeLabel = session.kind === "workout"
    ? TYPE_LABEL.muscu
    : hyrox ? TYPE_LABEL.hyrox : (ENERGY_KIND_LABEL[session.sessionKind ?? ""] ?? TYPE_LABEL.energie);
  const moved = session.rescheduledByAthlete && session.originalScheduledDate && !isDone
    ? `Déplacée du ${DOW_SHORT_FR[(new Date(session.originalScheduledDate + "T12:00:00").getDay() + 6) % 7].toLowerCase()}.`
    : null;
  const isToday = session.scheduledDate === today;
  const canAct = !isDone && !isMissed;

  return (
    <ProgramSessionCard
      color={color}
      typeLabel={typeLabel}
      title={session.sessionName}
      done={isDone}
      muted={isMissed}
      status={isMissed ? "Manquée" : moved}
      statusColor={isMissed ? C.tx3 : TYPE_COLOR.hyrox}
      highlight={isToday && canAct}
      onPress={() => { haptic(); onPress(session); }}
      onStart={canAct && isToday && session.kind === "workout" && onStart ? () => { haptic(); onStart(session); } : undefined}
      onMenu={(canAct || isMissed) && onReschedule ? () => { haptic(); onReschedule(session); } : undefined}
    />
  );
}

// ── Test chip ─────────────────────────────────────────────────────────────────

function TestChip({ test, onPress }: { test: TestBrief; onPress: (id: string) => void }) {
  return (
    <ProgramSessionCard
      color={TYPE_COLOR.test}
      typeLabel={test.type === "biometric" ? "Biométrie" : TYPE_LABEL.test}
      title={test.title}
      done={test.completed}
      onPress={() => { haptic(); onPress(test.id); }}
    />
  );
}

// ── Day row ───────────────────────────────────────────────────────────────────

function FreeActivityChip({ activity, onPress }: { activity: FreeSession; onPress: (f: FreeSession) => void }) {
  const sportMeta = SPORTS.find(s => s.key === activity.sport);
  const detail = [
    activity.duration ? `${activity.duration} min` : null,
    activity.distance_km ? `${String(activity.distance_km).replace(".", ",")} km` : null,
  ].filter(Boolean).join(" · ");
  return (
    <ProgramSessionCard
      color={TYPE_COLOR.libre}
      typeLabel={sportMeta?.label ?? activity.sport ?? TYPE_LABEL.libre}
      title={activity.name}
      done
      status={detail || undefined}
      onPress={() => { haptic(); onPress(activity); }}
    />
  );
}

function DayRow({
  day, today, onSessionPress, onReschedule, onStart, onTestPress,
  freeActivities, onAddActivity, onEditActivity, onAddCompetition, viewOnly,
  dayTheme, dayFiches = [], watch, vertical = false,
}: {
  day: WeekDay;
  today: string;
  onSessionPress: (s: WeekSession) => void;
  onReschedule: (s: WeekSession) => void;
  onStart?: (s: WeekSession) => void;
  onTestPress: (id: string) => void;
  freeActivities: FreeSession[];
  onAddActivity: (date: string) => void;
  onEditActivity: (f: FreeSession) => void;
  /** null = l'athlète n'a pas de coach (compétition impossible à rattacher) */
  onAddCompetition: ((date: string) => void) | null;
  viewOnly: boolean;
  dayTheme?: DayThemeLike | null;
  /** Fiches posées sur ce jour par un pro du staff ou le coach */
  dayFiches?: ScheduledDoc[];
  /** Montre (P34) : prévu / réalisé / libre du jour. */
  watch?: { day: PlannedVsDoneDay | undefined; athleteId: string; now: number };
  /** Ordinateur (planche AthOrdiAProgramme) : une colonne par jour, date en tête. */
  vertical?: boolean;
}) {
  const isToday = day.date === today;
  const isPast  = day.date < today;
  const d       = new Date(day.date + "T12:00:00");
  const dateNum = d.getDate();
  const isCompDay = day.competitions.length > 0;
  // Une séance rattachée à une activité de montre devient sa carte (jamais deux cartes).
  const watchCards = watch ? watchCardsOfDay(watch.day, watch.now) : [];
  const linkedCard = new Map(watchCards.filter((c) => c.planned).map((c) => [`${c.planned!.kind}:${c.planned!.id}`, c]));
  const freeWatch = watchCards.filter((c) => !c.planned);
  const watchCard = (c: (typeof watchCards)[number]) => (
    <WatchCard key={c.key} card={c} day={watch!.day} athleteId={watch!.athleteId} seancePath={(id) => `/athlete/program/activity/${id}`} />
  );
  const [showAdd, setShowAdd] = useState(false);
  const isEmpty = day.sessions.length === 0 && day.tests.length === 0 && freeActivities.length === 0 && dayFiches.length === 0 && freeWatch.length === 0;

  return (
    <div style={vertical
      ? { display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: 8, borderRadius: 14, minHeight: 220, background: isToday ? alpha(C.ac, 0.05) : "transparent", border: `1px solid ${isToday ? alpha(C.ac, 0.45) : C.brd}` }
      : { display: "flex", gap: 10, alignItems: "flex-start" }}>
      {/* Colonne du jour : « Jeu / 5 », pleine en or aujourd'hui ; « + » ouvre l'ajout */}
      <div style={vertical
        ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }
        : { width: 40, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div
          aria-hidden
          style={{
            width: 40, height: 44, borderRadius: 10,
            background: isToday ? C.ac : "transparent",
            color: isToday ? C.bg : isPast ? C.tx3 : C.tx,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          }}
        >
          <span style={{ ...MONO, fontSize: 9.5, color: isToday ? C.bg : C.tx3 }}>{DOW_SHORT_FR[day.dow]}</span>
          <span style={{ ...MONO, fontSize: 16 }}>{dateNum}</span>
        </div>
        {!viewOnly && (
          <button
            type="button"
            aria-expanded={showAdd}
            aria-label={`Ajouter le ${DOW_SHORT_FR[day.dow].toLowerCase()}. ${dateNum} : activité libre ou compétition`}
            onClick={() => { haptic(); setShowAdd((v) => !v); }}
            style={{ width: 28, height: 24, borderRadius: 8, border: "1px solid " + (showAdd ? C.ac : C.brd), background: "transparent", color: showAdd ? C.ac : C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {(isToday || !isDayThemeEmpty(dayTheme)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 16 }}>
            {isToday && <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ac }}>Aujourd’hui</span>}
            {!isDayThemeEmpty(dayTheme) && <DayThemePill theme={dayTheme} title={dayThemeFullLabel(dayTheme)} />}
          </div>
        )}

        {/* Jour de compétition — en tête, séances éventuelles dessous */}
        {isCompDay && day.competitions.map(c => (
          <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
        ))}

        {day.sessions.map(s => {
          const c = linkedCard.get(`${s.kind}:${s.id}`);
          return c ? (
            <div key={s.id}>{watchCard(c)}</div>
          ) : (
            <SessionChip
              key={s.id}
              session={s}
              today={today}
              onPress={onSessionPress}
              onReschedule={viewOnly ? undefined : onReschedule}
              onStart={viewOnly ? undefined : onStart}
            />
          );
        })}

        {day.tests.map(t => <TestChip key={t.id} test={t} onPress={onTestPress} />)}
        {freeActivities.map(f => <FreeActivityChip key={f.id} activity={f} onPress={onEditActivity} />)}
        {freeWatch.map(watchCard)}
        {dayFiches.length > 0 && <DayFiches items={dayFiches} />}

        {isEmpty && !isCompDay && (
          <div style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px dashed rgba(231,211,168,0.16)", display: "flex", alignItems: "center", fontSize: 13, color: C.tx3 }}>
            Repos
          </div>
        )}

        {!viewOnly && showAdd && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { haptic(); setShowAdd(false); onAddActivity(day.date); }}
              style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, border: "1px dashed " + C.brdL, background: "none", color: C.tx2, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
            >
              <Plus size={12} /> Activité libre
            </button>
            {onAddCompetition && !isCompDay && (
              <button
                type="button"
                onClick={() => { haptic(); setShowAdd(false); onAddCompetition(day.date); }}
                style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, border: "1px dashed " + TYPE_COLOR.competition + "73", background: "none", color: TYPE_COLOR.competition, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
              >
                <Trophy size={12} /> Compétition
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function localMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function weekLabel(offset: number): string {
  if (offset === 0)  return "Cette semaine";
  if (offset === 1)  return "Semaine prochaine";
  if (offset === -1) return "Semaine dernière";
  return offset > 0 ? `Dans ${offset} semaines` : `Il y a ${-offset} semaines`;
}

function weekRangeLabel(days: WeekDay[]): string {
  if (!days.length) return "";
  return `${fmtShort(days[0].date)} → ${fmtShort(days[days.length - 1].date)}`;
}

function ProgramSessionsView() {
  const isDesktop = useIsDesktop();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { athleteId, viewOnly, freeSessions, setFreeSessions, athleteProfile } = useAthleteContext();
  const { data: athleteCoaches } = useAthleteCoaches(athleteId);
  const myCoachId = athleteProfile?.coach_id ?? null;
  const [weekOffset, setWeekOffset] = useState(0);
  const { data, isLoading, isPlaceholderData } = useActivePlan(athleteId ?? "", weekOffset);

  const [workoutPreview,   setWorkoutPreview]   = useState<WeekSession | null>(null);
  const [energyPreview,    setEnergyPreview]    = useState<{ sessionId: string; assignmentId: string; status: string; scheduledDate: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<WeekSession | null>(null);
  const [testPreviewId,    setTestPreviewId]    = useState<string | null>(null);
  const [activityDate,     setActivityDate]     = useState<string | null>(null);
  const [editActivity,     setEditActivity]     = useState<FreeSession | null>(null);
  const [compDate,         setCompDate]         = useState<string | null>(null);
  const [showPastCycles,   setShowPastCycles]   = useState(false);

  const today         = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, []);
  const weekMondayISO = useMemo(localMonday, []);

  // Thèmes du coach sur la semaine réellement affichée : les bornes viennent de
  // `weekDays`, pas du lundi courant, sinon la navigation ±1 semaine montrerait
  // les thèmes de la semaine en cours sur une autre semaine.
  const weekBounds = useMemo(() => {
    const dates = (data?.weekDays ?? []).map((d) => d.date).sort();
    return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  }, [data?.weekDays]);
  const { data: dayThemeRows = [] } = useDayThemesRange(
    athleteId ?? undefined, weekBounds?.start, weekBounds?.end,
  );
  const dayThemesByDate = useMemo(() => indexDayThemesByDate(dayThemeRows), [dayThemeRows]);
  const { data: watchWeek } = usePlannedVsDone(athleteId ?? undefined, weekBounds?.start, weekBounds?.end);
  const watchByDate = useMemo(() => new Map((watchWeek ?? []).map((d) => [d.date, d])), [watchWeek]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watchNow = useMemo(() => Date.now(), [watchWeek]);
  const { data: scheduledDocs = [] } = useDocSchedule(
    weekBounds ? athleteId : null, weekBounds ?? { start: "", end: "" },
  );
  const fichesByDate = useMemo(() => groupScheduleByDate(scheduledDocs), [scheduledDocs]);
  const weekDone = useMemo(() => {
    const all = (data?.weekDays ?? []).flatMap((d) => d.sessions);
    return { planned: all.length, done: all.filter((x) => x.status === "completed").length };
  }, [data?.weekDays]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const rescheduleWorkout = useRescheduleWorkout();

  const rescheduleEnergy = useMutation({
    mutationFn: async ({ assignmentId, newDate }: { assignmentId: string; newDate: string }) => {
      await moveEnergyAssignment(assignmentId, newDate);
    },
    onSuccess: () => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance déplacée");
      setRescheduleTarget(null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  const rescheduleEnergyToToday = useMutation({
    mutationFn: async (assignmentId: string) => {
      await moveEnergyAssignment(assignmentId, today);
    },
    onSuccess: () => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance déplacée à aujourd'hui");
      setEnergyPreview(prev => prev ? { ...prev, scheduledDate: today } : null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  // Validation : gardée sur le téléphone sans réseau (file hors ligne).
  const completeEnergy = useCompleteEnergyAssignment();

  const cancelEnergy = useMutation({
    mutationFn: async (assignmentId: string) => {
      // Même remise à zéro que depuis l'accueil : blocs cochés et RPE effacés
      await reopenEnergyAssignment(assignmentId);
    },
    onSuccess: () => {
      invalidateSessionStatus(qc, athleteId);
      void invalidateEnergy(qc, athleteId);
      toast.success("Validation annulée");
      setEnergyPreview(null);
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleSessionPress(s: WeekSession) {
    if (s.kind === "energy" && s.energySessionId) {
      setEnergyPreview({ sessionId: s.energySessionId, assignmentId: s.id, status: s.status ?? "planned", scheduledDate: s.scheduledDate });
    } else if (s.kind === "workout") {
      setWorkoutPreview(s);
    }
  }

  const restSession = useMutation({
    mutationFn: async (t: WeekSession) => {
      if (t.kind === "workout") await restWorkoutByAthlete(t.id);
      else await restEnergyAssignment(t.id);
    },
    onSuccess: () => {
      setRescheduleTarget(null);
      if (athleteId) { void invalidateWorkouts(qc, { athleteId }); void invalidateEnergy(qc, athleteId); }
      toast.success("Séance passée en repos");
    },
    onError: () => toast.error("Impossible : la séance a déjà une saisie"),
  });

  function handleRescheduleConfirm(newDate: string, reason?: string) {
    if (!rescheduleTarget) return;
    if (rescheduleTarget.kind === "workout") {
      rescheduleWorkout.mutate(
        { workoutLogId: rescheduleTarget.id, athleteId: athleteId ?? "", currentDate: rescheduleTarget.scheduledDate, newDate, reason, weekMondayISO },
        { onSuccess: () => setRescheduleTarget(null) },
      );
    } else {
      rescheduleEnergy.mutate({ assignmentId: rescheduleTarget.id, newDate });
    }
  }

  const reschedulePending = rescheduleTarget?.kind === "workout"
    ? rescheduleWorkout.isPending
    : rescheduleEnergy.isPending;

  return (
    <div className="mx-auto w-full max-w-[480px] font-ui text-agon-tx lg:max-w-none">
      <ProgramHeader />

      {isLoading ? (
        <ProgramSkeleton />
      ) : (
        // Téléphone : une colonne. PC : rail du plan à gauche, semaine à droite.
        <div className="grid grid-cols-1 gap-agon-xl px-agon-lg pb-8 pt-agon-lg lg:px-0">
          <div className="flex flex-col gap-agon-xl lg:max-w-[420px]">
            {data?.cycle ? (
              <ActivePlanCard meso={data.cycle} />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Aucun cycle en cours"
                description="Tu n'es dans aucun cycle pour le moment. Ton coach programmera la suite."
              />
            )}
          </div>

          <section className="flex flex-col gap-[18px]">
            <div className="flex items-center gap-agon-md">
              <button
                type="button"
                aria-label="Semaine précédente"
                className={WEEK_NAV_BTN}
                onClick={() => { haptic(); setWeekOffset(o => o - 1); }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
                className={cn("min-w-0 flex-1 bg-transparent p-0 text-left", weekOffset === 0 ? "cursor-default" : "cursor-pointer")}
              >
                <div style={{ ...DISPLAY, fontSize: 15, color: C.tx }}>{weekLabel(weekOffset)}</div>
                <div style={{ ...MONO, fontSize: 11, color: C.tx3, marginTop: 2 }}>
                  {weekRangeLabel(data?.weekDays ?? [])}
                  {weekDone.planned > 0 && (
                    <> · <span style={{ color: TYPE_COLOR.fait }}>{weekDone.done}</span> / {weekDone.planned} faites</>
                  )}
                  {weekOffset !== 0 && <span style={{ color: C.ac }}> · revenir à aujourd'hui</span>}
                </div>
              </button>
              <button
                type="button"
                aria-label="Semaine suivante"
                className={WEEK_NAV_BTN}
                onClick={() => { haptic(); setWeekOffset(o => o + 1); }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {!data?.weekDays.length ? (
              <div className="rounded-lg border border-agon-brd bg-agon-s1 px-agon-lg py-agon-xl text-center text-agon-sm text-agon-tx3">
                Aucune séance cette semaine
              </div>
            ) : (
              <div className={cn("flex flex-col gap-[14px] transition-opacity duration-150 lg:grid lg:grid-cols-7 lg:items-stretch lg:gap-2", isPlaceholderData && "opacity-50")}>
                {data.weekDays.map(day => (
                  <DayRow
                    key={day.date}
                    day={day}
                    today={today}
                    onSessionPress={handleSessionPress}
                    onReschedule={setRescheduleTarget}
                    onStart={(s) => navigate("/athlete/program/workout/" + s.id)}
                    onTestPress={(id) => setTestPreviewId(id)}
                    freeActivities={freeSessions.filter(f => f.date === day.date && f.sport)}
                    onAddActivity={setActivityDate}
                    onEditActivity={setEditActivity}
                    onAddCompetition={myCoachId ? setCompDate : null}
                    viewOnly={viewOnly}
                    dayTheme={dayThemesByDate[day.date] ?? null}
                    dayFiches={fichesByDate.get(day.date)}
                    watch={athleteId ? { day: watchByDate.get(day.date), athleteId, now: watchNow } : undefined}
                    vertical={isDesktop}
                  />
                ))}
              </div>
            )}

            {/* Cycles précédents : en bas, repliés */}
            {data?.pastCycles && data.pastCycles.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={showPastCycles}
                  onClick={() => setShowPastCycles((v) => !v)}
                  className="flex h-12 w-full items-center gap-agon-sm bg-transparent px-1 text-left"
                  style={{ fontFamily: "inherit", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 13, color: C.tx2 }}>
                    Cycles précédents <span style={{ ...MONO, color: C.tx3 }}>({data.pastCycles.length})</span>
                  </span>
                  <span style={{ flex: 1 }} />
                  <ChevronRight size={16} color={C.tx3} style={{ transform: showPastCycles ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {showPastCycles && (
                  <div className="flex flex-col gap-agon-sm">
                    {data.pastCycles.map((c) => <PastCycleCard key={c.id} cycle={c} />)}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Workout preview drawer */}
      {workoutPreview && (
        <WorkoutPreviewDrawer
          session={workoutPreview}
          today={today}
          onStart={viewOnly ? undefined : (() => {
            setWorkoutPreview(null);
            navigate("/athlete/program/workout/" + workoutPreview.id);
          })}
          onReschedule={() => { setRescheduleTarget(workoutPreview); setWorkoutPreview(null); }}
          onClose={() => setWorkoutPreview(null)}
        />
      )}

      {/* Energy preview overlay */}
      {energyPreview && (
        <EnergyPreviewOverlay
          energySessionId={energyPreview.sessionId}
          assignmentId={energyPreview.assignmentId}
          scheduledDate={energyPreview.scheduledDate}
          initialStatus={energyPreview.status}
          today={today}
          athleteId={athleteId ?? ""}
          onClose={() => setEnergyPreview(null)}
          onRescheduleToToday={() => rescheduleEnergyToToday.mutate(energyPreview.assignmentId)}
          onComplete={(log) => {
            // Build step log JSON — stored in notes field
            const stepLogNotes: string | null = log.size > 0
              ? JSON.stringify({
                  __type: "step_log_v1",
                  steps: Object.fromEntries(
                    Array.from(log.entries()).map(([k, v]) => [k, { status: v.status, comment: v.comment }])
                  ),
                  session_comment: null,
                })
              : null;
            if (!athleteId) return;
            // Toasts (validée / gardée hors ligne / séance retirée) : dans le hook.
            completeEnergy.mutate(
              { id: energyPreview.assignmentId, athleteId, ...(stepLogNotes ? { notes: stepLogNotes } : {}) },
              { onSuccess: () => setEnergyPreview(null) },
            );
          }}
          onCancel={() => cancelEnergy.mutate(energyPreview.assignmentId)}
        />
      )}

      {/* Reschedule drawer (workout + energy) */}
      {rescheduleTarget && (
        <RescheduleSheet
          sessionName={rescheduleTarget.sessionName}
          scheduledDate={rescheduleTarget.scheduledDate}
          today={today}
          weekMondayISO={weekMondayISO}
          typeColor={rescheduleTarget.kind === "workout" ? TYPE_COLOR.muscu : rescheduleTarget.sessionKind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie}
          typeLabel={rescheduleTarget.kind === "workout" ? TYPE_LABEL.muscu : rescheduleTarget.sessionKind === "specifique" ? TYPE_LABEL.hyrox : TYPE_LABEL.energie}
          missed={isMissedWeekSession(rescheduleTarget, today)}
          onDetail={() => { const t = rescheduleTarget; setRescheduleTarget(null); handleSessionPress(t); }}
          onRest={() => restSession.mutate(rescheduleTarget)}
          onConfirm={(d) => handleRescheduleConfirm(d)}
          isPending={reschedulePending || restSession.isPending}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {/* Test preview / fill drawer */}
      <TestEntryPage
        testId={testPreviewId}
        athleteId={athleteId ?? ""}
        coachName={athleteCoaches?.referent?.full_name ?? null}
        onClose={() => setTestPreviewId(null)}
      />

      {/* Compétition posée sur un jour par l'athlète */}
      {compDate && myCoachId && (
        <CompetitionFormModal
          athleteId={athleteId ?? ""}
          coachId={myCoachId}
          initialDate={compDate}
          onClose={() => setCompDate(null)}
        />
      )}

      {/* Free activity create modal */}
      <FreeActivityModal
        date={activityDate}
        onClose={() => setActivityDate(null)}
        onSave={(session) => setFreeSessions((prev) => [...prev, session])}
      />

      {/* Free activity edit modal */}
      <FreeActivityModal
        date={editActivity?.date ?? null}
        existing={editActivity}
        onClose={() => setEditActivity(null)}
        onSave={(session) => setFreeSessions((prev) => prev.map((f) => f.id === session.id ? session : f))}
        onDelete={(id) => setFreeSessions((prev) => prev.filter((f) => f.id !== id))}
      />
    </div>
  );
}

export default function ProgramPage() {
  const [params] = useSearchParams();
  if (params.get("vue") !== "fiches") return <ProgramSessionsView />;
  return (
    <div className="mx-auto w-full max-w-[480px] font-ui lg:max-w-6xl">
      <ProgramHeader />
      <AthleteFichesView />
    </div>
  );
}
