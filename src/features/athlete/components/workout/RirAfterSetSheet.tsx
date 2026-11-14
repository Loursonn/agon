import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { RIR_AFTER_SET } from "./rirAfterSet";

const label = (v: string) => v.replace(".", ",");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Fenêtre « Reps en réserve » qui monte après « Valider série » (planche
 * « Séance en cours », écran 03) : RIR de 0 à 4+ au demi-point, le RIR visé
 * entouré d'or avec « Visé », une tape enregistre et ferme, « Passer » garde
 * la valeur déjà notée. La récup tourne déjà derrière.
 */
export function RirAfterSetSheet({
  setNumber,
  target,
  summary,
  restLeft,
  onPick,
  onSkip,
}: {
  setNumber: number;
  /** RIR prescrit (« 2 »), s'il y en a un. */
  target: string | null;
  /** Série qu'on vient de valider : « 70 kg × 6 ». */
  summary?: string | null;
  /** Récup en cours (secondes restantes), affichée en haut à droite. */
  restLeft?: number | null;
  onPick: (v: string) => void;
  onSkip: () => void;
}) {
  const sub = [summary, target ? `visé RIR ${label(target)}` : null].filter(Boolean).join(" · ");
  return (
    <>
      <div onClick={onSkip} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div role="dialog" aria-label="Reps en réserve" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 41, background: C.s1, borderTop: "1px solid " + C.brdL, borderRadius: "20px 20px 0 0", padding: "18px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 11, color: C.tx3, letterSpacing: "0.14em", textTransform: "uppercase" }}>RIR · série {setNumber}</span>
          {restLeft != null && (
            <span style={{ ...MONO, fontSize: 11, color: C.b, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: C.b }} />Récup {clock(restLeft)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: C.tx, marginTop: 8 }}>Combien de reps en réserve ?</div>
        {sub && <div style={{ ...MONO, fontSize: 12, color: C.tx2, marginTop: 4 }}>{sub}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
          {RIR_AFTER_SET.map((v) => {
            const isTarget = target != null && !v.endsWith("+") && parseFloat(target) === parseFloat(v);
            return (
              <button
                key={v}
                type="button"
                aria-label={isTarget ? `RIR ${label(v)}, visé` : `RIR ${label(v)}`}
                onClick={() => onPick(v)}
                style={{
                  position: "relative", height: 56, borderRadius: 12, cursor: "pointer", ...MONO, fontSize: 20,
                  border: isTarget ? "1.5px solid " + C.ac : "1px solid " + C.brd,
                  background: C.s2, color: isTarget ? C.ac : C.tx, padding: 0,
                }}
              >
                {label(v)}
                {isTarget && (
                  <span style={{ position: "absolute", top: 5, right: 7, fontSize: 9, letterSpacing: "0.1em", color: C.ac }}>VISÉ</span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", marginTop: 12 }}>Une tape enregistre et ferme · 4+ = 4 reps ou plus</div>
        <button type="button" onClick={onSkip} style={{ width: "100%", height: 48, marginTop: 10, borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Passer
        </button>
      </div>
    </>
  );
}
