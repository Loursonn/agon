import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { RIR_AFTER_SET } from "./rirAfterSet";


const label = (v: string) => v.replace(".", ",");

/**
 * Fenêtre « Reps en réserve » qui monte après « Valider série » (maquette
 * « Séance en cours ») : RIR visé entouré d'or, « Passer » pour garder la
 * valeur déjà notée.
 */
export function RirAfterSetSheet({
  exName,
  setNumber,
  target,
  value,
  onPick,
  onSkip,
}: {
  exName: string;
  setNumber: number;
  /** RIR prescrit (« 2 »), s'il y en a un. */
  target: string | null;
  value: string;
  onPick: (v: string) => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div onClick={onSkip} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div role="dialog" aria-label="Reps en réserve" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 41, background: C.s1, borderTop: "1px solid " + C.brd, borderRadius: "16px 16px 0 0", padding: "16px 16px 28px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ ...MONO, fontSize: 11, color: C.tx3, letterSpacing: "0.08em", textTransform: "uppercase" }}>{exName} · série {setNumber}</div>
        <div style={{ ...DISPLAY, fontSize: 18, color: C.tx, marginTop: 4 }}>Combien en réserve ?</div>
        <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 4 }}>
          Reps que tu aurais encore pu faire.{target ? <> Visé : <span style={{ ...MONO, color: C.ac }}>RIR {label(target)}</span></> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 14 }}>
          {RIR_AFTER_SET.map((v) => {
            const isTarget = target != null && parseFloat(target) === parseFloat(v) && !v.endsWith("+");
            const sel = value === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={sel}
                onClick={() => onPick(v)}
                style={{
                  height: 48, borderRadius: 12, cursor: "pointer", ...MONO, fontSize: 17,
                  border: isTarget ? "2px solid " + C.ac : "1px solid " + C.brdL,
                  background: sel ? C.ac : C.s2,
                  color: sel ? C.bg : isTarget ? C.ac : C.tx,
                }}
              >
                {label(v)}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onSkip} style={{ width: "100%", height: 48, marginTop: 12, borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Passer
        </button>
      </div>
    </>
  );
}
