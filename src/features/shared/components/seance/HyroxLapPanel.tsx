import { useEffect, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { C } from "@/lib/theme";
import { fmtClock } from "@/lib/seance";
import type { DetailLap } from "@/lib/activityDetail";
import { LapExercisePicker, type LapType } from "./LapExercisePicker";
import { MONO, buttonStyle } from "./seanceUi";

/** Panneau latéral HYROX : type et exercice du tour choisi. */
export function HyroxLapPanel({ lap, name, index, onApply, onResetProposal, onResetWatch }: {
  lap: DetailLap;
  name: string;
  index: number;
  onApply: (name: string, exerciseId: string | null, type: LapType) => void;
  onResetProposal?: () => void;
  onResetWatch: () => void;
}) {
  const initial: LapType = /transition|roxzone/i.test(lap.name ?? "") ? "transition" : /course|run/i.test(lap.name ?? "") ? "run" : "station";
  const [type, setType] = useState<LapType>(initial);
  const [pick, setPick] = useState<{ name: string; id: string | null } | null>(null);
  useEffect(() => { setType(initial); setPick(null); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, borderRadius: 14, background: C.s1, border: `1px solid ${lap.needsReview ? C.ac : C.brd}` }}>
      <div>
        <div style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.14em", color: lap.needsReview ? C.ac : C.tx3 }}>
          TOUR {index + 1}{lap.needsReview ? " · À VÉRIFIER" : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{pick?.name ?? name}</span>
          <span style={{ ...MONO, color: C.tx2 }}>{fmtClock(lap.endS - lap.startS)}</span>
        </div>
      </div>
      <LapExercisePicker type={type} onType={setType} onPick={(n, id) => setPick({ name: n, id })} />
      <button type="button" style={buttonStyle("primary")} onClick={() => onApply(pick?.name ?? lap.name ?? name, pick?.id ?? lap.exerciseId, type)}>
        Appliquer au tour {index + 1}
      </button>
      {onResetProposal && (
        <button type="button" style={buttonStyle()} onClick={onResetProposal}><Sparkles size={14} />Revenir à la proposition d’Agon</button>
      )}
      <button type="button" style={buttonStyle()} onClick={onResetWatch}><RotateCcw size={14} />Revenir aux tours de la montre</button>
    </div>
  );
}

