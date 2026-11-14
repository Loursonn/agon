import { useState } from "react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
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
      <div onClick={onClose} className="fixed inset-0 z-[100] bg-black/60" />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[101] rounded-t-[6px] border-t border-agon-brd bg-agon-s1 px-5 pb-10 pt-6"
        style={{ animation: "rpeSlideUp 220ms ease-out" }}
      >
        <style>{`
          @keyframes rpeSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-9 rounded-[2px] bg-agon-brd-l" />

        <div className="mb-1 text-[16px] font-extrabold text-agon-tx">
          Comment s'est passée la séance ?
        </div>
        <div className="mb-6 text-[12px] text-agon-tx3">
          Évalue ton effort global (échelle Foster 1-10)
        </div>

        {/* Number grid */}
        <div className="mb-4 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
            const isSelected = selected === v;
            return (
              <button
                key={v}
                onClick={() => setSelected(v)}
                className={cn(
                  "cursor-pointer rounded-[6px] border py-3.5 font-[inherit] text-[18px] font-extrabold transition-all [transition-duration:120ms]",
                  !isSelected && "border-agon-brd-l bg-agon-s2 text-agon-tx2",
                )}
                style={isSelected ? { borderColor: rpeColor(v) + "80", background: rpeBg(v), color: rpeColor(v) } : undefined}
              >
                {v}
              </button>
            );
          })}
        </div>

        {/* Foster label */}
        <div
          className={cn(
            "mb-7 min-h-7 rounded-[4px] px-3 py-1 text-center text-[13px] font-semibold transition-all duration-150",
            selected == null && "bg-transparent text-agon-tx3",
          )}
          style={selected != null ? { color: rpeColor(selected), background: rpeBg(selected) } : undefined}
        >
          {selected != null ? `${selected}/10 — ${FOSTER[selected]}` : "Sélectionne une valeur"}
        </div>

        {/* Actions */}
        <button
          onClick={handleSubmit}
          disabled={isPending || selected == null}
          className={cn(
            "min-h-11 w-full rounded-[6px] border-none py-[15px] font-[inherit] text-[14px] font-bold transition-colors duration-150",
            selected != null ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
          )}
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full cursor-pointer border-none bg-transparent py-2.5 font-[inherit] text-[13px] text-agon-tx3"
        >
          Passer
        </button>
      </div>
    </>
  );
}
