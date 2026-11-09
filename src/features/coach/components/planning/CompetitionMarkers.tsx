import { useState } from "react";
import { Trophy } from "lucide-react";
import { priorityLabel } from "@/types/planning";
import { cn } from "@/lib/utils";
import type { Competition } from "./hooks/useTimelineData";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";

const PRIORITY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: "bg-agon-coach", text: "text-agon-coach", border: "border-agon-coach/60" },
  B: { bg: "bg-agon-accent", text: "text-agon-accent", border: "border-agon-accent/60" },
  C: { bg: "bg-agon-tx3", text: "text-agon-tx3", border: "border-agon-tx3/60" },
};

interface Props {
  competitions: Competition[];
  calc: ReturnType<typeof useCalculatePosition>;
  /** Largeur de la colonne de libellés (px) : décalage du repère. */
  labelWidth: number;
  totalRowHeight: number;
  onSelect: (comp: Competition) => void;
}

export function CompetitionMarkers({ competitions, calc, labelWidth, totalRowHeight, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      {competitions.map((comp) => {
        const x = calc.dateToX(comp.date);
        const style = PRIORITY_STYLE[comp.priority ?? "C"] ?? PRIORITY_STYLE.C;
        const isH = hovered === comp.id;

        return (
          <div
            key={comp.id}
            role="button"
            tabIndex={0}
            aria-label={`Compétition ${comp.name}`}
            onClick={() => onSelect(comp)}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(comp); }}
            onMouseEnter={() => setHovered(comp.id)}
            onMouseLeave={() => setHovered(null)}
            // Zone de toucher élargie (le trait ne fait que 2 px)
            className={cn(
              "absolute top-0 z-[5] cursor-pointer transition-[width] duration-100 before:absolute before:inset-y-0 before:-left-2 before:-right-2 before:content-['']",
              style.bg, isH ? "w-[3px]" : "w-0.5",
            )}
            style={{ left: labelWidth + x - 1, height: totalRowHeight }}
          >
            {isH && (
              <div className={cn("pointer-events-none absolute left-1.5 top-1 z-20 whitespace-nowrap rounded-md border bg-agon-s2 px-agon-sm py-agon-2xs text-agon-xs font-semibold", style.border, style.text)}>
                {comp.name}
                {comp.priority && <span className="ml-agon-xs opacity-70">· {priorityLabel(comp.priority)}</span>}
              </div>
            )}

            <div className={cn("absolute -bottom-[22px] left-1/2 -translate-x-1/2", style.text)}>
              <Trophy size={14} />
            </div>
          </div>
        );
      })}
    </>
  );
}
