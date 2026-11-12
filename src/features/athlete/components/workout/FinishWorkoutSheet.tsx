import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR } from "@/lib/peps";

const FORME_COLORS = ["#FF3B1F", "#FF7A45", "#FF9500", "#B8F03C", "#66F03C"];
const FORME_LABELS = ["Dur", "Moyen", "Correct", "Bien", "Top"];

/**
 * Fin de séance (maquette « Séance · fin ») : anneau du % de séries faites,
 * compteurs, forme 1-5, commentaire, km courus, « Terminer ✓ ».
 */
export function FinishWorkoutSheet({
  doneSets,
  skippedSets,
  totalSets,
  forme,
  onFormeChange,
  comment,
  onCommentChange,
  runKm,
  onRunKmChange,
  onConfirm,
  onClose,
  completing,
}: {
  doneSets: number;
  skippedSets: number;
  totalSets: number;
  forme: number | undefined;
  onFormeChange: (f: number) => void;
  comment: string;
  onCommentChange: (c: string) => void;
  runKm: string;
  onRunKmChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  completing: boolean;
}) {
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const r = 34;
  const circ = 2 * Math.PI * r;
  const ringColor = pct >= 80 ? TYPE_COLOR.fait : C.ac;
  const counter = (value: number, label: string, color: string) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px", borderRadius: 10, background: C.s1, border: `1px solid ${C.brd}` }}>
      <span style={{ ...MONO, fontSize: 18, color }}>{value}</span>
      <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx3 }}>{label}</span>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50 }} />
      <div
        role="dialog"
        aria-label="Terminer la séance"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51, background: C.bg,
          borderRadius: "16px 16px 0 0", borderTop: `1px solid ${C.brdL}`, padding: "20px 18px 32px",
          maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16,
          maxHeight: "92vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width={84} height={84} viewBox="0 0 84 84" aria-hidden style={{ flex: "none" }}>
            <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(231,211,168,0.12)" strokeWidth={7} />
            <circle cx={42} cy={42} r={r} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={`${(circ * pct) / 100} ${circ}`} transform="rotate(-90 42 42)" />
            <text x={42} y={47} textAnchor="middle" fill={C.tx} style={{ ...MONO, fontSize: 17 }}>{pct}%</text>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>Fin de séance</span>
            <span style={{ ...DISPLAY, fontSize: 20, color: C.tx }}>Terminer la séance ?</span>
            <span style={{ fontSize: 13, color: C.tx2 }}>{doneSets} série{doneSets > 1 ? "s" : ""} faite{doneSets > 1 ? "s" : ""} sur {totalSets}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {counter(doneSets, "Séries ok", TYPE_COLOR.fait)}
          {counter(skippedSets, "Passées", skippedSets > 0 ? "#FF9500" : C.tx3)}
          {counter(totalSets, "Total", C.tx)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>Comment tu t'es senti ?</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {FORME_COLORS.map((col, i) => {
              const on = forme === i + 1;
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFormeChange(i + 1)}
                  style={{
                    minHeight: 52, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${on ? col : C.brdL}`, background: on ? col + "26" : C.s1,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  }}
                >
                  <span style={{ ...MONO, fontSize: 17, color: on ? col : C.tx }}>{i + 1}</span>
                  <span style={{ fontSize: 10, color: on ? col : C.tx3 }}>{FORME_LABELS[i]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Un mot pour ton coach ? (facultatif)"
          rows={3}
          style={{ width: "100%", background: C.s1, border: `1px solid ${C.brdL}`, borderRadius: 10, padding: "10px 12px", color: C.tx, fontSize: 14, fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box" }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.tx2, flex: 1 }}>J'ai couru pendant la séance <span style={{ color: C.tx3 }}>(facultatif)</span></span>
          <input
            type="text"
            inputMode="decimal"
            value={runKm}
            onChange={(e) => onRunKmChange(e.target.value)}
            placeholder="0"
            style={{ ...MONO, width: 72, padding: "8px 10px", borderRadius: 10, textAlign: "right", border: `1px solid ${C.brdL}`, background: C.s1, color: C.tx, fontSize: 15, outline: "none" }}
          />
          <span style={{ fontSize: 12, color: C.tx3 }}>km</span>
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, height: 52, borderRadius: 12, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
          >
            Continuer
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={completing}
            style={{ flex: 2, height: 52, borderRadius: 12, border: "none", background: TYPE_COLOR.fait, color: C.bg, fontSize: 15, fontWeight: 600, cursor: completing ? "default" : "pointer", fontFamily: "inherit", opacity: completing ? 0.7 : 1 }}
          >
            {completing ? "Enregistrement…" : "Terminer ✓"}
          </button>
        </div>
      </div>
    </>
  );
}
