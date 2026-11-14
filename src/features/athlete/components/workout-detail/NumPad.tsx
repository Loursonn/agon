import { ACCENT, FIELD_CFG, GREEN } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { PadTarget } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── NumPad ─────────────────────────────────────────────────────────────────────

export interface NumPadProps {
  target: PadTarget;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** Raccourcis de la planche (« Prescrit 70 », « Préc. 67,5 », « +2,5 »…) à la place des ± fixes. */
  presets?: { label: string; value: string; tone: "ac" | "neutral" | "green" }[];
  /** Texte du bouton (« OK · reps » quand la charge enchaîne sur les reps). */
  confirmLabel?: string;
}

export function NumPad({ target, value, onChange, onConfirm, onClose, presets, confirmLabel }: NumPadProps) {
  const baseCfg = FIELD_CFG[target.field];
  const cfg = target.field === "reps" && target.isIso
    ? { ...baseCfg, label: "Durée", unit: "s" }
    : baseCfg;

  function stepped(delta: number): string {
    const v = parseFloat(value.replace(",", ".")) || 0;
    const next = Math.max(0, v + delta);
    if (target.field === "kg") return String(Math.round(next * 4) / 4).replace(".", ",");
    return String(Math.max(0, Math.round(next)));
  }

  function press(key: string) {
    if (key === "←") {
      onChange(value.slice(0, -1));
    } else if (key === ",") {
      if (!value.includes(",")) onChange(value + ",");
    } else {
      onChange(value + key);
    }
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "←"];
  const fmtStep = (n: number) => `${n > 0 ? "+" : "−"}${String(Math.abs(n)).replace(".", ",")}`;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 41,
          background: C.s1,
          borderRadius: "20px 20px 0 0",
          borderTop: `1px solid ${C.brdL}`,
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {/* En-tête de la planche SeanceEnCours (écran 02) : « CHARGE · S2 », valeur dorée à gauche */}
        <div style={{ padding: "18px 20px 12px" }}>
          <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, marginBottom: 6 }}>
            {cfg.label}{target.field !== "rir" ? ` · S${target.setIdx + 1}` : ""}
          </div>
          <div
            style={{
              ...MONO,
              fontSize: 56,
              lineHeight: 1,
              color: ACCENT,
              minHeight: 58,
              display: "flex",
              alignItems: "baseline",
            }}
          >
            {value || <span style={{ color: C.tx3, fontSize: 28 }}>—</span>}
            {value && cfg.unit && <span style={{ ...MONO, fontSize: 13, color: C.tx3, marginLeft: 4 }}>{cfg.unit}</span>}
          </div>
        </div>

        {/* Raccourcis : prescrit / précédent / + écart (planche), sinon ± fixes avec la valeur obtenue */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
          {(presets ?? cfg.steps.map((s) => ({ label: fmtStep(s), value: stepped(s), tone: (s < 0 ? "neutral" : "green") as "neutral" | "green" }))).map((p) => {
            const tone = p.tone === "ac" ? ACCENT : p.tone === "green" ? GREEN : C.tx2;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.value)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  border: `1px solid ${tone}`,
                  background: hexToRgba(tone, 0.14),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: 0,
                }}
              >
                <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: tone }}>{p.label}</span>
                <span style={{ ...MONO, fontSize: 14, color: C.tx }}>{p.value}</span>
              </button>
            );
          })}
        </div>

        {/* Keyboard */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            padding: "0 12px 8px",
          }}
        >
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k === "←" ? "Effacer" : undefined}
              onClick={() => press(k)}
              style={{
                ...MONO,
                height: 58,
                borderRadius: 12,
                border: 0,
                background: C.s2,
                color: C.tx,
                fontSize: 24,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {k === "←" ? "⌫" : k}
            </button>
          ))}
        </div>

        {/* Confirm */}
        <div style={{ padding: "4px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 12,
              border: "none",
              background: ACCENT,
              color: C.ink,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {confirmLabel ?? "Valider"}
          </button>
        </div>
      </div>
    </>
  );
}
