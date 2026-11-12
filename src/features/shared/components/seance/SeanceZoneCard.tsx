import { Link } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { DASH, fmtMinSec, zoneColor } from "@/lib/seance";
import { zoneShares, type TimeInZones } from "@shared/domain/hrZones";
import { CARD, KICKER, MONO } from "./seanceUi";

interface Props {
  zones: TimeInZones | null;
  bounds: number[] | null;
  /** La série a-t-elle une FC ? */
  hasHr: boolean;
  /** Lien vers la saisie du test « Seuils ventilatoires (FC) ». */
  thresholdsLink: string | null;
  /** Durée affichée en haut à droite (« 48 min 10 s »). */
  totalS: number | null;
  compact: boolean;
}

const SUB = ["sous SV1", "SV1 → SV2", "au-dessus de SV2"];

/** Temps par zone (modèle Agon à 3 zones, ou N zones) ; « — » sans FC ou sans seuils. */
export function SeanceZoneCard({ zones, bounds, hasHr, thresholdsLink, totalS, compact }: Props) {
  const n = bounds ? bounds.length + 1 : 3;
  const shares = zoneShares(zones);
  const empty = !zones || !bounds || !shares;
  return (
    <div style={{ ...CARD, padding: compact ? "14px" : "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={KICKER}>Temps par zone</span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{totalS != null ? fmtMinSec(totalS) : ""}</span>
      </div>

      <div style={{ display: "flex", gap: 2, height: 10, borderRadius: 999, overflow: "hidden", background: alpha(C.tx3, 0.25) }}>
        {!empty && shares!.map((p, i) => (p > 0 ? <div key={i} style={{ width: `${p}%`, background: zoneColor(i + 1, n) }} /> : null))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: empty ? alpha(C.tx3, 0.5) : zoneColor(i + 1, n), flex: "none" }} />
            <span style={{ color: empty ? C.tx3 : C.tx, fontWeight: 500 }}>Zone {i + 1}</span>
            {!compact && n === 3 && <span style={{ color: C.tx3 }}>{SUB[i]}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ ...MONO, color: empty ? C.tx3 : zoneColor(i + 1, n), minWidth: 90, textAlign: "right" }}>
              {empty ? DASH : fmtMinSec(zones!.seconds[i])}
            </span>
            <span style={{ ...MONO, color: C.tx2, width: 44, textAlign: "right" }}>{empty ? "" : `${Math.round(shares![i])} %`}</span>
          </div>
        ))}
      </div>

      <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>
        {!hasHr ? (
          "Pas de fréquence cardiaque sur cette activité."
        ) : !bounds ? (
          <span style={{ fontFamily: "var(--agon-font-ui)", fontSize: 12, color: C.tx2 }}>
            SV1 et SV2 pas encore saisis.{" "}
            {thresholdsLink && <Link to={thresholdsLink} style={{ color: C.ac, textDecoration: "none" }}>Définir mes seuils ›</Link>}
          </span>
        ) : bounds.length === 2 ? (
          `SV1 ${bounds[0]} bpm · SV2 ${bounds[1]} bpm`
        ) : (
          `Bornes ${bounds.join(" · ")} bpm`
        )}
      </div>
    </div>
  );
}
