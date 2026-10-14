/**
 * ExecutionCard — central card showing current step during execution.
 * Timer countdown, round info, next step preview.
 */
import type { FlatExecStep } from "@/features/athlete/hooks/useSpecificExecution";
import { formatTarget } from "@/lib/energy/formatTarget";

const PHASE_COLOR: Record<string, string> = {
  warmup: "#66F03C", work: "#E5484D", recovery: "#4FA3FF",
  rest: "#8B8A92", cooldown: "#66F03C", open: "#8B8A92",
};
const PHASE_LABEL: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récupération",
  rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};
const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  current: FlatExecStep;
  next: FlatExecStep | null;
  secondsLeft: number;
  isLastStep: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export default function ExecutionCard({ current, next, secondsLeft, isLastStep, onNext, onSkip }: Props) {
  const { step, roundLabel } = current;
  const isExercise = step.type === "exercise";
  const color = isExercise ? "#FFC933" : (PHASE_COLOR[step.role] ?? "#8B8A92");
  const phaseLabel = isExercise
    ? (step.role === "work" ? "Effort · Exercice" : "Exercice")
    : (PHASE_LABEL[step.role] ?? step.role);

  const title = isExercise ? step.exercise_name : (
    step.type === "interval" && step.notes ? step.notes
    : PHASE_LABEL[step.role] ?? step.role
  );

  const equipmentLabel = !isExercise && step.type === "interval" && step.equipment
    ? (EQUIPMENT_LABEL[step.equipment] ?? step.equipment)
    : null;

  const targetStr = step.target ? formatTarget(step.target) : "";
  const showTarget = targetStr && targetStr !== "Libre";

  const detail = isExercise
    ? [step.reps_min ? (step.reps_max && step.reps_max !== step.reps_min ? `${step.reps_min}-${step.reps_max} reps` : `${step.reps_min} reps`) : null, step.weight_kg ? `${step.weight_kg} kg` : null].filter(Boolean).join(" · ")
    : null;

  const nextTitle = next ? (
    next.step.type === "exercise" ? `${next.step.exercise_name}${next.step.reps_min ? ` — ${next.step.reps_max && next.step.reps_max !== next.step.reps_min ? `${next.step.reps_min}-${next.step.reps_max}` : next.step.reps_min} reps` : ""}`
    : (PHASE_LABEL[next.step.role] ?? next.step.role)
  ) : null;

  return (
    <div style={{
      background: "var(--card, #0E0C0A)", border: `1px solid ${color}`,
      borderRadius: 6, padding: "24px 18px", textAlign: "center",
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color, textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
      }}>
        {phaseLabel}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px", color: "#F2F1F5" }}>
        {title}
      </div>
      {detail && (
        <div style={{ fontSize: 13, color: "#8B8A92" }}>{detail}</div>
      )}

      {/* Equipment + Intensity */}
      {(equipmentLabel || showTarget) && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          {equipmentLabel && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
              background: "#4FA3FF20", color: "#4FA3FF",
              border: "1px solid #4FA3FF40",
            }}>
              {equipmentLabel}
            </span>
          )}
          {showTarget && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
              background: `${color}20`, color,
              border: `1px solid ${color}40`,
            }}>
              {targetStr}
            </span>
          )}
        </div>
      )}

      {/* Timer */}
      <div style={{
        fontSize: 52, fontWeight: 800, fontVariantNumeric: "tabular-nums",
        margin: "14px 0 4px", color: "#F2F1F5",
      }}>
        {secondsLeft > 0 ? formatTimer(secondsLeft) : "—"}
      </div>

      {/* Round */}
      {roundLabel && (
        <div style={{ fontSize: 13, color: "#F5A623", fontWeight: 600 }}>
          {roundLabel}
        </div>
      )}

      {/* Next step preview */}
      {nextTitle && (
        <div style={{ marginTop: 14, fontSize: 13, color: "#8B8A92" }}>
          Suivant : <strong style={{ color: "#F2F1F5" }}>{nextTitle}</strong>
        </div>
      )}

      {/* Buttons */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16,
      }}>
        <button
          onClick={onSkip}
          style={{
            borderRadius: 6, padding: 12, fontSize: 14, fontWeight: 700,
            cursor: "pointer", border: "1px solid var(--border, #2E2D33)",
            background: "var(--card2, #26252A)", color: "#8B8A92",
            fontFamily: "inherit",
          }}
        >
          Passer
        </button>
        <button
          onClick={onNext}
          style={{
            borderRadius: 6, padding: 12, fontSize: 14, fontWeight: 700,
            cursor: "pointer", border: "1px solid var(--border, #2E2D33)",
            background: "var(--card2, #26252A)", color: "#F2F1F5",
            fontFamily: "inherit",
          }}
        >
          {isLastStep ? "Terminer ✓" : "Étape suivante ✓"}
        </button>
      </div>
    </div>
  );
}
