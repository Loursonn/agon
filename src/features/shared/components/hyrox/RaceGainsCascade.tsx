import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { hyroxPictoColor } from "@/features/shared/components/hyroxStation";
import type { GainItem } from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";

const W = 360;
const H = 210;
const TOP = 22;
const BOTTOM = 40;

/** Libellé sur deux lignes au plus (« Runs 6 » / « à 8 »). */
function twoLines(label: string): [string, string] {
  const words = label.split(" ");
  if (words.length < 2 || label.length <= 9) return [label, ""];
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

/**
 * Cascade du chrono actuel au chrono possible : barre de départ, une marche par
 * point à gagner, barre « Possible ». L'échelle est coupée (elle ne part pas de
 * zéro) pour que les marches restent lisibles.
 */
export default function RaceGainsCascade({ currentS, possibleS, items, startLabel }: {
  currentS: number;
  possibleS: number;
  items: GainItem[];
  startLabel: string;
}) {
  const lo = Math.max(0, Math.floor((possibleS - 45) / 60) * 60);
  const hi = Math.ceil((currentS + 15) / 60) * 60;
  const y = (v: number) => TOP + ((hi - v) / Math.max(1, hi - lo)) * (H - TOP - BOTTOM);
  const n = items.length + 2;
  const slot = W / n;
  const bw = Math.min(30, slot * 0.62);
  const xMid = (i: number) => slot * i + slot / 2;
  const station = hyroxPictoColor("skierg");
  let at = currentS;
  const steps = items.map((g) => {
    const from = at;
    at -= g.gainS;
    return { g, from, to: at };
  });
  const bars: Array<{ label: string; top: number; bottom: number; value: string; color: string }> = [
    { label: startLabel, top: currentS, bottom: lo, value: fmtClock(currentS), color: C.tx3 },
    ...steps.map((s) => ({ label: s.g.label, top: s.from, bottom: s.to, value: `−${Math.round(s.g.gainS)} s`, color: station })),
    { label: "Possible", top: possibleS, bottom: lo, value: fmtClock(possibleS), color: C.g },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W * 1.4, height: "auto", display: "block", margin: "0 auto" }} role="img" aria-label="Cascade du chrono actuel au chrono possible">
        <line x1={0} x2={W} y1={y(lo)} y2={y(lo)} stroke={C.brd} strokeWidth={1} />
        {bars.map((b, i) => {
          const [l1, l2] = twoLines(b.label);
          const yTop = y(b.top);
          const h = Math.max(2, y(b.bottom) - yTop);
          return (
            <g key={i}>
              {i > 0 && i < bars.length && (
                <line x1={xMid(i - 1) + bw / 2} x2={xMid(i) - bw / 2} y1={yTop} y2={yTop} stroke={C.tx3} strokeDasharray="2 3" strokeWidth={1} />
              )}
              <rect x={xMid(i) - bw / 2} y={yTop} width={bw} height={h} rx={3} fill={b.color} />
              <text x={xMid(i)} y={yTop - 6} fontSize={9.5} textAnchor="middle" fill={i === 0 || i === bars.length - 1 ? C.tx : C.o} style={MONO}>{b.value}</text>
              <text x={xMid(i)} y={H - BOTTOM + 14} fontSize={9.5} textAnchor="middle" fill={C.tx2}>{l1}</text>
              {l2 && <text x={xMid(i)} y={H - BOTTOM + 26} fontSize={9.5} textAnchor="middle" fill={C.tx2}>{l2}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: C.tx3 }}>Échelle coupée : le graphique va de {fmtClock(lo)} à {fmtClock(hi)}.</div>
    </div>
  );
}
