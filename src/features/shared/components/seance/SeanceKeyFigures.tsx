import { C } from "@/lib/theme";
import { DASH, fmtClock, fmtInt, fmtKm, fmtPace, fmtUpDown, SERIES_COLORS, sportFamily, zoneColor } from "@/lib/seance";
import type { ActivityDetail, DetailLapWithMetrics } from "@/lib/activityDetail";
import type { LapKind } from "@/lib/seance";
import { CARD, MONO } from "./seanceUi";
import type { Figure } from "./seanceFigures";



export function SeanceKeyFigures({ figures, compact }: { figures: Figure[]; compact: boolean }) {
  if (compact) {
    // Téléphone : 2 colonnes pour les 4 premiers, 3 colonnes ensuite.
    const head = figures.slice(0, 4);
    const tail = figures.slice(4);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {head.map((f) => <FigureCard key={f.label} f={f} size={24} />)}
        </div>
        {tail.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, tail.length)}, 1fr)`, gap: 8 }}>
            {tail.map((f) => <FigureCard key={f.label} f={f} size={16} />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`, gap: 10 }}>
      {figures.map((f) => <FigureCard key={f.label} f={f} size={24} />)}
    </div>
  );
}

function FigureCard({ f, size }: { f: Figure; size: number }) {
  return (
    <div style={{ ...CARD, padding: size > 20 ? "12px 14px" : "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
        <span style={{ ...MONO, fontSize: size, color: f.value === DASH ? C.tx3 : f.color ?? C.tx, lineHeight: 1.1 }}>{f.value}</span>
        {f.unit && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{f.unit}</span>}
      </div>
    </div>
  );
}
