import type { WodBlock } from "@/types/specific";
import StepTimeline from "./StepTimeline";

/** Bloc WOD (étapes chronométrées) d'une séance spécifique, en lecture. */
export function WodBlockPreview({ block, vma }: { block: WodBlock; vma?: number | null }) {
  return (
    <div className="mb-agon-md break-inside-avoid rounded-md border border-dashed border-agon-alerte bg-agon-alerte/[0.03] p-agon-md">
      <div className="mb-agon-xs px-agon-xs text-agon-xs font-bold uppercase tracking-wide text-agon-alerte">
        {block.title || "Bloc WOD"}
        <span className="ml-agon-sm text-agon-xs font-normal text-agon-tx2">
          {block.steps.length} étape{block.steps.length > 1 ? "s" : ""}
        </span>
      </div>
      {block.instructions && (
        <div className="mb-agon-xs whitespace-pre-wrap text-agon-sm leading-snug text-agon-tx2">{block.instructions}</div>
      )}
      <div className="ml-1.5">
        <StepTimeline steps={block.steps} vma={vma} />
      </div>
    </div>
  );
}
