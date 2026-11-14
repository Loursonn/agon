import { useMemo } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { RaceWatchAnalysis } from "@/lib/hyrox/raceWatch";
import { zoneColor } from "@/lib/seance";
import { FRISE_CADENCE_COLOR, FRISE_PACE_COLOR, segColor } from "./raceAnalysisShared";

const W = 1000;
const HH = 120;

/**
 * Frise des 17 segments à l'échelle du temps, FC par zone par-dessus. Côté
 * coach (`curves`), l'allure de chaque run et la cadence s'ajoutent, et le
 * survol d'un segment affiche son détail.
 */
export default function RaceFrise({ analysis, hr, cadence, offset, sv1, sv2, selected, onSelect, curves = false, hover = false }: {
  analysis: RaceWatchAnalysis;
  hr: { t: number[]; v: Array<number | null> } | null;
  cadence?: { t: number[]; v: Array<number | null> } | null;
  offset: number;
  sv1: number | null;
  sv2: number | null;
  selected: string | null;
  onSelect: (k: string) => void;
  curves?: boolean;
  hover?: boolean;
}) {
  const total = analysis.segments[analysis.segments.length - 1].endS;
  const pts = useMemo(() => {
    if (!hr) return null;
    const xs: Array<[number, number]> = [];
    hr.t.forEach((t, i) => {
      const v = hr.v[i];
      const r = t - offset;
      if (v != null && r >= 0 && r <= total) xs.push([r, v]);
    });
    return xs.length > 1 ? xs : null;
  }, [hr, offset, total]);
  const runs = analysis.segments.filter((s) => s.kind === "run");
  // Cadence : seulement pendant les runs (ailleurs elle ne veut rien dire), un point toutes les 5 s.
  const cad = useMemo(() => {
    if (!curves || !cadence) return null;
    const out: Array<Array<[number, number]>> = runs.map(() => []);
    cadence.t.forEach((t, i) => {
      const v = cadence.v[i];
      const r = t - offset;
      if (v == null || v <= 0 || i % 5 !== 0) return;
      const k = runs.findIndex((s) => r >= s.startS && r < s.endS);
      if (k >= 0) out[k].push([r, v]);
    });
    return out.some((x) => x.length > 1) ? out : null;
  }, [curves, cadence, offset, runs]);

  const lo = pts ? Math.min(...pts.map((p) => p[1])) - 5 : 0;
  const hi = pts ? Math.max(...pts.map((p) => p[1])) + 5 : 1;
  const yOf = (v: number) => HH - ((v - lo) / Math.max(1, hi - lo)) * HH;
  const zoneOf = (v: number) => (sv2 != null && v > sv2 ? 3 : sv1 != null && v > sv1 ? 2 : 1);
  const xOf = (t: number) => (t / total) * W;

  // Allure : plus lent = plus bas, sur toute la hauteur de la frise.
  const paces = runs.map((r) => r.officialS);
  const pLo = Math.min(...paces) - 5;
  const pHi = Math.max(...paces) + 5;
  const yPace = (p: number) => 8 + ((p - pLo) / Math.max(1, pHi - pLo)) * (HH - 16);
  const cadVals = cad?.flat().map((p) => p[1]) ?? [];
  const cLo = cadVals.length ? Math.min(...cadVals) - 3 : 0;
  const cHi = cadVals.length ? Math.max(...cadVals) + 3 : 1;
  const yCad = (v: number) => HH - 8 - ((v - cLo) / Math.max(1, cHi - cLo)) * (HH - 16);

  return (
    <svg viewBox={`0 0 ${W} ${HH + 46}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Frise de course"
      onMouseLeave={hover ? () => onSelect("") : undefined}>
      {pts && pts.slice(1).map(([t, v], i) => (
        <line key={i} x1={xOf(pts[i][0])} y1={yOf(pts[i][1])} x2={xOf(t)} y2={yOf(v)}
          stroke={zoneColor(zoneOf(v))} strokeWidth={2.2} />
      ))}
      {sv2 != null && pts && sv2 > lo && sv2 < hi && (
        <line x1={0} x2={W} y1={yOf(sv2)} y2={yOf(sv2)} stroke={C.tx3} strokeDasharray="4 6" strokeWidth={1} />
      )}
      {curves && runs.map((r) => (
        <line key={`p-${r.key}`} x1={xOf(r.startS)} x2={xOf(r.endS)} y1={yPace(r.officialS)} y2={yPace(r.officialS)}
          stroke={FRISE_PACE_COLOR} strokeWidth={3} strokeLinecap="round" />
      ))}
      {cad && cad.map((line, k) => line.length > 1 && (
        <polyline key={`c-${k}`} fill="none" stroke={FRISE_CADENCE_COLOR} strokeWidth={1.4} opacity={0.85}
          points={line.map(([t, v]) => `${xOf(t)},${yCad(v)}`).join(" ")} />
      ))}
      {analysis.segments.map((s) => {
        const x = xOf(s.startS);
        const w = Math.max(1.5, ((s.endS - s.startS) / total) * W - 1.5);
        const on = selected === s.key;
        return (
          <g key={s.key} onClick={() => onSelect(s.key)} onMouseEnter={hover ? () => onSelect(s.key) : undefined} style={{ cursor: "pointer" }}>
            <rect x={x} y={HH + 8} width={w} height={on ? 22 : 16} rx={2} fill={segColor(s)} opacity={selected && !on ? 0.45 : 1} />
            <rect x={x} y={0} width={w} height={HH + 30} fill="transparent" />
            {s.kind === "run" && (
              <text x={x + 2} y={HH + 44} fontSize={13} fill={C.tx3} style={MONO}>{s.key.slice(4)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
