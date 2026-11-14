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
}

export function NumPad({ target, value, onChange, onConfirm, onClose }: NumPadProps) {
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

  function step(delta: number) {
    onChange(stepped(delta));
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
        {/* Label + value display — planche AthleteSaisie1 */}
        <div style={{ padding: "18px 20px 12px", textAlign: "center" }}>
          <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, marginBottom: 6 }}>
            {cfg.label}
          </div>
          <div
            style={{
              ...MONO,
              fontSize: 48,
              lineHeight: 1,
              color: ACCENT,
              minHeight: 52,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
            }}
          >
            {value || <span style={{ color: C.tx3, fontSize: 28 }}>—</span>}
            {value && cfg.unit && <span style={{ ...MONO, fontSize: 12, color: C.tx3, marginLeft: 3 }}>{cfg.unit}</span>}
          </div>
        </div>

        {/* Steppers : écart et valeur obtenue */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
          {cfg.steps.map((s) => {
            const tone = s < 0 ? C.tx2 : GREEN;
            return (
              <button
                key={s}
                type="button"
                onClick={() => step(s)}
                style={{
                  flex: 1,
                  height: 44,
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
                <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.1em", color: tone }}>{fmtStep(s)}</span>
                <span style={{ ...MONO, fontSize: 14, color: C.tx }}>{stepped(s)}</span>
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
            Valider
          </button>
        </div>
      </div>
    </>
  );
}
