import { C } from "@/lib/theme";
import { Skeleton } from "@/components/ui/skeleton";

interface KPICardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number | null;
  subtitle?: string;
  subtitle2?: string;
  valueColor?: string;
  loading?: boolean;
  onClick?: () => void;
}

/**
 * Single KPI tile for the coach home dashboard.
 */
export function KPICard({
  icon, title, value, subtitle, subtitle2, valueColor, loading = false, onClick,
}: KPICardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.s1,
        border: "1px solid " + C.brd,
        borderRadius: 6,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 150ms",
        minHeight: 96,
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = C.ac + "50";
      }}
      onMouseLeave={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = C.brd;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <span style={{ fontSize: 16, display: "flex", alignItems: "center" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {title}
        </span>
      </div>

      {loading ? (
        <>
          <Skeleton style={{ height: 32, width: "60%", borderRadius: 6, background: C.s2, alignSelf: "center" }} />
          {subtitle && <Skeleton style={{ height: 14, width: "80%", borderRadius: 4, background: C.s2, alignSelf: "center" }} />}
        </>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 800, color: valueColor ?? C.tx, lineHeight: 1, letterSpacing: "-0.5px", textAlign: "center" }}>
            {value ?? "—"}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: C.tx3, marginTop: -2, textAlign: "center" }}>{subtitle}</div>
          )}
          {subtitle2 && (
            <div style={{ fontSize: 10, color: C.tx3, marginTop: -4, textAlign: "center" }}>{subtitle2}</div>
          )}
        </>
      )}
    </div>
  );
}
