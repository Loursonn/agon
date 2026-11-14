import { ACCENT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── BadgeTag ───────────────────────────────────────────────────────────────────

export function BadgeTag({ label, color = ACCENT }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 6,
        background: hexToRgba(color, 0.12),
        color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.2px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
