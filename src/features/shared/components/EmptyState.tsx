import type { LucideIcon } from "lucide-react";
import { C } from "@/lib/theme";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Generic empty state component.
 * Use when a list/table/section has no data to display.
 */
export function EmptyState({ icon: Icon, title, description, cta }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        borderRadius: 6,
        border: "1px dashed rgba(255,255,255,0.08)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 6,
          background: "rgba(255,201,51,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon size={22} color={C.ac} strokeWidth={1.5} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 6 }}>
        {title}
      </div>

      {description && (
        <div style={{ fontSize: 12, color: C.tx3, maxWidth: 280, lineHeight: 1.5 }}>
          {description}
        </div>
      )}

      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            marginTop: 20,
            padding: "8px 20px",
            borderRadius: 4,
            border: "1px solid " + C.ac + "50",
            background: "rgba(255,201,51,0.12)",
            color: C.ac,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 150ms ease-out",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "rgba(255,201,51,0.22)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "rgba(255,201,51,0.12)")
          }
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
