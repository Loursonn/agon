import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { C } from "@/lib/theme";

interface RadarSeries {
  name: string;
  color: string;
  axes: { key: string; label: string; value: number | null }[];
}

interface Props {
  series: RadarSeries[];
  height?: number;
}

export default function HyroxRadar({ series, height = 320 }: Props) {
  if (series.length === 0 || series[0].axes.length === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune donnée radar</div>;
  }

  // Merge axes — use first series for labels, filter out null-value axes from ALL series
  const allKeys = series[0].axes.map(a => a.key);
  const availableKeys = allKeys.filter(key =>
    series.some(s => s.axes.find(a => a.key === key)?.value != null)
  );
  const unavailable = allKeys.filter(k => !availableKeys.includes(k));

  const data = availableKeys.map(key => {
    const row: Record<string, string | number> = {
      label: series[0].axes.find(a => a.key === key)?.label ?? key,
    };
    series.forEach((s, i) => {
      const ax = s.axes.find(a => a.key === key);
      row[`s${i}`] = ax?.value ?? 0;
    });
    return row;
  });

  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 8px" }}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke={C.brd} />
          <PolarAngleAxis dataKey="label" tick={{ fill: C.tx2, fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          {series.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={`s${i}`}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4 }}>
        {series.map(s => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ fontSize: 10, color: C.tx2 }}>{s.name}</span>
          </div>
        ))}
      </div>

      {/* Unavailable axes note */}
      {unavailable.length > 0 && (
        <div style={{ fontSize: 10, color: C.tx3, textAlign: "center", marginTop: 6 }}>
          réf. n.d. : {unavailable.map(k => series[0].axes.find(a => a.key === k)?.label ?? k).join(", ")}
        </div>
      )}
    </div>
  );
}
