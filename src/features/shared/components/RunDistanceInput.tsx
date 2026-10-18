import { C } from "@/lib/theme";

export type ActivityType = "course" | "velo" | "rameur" | "natation" | "autre";

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  course:   "Course",
  velo:     "Vélo",
  rameur:   "Rameur",
  natation: "Natation",
  autre:    "Autre",
};

export interface RunDistanceValue {
  activity: ActivityType;
  /** Saisie brute (virgule acceptée) */
  km: string;
}

/** Distance pré-remplie : distance prévue de la séance (m) si connue */
export function initialRunDistance(plannedDistanceM?: number | null): RunDistanceValue {
  return {
    activity: "course",
    km: plannedDistanceM && plannedDistanceM > 0 ? String(Math.round(plannedDistanceM / 100) / 10) : "",
  };
}

/** km saisis → nombre (null si vide / invalide) */
export function parseKm(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Champs prêts pour useCompleteEnergyAssignment */
export function runDistancePayload(v: RunDistanceValue): { activity_type: ActivityType; distance_km: number | null } {
  return { activity_type: v.activity, distance_km: v.activity === "course" ? parseKm(v.km) : null };
}

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
