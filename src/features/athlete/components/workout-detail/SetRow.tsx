import { ACCENT_ALT, GREEN } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import type { SetState } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { haptic, hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── SetRow ─────────────────────────────────────────────────────────────────────

export interface SetRowProps {
  setIdx: number;
  state: SetState;
  prevStr: string;
  chargeUnit: string;
  isIso?: boolean;
  indexLabel?: string;
  indexColor?: string;
  onToggle: () => void;
  onOpenPad: (field: "kg" | "reps" | "rir") => void;
  isCompleted: boolean;
  canRemove?: boolean;
  onRemoveSet?: () => void;
}

export function SetRow({ setIdx, state, prevStr, chargeUnit, isIso, indexLabel, indexColor, onToggle, onOpenPad, isCompleted, canRemove, onRemoveSet }: SetRowProps) {
  const isPDC = chargeUnit === "PDC";
  const checkState = state.done ? "done" : state.skipped ? "skip" : "empty";
  const gridCols = isPDC
    ? "34px 1fr 1.15fr 0.9fr 40px"
    : "34px 1fr 1.15fr 1.15fr 0.9fr 40px";

  function cell(field: "kg" | "reps" | "rir", val: string) {
    return (
      <div
        onClick={() => !isCompleted && onOpenPad(field)}
        style={{
          background: state.done ? hexToRgba(GREEN, 0.06) : C.s2,
          border: `1px solid ${state.done ? hexToRgba(GREEN, 0.3) : C.brdL}`,
          borderRadius: 4,
          padding: "7px 2px",
          color: state.done ? GREEN : state.skipped ? C.tx3 : C.tx,
          fontSize: 13,
          fontWeight: 700,
          textAlign: "center" as const,
          cursor: isCompleted ? "default" : "pointer",
          transition: "all 100ms",
          minHeight: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: state.skipped ? "line-through" : "none",
        }}
      >
        {val || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 11 }}>—</span>}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: 5,
        alignItems: "center",
        padding: "5px 0",
        borderBottom: `1px solid ${C.brd}`,
      }}
    >
      {/* Set number / remove bonus */}
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: indexColor ?? C.tx3 }}>
        {canRemove && onRemoveSet ? (
          <button
            onClick={onRemoveSet}
            style={{
              width: 22, height: 22, borderRadius: 6,
              border: `1px solid ${hexToRgba(ACCENT_ALT, 0.5)}`,
              background: hexToRgba(ACCENT_ALT, 0.12),
              color: ACCENT_ALT, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >×</button>
        ) : (indexLabel ?? setIdx + 1)}
      </div>

      {/* kg */}
      {!isPDC && cell("kg", state.kg)}

      {/* reps — en iso la valeur est une durée en secondes */}
      {cell("reps", state.reps ? (isIso ? `${state.reps} s` : state.reps) : "")}

      {/* prev perf */}
      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          color: C.tx3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {prevStr || "—"}
      </div>

      {/* rir */}
      {cell("rir", state.rir)}

      {/* 3-state checkmark */}
      <button
        onClick={() => {
          if (!isCompleted) {
            onToggle();
            haptic();
          }
        }}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `2px solid ${
            checkState === "done" ? GREEN : checkState === "skip" ? ACCENT_ALT : C.brdL
          }`,
          background:
            checkState === "done"
              ? GREEN
              : checkState === "skip"
              ? hexToRgba(ACCENT_ALT, 0.18)
              : "transparent",
          color:
            checkState === "done"
              ? C.tx
              : checkState === "skip"
              ? ACCENT_ALT
              : C.tx3,
          fontSize: 14,
          fontWeight: 700,
          cursor: isCompleted ? "default" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          flexShrink: 0,
          justifySelf: "center" as const,
          minWidth: 32,
          opacity: checkState === "empty" ? 0.35 : 1,
        }}
      >
        {checkState === "skip" ? "✕" : "✓"}
      </button>
    </div>
  );
}
