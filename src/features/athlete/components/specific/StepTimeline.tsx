/**
 * StepTimeline — read-only vertical timeline for specific session preview.
 * Matches maquette vue-athlete-specifique.html styling.
 */
import type { EnergyStep, EnergyGroup, EnergyInterval, ExerciseInterval } from "@/types/energy";
import { formatS, formatTarget, formatExerciseStep } from "@/lib/energy/formatTarget";
import { estimateIntervalDuration } from "@/lib/energy";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";
import { C, H } from "@/lib/theme";

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

const COLORS = {
  warmup: C.g, work: H.rougeDoux, recovery: H.bleu,
  rest: H.grisClair, cooldown: C.g, open: H.grisClair,
  exercise: C.ac, repeat: H.miel,
};

const ROLE_LABEL: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récupération",
  rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};

function StepCard({ step, color, vma, children }: {
  step: EnergyInterval | ExerciseInterval;
  color: string;
  vma?: number | null;
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
    ? [formatExerciseStep(step), step.notes].filter(Boolean).join(" · ")
    : step.target.kind !== "none" ? formatTarget(step.target) : step.notes ?? "";

  return (
    <div style={{
      display: "flex", gap: 12,
      background: `var(--card, ${C.bg})`, border: `1px solid var(--border, ${H.anthracite})`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6, padding: "12px 14px", marginBottom: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
          color: isExercise ? COLORS.exercise : H.grisClair,
        }}>
          {kindLabel}
        </span>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2, color: H.blancCasse, whiteSpace: "pre-wrap" }}>
          {title}
        </div>
        {(equipmentLabel || targetStr) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            {equipmentLabel && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: `${H.bleu}20`, color: H.bleu,
                border: `1px solid ${H.bleu}40`,
              }}>
                {equipmentLabel}
              </span>
            )}
            {targetStr && (
              <span style={{ fontSize: 12, color: H.grisClair }}>{targetStr}</span>
            )}
          </div>
        )}
        {!isExercise && (
          <PaceEquivalents
            target={step.target}
            repDistanceM={stepDistanceM(step.duration)}
            vma={vma}
            omitPrimary
          />
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
      <span style={{ fontSize: 15, fontWeight: 700, alignSelf: "center", color: H.blancCasse }}>
        {dur > 0 ? formatS(dur) : "—"}
      </span>
    </div>
  );
}


export default function StepTimeline({ steps, vma }: { steps: EnergyStep[]; vma?: number | null }) {
  return (
    <div>
      {steps.map((step, i) => {
        if (step.type === "interval") {
          const color = COLORS[step.role] ?? COLORS.open;
          return <StepCard key={step.id ?? i} step={step} color={color} vma={vma} />;
        }
        if (step.type === "exercise") {
          return <StepCard key={step.id ?? i} step={step} color={COLORS.exercise} vma={vma} />;
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
              <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", padding: "0 4px 8px" }}>
                {group.instructions}
              </div>
            )}
            <div style={{ marginLeft: 6 }}>
              <StepTimeline steps={group.children} vma={vma} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
