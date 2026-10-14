import { useState } from "react";
import { Trophy } from "lucide-react";
import { C } from "@/lib/theme";
import type { Competition } from "./hooks/useTimelineData";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";

const LABEL_W = 88;

const PRIORITY_COLOR: Record<string, string> = {
  A: C.coach,
  B: C.ac,
  C: C.tx3,
};

interface Props {
  competitions: Competition[];
  calc:         ReturnType<typeof useCalculatePosition>;
  totalRowHeight: number;
  onSelect:     (comp: Competition) => void;
}

export function CompetitionMarkers({ competitions, calc, totalRowHeight, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      {competitions.map((comp) => {
        const x    = calc.dateToX(comp.date);
        const color = PRIORITY_COLOR[comp.priority ?? "C"] ?? C.tx3;
        const isH  = hovered === comp.id;

        return (
          <div
            key={comp.id}
            onClick={() => onSelect(comp)}
            onMouseEnter={() => setHovered(comp.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position: "absolute",
              left: LABEL_W + x - 1,
              top: 0,
              height: totalRowHeight,
              width: isH ? 3 : 2,
              background: color,
              cursor: "pointer",
              zIndex: 5,
              transition: "width 100ms",
            }}
          >
            {/* Tooltip */}
            {isH && (
              <div
                style={{
                  position: "absolute", top: 4, left: 6,
                  background: C.s2, border: "1px solid " + color + "60",
                  borderRadius: 6, padding: "3px 8px",
                  fontSize: 10, fontWeight: 600, color,
                  whiteSpace: "nowrap", pointerEvents: "none",
                  zIndex: 20,
                }}
              >
                {comp.name}
                {comp.priority && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>· {comp.priority}</span>
                )}
              </div>
            )}

            {/* Icon at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: -22,
                left: "50%", transform: "translateX(-50%)",
                color,
              }}
            >
              <Trophy size={14} />
            </div>
          </div>
        );
      })}
    </>
  );
}
