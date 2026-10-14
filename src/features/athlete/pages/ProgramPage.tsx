import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Plus, TrendingUp, X, Zap } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useActivePlan } from "@/features/shared/hooks/useActivePlan";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useRescheduleWorkout } from "@/features/shared/hooks/useRescheduleWorkout";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { SessionPreviewModal, ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/SessionPreviewModal";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import { TestFillDrawer } from "@/features/athlete/components/TestFillDrawer";
import type { ActiveMesocycle, PastCycle, WeekDay, WeekSession, TestBrief } from "@/features/shared/hooks/useActivePlan";
import type { EnergyStep, EnergySessionRow } from "@/types/energy";
import type { FreeSession } from "@/features/shared/types/athlete";
import { formatClusterReps } from "@/features/coach/components/programmation/clusterFormat";
import { FreeActivityModal, SPORTS } from "@/features/athlete/components/FreeActivityModal";
import { AthleteFichesView } from "@/features/athlete/components/fiches/AthleteFichesView";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_FR    = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
const DOW_FULL_FR  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

const ENERGY_KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#10B981", fartlek: "#EF4444", autre: "#6B7280", custom: "#6B7280",
};
const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function haptic() { if (navigator.vibrate) navigator.vibrate(10); }

function sessionColor(s: WeekSession): string {
  return s.kind === "energy"
    ? (ENERGY_KIND_COLOR[s.sessionKind ?? ""] ?? "#FFC933")
    : C.ac;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProgramSkeleton() {
  const pulse: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", borderRadius: 4,
    animation: "pulse 1.5s ease-in-out infinite",
  };
  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ background: C.s1, borderRadius: 6, padding: 20, border: "1px solid " + C.brd, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ ...pulse, width: 80, height: 22 }} />
          <div style={{ ...pulse, width: 60, height: 16 }} />
        </div>
        <div style={{ ...pulse, width: "70%", height: 22 }} />
        <div style={{ ...pulse, width: "100%", height: 4 }} />
        <div style={{ display: "flex", gap: 12 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ ...pulse, width: "60%", height: 18 }} />
              <div style={{ ...pulse, width: "80%", height: 12 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...pulse, width: 160, height: 22 }} />
      {[0,1,2,3,4,5,6].map(i => (
        <div key={i} style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...pulse, width: 80, height: 14 }} />
          <div style={{ ...pulse, width: "100%", height: 44 }} />
        </div>
      ))}
    </div>
  );
}

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
  step, state, onDone, onPartial, onComment,
}: {
  step: EnergyStep;
  state: StepState | undefined;
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
    const reps = step.reps_min != null
      ? (step.reps_max != null && step.reps_max !== step.reps_min
          ? `${step.reps_min}-${step.reps_max} reps`
          : `${step.reps_min} reps`)
      : step.duration?.kind === "time"
      ? formatS(step.duration.value ?? 0)
      : null;
    const load = step.weight_kg != null
      ? step.weight_unit === "pct_rm" ? `${step.weight_kg}% RM`
      : step.weight_unit === "bw" ? "PDC"
      : `${step.weight_kg} kg`
      : null;
    const detail = [reps, load].filter(Boolean).join(" · ");
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
  session, onTerminate, onClose,
}: {
  session: EnergySessionRow;
  onTerminate: (log: Map<string, StepState>) => void;
  onClose: () => void;
}) {
  const steps = session.intervals ?? [];
  const [stepStates, setStepStates] = useState<Map<string, StepState>>(new Map());

  const kc = ENERGY_KIND_COLOR[session.session_kind] ?? "#6B7280";

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

function ActivePlanCard({ meso, weekSessionCount }: { meso: ActiveMesocycle; weekSessionCount: number }) {
  const color = C.ac;
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL, overflow: "hidden" }}>
      <div style={{ padding: "18px 18px 0" }}>
        {/* Pill + duration */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 6,
            background: color + "18", color,
            fontSize: 11, fontWeight: 700,
          }}>
            <Dumbbell size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Programme
          </span>
          <span style={{ fontSize: 11, color: C.tx3 }}>{meso.totalWeeks} semaines</span>
        </div>

        {/* Meso name */}
        <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 12, lineHeight: 1.3 }}>
          {meso.name}
        </div>

        {/* Week progress */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: C.tx3 }}>
            Semaine {meso.currentWeek} sur {meso.totalWeeks}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{meso.progressPct}%</span>
        </div>
        <div style={{ width: "100%", height: 5, borderRadius: 99, background: "rgba(255,255,255,0.08)", marginBottom: 18, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: C.acV, width: meso.progressPct + "%", transition: "width 0.6s ease" }} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.brd, marginBottom: 16 }} />

        {/* 3 stats */}
        <div style={{ display: "flex", marginBottom: 18 }}>
          {[
            { label: "Complétion",     value: meso.completionPct + "%" },
            { label: "Fréquence",      value: meso.frequency != null ? meso.frequency + "/sem" : "—" },
            { label: "Séances / sem",  value: String(weekSessionCount) },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              borderLeft: i > 0 ? "1px solid " + C.brd : "none", paddingTop: 2,
            }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.tx, lineHeight: 1.1 }}>{stat.value}</span>
              <span style={{ fontSize: 10, color: C.tx3, marginTop: 3 }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase sub-card */}
      {(meso.objective || meso.macroName) && (
        <div style={{
          margin: "0 12px 12px",
          background: C.bS, border: "1px solid " + C.b + "30",
          borderRadius: 6, padding: "11px 14px",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <TrendingUp size={16} style={{ marginTop: 1, flexShrink: 0 }} color={C.b} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.b, marginBottom: 2 }}>{meso.macroName}</div>
            {meso.objective && (
              <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.4 }}>{meso.objective}</div>
            )}
          </div>
        </div>
      )}
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

type RescheduleDay = { iso: string; dow: number; num: number };

function WeekRow({
  days,
  nextWeek,
  selected,
  scheduledDate,
  onSelect,
}: {
  days: RescheduleDay[];
  nextWeek?: boolean;
  selected: string;
  scheduledDate: string;
  onSelect: (iso: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {days.map(d => {
        const isSel = d.iso === selected;
        const isCur = d.iso === scheduledDate;
        return (
          <button
            key={d.iso}
            onClick={() => onSelect(d.iso)}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", padding: "7px 2px", borderRadius: 4,
              cursor: "pointer", fontFamily: "inherit",
              border: "1px solid " + (isSel ? C.ac : nextWeek ? "#F59E0B30" : C.brd),
              background: isSel ? C.acS : nextWeek ? "rgba(245,158,11,0.04)" : C.s2,
              position: "relative",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 600, color: isSel ? C.ac : C.tx3, textTransform: "uppercase" }}>
              {DOW_SHORT_FR[d.dow]}
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: isSel ? C.ac : C.tx, lineHeight: 1.2 }}>
              {d.num}
            </span>
            {isCur && (
              <span style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: C.ac }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function RescheduleDrawer({
  sessionName,
  scheduledDate,
  weekMondayISO,
  onConfirm,
  isPending,
  onClose,
}: {
  sessionName: string;
  scheduledDate: string;
  weekMondayISO: string;
  onConfirm: (newDate: string, reason?: string) => void;
  isPending?: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(scheduledDate);
  const [reason, setReason]     = useState("");

  const { week1, week2 } = useMemo(() => {
    const mon = new Date(weekMondayISO + "T12:00:00");
    const makeDay = (offset: number) => {
      const d = new Date(mon); d.setDate(mon.getDate() + offset);
      return { iso: isoFromDate(d), dow: (d.getDay() + 6) % 7, num: d.getDate() };
    };
    return {
      week1: Array.from({ length: 7 }, (_, i) => makeDay(i)),
      week2: Array.from({ length: 7 }, (_, i) => makeDay(7 + i)),
    };
  }, [weekMondayISO]);

  const isNextWeek  = week2.some(d => d.iso === selected);
  const canConfirm  = selected !== scheduledDate && !isPending;

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: "0 0 32px" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px" }}>
          <DrawerTitle style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
            Déplacer
            <span style={{ fontSize: 12, fontWeight: 400, color: C.tx3, marginLeft: 8 }}>{sessionName}</span>
          </DrawerTitle>
        </DrawerHeader>

        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Week 1 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              Cette semaine
            </div>
            <WeekRow days={week1} selected={selected} scheduledDate={scheduledDate} onSelect={setSelected} />
          </div>

          {/* Week 2 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              Semaine suivante <span style={{ fontSize: 9 }}>notifie le coach</span>
            </div>
            <WeekRow days={week2} nextWeek selected={selected} scheduledDate={scheduledDate} onSelect={setSelected} />
          </div>

          {/* Raison */}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison (optionnel) — blessure, compétition…"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2,
              color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={() => onConfirm(selected, reason.trim() || undefined)}
            disabled={!canConfirm}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 6, border: "none",
              background: canConfirm ? C.ac : C.s2,
              color: canConfirm ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: canConfirm ? "pointer" : "default",
              fontFamily: "inherit", minHeight: 44,
            }}
          >
            {isPending ? "Déplacement…" : "Confirmer"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
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
                            <span style={{ fontSize: 10, color: C.tx3 }}>{nb} séries × {reps}{ex.params?.cluster ? "" : " reps"}</span>
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

          {!isPast && (
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
  onPress,
  onReschedule,
}: {
  session: WeekSession;
  onPress: (s: WeekSession) => void;
  onReschedule?: (s: WeekSession) => void;
}) {
  const color = sessionColor(session);
  const isDone    = session.status === "completed";
  const isMissed  = session.status === "missed";
  const isMuscu   = session.kind === "workout";

  const meta = session.kind === "energy"
    ? (ENERGY_KIND_LABEL[session.sessionKind ?? ""] ?? "Énergie")
    : "Musculation";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <button
        onClick={() => { haptic(); onPress(session); }}
        style={{
          flex: 1, display: "flex", alignItems: "center", gap: 12,
          background: isDone ? C.gS : color + "12",
          border: "none", borderLeft: "4px solid " + (isDone ? C.gV : color),
          borderRadius: "0 10px 10px 0",
          padding: "10px 12px",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
          minHeight: 44,
          opacity: isMissed ? 0.55 : 1,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.tx,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {session.sessionName}
          </div>
          <div style={{ fontSize: 10, color: isDone ? C.g : C.tx3, marginTop: 2 }}>
            {meta}
            {isDone ? " · Complétée ✓" : isMissed ? " · Manquée" : " · Planifiée"}
            {session.rescheduledByAthlete && session.originalScheduledDate && !isDone && (
              <span style={{ color: "#F59E0B" }}> · Déplacée</span>
            )}
          </div>
        </div>
        {!isDone && !isMissed && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: color + "20", color, flexShrink: 0,
          }}>
            {session.kind === "energy" ? "Voir →" : "Démarrer ▶"}
          </span>
        )}
        {isDone && <span style={{ fontSize: 14, color: C.g, flexShrink: 0 }}>✓</span>}
      </button>

      {/* ⋯ reschedule button — workout and energy (not completed/missed) */}
      {!isDone && !isMissed && onReschedule && (
        <button
          onClick={(e) => { e.stopPropagation(); haptic(); onReschedule(session); }}
          title="Déplacer la séance"
          style={{
            width: 36, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer",
            color: C.tx3, fontSize: 16, fontFamily: "inherit", flexShrink: 0,
          }}
        >
          ⋯
        </button>
      )}
    </div>
  );
}

// ── Test chip ─────────────────────────────────────────────────────────────────

const TEST_TYPE_COLOR: Record<string, string> = {
  musculation: "#FFC933", endurance: "#33B5FF", vitesse: "#EF4444",
  puissance: "#F59E0B", souplesse: "#10B981", autre: "#6B7280",
};

function TestChip({ test, onPress }: { test: TestBrief; onPress: (id: string) => void }) {
  const tc = TEST_TYPE_COLOR[test.type] ?? "#6B7280";
  return (
    <button
      onClick={() => { haptic(); onPress(test.id); }}
      style={{
        flex: 1, display: "flex", alignItems: "center", gap: 12,
        background: test.completed ? C.gS : tc + "12",
        border: "none", borderLeft: "4px solid " + (test.completed ? C.g : tc),
        borderRadius: "0 10px 10px 0",
        padding: "10px 12px",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
        minHeight: 44,
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {test.title}
        </div>
        <div style={{ fontSize: 10, color: test.completed ? C.g : C.tx3, marginTop: 2, textTransform: "capitalize" }}>
          {test.type}{test.completed ? " · Réalisé ✓" : " · À faire"}
        </div>
      </div>
      {!test.completed && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: tc + "20", color: tc, flexShrink: 0 }}>
          Remplir →
        </span>
      )}
      {test.completed && <span style={{ fontSize: 14, color: C.g, flexShrink: 0 }}>✓</span>}
    </button>
  );
}

// ── Day row ───────────────────────────────────────────────────────────────────

function FreeActivityChip({ activity, onPress }: { activity: FreeSession; onPress: (f: FreeSession) => void }) {
  const sportMeta = SPORTS.find(s => s.key === activity.sport);
  const color = "#1FF0B0";
  return (
    <button
      onClick={() => { haptic(); onPress(activity); }}
      style={{
        flex: 1, display: "flex", alignItems: "center", gap: 12,
        background: color + "12",
        border: "none", borderLeft: "4px solid " + color,
        borderRadius: "0 10px 10px 0",
        padding: "10px 12px",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
        minHeight: 44,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activity.name}
        </div>
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
          {sportMeta?.label ?? activity.sport}
          {activity.duration ? ` · ${activity.duration} min` : ""}
          {activity.distance_km ? ` · ${activity.distance_km} km` : ""}
          {" · ✓"}
        </div>
      </div>
      <span style={{ fontSize: 14, color: C.g, flexShrink: 0 }}>✓</span>
    </button>
  );
}

function DayRow({
  day, today, onSessionPress, onReschedule, onTestPress,
  freeActivities, onAddActivity, onEditActivity, viewOnly,
}: {
  day: WeekDay;
  today: string;
  onSessionPress: (s: WeekSession) => void;
  onReschedule: (s: WeekSession) => void;
  onTestPress: (id: string) => void;
  freeActivities: FreeSession[];
  onAddActivity: (date: string) => void;
  onEditActivity: (f: FreeSession) => void;
  viewOnly: boolean;
}) {
  const isToday = day.date === today;
  const isPast  = day.date < today;
  const d       = new Date(day.date + "T12:00:00");
  const dateNum = d.getDate();
  const isEmpty = day.sessions.length === 0 && day.tests.length === 0 && freeActivities.length === 0;

  return (
    <div style={{
      background: C.s1,
      borderRadius: 6,
      border: "1px solid " + (isToday ? C.ac + "50" : C.brdL),
      overflow: "hidden",
    }}>
      {/* Day header */}
      <div style={{
        padding: "10px 14px",
        background: isToday ? C.acS : "transparent",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 4, flexShrink: 0,
          background: isToday ? C.acV : C.s2,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: isToday ? "#0E0C0A" : C.tx3, textTransform: "uppercase" }}>
            {DOW_FULL_FR[day.dow].slice(0, 3)}
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#0E0C0A" : C.tx, lineHeight: 1.1 }}>
            {dateNum}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          {isToday && (
            <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 1 }}>
              Aujourd'hui
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: isEmpty ? 400 : 600, color: isEmpty ? C.tx3 : C.tx }}>
            {isEmpty
              ? (isPast ? "Repos" : "Aucune séance")
              : `${day.sessions.length} séance${day.sessions.length > 1 ? "s" : ""}`}
          </div>
        </div>
        {day.sessions.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            {day.sessions.map(s => (
              <div key={s.id} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: s.status === "completed" ? C.gV : sessionColor(s),
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Session list */}
      {day.sessions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0 6px 14px" }}>
          {day.sessions.map(s => (
            <SessionChip
              key={s.id}
              session={s}
              onPress={onSessionPress}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      )}

      {/* Test list */}
      {day.tests.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0 6px 14px" }}>
          {day.tests.map(t => (
            <TestChip key={t.id} test={t} onPress={onTestPress} />
          ))}
        </div>
      )}

      {/* Free activities */}
      {freeActivities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0 6px 14px" }}>
          {freeActivities.map(f => (
            <FreeActivityChip key={f.id} activity={f} onPress={onEditActivity} />
          ))}
        </div>
      )}

      {/* Add activity button */}
      {!viewOnly && (
        <div style={{ padding: "4px 14px 8px" }}>
          <button
            onClick={() => { haptic(); onAddActivity(day.date); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 0", borderRadius: 6,
              border: "1px dashed " + C.brdL, background: "transparent",
              color: C.tx3, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={12} />
            Activité libre
          </button>
        </div>
      )}
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

const weekNavBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 4, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: C.s2, border: "1px solid " + C.brdL, color: C.tx, cursor: "pointer",
};

function ProgramSessionsView() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { athleteId, viewOnly, freeSessions, setFreeSessions } = useAthleteContext();
  const [weekOffset, setWeekOffset] = useState(0);
  const { data, isLoading, isPlaceholderData } = useActivePlan(athleteId ?? "", weekOffset);

  const [workoutPreview,   setWorkoutPreview]   = useState<WeekSession | null>(null);
  const [energyPreview,    setEnergyPreview]    = useState<{ sessionId: string; assignmentId: string; status: string; scheduledDate: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<WeekSession | null>(null);
  const [testPreviewId,    setTestPreviewId]    = useState<string | null>(null);
  const [activityDate,     setActivityDate]     = useState<string | null>(null);
  const [editActivity,     setEditActivity]     = useState<FreeSession | null>(null);

  const today         = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, []);
  const weekMondayISO = useMemo(localMonday, []);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const rescheduleWorkout = useRescheduleWorkout();

  const rescheduleEnergy = useMutation({
    mutationFn: async ({ assignmentId, newDate }: { assignmentId: string; newDate: string }) => {
      const { error } = await supabase
        .from("energy_session_assignments")
        .update({ scheduled_date: newDate })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.activePlan(athleteId ?? "") });
      toast.success("Séance déplacée");
      setRescheduleTarget(null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  const rescheduleEnergyToToday = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("energy_session_assignments")
        .update({ scheduled_date: today })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.activePlan(athleteId ?? "") });
      toast.success("Séance déplacée à aujourd'hui");
      setEnergyPreview(prev => prev ? { ...prev, scheduledDate: today } : null);
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });

  const cancelEnergy = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("energy_session_assignments")
        // Même remise à zéro que depuis l'accueil : blocs cochés et RPE effacés
        .update({ status: "planned", block_logs: {}, rpe_score: null, updated_at: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSessionStatus(qc, athleteId);
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
    <div style={{ maxWidth: 480, margin: "0 auto", scrollbarWidth: "none" }}>
      {/* Sticky header */}
      <div style={{
        position: "sticky", top: 45, zIndex: 5,
        background: "linear-gradient(135deg, rgba(255,201,51,0.18) 0%, rgba(21,18,15,0.98) 70%)",
        borderBottom: "1px solid rgba(255,201,51,0.25)",
        padding: "14px 16px", textAlign: "center",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, letterSpacing: "-0.2px" }}>Programme</div>
        <ProgramViewSwitch />
      </div>

      {isLoading ? (
        <ProgramSkeleton />
      ) : (
        <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Plan actif ── */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              Plan actif
            </div>
            {data?.cycle ? (
              <ActivePlanCard meso={data.cycle} weekSessionCount={data.weekSessionCount} />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Aucun cycle en cours"
                description="Tu n'es dans aucun cycle pour le moment. Ton coach programmera la suite."
              />
            )}
          </section>

          {/* ── Cycles précédents ── */}
          {data?.pastCycles && data.pastCycles.length > 0 && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                Cycles précédents
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.pastCycles.map((c) => <PastCycleCard key={c.id} cycle={c} />)}
              </div>
            </section>
          )}

          {/* ── Cette semaine ── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                aria-label="Semaine précédente"
                style={weekNavBtn}
                onClick={() => { haptic(); setWeekOffset(o => o - 1); }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
                style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "center", cursor: weekOffset === 0 ? "default" : "pointer" }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>{weekLabel(weekOffset)}</div>
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                  {weekRangeLabel(data?.weekDays ?? [])}
                  {weekOffset !== 0 && <span style={{ color: C.ac }}> · revenir à aujourd'hui</span>}
                </div>
              </button>
              <button
                type="button"
                aria-label="Semaine suivante"
                style={weekNavBtn}
                onClick={() => { haptic(); setWeekOffset(o => o + 1); }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {!data?.weekDays.length ? (
              <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "24px 16px", textAlign: "center", color: C.tx3, fontSize: 12 }}>
                Aucune séance cette semaine
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: isPlaceholderData ? 0.5 : 1, transition: "opacity 150ms" }}>
                {data.weekDays.map(day => (
                  <DayRow
                    key={day.date}
                    day={day}
                    today={today}
                    onSessionPress={handleSessionPress}
                    onReschedule={setRescheduleTarget}
                    onTestPress={(id) => setTestPreviewId(id)}
                    freeActivities={freeSessions.filter(f => f.date === day.date && f.sport)}
                    onAddActivity={setActivityDate}
                    onEditActivity={setEditActivity}
                    viewOnly={viewOnly}
                  />
                ))}
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
            supabase.from("energy_session_assignments")
              .update({
                status: "completed",
                ...(stepLogNotes ? { notes: stepLogNotes } : {}),
              })
              .eq("id", energyPreview.assignmentId)
              .then(({ error }) => {
                if (!error) {
                  qc.invalidateQueries({ queryKey: QK.activePlan(athleteId ?? "") });
                  toast.success("Séance terminée");
                  setEnergyPreview(null);
                } else {
                  toast.error("Erreur lors de la validation");
                }
              });
          }}
          onCancel={() => cancelEnergy.mutate(energyPreview.assignmentId)}
        />
      )}

      {/* Reschedule drawer (workout + energy) */}
      {rescheduleTarget && (
        <RescheduleDrawer
          sessionName={rescheduleTarget.sessionName}
          scheduledDate={rescheduleTarget.scheduledDate}
          weekMondayISO={weekMondayISO}
          onConfirm={handleRescheduleConfirm}
          isPending={reschedulePending}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {/* Test preview / fill drawer */}
      <TestFillDrawer
        testId={testPreviewId}
        athleteId={athleteId ?? ""}
        onClose={() => setTestPreviewId(null)}
      />

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

// ── Sélecteur Séances | Fiches (?vue=fiches) ──────────────────────────────────

function ProgramViewSwitch() {
  const [params, setParams] = useSearchParams();
  const vue = params.get("vue") === "fiches" ? "fiches" : "seances";
  const go = (v: "seances" | "fiches") => {
    const next = new URLSearchParams(params);
    if (v === "fiches") next.set("vue", "fiches");
    else next.delete("vue");
    setParams(next, { replace: true });
  };
  return (
    <div role="tablist" style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: 3, marginTop: 10 }}>
      {([["seances", "Séances"], ["fiches", "Fiches"]] as const).map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={vue === k}
          onClick={() => go(k)}
          style={{
            flex: 1, minHeight: 36, borderRadius: 4, border: "none",
            background: vue === k ? C.acS : "transparent",
            color: vue === k ? C.ac : C.tx3, fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >{l}</button>
      ))}
    </div>
  );
}

export default function ProgramPage() {
  const [params] = useSearchParams();
  if (params.get("vue") !== "fiches") return <ProgramSessionsView />;
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{
        position: "sticky", top: 45, zIndex: 5,
        background: "linear-gradient(135deg, rgba(255,201,51,0.18) 0%, rgba(21,18,15,0.98) 70%)",
        borderBottom: "1px solid rgba(255,201,51,0.25)",
        padding: "14px 16px", textAlign: "center",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, letterSpacing: "-0.2px" }}>Programme</div>
        <ProgramViewSwitch />
      </div>
      <AthleteFichesView />
    </div>
  );
}
