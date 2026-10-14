import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useUpsertWorkoutRpe } from "@/features/shared/hooks/useUpsertWorkoutRpe";

const FOSTER: Record<number, string> = {
  1: "Repos total",
  2: "Très facile",
  3: "Facile",
  4: "Assez difficile",
  5: "Difficile",
  6: "Difficile+",
  7: "Difficile++",
  8: "Très difficile",
  9: "Très difficile+",
  10: "Maximal",
};

function rpeColor(v: number) {
  if (v <= 4) return C.g;
  if (v <= 7) return C.o;
  return C.r;
}
function rpeBg(v: number) {
  if (v <= 4) return C.gS;
  if (v <= 7) return C.oS;
  return C.rS;
}

interface RpeSheetProps {
  sessionId: string;
  scheduledDate?: string;
  onClose: () => void;
}

export function RpeSheet({ sessionId, scheduledDate, onClose }: RpeSheetProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const { athleteId } = useAthleteContext();
  const { mutate, isPending } = useUpsertWorkoutRpe(athleteId, sessionId, scheduledDate);

  function handleSubmit() {
    if (selected == null) { onClose(); return; }
    mutate(selected, { onSettled: onClose });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)" }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
          background: C.s1,
          borderRadius: "6px 6px 0 0",
          borderTop: "1px solid " + C.brd,
          padding: "24px 20px 40px",
          animation: "rpeSlideUp 220ms ease-out",
        }}
      >
        <style>{`
          @keyframes rpeSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL, margin: "0 auto 20px" }} />

        <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 4 }}>
          Comment s'est passée la séance ?
        </div>
        <div style={{ fontSize: 12, color: C.tx3, marginBottom: 24 }}>
          Évalue ton effort global (échelle Foster 1-10)
        </div>

        {/* Number grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
            const isSelected = selected === v;
            return (
              <button
                key={v}
                onClick={() => setSelected(v)}
                style={{
                  padding: "14px 0",
                  borderRadius: 6,
                  border: "1px solid " + (isSelected ? rpeColor(v) + "80" : C.brdL),
                  background: isSelected ? rpeBg(v) : C.s2,
                  color: isSelected ? rpeColor(v) : C.tx2,
                  fontSize: 18, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 120ms",
                }}
              >
                {v}
              </button>
            );
          })}
        </div>

        {/* Foster label */}
        <div
          style={{
            minHeight: 28, textAlign: "center", marginBottom: 28,
            fontSize: 13, fontWeight: 600,
            color: selected != null ? rpeColor(selected) : C.tx3,
            background: selected != null ? rpeBg(selected) : "transparent",
            borderRadius: 4, padding: "4px 12px",
            transition: "all 150ms",
          }}
        >
          {selected != null ? `${selected}/10 — ${FOSTER[selected]}` : "Sélectionne une valeur"}
        </div>

        {/* Actions */}
        <button
          onClick={handleSubmit}
          disabled={isPending || selected == null}
          style={{
            width: "100%", padding: "15px 0", borderRadius: 6,
            border: "none",
            background: selected != null ? C.ac : C.s2,
            color: selected != null ? "#fff" : C.tx3,
            fontSize: 14, fontWeight: 700,
            cursor: selected != null ? "pointer" : "default",
            fontFamily: "inherit", minHeight: 44,
            transition: "background 150ms",
            boxShadow: selected != null ? "0 4px 20px rgba(255,201,51,0.3)" : "none",
          }}
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>

        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 12, padding: "10px 0",
            border: "none", background: "transparent",
            color: C.tx3, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Passer
        </button>
      </div>
    </>
  );
}
