/**
 * StepTimeline — read-only vertical timeline for specific session preview.
 * Matches maquette vue-athlete-specifique.html styling.
 */
import type { EnergyStep, EnergyGroup, EnergyInterval, ExerciseInterval } from "@/types/energy";
import { formatS, formatTarget, formatExerciseStep } from "@/lib/energy/formatTarget";
import { estimateIntervalDuration } from "@/lib/energy";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";
import { cn } from "@/lib/utils";

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

/** Filet gauche de la carte, selon le rôle de l'étape. */
const BORDER = {
  warmup: "border-l-agon-succes", work: "border-l-agon-erreur", recovery: "border-l-agon-info",
  rest: "border-l-agon-tx3", cooldown: "border-l-agon-succes", open: "border-l-agon-tx3",
  exercise: "border-l-agon-accent",
};

const ROLE_LABEL: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récupération",
  rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};

function StepCard({ step, borderClass, vma, children }: {
  step: EnergyInterval | ExerciseInterval;
  /** Classe `border-l-agon-*` du filet gauche. */
  borderClass: string;
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
    <div className={cn("mb-2 flex gap-3 rounded-[6px] border border-l-4 border-agon-brd bg-agon-s1 px-3.5 py-3", borderClass)}>
      <div className="min-w-0 flex-1">
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.05em]", isExercise ? "text-agon-accent" : "text-agon-tx3")}>
          {kindLabel}
        </span>
        <div className="mt-0.5 whitespace-pre-wrap text-[15px] font-semibold text-agon-tx">
          {title}
        </div>
        {(equipmentLabel || targetStr) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {equipmentLabel && (
              <span className="rounded-[6px] border border-agon-info/[0.25] bg-agon-info/[0.125] px-2 py-0.5 text-[10px] font-bold text-agon-info">
                {equipmentLabel}
              </span>
            )}
            {targetStr && (
              <span className="text-[12px] text-agon-tx3">{targetStr}</span>
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
            className="mt-1.5 inline-flex items-center gap-[5px] text-[12px] text-agon-accent no-underline"
            onClick={(e) => e.stopPropagation()}
          >
            ▶ Voir la démo vidéo
          </a>
        )}
        {children}
      </div>
      <span className="self-center text-[15px] font-bold text-agon-tx">
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
          return <StepCard key={step.id ?? i} step={step} borderClass={BORDER[step.role] ?? BORDER.open} vma={vma} />;
        }
        if (step.type === "exercise") {
          return <StepCard key={step.id ?? i} step={step} borderClass={BORDER.exercise} vma={vma} />;
        }
        // Group
        const group = step as EnergyGroup;
        return (
          <div key={group.id ?? i} className="mb-2 rounded-[6px] border border-dashed border-agon-alerte bg-agon-alerte/[0.03] p-2.5">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[12px] font-bold uppercase text-agon-alerte">
                × {group.repeat} tours
              </span>
            </div>
            {group.instructions && (
              <div className="whitespace-pre-wrap px-1 pb-2 text-[12px] leading-[1.4] text-agon-tx2">
                {group.instructions}
              </div>
            )}
            <div className="ml-1.5">
              <StepTimeline steps={group.children} vma={vma} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
