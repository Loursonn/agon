import { PAIN_COLORS, type BodyView } from "@/lib/bodyZones";
import { C, alpha } from "@/lib/theme";
import { PAIN_SCALE_MARKS, PAIN_SILHOUETTE, PAIN_ZONES, painList, painWord } from "@/lib/painZones";

/** Zones touchées : id → note 0-10, ou null tant qu'elle n'est pas notée. */
export type PainDraft = Record<string, number | null>;

const IDLE_FILL = "rgba(231,211,168,0.07)";
const IDLE_STROKE = "rgba(231,211,168,0.16)";
const ROUGE = "var(--agon-rouge)";

/**
 * Carte douleur du wellness (2ᵉ corps, 14/11) : distincte de celle des
 * courbatures (fond rouge, zones articulaires), une note 0-10 par zone.
 */
export function PainZoneMap({
  levels, onChange, selected, onSelect,
}: {
  levels: PainDraft;
  onChange: (next: PainDraft) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const list = painList(levels);
  const sel = selected ? list.find((z) => z.id === selected) ?? null : null;

  const touch = (id: string) => {
    if (!(id in levels)) onChange({ ...levels, [id]: null });
    onSelect(id);
  };
  const remove = (id: string) => {
    const next = { ...levels };
    delete next[id];
    onChange(next);
    onSelect(null);
  };

  const figure = (view: BodyView) => (
    <div className="flex flex-col items-center gap-agon-xs">
      <svg width={128} height={229} viewBox="0 0 120 215" role="img" aria-label={view === "face" ? "Carte douleur, face" : "Carte douleur, dos"}>
        <circle cx={60} cy={15} r={11} fill="none" stroke="rgba(231,211,168,0.18)" />
        {PAIN_SILHOUETTE.map((rc, i) => (
          <rect key={"s" + i} x={rc.x} y={rc.y} width={rc.w} height={rc.h} rx={5} fill="none" stroke="rgba(231,211,168,0.08)" aria-hidden />
        ))}
        {PAIN_ZONES.filter((z) => z.view === view).map((z) => {
          const touched = z.id in levels;
          const lvl = levels[z.id];
          const isSel = selected === z.id;
          return (
            <g
              key={z.id + view}
              role="button"
              tabIndex={0}
              aria-label={z.label + (lvl != null ? ` : douleur ${lvl} sur 10` : touched ? " : à noter" : "")}
              aria-pressed={isSel}
              onClick={() => touch(z.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touch(z.id); } }}
              className="cursor-pointer outline-none"
            >
              {z.rects.map((rc, i) => (
                <g key={i}>
                  <rect
                    x={rc.x} y={rc.y} width={rc.w} height={rc.h} rx={5}
                    fill={lvl != null ? PAIN_COLORS[lvl] : touched ? alpha(C.rouge, 0.22) : IDLE_FILL}
                    stroke={lvl != null ? "none" : touched ? ROUGE : IDLE_STROKE}
                    strokeDasharray={touched && lvl == null ? "3 2" : undefined}
                  />
                  {isSel && <rect x={rc.x - 2.5} y={rc.y - 2.5} width={rc.w + 5} height={rc.h + 5} rx={7} fill="none" stroke="var(--agon-tx)" strokeWidth={1.5} />}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="text-center font-data text-[10px] tracking-[0.14em] text-agon-tx3">{view === "face" ? "FACE" : "DOS"}</div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-agon-md rounded-[14px] border border-agon-rouge/30 bg-agon-rouge/10 p-[14px]">
        <div className="flex justify-around">
          {figure("face")}
          {figure("dos")}
        </div>
        <div className="text-center text-[11.5px] text-agon-tx2">Touche la zone qui te fait mal, puis note-la.</div>
      </div>

      {sel && (
        <div
          className="flex flex-col gap-agon-sm rounded-[14px] border bg-agon-s1 px-[14px] py-agon-md"
          style={{ borderColor: sel.level != null ? PAIN_COLORS[sel.level] + "73" : alpha(C.rouge, 0.45) }}
        >
          <div className="flex items-center justify-between">
            <span className="font-data text-agon-xs uppercase tracking-[0.14em] text-agon-tx2">
              {sel.label} · {sel.level != null ? `${sel.level}/10 · ${painWord(sel.level)}` : "note de 0 à 10"}
            </span>
            <button type="button" onClick={() => remove(sel.id)} className="border-none bg-transparent p-0 text-agon-sm text-agon-tx3">
              Retirer
            </button>
          </div>
          <div role="radiogroup" aria-label={sel.label + " : douleur de 0 à 10"} className="flex gap-[3px]">
            {PAIN_COLORS.map((col, n) => {
              const on = sel.level === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...levels, [sel.id]: n })}
                  className="h-9 min-w-0 flex-1 rounded-[8px] p-0 font-data text-[13px] tabular-nums"
                  style={{ border: on ? "none" : "1px solid " + col + "40", background: on ? col : col + "14", color: on ? "var(--agon-ink)" : col, fontWeight: on ? 500 : 400 }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {/* Repères : 0 aucune, 1-2 gêne, 3 douleur, 10 insupportable (alignés sur les cases). */}
          <div className="grid grid-cols-11 gap-[3px] text-agon-xs text-agon-tx3" aria-hidden>
            {PAIN_SCALE_MARKS.map((m) => (
              <span
                key={m.label}
                className={
                  m.at === 0 ? "col-start-1 whitespace-nowrap text-left"
                  : m.at === 1 ? "col-span-2 col-start-2 border-t border-agon-brd-l pt-[2px] text-center"
                  : m.at === 3 ? "col-start-4 -mx-agon-sm whitespace-nowrap pt-[3px] text-center"
                  : "col-span-4 col-start-8 whitespace-nowrap pt-[3px] text-right"
                }
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {list.map((z) => {
            const c = z.level != null ? PAIN_COLORS[z.level] : C.rouge;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelect(z.id)}
                className="flex h-7 items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] text-agon-sm text-agon-tx"
                style={{ background: alpha(c, 0.12), border: "1px solid " + alpha(c, 0.33) }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                {z.label}
                <span className="font-data text-agon-tx3">{z.level != null ? `${z.level}/10` : "à noter"}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
