/**
 * StepTimeline — read-only vertical timeline for specific session preview.
 * Matches maquette vue-athlete-specifique.html styling.
 */
import type { EnergyStep, EnergyGroup, EnergyInterval, ExerciseInterval } from "@/types/energy";
import { formatS, formatTarget } from "@/lib/energy/formatTarget";
import { estimateIntervalDuration } from "@/lib/energy";

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

const COLORS = {
  warmup: "#66F03C", work: "#E5484D", recovery: "#4FA3FF",
  rest: "#8B8A92", cooldown: "#66F03C", open: "#8B8A92",
  exercise: "#FFC933", repeat: "#F5A623",
};

const ROLE_LABEL: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récupération",
  rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};

function StepCard({ step, color, children }: {
  step: EnergyInterval | ExerciseInterval;
  color: string;
  children?: React.ReactNode;
}) {
  const isExercise = step.type === "exercise";
  const dur = isExercise
    ? (step.duration ? estimateIntervalDuration(step) : 0)
    : estimateIntervalDuration(step);

  const kindLabel = isExercise
    ? (step.role === "work" ? "Effort · Exercice" : `${ROLE_LABEL[step.role] ?? step.role} · Exercice`)
    : (ROLE_LABEL[step.role] ?? step.role);

  const title = isExercise ? step.exercise_name : (
    step.duration.kind === "distance" ? `${step.duration.value ?? 0}m`
    : step.duration.kind === "calories" ? `${step.duration.value ?? 0} kcal`
    : step.notes ?? ROLE_LABEL[step.role] ?? ""
  );

  const equipmentLabel = !isExercise && step.type === "interval" && step.equipment
    ? (EQUIPMENT_LABEL[step.equipment] ?? step.equipment)
    : null;

  const targetStr = isExercise
    ? [step.reps_min ? (step.reps_max && step.reps_max !== step.reps_min ? `${step.reps_min}-${step.reps_max} reps` : `${step.reps_min} reps`) : null, step.weight_kg ? `${step.weight_kg} ${step.weight_unit === "bw" ? "BW" : step.weight_unit === "pct_rm" ? "%RM" : "kg"}` : null, step.notes].filter(Boolean).join(" · ")
    : step.target.kind !== "none" ? formatTarget(step.target) : step.notes ?? "";

  return (
    <div style={{
      display: "flex", gap: 12,
      background: "var(--card, #0E0C0A)", border: "1px solid var(--border, #2E2D33)",
      borderLeft: `4px solid ${color}`,
      borderRadius: 6, padding: "12px 14px", marginBottom: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
          color: isExercise ? COLORS.exercise : "#8B8A92",
        }}>
          {kindLabel}
        </span>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2, color: "#F2F1F5", whiteSpace: "pre-wrap" }}>
          {title}
        </div>
        {(equipmentLabel || targetStr) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            {equipmentLabel && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: "#4FA3FF20", color: "#4FA3FF",
                border: "1px solid #4FA3FF40",
              }}>
                {equipmentLabel}
              </span>
            )}
            {targetStr && (
              <span style={{ fontSize: 12, color: "#8B8A92" }}>{targetStr}</span>
            )}
          </div>
        )}
        {isExercise && step.youtube_id && (
          <a
            href={`https://www.youtube.com/watch?v=${step.youtube_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 12, color: COLORS.exercise, marginTop: 6, textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            ▶ Voir la démo vidéo
          </a>
        )}
        {children}
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, alignSelf: "center", color: "#F2F1F5" }}>
        {dur > 0 ? formatS(dur) : "—"}
      </span>
    </div>
  );
}


export default function StepTimeline({ steps }: { steps: EnergyStep[] }) {
  return (
    <div>
      {steps.map((step, i) => {
        if (step.type === "interval") {
          const color = COLORS[step.role] ?? COLORS.open;
          return <StepCard key={step.id ?? i} step={step} color={color} />;
        }
        if (step.type === "exercise") {
          return <StepCard key={step.id ?? i} step={step} color={COLORS.exercise} />;
        }
        // Group
        const group = step as EnergyGroup;
        return (
          <div key={group.id ?? i} style={{
            border: `1px dashed ${COLORS.repeat}`,
            borderRadius: 6, padding: 10, marginBottom: 8,
            background: "rgba(245,166,35,0.03)",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", padding: "0 4px 8px",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.repeat, textTransform: "uppercase" as const }}>
                × {group.repeat} tours
              </span>
            </div>
            {group.instructions && (
              <div style={{ fontSize: 12, color: "#B9AE9C", lineHeight: 1.4, whiteSpace: "pre-wrap", padding: "0 4px 8px" }}>
                {group.instructions}
              </div>
            )}
            <div style={{ marginLeft: 6 }}>
              <StepTimeline steps={group.children} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
