import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { C } from "@/lib/theme";
import type { TLTestSession } from "./hooks/useTimelineData";
import type { useCalculatePosition } from "./hooks/useCalculatePosition";

const LABEL_W = 88;

interface Props {
  tests:          TLTestSession[];
  calc:           ReturnType<typeof useCalculatePosition>;
  totalRowHeight: number;
}

export function TestMarkers({ tests, calc, totalRowHeight }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      {tests.map((t) => {
        const x     = calc.dateToX(t.date);
        const color = t.completed ? C.g : C.o;
        const isH   = hovered === t.id;

        return (
          <div
            key={t.id}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position: "absolute",
              left: LABEL_W + x - 1,
              top: 0,
              height: totalRowHeight,
              width: isH ? 2 : 1,
              background: color,
              cursor: "default",
              zIndex: 4,
              opacity: 0.7,
              transition: "width 100ms, opacity 100ms",
            }}
          >
            {isH && (
              <div
                style={{
                  position: "absolute", top: 4, left: 5,
                  background: C.s2, border: "1px solid " + color + "60",
                  borderRadius: 6, padding: "3px 8px",
                  fontSize: 10, fontWeight: 600, color,
                  whiteSpace: "nowrap", pointerEvents: "none",
                  zIndex: 20,
                }}
              >
                {t.title}{t.completed ? " ✓" : ""}
              </div>
            )}
            <div
              style={{
                position: "absolute", bottom: -20,
                left: "50%", transform: "translateX(-50%)",
                color,
              }}
            >
              <FlaskConical size={12} />
            </div>
          </div>
        );
      })}
    </>
  );
}
