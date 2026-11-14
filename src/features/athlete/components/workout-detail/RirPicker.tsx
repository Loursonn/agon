import { ACCENT, RIR_ITEMS } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import { getRirColor, hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── RirPicker ──────────────────────────────────────────────────────────────────

export interface RirPickerProps {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function RirPicker({ value, onChange, onConfirm, onClose }: RirPickerProps) {
  const selectedItem = RIR_ITEMS.find((r) => r.val === value);
  const selColor = value ? getRirColor(value) : ACCENT;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 41,
          background: C.s1, borderRadius: "6px 6px 0 0",
          maxWidth: 480, margin: "0 auto",
        }}
      >
        {/* Label + selected value display */}
        <div style={{ padding: "16px 20px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3, fontWeight: 600, marginBottom: 4 }}>
            RIR — Reps en réserve
          </div>
          <div
            style={{
              fontSize: 36, fontWeight: 900, color: selColor,
              minHeight: 44, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10,
            }}
          >
            {value ? (
              <>
                <span>{selectedItem?.label ?? value}</span>
                {selectedItem?.desc && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.tx3 }}>
                    {selectedItem.desc}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: C.tx3, fontWeight: 400, fontSize: 22 }}>—</span>
            )}
          </div>
        </div>

        {/* 4-column grid of RIR values */}
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, padding: "0 12px 8px",
          }}
        >
          {RIR_ITEMS.map((item) => {
            const color = getRirColor(item.val);
            const selected = value === item.val;
            return (
              <button
                key={item.val}
                onClick={() => onChange(item.val)}
                style={{
                  height: 52, borderRadius: 4,
                  border: `2px solid ${selected ? color : hexToRgba(color, 0.3)}`,
                  background: selected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.07),
                  color: selected ? color : C.tx2,
                  fontSize: 15, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 120ms",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Confirm */}
        <div style={{ padding: "4px 12px 28px" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 6,
              border: "none",
              background: value ? selColor : C.s2,
              color: value ? C.tx : C.tx3,
              fontSize: 14, fontWeight: 700,
              cursor: value ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            Valider
          </button>
        </div>
      </div>
    </>
  );
}
