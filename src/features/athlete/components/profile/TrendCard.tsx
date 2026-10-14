import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";
import { C } from "@/lib/theme";
import type { TrendPoint } from "@/lib/athleteTrends";

interface Props {
  label: string;
  value: string;
  unit?: string;
  /** Écart vs période précédente (affiché avec flèche) */
  delta?: number | null;
  deltaUnit?: string;
  /** true = hausse positive, false = baisse positive, null = neutre */
  goodWhenUp?: boolean | null;
  sub?: string;
  series?: TrendPoint[];
  color: string;
  /** 0–100 : barre de progression à la place de la courbe */
  progress?: number | null;
  onClick?: () => void;
}

export function TrendCard({ label, value, unit, delta, deltaUnit = "", goodWhenUp = true, sub, series, color, progress, onClick }: Props) {
  const hasDelta = delta !== null && delta !== undefined && delta !== 0;
  const good = !hasDelta || goodWhenUp === null ? null : (delta! > 0) === goodWhenUp;
  const deltaColor = good === null ? C.tx3 : good ? C.g : C.r;
  const points = (series ?? []).filter(p => p.value !== null).length;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "12px 12px 10px",
        textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit",
        display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: value === "—" ? C.tx3 : color, letterSpacing: "-0.5px", lineHeight: 1.1 }}>{value}</span>
        {unit && value !== "—" && <span style={{ fontSize: 10, color: C.tx3 }}>{unit}</span>}
        {hasDelta && (
          <span style={{ fontSize: 10, fontWeight: 700, color: deltaColor }}>
            {delta! > 0 ? "▲" : "▼"} {Math.abs(delta!)}{deltaUnit}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 10, color: C.tx3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      {progress !== undefined && progress !== null ? (
        <div style={{ height: 5, background: C.s2, borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
          <div style={{ height: "100%", width: Math.min(100, Math.max(0, progress)) + "%", background: color, borderRadius: 3 }} />
        </div>
      ) : points >= 2 ? (
        <div style={{ height: 30, marginTop: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line dataKey="value" stroke={color} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 10, color: C.tx3 }}>Pas assez de données</div>
      )}
    </button>
  );
}
