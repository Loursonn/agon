import { C } from "@/lib/theme";
import type { NutritionDailyLog } from "@/lib/nutrition";

export function NutritionDayView({ nutrition }: { nutrition: NutritionDailyLog }) {
  const { total_calories_consumed: kcal, active_calories: active, glucides_consumed: glucides, lipides_consumed: lipides, proteines_consumed: proteines } = nutrition;
  const hasMacros = glucides != null || lipides != null || proteines != null;
  return (
    <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      {kcal != null && (
        <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: hasMacros ? 6 : 0 }}>
          {kcal} <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>kcal</span>
          {active != null && <span style={{ fontSize: 10, color: C.tx3, fontWeight: 400, marginLeft: 8 }}>(dépense : {active} kcal)</span>}
        </div>
      )}
      {hasMacros && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
          {proteines != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Prot.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#33B5FF" }}>{proteines}g</span></div>}
          {glucides != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Gluc.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>{glucides}g</span></div>}
          {lipides != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Lip.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444" }}>{lipides}g</span></div>}
        </div>
      )}
    </div>
  );
}
