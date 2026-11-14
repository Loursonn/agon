import { MONO } from "@/features/shared/components/seance/seanceUi";
import { BODY_ZONES, DOMS_LEVEL_COLOR, DOMS_LEVEL_LABEL, levelsList, setZoneLevel, touchZone, type BodyView } from "@/lib/bodyZones";
import type { DomsLevel, DomsLevels } from "@shared/domain/wellness";
import { C } from "@/lib/theme";

const IDLE_FILL = "rgba(231,211,168,0.07)";
const IDLE_STROKE = "rgba(231,211,168,0.16)";
const TX2 = C.tx2;
const TX3 = C.pierre;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
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
              style={{ cursor: "pointer", outline: "none" }}
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
      <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.14em", color: TX3, textAlign: "center" }}>{view === "face" ? "FACE" : "DOS"}</div>
    </div>
  );

  return (
    <>
      <div style={{ padding: 14, borderRadius: 14, background: `radial-gradient(90% 70% at 50% 40%,rgba(255,149,0,0.12),transparent 70%),${C.s1}`, border: "1px solid rgba(231,211,168,0.10)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {figure("face")}
          {figure("dos")}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 11.5, color: TX2 }}>
          {([1, 2, 3] as DomsLevel[]).map((l) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: DOMS_LEVEL_COLOR[l] }} />{DOMS_LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
      </div>

      {sel && selLevel != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 14, background: C.s1, border: "1px solid " + DOMS_LEVEL_COLOR[selLevel] + "73" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TX2 }}>{sel.label} · intensité</span>
            <button
              type="button"
              onClick={() => { onChange(setZoneLevel(levels, sel.id, null)); onSelect(null); }}
              style={{ fontSize: 12, color: TX3, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
            >
              Retirer
            </button>
          </div>
          <div role="radiogroup" aria-label={sel.label + " : intensité"} style={{ display: "flex", gap: 6 }}>
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
                  style={{
                    flex: 1, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    background: on ? c : c + "14", border: on ? "none" : "1px solid " + c + "45",
                    color: on ? C.ink : c, fontWeight: on ? 500 : 400,
                  }}
                >
                  <span style={MONO}>{l}</span>{DOMS_LEVEL_LABEL[l]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {list.map((z) => {
            const c = DOMS_LEVEL_COLOR[z.level];
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelect(z.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 999, background: c + "1F", border: "1px solid " + c + "55", fontSize: 12, whiteSpace: "nowrap", color: C.tx, cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {z.label}
                <span style={{ ...MONO, color: TX3 }}>{z.level}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
