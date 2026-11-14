import { useMemo } from "react";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { RaceWatchAnalysis } from "@/lib/hyrox/raceWatch";
import { zoneColor } from "@/lib/seance";
import { fmtClock } from "@/lib/seance";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { FRISE_CADENCE_COLOR, FRISE_PACE_COLOR, STATION_PICTO, segColor } from "./raceAnalysisShared";

/**
 * Frise des 17 segments à l'échelle du temps, FC par zone par-dessus. Côté
 * coach (`curves`), l'allure de chaque run et la cadence s'ajoutent, et le
 * survol d'un segment affiche son détail. `compact` (téléphone, planche
 * HyroxAnaTel) : repère à l'échelle de l'écran, cases hautes numérotées,
 * pictos des stations et axe du temps.
 */
export default function RaceFrise({ analysis, hr, cadence, offset, sv1, sv2, selected, onSelect, curves = false, hover = false, compact = false, speed = null }: {
  analysis: RaceWatchAnalysis;
  hr: { t: number[]; v: Array<number | null> } | null;
  cadence?: { t: number[]; v: Array<number | null> } | null;
  /** Vitesse (m/s) seconde par seconde : allure des runs sur sa propre piste (coach). */
  speed?: { t: number[]; v: Array<number | null> } | null;
  offset: number;
  sv1: number | null;
  sv2: number | null;
  selected: string | null;
  onSelect: (k: string) => void;
  curves?: boolean;
  hover?: boolean;
  compact?: boolean;
}) {
  const W = compact ? 340 : 1000;
  const HH = compact ? 70 : 120;
  const BAR = compact ? 22 : 16;
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

  if (curves) {
    return <StackedFrise analysis={analysis} pts={pts} cadence={cadence ?? null} speed={speed} offset={offset}
      sv1={sv1} sv2={sv2} selected={selected} onSelect={onSelect} hover={hover} />;
  }

  if (compact) {
    const step = total > 3600 ? 1200 : 600;
    const ticks: number[] = [];
    for (let t = 0; t < total - step * 0.6; t += step) ticks.push(t);
    ticks.push(total);
    const by = HH + 8;
    return (
      <svg viewBox={`0 0 ${W} ${HH + 62}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }} role="img" aria-label="Frise de course">
        {[sv2, sv1].map((sv, k) => sv != null && pts && sv > lo && sv < hi && (
          <line key={k} x1={0} x2={W} y1={yOf(sv)} y2={yOf(sv)} stroke={C.brdL} strokeDasharray="2 3" strokeWidth={1} />
        ))}
        {pts && pts.slice(1).map(([t, v], i) => (
          <line key={i} x1={xOf(pts[i][0])} y1={yOf(pts[i][1])} x2={xOf(t)} y2={yOf(v)}
            stroke={zoneColor(zoneOf(v))} strokeWidth={1.8} strokeLinecap="round" />
        ))}
        {analysis.segments.map((s) => {
          const x = xOf(s.startS);
          const w = Math.max(1, ((s.endS - s.startS) / total) * W - 1);
          const on = selected === s.key;
          const mid = x + w / 2;
          return (
            <g key={s.key} onClick={() => onSelect(s.key)} style={{ cursor: "pointer" }}>
              {on && <rect x={x - 0.5} y={0} width={w + 1} height={HH} fill={C.ac} opacity={0.1} />}
              <rect x={x} y={by} width={w} height={BAR} rx={2} fill={segColor(s)}
                opacity={selected && !on ? 0.45 : 1} stroke={on ? C.tx : "none"} strokeWidth={on ? 1.2 : 0} />
              <rect x={x} y={0} width={w} height={by + BAR + 18} fill="transparent" />
              {s.kind === "run" && (
                <text x={mid} y={by + BAR / 2 + 3.5} fontSize={10} textAnchor="middle" fill={C.ink} style={MONO}>{s.key.slice(4)}</text>
              )}
              {s.kind !== "roxzone" && w > 8 && (
                <g transform={`translate(${mid - 5.5}, ${by + BAR + 4})`}>
                  <HyroxPicto station={s.kind === "run" ? "course" : STATION_PICTO[s.key] ?? "autre"} size={11} color={C.tx2} />
                </g>
              )}
            </g>
          );
        })}
        {ticks.map((t, i) => (
          <text key={t} x={xOf(t)} y={HH + 58} fontSize={9.5} fill={C.tx3} style={MONO}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{fmtClock(Math.round(t))}</text>
        ))}
      </svg>
    );
  }

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
            <rect x={x} y={HH + 8} width={w} height={on ? BAR + 6 : BAR} rx={2} fill={segColor(s)} opacity={selected && !on ? 0.45 : 1} />
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

/* ── Coach, ordinateur (planche HyroxAnaCoachOrdi) ─────────────────────────────
 * Cases des 17 segments en tête (R1…R8, pictos des stations), puis trois pistes
 * alignées sur le même temps : FC par zone (+ bande de zones), allure des runs
 * et cadence des runs, seconde par seconde ; axe du temps aux départs des runs.
 */
const SW = 1000, PL = 44, PR = 952;
const Y_BOX = 26, BOX_H = 20;
const Y_FC = 72, FC_H = 110;
const Y_PACE = 222, PACE_H = 56;
const Y_CAD = 316, CAD_H = 48;
const Y_AXIS = 384;

function runSeries(
  col: { t: number[]; v: Array<number | null> } | null | undefined,
  runs: RaceWatchAnalysis["segments"], offset: number, map: (v: number) => number | null, smooth: number,
): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = runs.map(() => []);
  if (!col) return out;
  col.t.forEach((t, i) => {
    const raw = col.v[i];
    const r = t - offset;
    if (raw == null) return;
    const v = map(raw);
    if (v == null) return;
    const k = runs.findIndex((s) => r >= s.startS && r < s.endS);
    if (k >= 0) out[k].push([r, v]);
  });
  // Seuils (vitesse > 1,8 m/s, cadence ≥ 130) : on ne garde que la course, pas la marche en sortie de run.
  // Moyenne glissante centrée : la mesure brute seconde par seconde est trop bruitée pour se lire.
  return out.map((line) => line.map(([t], i) => {
    const a = Math.max(0, i - smooth), b = Math.min(line.length, i + smooth + 1);
    let sum = 0;
    for (let j = a; j < b; j++) sum += line[j][1];
    return [t, sum / (b - a)] as [number, number];
  }));
}

const fmtPace = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}`;

function StackedFrise({ analysis, pts, cadence, speed, offset, sv1, sv2, selected, onSelect, hover }: {
  analysis: RaceWatchAnalysis;
  pts: Array<[number, number]> | null;
  cadence: { t: number[]; v: Array<number | null> } | null;
  speed: { t: number[]; v: Array<number | null> } | null;
  offset: number;
  sv1: number | null;
  sv2: number | null;
  selected: string | null;
  onSelect: (k: string) => void;
  hover: boolean;
}) {
  const segs = analysis.segments;
  const total = segs[segs.length - 1].endS;
  const runs = useMemo(() => segs.filter((s) => s.kind === "run"), [segs]);
  const xOf = (t: number) => PL + (t / total) * (PR - PL);

  const lo = pts ? Math.min(...pts.map((p) => p[1]), sv1 ?? Infinity) - 6 : 0;
  const hi = pts ? Math.max(...pts.map((p) => p[1]), sv2 ?? -Infinity) + 6 : 1;
  const yFc = (v: number) => Y_FC + FC_H - ((v - lo) / Math.max(1, hi - lo)) * FC_H;
  const zoneOf = (v: number) => (sv2 != null && v > sv2 ? 3 : sv1 != null && v > sv1 ? 2 : 1);

  const pace = useMemo(() => runSeries(speed, runs, offset, (v) => (v > 1.8 ? 1000 / v : null), 7), [speed, runs, offset]);
  const cad = useMemo(() => runSeries(cadence, runs, offset, (v) => (v >= 130 ? v : null), 7), [cadence, runs, offset]);
  const paceVals = pace.flat().map((p) => p[1]);
  const hasPace = paceVals.length > 10;
  const pLo = hasPace ? Math.min(...paceVals) - 6 : 0;
  const pHi = hasPace ? Math.max(...paceVals) + 6 : 1;
  const yPace = (p: number) => Y_PACE + ((p - pLo) / Math.max(1, pHi - pLo)) * PACE_H; // plus lent = plus bas
  const cadVals = cad.flat().map((p) => p[1]);
  const hasCad = cadVals.length > 10;
  const cLo = hasCad ? Math.min(...cadVals) - 3 : 0;
  const cHi = hasCad ? Math.max(...cadVals) + 3 : 1;
  const yCad = (v: number) => Y_CAD + CAD_H - ((v - cLo) / Math.max(1, cHi - cLo)) * CAD_H;
  const bottom = (hasCad ? Y_CAD + CAD_H : hasPace ? Y_PACE + PACE_H : Y_FC + FC_H + 12) + 6;
  const axisY = hasCad ? Y_AXIS : bottom + 16;

  const label = (y: number, text: string, unit: string) => (
    <text x={PL} y={y} fontSize={10} fill={C.tx3} style={{ ...MONO, letterSpacing: "0.14em" }}>
      {text}<tspan fill={C.tx3} opacity={0.7}>{"  ·  "}{unit}</tspan>
    </text>
  );
  const sel = segs.find((s) => s.key === selected);
  const ticks = [...runs.map((r) => r.startS), total];

  return (
    <svg viewBox={`0 0 ${SW} ${axisY + 8}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Frise de course"
      onMouseLeave={hover ? () => onSelect("") : undefined}>
      {/* colonnes : stations et roxzone sur fond, runs en clair */}
      {segs.filter((s) => s.kind !== "run").map((s) => (
        <rect key={`bg-${s.key}`} x={xOf(s.startS)} y={Y_BOX + BOX_H + 6} width={Math.max(0.5, xOf(s.endS) - xOf(s.startS))}
          height={bottom - (Y_BOX + BOX_H + 6)} fill={alpha(C.tx, 0.035)} />
      ))}
      {sel && (
        <rect x={xOf(sel.startS) - 1} y={Y_BOX - 3} width={xOf(sel.endS) - xOf(sel.startS) + 2} height={bottom - Y_BOX + 3}
          rx={3} fill={alpha(C.ac, 0.07)} stroke={alpha(C.ac, 0.5)} strokeWidth={1} />
      )}

      {/* cases + pictos */}
      {segs.map((s) => {
        const x = xOf(s.startS);
        const w = Math.max(1, xOf(s.endS) - x - 1.5);
        const on = selected === s.key;
        const mid = x + w / 2;
        return (
          <g key={s.key}>
            {s.kind === "station" && w > 10 && (
              <g transform={`translate(${mid - 8}, 2)`}>
                <rect x={-2} y={-1} width={20} height={20} rx={4} fill="none" stroke={alpha(C.o, 0.55)} strokeWidth={1} />
                <HyroxPicto station={STATION_PICTO[s.key] ?? "autre"} size={16} />
              </g>
            )}
            <rect x={x} y={Y_BOX} width={w} height={BOX_H} rx={2} fill={segColor(s)} opacity={selected && !on ? 0.5 : 1} />
            {s.kind === "run" && w > 18 && (
              <text x={mid} y={Y_BOX + BOX_H / 2 + 3.5} fontSize={10} textAnchor="middle" fill={C.ink} style={MONO}>R{s.key.slice(4)}</text>
            )}
          </g>
        );
      })}

      {/* FC */}
      {label(Y_FC - 8, "FC", "BPM")}
      {[sv2, sv1].map((sv, k) => sv != null && pts && sv > lo && sv < hi && (
        <g key={`sv${k}`}>
          <line x1={PL} x2={PR} y1={yFc(sv)} y2={yFc(sv)} stroke={C.brdL} strokeDasharray="3 4" strokeWidth={1} />
          <text x={PR + 6} y={yFc(sv) + 3.5} fontSize={10} fill={C.tx3} style={MONO}>{k === 0 ? "SV2" : "SV1"} {sv}</text>
        </g>
      ))}
      {pts && [hi - 6, lo + 6].filter((v) => [sv1, sv2].every((sv) => sv == null || Math.abs(yFc(v) - yFc(sv)) > 12)).map((v) => (
        <text key={`ax${v}`} x={PR + 6} y={yFc(v) + 3.5} fontSize={10} fill={C.tx3} style={MONO}>{Math.round(v)}</text>
      ))}
      {pts && pts.slice(1).map(([t, v], i) => (
        <line key={i} x1={xOf(pts[i][0])} y1={yFc(pts[i][1])} x2={xOf(t)} y2={yFc(v)} stroke={zoneColor(zoneOf(v))} strokeWidth={1.6} />
      ))}
      {pts && pts.filter((_, i) => i % 5 === 0).slice(1).map(([t, v], i, arr) => (
        <line key={`z${i}`} x1={xOf(i === 0 ? 0 : arr[i - 1][0])} x2={xOf(t)} y1={Y_FC + FC_H + 8} y2={Y_FC + FC_H + 8}
          stroke={zoneColor(zoneOf(v))} strokeWidth={4} />
      ))}
      {!pts && <text x={(PL + PR) / 2} y={Y_FC + FC_H / 2} fontSize={12} textAnchor="middle" fill={C.tx3}>Pas de FC enregistrée</text>}

      {/* Allure des runs */}
      {hasPace && <>
        {label(Y_PACE - 8, "ALLURE DES RUNS", "/KM")}
        {[pLo + 6, (pLo + pHi) / 2, pHi - 6].map((p) => (
          <text key={`pa${p}`} x={PL - 6} y={yPace(p) + 3.5} fontSize={10} textAnchor="end" fill={C.tx3} style={MONO}>{fmtPace(p)}</text>
        ))}
        {runs.map((r) => (
          <line key={`off-${r.key}`} x1={xOf(r.startS)} x2={xOf(r.endS)} y1={yPace(r.officialS)} y2={yPace(r.officialS)}
            stroke={C.tx2} strokeDasharray="2 3" strokeWidth={1} opacity={0.7} />
        ))}
        {pace.map((line, k) => line.length > 1 && (
          <polyline key={`p${k}`} fill="none" stroke={FRISE_PACE_COLOR} strokeWidth={1.5}
            points={line.map(([t, v]) => `${xOf(t)},${yPace(Math.min(pHi, Math.max(pLo, v)))}`).join(" ")} />
        ))}
      </>}

      {/* Cadence */}
      {hasCad && <>
        {label(Y_CAD - 8, "CADENCE", "PAS/MIN")}
        {[cHi - 3, cLo + 3].map((v) => (
          <text key={`ca${v}`} x={PL - 6} y={yCad(v) + 3.5} fontSize={10} textAnchor="end" fill={C.tx3} style={MONO}>{Math.round(v)}</text>
        ))}
        {cad.map((line, k) => line.length > 1 && (
          <polyline key={`c${k}`} fill="none" stroke={FRISE_CADENCE_COLOR} strokeWidth={1.5}
            points={line.map(([t, v]) => `${xOf(t)},${yCad(v)}`).join(" ")} />
        ))}
      </>}

      {/* axe du temps : départs des runs */}
      {ticks.map((t, i) => (
        <text key={`t${i}`} x={xOf(t)} y={axisY} fontSize={10} fill={C.tx3} style={MONO}
          textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{fmtClock(Math.round(t))}</text>
      ))}

      {/* zones de survol (au-dessus de tout) */}
      {segs.map((s) => (
        <rect key={`hit-${s.key}`} x={xOf(s.startS)} y={0} width={Math.max(1, xOf(s.endS) - xOf(s.startS))} height={bottom}
          fill="transparent" style={{ cursor: "pointer" }}
          onClick={() => onSelect(s.key)} onMouseEnter={hover ? () => onSelect(s.key) : undefined} />
      ))}
    </svg>
  );
}
