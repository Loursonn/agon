import { AlertTriangle } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { KICKER } from "@/features/shared/components/seance/seanceUi";
import type { HyroxAlert } from "@/features/shared/types/hyrox";
import type { CompareKind } from "@/lib/hyrox/raceCompare";

/**
 * « Comparer à » (coach) : course précédente, plan de course ou médiane du
 * niveau ; change la colonne Écart et le pointillé d'allure. Les alertes de la
 * course (`alerts()`) à droite.
 */
export default function RaceCompareBar({ value, onChange, options, alerts }: {
  value: CompareKind;
  onChange: (k: CompareKind) => void;
  options: Array<{ key: CompareKind; label: string; available: boolean }>;
  alerts: HyroxAlert[];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}>Comparer à</span>
        <div role="radiogroup" aria-label="Comparer à" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s1 }}>
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button key={o.key} type="button" role="radio" aria-checked={on} disabled={!o.available} onClick={() => onChange(o.key)}
                title={o.available ? undefined : o.key === "plan" ? "Aucun plan de course pour cette course" : "Pas de course précédente"}
                style={{
                  height: 30, padding: "0 12px", borderRadius: 7, border: "none", fontSize: 12.5, fontFamily: "inherit", whiteSpace: "nowrap",
                  background: on ? C.s2 : "transparent", color: !o.available ? C.tx3 : on ? C.tx : C.tx2,
                  cursor: o.available ? "pointer" : "not-allowed", opacity: o.available ? 1 : 0.55,
                }}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {alerts.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, fontSize: 12.5,
          border: `1px solid ${alpha(C.o, 0.45)}`, background: alpha(C.o, 0.08), color: C.tx,
        }}>
          <AlertTriangle size={14} color={C.o} />
          <span><b style={{ fontWeight: 600 }}>{alerts.length} alerte{alerts.length > 1 ? "s" : ""}</b> · {alerts.map((a) => a.message).join(" · ")}</span>
        </div>
      )}
    </div>
  );
}
