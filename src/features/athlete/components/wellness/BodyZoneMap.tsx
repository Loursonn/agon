import { BODY_ZONES, DOMS_LEVEL_COLOR, DOMS_LEVEL_LABEL, levelsList, setZoneLevel, touchZone, type BodyView } from "@/lib/bodyZones";
import type { DomsLevel, DomsLevels } from "@shared/domain/wellness";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";

const IDLE_FILL = "rgba(231,211,168,0.07)";
const IDLE_STROKE = "rgba(231,211,168,0.16)";

/** Carte du corps face / dos (planche wellness 12/11) : touche une zone, choisis son intensité. */
export function BodyZoneMap({
  levels, onChange, selected, onSelect,
}: {
  levels: DomsLevels;
  onChange: (next: DomsLevels) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const sel = selected ? BODY_ZONES.find((z) => z.id === selected) ?? null : null;
  const selLevel = sel ? levels[sel.id] ?? null : null;
  const list = levelsList(levels);

  const figure = (view: BodyView) => (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={128} height={229} viewBox="0 0 120 215" role="img" aria-label={view === "face" ? "Carte du corps, face" : "Carte du corps, dos"}>
        <circle cx={60} cy={15} r={11} fill="none" stroke="rgba(231,211,168,0.18)" />
        <rect x={54} y={26} width={12} height={8} rx={2} fill="none" stroke="rgba(231,211,168,0.10)" />
        {BODY_ZONES.filter((z) => z.view === view).map((z) => {
          const lvl = levels[z.id];
          const isSel = selected === z.id;
          return (
            <g
              key={z.id}
              role="button"
              tabIndex={0}
              aria-label={z.label + (lvl ? ` : ${DOMS_LEVEL_LABEL[lvl]}` : "")}
              aria-pressed={isSel}
              onClick={() => { onChange(touchZone(levels, z.id)); onSelect(z.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(touchZone(levels, z.id)); onSelect(z.id); } }}
              className="cursor-pointer [outline:none]"
            >
              {z.rects.map((rc, i) => (
                <g key={i}>
                  <rect
                    x={rc.x} y={rc.y} width={rc.w} height={rc.h} rx={5}
                    fill={lvl ? DOMS_LEVEL_COLOR[lvl] : IDLE_FILL}
                    fillOpacity={lvl ? 0.95 : 1}
                    stroke={lvl ? "none" : IDLE_STROKE}
                  />
                  {isSel && <rect x={rc.x - 2.5} y={rc.y - 2.5} width={rc.w + 5} height={rc.h + 5} rx={7} fill="none" stroke={C.tx} strokeWidth={1.5} />}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="agon-mono text-center text-[10px] tracking-[0.14em] text-agon-tx3">{view === "face" ? "FACE" : "DOS"}</div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-3 rounded-[14px] border border-agon-brd bg-agon-alerte/[0.1] p-3.5">
        <div className="flex justify-around">
          {figure("face")}
          {figure("dos")}
        </div>
        <div className="flex justify-center gap-4 text-[11.5px] text-agon-tx2">
          {([1, 2, 3] as DomsLevel[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="size-2.5 rounded-[3px]" style={{ background: DOMS_LEVEL_COLOR[l] }} />{DOMS_LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
      </div>

      {sel && selLevel != null && (
        <div className="flex flex-col gap-2 rounded-[14px] border bg-agon-s1 px-3.5 py-3" style={{ borderColor: DOMS_LEVEL_COLOR[selLevel] + "73" }}>
          <div className="flex items-center justify-between">
            <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx2">{sel.label} · intensité</span>
            <button
              type="button"
              onClick={() => { onChange(setZoneLevel(levels, sel.id, null)); onSelect(null); }}
              className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12px] text-agon-tx3"
            >
              Retirer
            </button>
          </div>
          <div role="radiogroup" aria-label={sel.label + " : intensité"} className="flex gap-1.5">
            {([1, 2, 3] as DomsLevel[]).map((l) => {
              const c = DOMS_LEVEL_COLOR[l];
              const on = selLevel === l;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange(setZoneLevel(levels, sel.id, l))}
                  className={cn(
                    "flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] font-[inherit] text-[13px]",
                    on ? "border-none font-medium text-agon-ink" : "border font-normal",
                  )}
                  style={on ? { background: c } : { background: c + "14", borderColor: c + "45", color: c }}
                >
                  <span className="agon-mono">{l}</span>{DOMS_LEVEL_LABEL[l]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((z) => {
            const c = DOMS_LEVEL_COLOR[z.level];
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelect(z.id)}
                className="flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-[inherit] text-[12px] text-agon-tx"
                style={{ background: c + "1F", borderColor: c + "55" }}
              >
                <span className="size-2 rounded-full" style={{ background: c }} />
                {z.label}
                <span className="agon-mono text-agon-tx3">{z.level}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
