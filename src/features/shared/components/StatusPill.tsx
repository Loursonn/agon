/** Status pill for workout/session states — palette v2 */

export type SessionStatus = "planned" | "in-progress" | "completed" | "missed" | "skipped";

const CONFIG: Record<
  SessionStatus,
  { label: string; bg: string; color: string; dot: string }
> = {
  planned: {
    label: "Planifiée",
    bg:    "rgba(231,211,168,0.18)",
    color: "#7D7468",
    dot:   "#7D7468",
  },
  "in-progress": {
    label: "En cours",
    bg:    "rgba(255,201,51,0.18)",
    color: "#FFC933",
    dot:   "#FFC933",
  },
  completed: {
    label: "Terminée",
    bg:    "rgba(34,201,147,0.15)",
    color: "#66F03C",
    dot:   "#66F03C",
  },
  missed: {
    label: "Manquée",
    bg:    "rgba(251,146,60,0.15)",
    color: "#FF9500",
    dot:   "#FF9500",
  },
  skipped: {
    label: "Ignorée",
    bg:    "rgba(244,114,182,0.15)",
    color: "#FFC933",
    dot:   "#FFC933",
  },
};

interface StatusPillProps {
  status: SessionStatus;
  label?: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, label, size = "md" }: StatusPillProps) {
  const cfg = CONFIG[status];
  const fs = size === "sm" ? 10 : 11;
  const dotSize = size === "sm" ? 5 : 6;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        borderRadius: 6,
        background: cfg.bg,
        color: cfg.color,
        fontSize: fs,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {label ?? cfg.label}
    </span>
  );
}
