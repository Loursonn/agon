import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { zoneColor } from "@/lib/seance";
import { zoneNames } from "@shared/domain/hrZones";

/**
 * Aperçu des zones en bpm : une ligne par zone, pastille de couleur, nom,
 * plage. `bounds` = bornes basses des zones 2..N.
 */
export function ZoneBoundsBar({ bounds }: { bounds: readonly number[] }) {
  const n = bounds.length + 1;
  const names = zoneNames(n);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div aria-hidden style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
        {names.map((_, i) => <span key={i} style={{ flex: 1, background: zoneColor(i + 1, n) }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: 10, rowGap: 4, alignItems: "center" }}>
        {names.map((name, i) => {
          const lo = i === 0 ? null : bounds[i - 1];
          const hi = i === n - 1 ? null : bounds[i] - 1;
          return (
            <div key={i} style={{ display: "contents" }}>
              <span style={{ ...MONO, fontSize: 11, color: C.bg, background: zoneColor(i + 1, n), borderRadius: 999, padding: "1px 7px" }}>Z{i + 1}</span>
              <span style={{ fontSize: 12, color: C.tx2 }}>{name}</span>
              <span style={{ ...MONO, fontSize: 12, color: C.tx, textAlign: "right" }}>
                {lo == null ? `< ${bounds[0]}` : hi == null ? `≥ ${lo}` : `${lo}–${hi}`} bpm
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
