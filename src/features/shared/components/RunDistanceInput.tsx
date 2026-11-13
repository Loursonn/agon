import { C } from "@/lib/theme";
import { type ActivityType, ACTIVITY_LABEL, type RunDistanceValue } from "./runDistance";







/**
 * Fin de séance énergie / spécifique : activité réellement faite + distance
 * réalisée (comptée dans le volume de course si « Course »). Facultatif.
 */
export function RunDistanceInput({ value, onChange }: {
  value: RunDistanceValue;
  onChange: (v: RunDistanceValue) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Activité réalisée
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((a) => {
          const active = value.activity === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, activity: a })}
              style={{
                padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                border: "1px solid " + (active ? C.ac : C.brdL),
                background: active ? C.acS : "transparent",
                color: active ? C.ac : C.tx3,
              }}
            >
              {ACTIVITY_LABEL[a]}
            </button>
          );
        })}
      </div>
      {value.activity === "course" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.tx2, flex: 1 }}>Distance courue</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.km}
            onChange={(e) => onChange({ ...value, km: e.target.value })}
            placeholder="0"
            style={{
              width: 80, padding: "8px 10px", borderRadius: 4, textAlign: "right",
              border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
              fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none",
            }}
          />
          <span style={{ fontSize: 12, color: C.tx3 }}>km</span>
        </label>
      )}
    </div>
  );
}
