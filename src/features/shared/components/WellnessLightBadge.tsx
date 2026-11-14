import { C, alpha } from "@/lib/theme";
import type { Light, LightResult } from "@shared/domain/wellnessLight";

const LABEL: Record<Light, string> = { green: "Feu vert", orange: "Feu orange", red: "Feu rouge" };

function colorOf(light: Light): string {
  return light === "red" ? C.r : light === "orange" ? C.o : C.g;
}

/**
 * Feu du matin calculé (`_shared/domain/wellnessLight.ts`) : pastille, libellé,
 * phrase du signal principal. Sans donnée : « — ».
 * `detail` : liste aussi les autres signaux (vue coach).
 */
export function WellnessLightBadge({
  result,
  loading = false,
  detail = false,
}: {
  result: LightResult | null | undefined;
  loading?: boolean;
  detail?: boolean;
}) {
  if (loading) return null;
  if (!result) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.tx3 }} aria-label="Feu du matin : pas de donnée">
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", border: `1px solid ${C.brdL}` }} />
        Feu du matin —
      </div>
    );
  }
  const col = colorOf(result.light);
  const others = [...result.orange, ...result.redSigns]
    .map((s) => s.text)
    .filter((t, i, all) => t !== result.sentence && all.indexOf(t) === i);
  return (
    <div
      role="status"
      style={{
        display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px", borderRadius: 10,
        border: `1px solid ${alpha(col, 0.4)}`, background: alpha(col, 0.1),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: col, flex: "none" }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: col, whiteSpace: "nowrap" }}>{LABEL[result.light]}</span>
        <span style={{ fontSize: 13, color: C.tx2, minWidth: 0 }}>{result.sentence}</span>
      </div>
      {detail && others.length > 0 && (
        <div style={{ fontSize: 12, color: C.tx3, paddingLeft: 18 }}>{others.join(" · ")}</div>
      )}
      {detail && (
        <div style={{ fontSize: 11, color: C.tx3, paddingLeft: 18 }}>
          {result.brand ? `Mesures ${result.brand === "garmin" ? "Garmin" : result.brand === "coros" ? "COROS" : result.brand}` : "Sans montre : rouge seulement si malade"}
          {result.hrv.dayIndex != null && result.hrv.dayIndex < 14 ? ` · alerte VFC active au 14e jour (J${result.hrv.dayIndex})` : ""}
        </div>
      )}
    </div>
  );
}
