import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { EQUIPMENT_LABEL } from "@/features/athlete/components/program/programConstants";
import type { EnergyStep } from "@/types/energy";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { ROLE_COLOR, ROLE_LABEL_FR } from "@/features/coach/components/energy/energyLabels";
import type { StepState } from "@/features/athlete/components/program/programTypes";
import { formatExerciseStep, formatS, formatTarget } from "@/lib/energy/formatTarget";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";

// ── Step card (done / partial + comment) ──────────────────────────────────────

const STEP_BTN = "flex size-8 cursor-pointer items-center justify-center rounded-[4px] border-none font-[inherit] font-bold";

export function StepCheckRow({
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
  const tone      = isDone
    ? "border-agon-succes/[0.25] bg-agon-succes/[0.094]"
    : isPartial
    ? "border-agon-alerte/[0.31] bg-agon-alerte/[0.094]"
    : "border-transparent bg-agon-s2";

  // ── shared step-info block ──────────────────────────────────────────────────
  let infoNode: React.ReactNode;
  if (step.type === "interval") {
    const rc  = ROLE_COLOR[step.role] ?? C.tx3;
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
        <div className="h-[34px] w-[3px] shrink-0 rounded-[2px]" style={{ background: rc }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold" style={{ color: rc }}>{ROLE_LABEL_FR[step.role] ?? step.role}</span>
            <span className="text-[13px] font-bold text-agon-tx">{dur}</span>
          </div>
          {tgt && tgt !== "Libre" && (
            <div className="mt-px text-[10px] text-agon-tx3">{tgt}</div>
          )}
          <PaceEquivalents
            target={step.target}
            repDistanceM={stepDistanceM(step.duration)}
            vma={vma}
            omitPrimary
            fontSize={9}
          />
          {step.equipment && step.equipment !== "none" && (
            <div className="mt-0.5">
              <span className="rounded-[4px] bg-agon-tx/[0.08] px-[5px] py-px text-[8px] font-bold text-agon-tx2">
                {EQUIPMENT_LABEL[step.equipment] ?? step.equipment}
              </span>
            </div>
          )}
          {step.notes && (
            <div className="mt-px text-[9px] italic text-agon-tx3">{step.notes}</div>
          )}
        </div>
      </>
    );
  } else if (step.type === "exercise") {
    // Step exercice (séance spécifique / MetCon) : pas de `children` ni de `repeat`.
    // Sans cette branche, on tombait dans le cas "groupe" → step.children undefined → crash.
    const rc = ROLE_COLOR[step.role] ?? C.tx3;
    const detail = formatExerciseStep(step);
    infoNode = (
      <>
        <div className="h-[34px] w-[3px] shrink-0 rounded-[2px]" style={{ background: rc }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-agon-tx">
            {step.exercise_name}
          </div>
          {detail && <div className="mt-px text-[10px] text-agon-tx3">{detail}</div>}
          {step.notes && (
            <div className="mt-px text-[9px] italic text-agon-tx3">{step.notes}</div>
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-extrabold text-agon-info">× {step.repeat}</span>
          <span className="text-[10px] text-agon-tx3">répétitions</span>
        </div>
        {childSummary && (
          <div className="mt-px text-[10px] text-agon-tx2">
            {childSummary}{(step.children?.length ?? 0) > 3 ? " …" : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-[6px] border", tone)}>
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        {infoNode}

        {/* Action buttons */}
        <div className="flex shrink-0 gap-[5px]">
          {/* ✓ Fait */}
          <button
            onClick={onDone}
            title="Bloc fait"
            className={cn(STEP_BTN, "text-[14px]", isDone ? "bg-agon-succes text-agon-ink" : "bg-agon-tx/[0.07] text-agon-tx3")}
          >✓</button>

          {/* ~ Incomplet */}
          <button
            onClick={onPartial}
            title="Bloc non terminé"
            className={cn(STEP_BTN, "text-[13px]", isPartial ? "bg-agon-alerte text-agon-ink" : "bg-agon-tx/[0.07] text-agon-tx3")}
          >~</button>
        </div>
      </div>

      {/* Comment — mandatory when partial */}
      {isPartial && (
        <div className="px-3.5 pb-3">
          <input
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="Commentaire obligatoire…"
            autoFocus
            className={cn(
              "box-border w-full rounded-[4px] border-[1.5px] bg-agon-alerte/[0.06] px-2.5 py-2 font-[inherit] text-[12px] text-agon-tx [outline:none]",
              comment.trim() ? "border-agon-brd-l" : "border-agon-alerte/[0.5]",
            )}
          />
          {!comment.trim() && (
            <div className="mt-[3px] text-[9px] text-agon-alerte">
              Requis avant de terminer la séance
            </div>
          )}
        </div>
      )}
    </div>
  );
}
