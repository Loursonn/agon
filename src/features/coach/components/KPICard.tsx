import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
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
  /** Tuile colorée (planche CoachRetours) : aplat 12 %, liseré 3 px, chiffre mono dans la couleur. */
  accent?: string;
}

/**
 * Single KPI tile for the coach home dashboard.
 */
export function KPICard({
  icon, title, value, subtitle, subtitle2, valueColor, loading = false, onClick, accent,
}: KPICardProps) {
  if (accent) {
    return (
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        style={{
          position: "relative", overflow: "hidden", borderRadius: 14, padding: "14px 16px 14px 19px",
          border: `1px solid ${alpha(accent, 0.42)}`, background: alpha(accent, 0.12),
          display: "flex", flexDirection: "column", gap: 8, cursor: onClick ? "pointer" : "default", minWidth: 0,
        }}
      >
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", color: accent, flexShrink: 0 }}>{icon}</span>
          <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        </div>
        {loading ? (
          <Skeleton style={{ height: 32, width: "60%", borderRadius: 6, background: C.s2 }} />
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
            <span style={{ ...MONO, fontSize: 32, lineHeight: 1, color: value == null ? C.tx3 : accent }}>{value ?? "—"}</span>
            {subtitle && <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>{subtitle}</span>}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: C.tx2, height: 16, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle2 ?? ""}</div>
      </div>
    );
  }

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
