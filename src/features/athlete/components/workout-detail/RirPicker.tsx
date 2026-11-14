import { ACCENT, RIR_ITEMS } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { getRirColor } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

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
          background: C.s1, borderRadius: "20px 20px 0 0", borderTop: `1px solid ${C.brdL}`,
          maxWidth: 480, margin: "0 auto",
        }}
      >
        {/* Label + selected value display */}
        <div style={{ padding: "16px 20px 10px", textAlign: "center" }}>
          <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, marginBottom: 6 }}>
            RIR ressenti · reps en réserve
          </div>
          <div
            style={{
              ...MONO, fontSize: 48, lineHeight: 1, color: selColor,
              minHeight: 52, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10,
            }}
          >
            {value ? (
              <>
                <span>{selectedItem?.label ?? value}</span>
                {selectedItem?.desc && (
                  <span style={{ fontFamily: "inherit", fontSize: 13, color: C.tx2 }}>
                    {selectedItem.desc}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: C.tx3, fontSize: 28 }}>—</span>
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
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(item.val)}
                style={{
                  ...MONO,
                  height: 52, borderRadius: 12,
                  border: 0,
                  background: selected ? color : C.s2,
                  color: selected ? C.ink : C.tx,
                  fontSize: 16,
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
        <div style={{ padding: "4px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%", height: 52, borderRadius: 12,
              border: "none",
              background: value ? ACCENT : C.s2,
              color: value ? C.ink : C.tx3,
              fontSize: 15, fontWeight: 600,
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
