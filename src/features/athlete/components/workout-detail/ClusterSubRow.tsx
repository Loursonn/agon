import { ACCENT_ALT, GREEN, ORANGE } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import type { SetState } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import { haptic, hexToRgba, parsePrevVal } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── ClusterSubRow ──────────────────────────────────────────────────────────────


export interface ClusterSubRowProps {
  clusterIdx: number;
  prescribedReps: number;
  state: SetState;
  chargeUnit: string;
  prevStr: string;
  canEdit: boolean;
  onToggle: () => void;
  onOpenPad: () => void;
}

export function ClusterSubRow({
  clusterIdx,
  prescribedReps,
  state,
  chargeUnit,
  prevStr,
  canEdit,
  onToggle,
  onOpenPad,
}: ClusterSubRowProps) {
  const isPDC = chargeUnit === "PDC";
  const checkState = state.done ? "done" : state.skipped ? "skip" : "empty";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isPDC ? "26px 1fr 44px 34px" : "26px 1fr 1fr 44px 34px",
      gap: 4,
      alignItems: "center",
      padding: "3px 0",
      borderBottom: `1px solid ${C.brd}`,
    }}>
      {/* Cluster badge */}
      <div style={{
        textAlign: "center",
        fontSize: 8,
        fontWeight: 800,
        color: ORANGE,
        background: "rgba(245,166,35,0.15)",
        borderRadius: 4,
        padding: "2px 0",
        lineHeight: "1.4",
      }}>
        C{clusterIdx + 1}
      </div>

      {/* Charge */}
      {!isPDC && (
        <div
          onClick={() => canEdit && onOpenPad()}
          style={{
            background: state.done ? hexToRgba(GREEN, 0.06) : C.s2,
            border: `1px solid ${state.done ? hexToRgba(GREEN, 0.3) : C.brdL}`,
            borderRadius: 7,
            padding: "5px 2px",
            color: state.done ? GREEN : C.tx,
            fontSize: 12,
            fontWeight: 700,
            textAlign: "center" as const,
            cursor: canEdit ? "pointer" : "default",
            minHeight: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {state.kg || <span style={{ color: C.tx3, fontWeight: 400, fontSize: 10 }}>—</span>}
        </div>
      )}

      {/* Prescribed reps (fixed) */}
      <div style={{
        background: "rgba(245,166,35,0.1)",
        border: "1px solid rgba(245,166,35,0.25)",
        borderRadius: 7,
        padding: "5px 2px",
        color: ORANGE,
        fontSize: 12,
        fontWeight: 800,
        textAlign: "center" as const,
        minHeight: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {prescribedReps}
      </div>

      {/* Prev */}
      <div style={{
        textAlign: "center",
        fontSize: 10,
        color: C.tx3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {prevStr ? (parsePrevVal(prevStr, "kg") || "—") : "—"}
      </div>

      {/* Checkmark */}
      <button
        onClick={() => { if (canEdit) { onToggle(); haptic(); } }}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `2px solid ${
            checkState === "done" ? GREEN : checkState === "skip" ? ACCENT_ALT : C.brdL
          }`,
          background: checkState === "done" ? GREEN : checkState === "skip" ? hexToRgba(ACCENT_ALT, 0.18) : "transparent",
          color: checkState === "done" ? C.tx : checkState === "skip" ? ACCENT_ALT : C.tx3,
          fontSize: 12,
          fontWeight: 700,
          cursor: canEdit ? "pointer" : "default",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          flexShrink: 0,
          justifySelf: "center" as const,
          opacity: checkState === "empty" ? 0.35 : 1,
        }}
      >
        {checkState === "skip" ? "✕" : "✓"}
      </button>
    </div>
  );
}
