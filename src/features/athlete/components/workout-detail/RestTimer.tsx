import { ACCENT, ACCENT_ALT, RING_C, RING_R } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";

// ── RestTimer ──────────────────────────────────────────────────────────────────

export interface RestTimerProps {
  left: number;
  total: number;
  nextInfo: string | null;
  loop?: boolean;
  onDismiss: () => void;
}

export function RestTimer({ left, total, nextInfo, loop, onDismiss }: RestTimerProps) {
  const offset = RING_C * (1 - left / total);
  const isUrgent = left <= 10;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        bottom: 90,
        right: 16,
        zIndex: 30,
        background: C.s1,
        borderRadius: 6,
        border: `1px solid ${isUrgent ? ACCENT_ALT : C.brdL}`,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        maxWidth: 220,
      }}
    >
      {/* SVG ring */}
      <div style={{ flexShrink: 0 }}>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle
            cx={22} cy={22} r={RING_R}
            fill="none" stroke={C.brd} strokeWidth={3}
          />
          <circle
            cx={22} cy={22} r={RING_R}
            fill="none"
            stroke={isUrgent ? ACCENT_ALT : ACCENT}
            strokeWidth={3}
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
          <text
            x={22} y={22}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isUrgent ? ACCENT_ALT : C.tx}
            fontSize={10}
            fontWeight={700}
            fontFamily="inherit"
          >
            {left}s
          </text>
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{loop ? "Départ ∞" : "Repos"}</div>
        {nextInfo && (
          <div
            style={{
              fontSize: 9,
              color: C.tx3,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 130,
            }}
          >
            Suiv. : {nextInfo}
          </div>
        )}
        <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>Tap pour ignorer</div>
      </div>
    </div>
  );
}
