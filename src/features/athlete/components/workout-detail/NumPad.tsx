import { ACCENT, ACCENT_ALT, FIELD_CFG } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
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

  function step(delta: number) {
    const v = parseFloat(value.replace(",", ".")) || 0;
    const next = Math.max(0, v + delta);
    if (target.field === "kg") {
      const rounded = Math.round(next * 4) / 4;
      onChange(String(rounded).replace(".", ","));
    } else {
      onChange(String(Math.max(0, Math.round(next))));
    }
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
          borderRadius: "6px 6px 0 0",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {/* Label + value display */}
        <div style={{ padding: "16px 20px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3, fontWeight: 600, marginBottom: 4 }}>
            {cfg.label}
            {cfg.unit ? ` (${cfg.unit})` : ""}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: ACCENT,
              letterSpacing: "1px",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {value || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 22 }}>—</span>}
          </div>
        </div>

        {/* Steppers */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
          {cfg.steps.map((s) => (
            <button
              key={s}
              onClick={() => step(s)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 4,
                border: `1px solid ${C.brdL}`,
                background: C.s2,
                color: s < 0 ? ACCENT_ALT : ACCENT,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {s > 0 ? `+${s}` : s}
            </button>
          ))}
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
              onClick={() => press(k)}
              style={{
                padding: "14px 0",
                borderRadius: 4,
                border: `1px solid ${C.brdL}`,
                background: k === "←" ? hexToRgba(ACCENT_ALT, 0.1) : C.s2,
                color: k === "←" ? ACCENT_ALT : C.tx,
                fontSize: k === "←" ? 18 : 16,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Confirm */}
        <div style={{ padding: "4px 12px 28px" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: 6,
              border: "none",
              background: ACCENT,
              color: C.tx,
              fontSize: 14,
              fontWeight: 700,
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
