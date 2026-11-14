import { ACCENT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── BadgeTag ───────────────────────────────────────────────────────────────────

export function BadgeTag({ label, color = ACCENT }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        ...MONO,
        padding: "3px 9px",
        borderRadius: 999,
        background: hexToRgba(color, 0.12),
        border: `1px solid ${hexToRgba(color, 0.45)}`,
        color,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
