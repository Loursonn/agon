import { ACCENT_ALT, GREEN } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
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
  /** Série à saisir maintenant : carte dorée, case à cocher cerclée d'or. */
  isCurrent?: boolean;
}

export function SetRow({ setIdx, state, prevStr, chargeUnit, isIso, indexLabel, indexColor, onToggle, onOpenPad, isCompleted, canRemove, onRemoveSet, isCurrent }: SetRowProps) {
  const isPDC = chargeUnit === "PDC";
  const checkState = state.done ? "done" : state.skipped ? "skip" : "empty";
  const gridCols = isPDC
    ? "28px 1fr 1.3fr 0.8fr 42px"
    : "28px 1.1fr 0.8fr 1.3fr 0.7fr 42px";

  const live = state.done || isCurrent;
  // Décimales à la française (« 1,5 », « 57,5 × 8 ») : le stockage garde le point
  const fr = (v: string) => v.replace(".", ",");
  // Planche SeanceEnCours : valeurs en Geist Mono 16, grises tant que la série n'est ni faite ni en cours
  function cell(field: "kg" | "reps" | "rir", val: string) {
    return (
      <div
        onClick={() => !isCompleted && onOpenPad(field)}
        style={{
          ...MONO,
          color: state.skipped ? C.tx3 : live ? C.tx : C.tx3,
          fontSize: 16,
          textAlign: "center" as const,
          cursor: isCompleted ? "default" : "pointer",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          whiteSpace: "nowrap",
          textDecoration: state.skipped ? "line-through" : "none",
        }}
      >
        {val ? fr(val) : <span style={{ color: C.tx3, fontSize: 13 }}>—</span>}
      </div>
    );
  }

  const rowStyle = state.done
    ? { background: alpha(GREEN, 0.12), border: `1px solid ${alpha(GREEN, 0.45)}` }
    : isCurrent
    ? { background: alpha(C.ac, 0.12), border: `1.5px solid ${C.ac}` }
    : { background: C.s1, border: `1px solid ${C.brd}` };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: 4,
        alignItems: "center",
        minHeight: 52,
        boxSizing: "border-box",
        padding: "0 4px 0 6px",
        borderRadius: 14,
        ...rowStyle,
      }}
    >
      {/* Set number / remove bonus */}
      <div style={{ ...MONO, textAlign: "center", fontSize: 13, color: indexColor ?? C.tx3 }}>
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
          ...MONO,
          textAlign: "center",
          fontSize: 12,
          color: C.tx3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {prevStr && prevStr !== "—" ? fr(prevStr).replace(/\s*×\s*/, " × ") : "—"}
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
        aria-label={checkState === "done" ? "Série faite" : checkState === "skip" ? "Série passée" : "Valider la série"}
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          boxSizing: "border-box",
          border:
            checkState === "done" ? "0"
            : checkState === "skip" ? `1.5px solid ${ACCENT_ALT}`
            : isCurrent ? `2px solid ${C.ac}`
            : `1px dashed ${C.brdL}`,
          background:
            checkState === "done" ? GREEN
            : checkState === "skip" ? hexToRgba(ACCENT_ALT, 0.18)
            : "transparent",
          color: checkState === "done" ? C.ink : checkState === "skip" ? ACCENT_ALT : "transparent",
          fontSize: 18,
          fontWeight: 700,
          cursor: isCompleted ? "default" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          flexShrink: 0,
          justifySelf: "end" as const,
          padding: 0,
        }}
      >
        {checkState === "skip" ? "✕" : "✓"}
      </button>
    </div>
  );
}
