import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TLTestSession } from "./hooks/useTimelineData";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";

interface Props {
  tests: TLTestSession[];
  calc: ReturnType<typeof useCalculatePosition>;
  /** Largeur de la colonne de libellés (px) : décalage du repère. */
  labelWidth: number;
  totalRowHeight: number;
}

export function TestMarkers({ tests, calc, labelWidth, totalRowHeight }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      {tests.map((t) => {
        const x = calc.dateToX(t.date);
        const isH = hovered === t.id;
        const bg = t.completed ? "bg-agon-succes" : "bg-agon-alerte";
        const text = t.completed ? "text-agon-succes" : "text-agon-alerte";
        const border = t.completed ? "border-agon-succes/60" : "border-agon-alerte/60";

        return (
          <div
            key={t.id}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
            className={cn("absolute top-0 z-[4] cursor-default opacity-70 transition-[width,opacity] duration-100", bg, isH ? "w-0.5" : "w-px")}
            style={{ left: labelWidth + x - 1, height: totalRowHeight }}
          >
            {isH && (
              <div className={cn("pointer-events-none absolute left-[5px] top-1 z-20 whitespace-nowrap rounded-md border bg-agon-s2 px-agon-sm py-agon-2xs text-agon-xs font-semibold", border, text)}>
                {t.title}{t.completed ? " ✓" : ""}
              </div>
            )}
            <div className={cn("absolute -bottom-5 left-1/2 -translate-x-1/2", text)}>
              <FlaskConical size={12} />
            </div>
          </div>
        );
      })}
    </>
  );
}
