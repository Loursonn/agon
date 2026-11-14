import { C } from "@/lib/theme";
import type { WellnessData } from "@/features/shared/types/athlete";
import { WELLNESS_ITEMS, WELLNESS_ITEM_SHORT } from "@shared/domain/wellness";
import { wellnessView } from "@/lib/wellness";

export function WellnessDayView({ wellness }: { wellness: WellnessData }) {
  // Score et palier : domaine wellness (même calcul que l'athlète et les Retours).
  const { items, score, reco, injuryNote: injury } = wellnessView(wellness);
  const color = reco.c;
  const metrics = WELLNESS_ITEMS
    .map((k) => ({ k: WELLNESS_ITEM_SHORT[k], v: items[k] }))
    .filter((m): m is { k: string; v: number } => m.v != null);
  return (
    <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: metrics.length > 0 || injury ? 8 : 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>{score ?? "—"}</span>
        <span style={{ fontSize: 9, color: C.tx3 }}>/100</span>
        {score != null && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: color + "20", color }}>{reco.label}</span>}
        {wellness.poids != null && <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>{wellness.poids} kg</span>}
      </div>
      {injury && (
        <div style={{ marginBottom: metrics.length > 0 ? 8 : 0, padding: "6px 8px", borderRadius: 4, background: C.r + "12", border: "1px solid " + C.r + "40" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.r, textTransform: "uppercase", marginBottom: 2 }}>Blessé / malade</div>
          <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.4 }}>{injury}</div>
        </div>
      )}
      {metrics.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
          {metrics.map(({ k, v }) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 9, color: C.tx3 }}>{k}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{v}/5</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
