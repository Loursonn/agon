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
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className="flex h-2 overflow-hidden rounded-[4px]">
        {names.map((_, i) => <span key={i} className="flex-1" style={{ background: zoneColor(i + 1, n) }} />)}
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1">
        {names.map((name, i) => {
          const lo = i === 0 ? null : bounds[i - 1];
          const hi = i === n - 1 ? null : bounds[i] - 1;
          return (
            <div key={i} className="contents">
              <span className="agon-mono rounded-full px-[7px] py-px text-[11px] text-agon-bg" style={{ background: zoneColor(i + 1, n) }}>Z{i + 1}</span>
              <span className="text-[12px] text-agon-tx2">{name}</span>
              <span className="agon-mono text-right text-[12px] text-agon-tx">
                {lo == null ? `< ${bounds[0]}` : hi == null ? `≥ ${lo}` : `${lo}–${hi}`} bpm
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
