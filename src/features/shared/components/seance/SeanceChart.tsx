import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ActivityStream } from "@shared/activityFiles/stream";
import { zoneOf, zoneSeries } from "@shared/domain/hrZones";
import { smoothSeries } from "@shared/domain/lapMetrics";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import { downsampleStream, DISPLAY_MAX_POINTS } from "@/lib/streamDisplay";
import {
  areaPath, displayLapNames, DASH, fmtClock, fmtInt, fmtKm, fmtPace, lapIndexAt, lapKind, linePath,
  nearestIndex, niceTicks, paceSeries, robustDomain, SERIES_COLORS, sliceStream, xAxisValues, zoneColor, zoneRuns,
} from "@/lib/seance";
import { C, alpha } from "@/lib/theme";
import type { DetailLap } from "@/lib/activityDetail";
import { MONO } from "./seanceUi";
import { StationIcon } from "./StationIcon";

export type SeriesKey = "pace" | "hr" | "alt" | "cadence";
export type XAxis = "time" | "distance";

export interface SeanceChartProps {
  /** Série complète (le zoom repart d'elle) et série allégée (≤ 3 000 points). */
  stream: ActivityStream;
  display: ActivityStream;
  laps: readonly DetailLap[];
  blocks: readonly ExpectedBlock[] | null;
  bounds: number[] | null;
  axis: XAxis;
  visible: Record<SeriesKey, boolean>;
  /** Fenêtre affichée (secondes), `null` = toute la séance. */
  zoom: { startS: number; endS: number } | null;
  onZoomChange?: (z: { startS: number; endS: number } | null) => void;
  /** Tour surligné. */
  activeLap: number | null;
  /** Clic sur un tour (mode lecture). */
  onLapClick?: (i: number) => void;
  /** Mode « Modifier les tours ». */
  editing?: boolean;
  cutAtS?: number | null;
  onPickTime?: (tS: number) => void;
  onMoveBoundary?: (i: number, tS: number) => void;
  /** Téléphone : bulle au-dessus, doigt, pincement. */
  touch?: boolean;
  height?: number;
  /** Pictos au-dessus des stations (HYROX, ordinateur). */
  stationIcons?: boolean;
  /** Vélo : la série bleue est la vitesse (km/h, croissante vers le haut) au lieu de l'allure. */
  speed?: boolean;
}

const M = { l: 44, r: 44, t: 26, b: 34 };
const M_TOUCH = { l: 34, r: 34, t: 22, b: 30 };
const PACE_MAX_S = 600; // au-delà de 10'/km, l'axe ne descend plus

export function SeanceChart(props: SeanceChartProps) {
  const { stream, display, laps, blocks, bounds, axis, visible, zoom, activeLap, editing, touch } = props;
  const speedMode = !!props.speed;
  const wrapRef = useRef<HTMLDivElement>(null);
  const clipId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(0);
  const height = props.height ?? (touch ? 210 : 300);
  const m = touch ? M_TOUCH : M;
  const iconRow = props.stationIcons ? 26 : 0;
  const plotTop = m.t + iconRow;
  const plotH = height - plotTop - m.b;
  const plotW = Math.max(10, width - m.l - m.r);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ── Données de la fenêtre ────────────────────────────────────────────────
  const src = useMemo(() => {
    if (!zoom) return display;
    return downsampleStream(sliceStream(stream, zoom.startS, zoom.endS), DISPLAY_MAX_POINTS);
  }, [stream, display, zoom]);

  const stations = useMemo(
    () => laps.filter((l) => lapKind(l, blocks) === "station" || lapKind(l, blocks) === "transition"),
    [laps, blocks],
  );
  const xs = useMemo(() => xAxisValues(src, axis), [src, axis]);
  const fullXs = useMemo(() => xAxisValues(display, axis), [display, axis]);
  // Allure lissée (±3 points) pour la lecture ; la bulle donne la valeur lissée aussi.
  const pace = useMemo(() => {
    const p = speedMode
      ? src.speed?.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v * 3.6 : null)) ?? null
      : paceSeries(src.speed, src.t, blocks?.length ? stations : []);
    if (!p) return null;
    const sm = smoothSeries(p, 3);
    return sm.map((v, i) => (p[i] === null ? null : v));
  }, [src, stations, blocks, speedMode]);
  const zones = useMemo(() => zoneSeries(src.hr, bounds), [src, bounds]);

  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  const sx = (x: number) => m.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * plotW;
  const invX = (px: number) => x0 + ((px - m.l) / plotW) * (x1 - x0);

  // Abscisse d'un instant (s) dans l'axe courant.
  const xOfT = (tS: number) => {
    if (axis === "time") return tS;
    const i = nearestIndex(src.t, tS);
    if (i >= 0 && tS >= src.t[0] && tS <= src.t[src.t.length - 1]) return xs[i];
    const j = nearestIndex(display.t, tS);
    return fullXs[j] ?? tS;
  };
  const tOfX = (x: number) => src.t[nearestIndex(xs, x)] ?? 0;

  const showPace = visible.pace && pace?.some((v) => v !== null);
  const showHr = visible.hr && !!src.hr?.some((v) => v !== null);
  const showAlt = visible.alt && !zoom && !!src.alt?.some((v) => v !== null);
  const showCad = visible.cadence && !zoom && !!src.cadence?.some((v) => v !== null);

  const paceDom = useMemo(() => {
    if (speedMode) {
      const d = robustDomain(pace, { minSpan: 6 });
      return d ? ([Math.max(0, d[0]), d[1]] as [number, number]) : null;
    }
    const d = robustDomain(pace, { minSpan: 30 });
    return d ? ([Math.max(120, d[0]), Math.min(PACE_MAX_S, d[1])] as [number, number]) : null;
  }, [pace, speedMode]);
  const clampPace = (v: number) => (speedMode ? v : Math.min(PACE_MAX_S, v));
  const hrDom = useMemo(() => {
    const d = robustDomain(src.hr, { minSpan: 20 });
    if (!d) return null;
    const lo = Math.min(d[0], bounds?.[0] ? bounds[0] - 8 : d[0]);
    const hi = Math.max(d[1], bounds?.length ? bounds[bounds.length - 1] + 8 : d[1]);
    return [lo, hi] as [number, number];
  }, [src, bounds]);
  const altDom = useMemo(() => robustDomain(src.alt, { minSpan: 20, pad: 0.1 }), [src]);
  const cadDom = useMemo(() => robustDomain(src.cadence, { minSpan: 20 }), [src]);

  // Allure : rapide en haut (axe inversé). Vitesse : rapide en haut aussi (axe normal).
  const syPace = (v: number) => {
    if (!paceDom) return 0;
    const r = (v - paceDom[0]) / (paceDom[1] - paceDom[0]);
    return speedMode ? plotTop + plotH - r * plotH : plotTop + r * plotH;
  };
  const syHr = (v: number) => (hrDom ? plotTop + plotH - ((v - hrDom[0]) / (hrDom[1] - hrDom[0])) * plotH : 0);
  // Altitude : aire discrète dans le tiers bas.
  const syAlt = (v: number) => (altDom ? plotTop + plotH - ((v - altDom[0]) / (altDom[1] - altDom[0])) * plotH * 0.32 : 0);
  const syCad = (v: number) => (cadDom ? plotTop + plotH - ((v - cadDom[0]) / (cadDom[1] - cadDom[0])) * plotH : 0);

  const paths = useMemo(() => {
    if (width === 0) return null;
    const pacePath = showPace && pace ? linePath(xs, pace.map((v) => (v === null ? null : clampPace(v))), sx, syPace) : "";
    const altPath = showAlt && src.alt ? areaPath(xs, src.alt, sx, syAlt, plotTop + plotH) : "";
    const cadPath = showCad && src.cadence ? linePath(xs, src.cadence, sx, syCad) : "";
    // FC : un tracé par suite de points de même zone (raccordé au point suivant).
    const hrSegs: Array<{ d: string; color: string }> = [];
    if (showHr && src.hr) {
      const runs = bounds ? zoneRuns(zones) : [{ from: 0, to: src.hr.length - 1, zone: null }];
      for (const r of runs) {
        const to = Math.min(src.hr.length - 1, r.to + 1);
        const d = linePath(xs.slice(r.from, to + 1), src.hr.slice(r.from, to + 1), sx, syHr);
        if (d) hrSegs.push({ d, color: bounds ? zoneColor(r.zone, bounds.length + 1) : C.r });
      }
    }
    const strip = bounds && zones
      ? zoneRuns(zones).map((r) => ({
          x: sx(xs[r.from]),
          w: Math.max(0.5, sx(xs[Math.min(xs.length - 1, r.to + 1)]) - sx(xs[r.from])),
          color: r.zone ? zoneColor(r.zone, bounds.length + 1) : alpha(C.tx3, 0.3),
        }))
      : [];
    return { pacePath, altPath, cadPath, hrSegs, strip };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, xs, pace, src, zones, bounds, showPace, showHr, showAlt, showCad, paceDom, hrDom, altDom, cadDom]);

  // ── Curseur ──────────────────────────────────────────────────────────────
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<{ d0: number; z0: { startS: number; endS: number }; mid: number } | null>(null);

  const localX = (e: ReactPointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r ? e.clientX - r.left : 0;
  };
  const clampPx = (px: number) => Math.min(m.l + plotW, Math.max(m.l, px));

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const px = localX(e);
    pointers.current.set(e.pointerId, px);
    if (touch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const full = { startS: display.t[0] ?? 0, endS: display.t[display.t.length - 1] ?? 1 };
      pinch.current = { d0: Math.abs(a - b), z0: zoom ?? full, mid: tOfX(invX(clampPx((a + b) / 2))) };
      setCursorX(null);
      return;
    }
    if (editing) {
      // Poignée dorée sous le doigt / la souris ?
      const hit = laps.slice(0, -1).findIndex((l) => Math.abs(sx(xOfT(l.endS)) - px) < (touch ? 16 : 8));
      if (hit >= 0) {
        setDrag(hit);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        return;
      }
    }
    if (touch) {
      setCursorX(clampPx(px));
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const px = localX(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, px);
    if (pinch.current && pointers.current.size === 2 && props.onZoomChange) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const scale = Math.max(1, Math.abs(a - b)) / Math.max(1, p.d0);
      const span = Math.max(30, (p.z0.endS - p.z0.startS) / scale);
      const fullEnd = display.t[display.t.length - 1] ?? 1;
      if (span >= fullEnd - (display.t[0] ?? 0)) props.onZoomChange(null);
      else {
        const start = Math.max(0, Math.min(fullEnd - span, p.mid - span / 2));
        props.onZoomChange({ startS: start, endS: start + span });
      }
      return;
    }
    if (drag !== null) {
      props.onMoveBoundary?.(drag, tOfX(invX(clampPx(px))));
      return;
    }
    if (!touch || pointers.current.has(e.pointerId)) setCursorX(px >= m.l && px <= m.l + plotW ? px : null);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wasPinch = pinch.current !== null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag !== null) {
      setDrag(null);
      return;
    }
    if (wasPinch) return;
    const px = localX(e);
    if (px < m.l || px > m.l + plotW) return;
    const tS = tOfX(invX(px));
    if (editing) props.onPickTime?.(tS);
    else if (!touch) {
      const i = lapIndexAt(laps, tS);
      if (i >= 0) props.onLapClick?.(i);
    }
  };

  const ci = cursorX !== null && xs.length ? nearestIndex(xs, invX(cursorX)) : -1;
  const names = useMemo(() => displayLapNames(laps), [laps]);

  // ── Graduations ──────────────────────────────────────────────────────────
  const xTicks = useMemo(() => {
    const n = touch ? 4 : 6;
    if (axis === "distance") return niceTicks(x0, x1, n);
    const step = [30, 60, 120, 300, 600, 900, 1200, 1800, 3600].find((s) => (x1 - x0) / s <= n) ?? 3600;
    const out: number[] = [];
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) out.push(v);
    return out;
  }, [axis, x0, x1, touch]);
  const paceTicks = useMemo(() => {
    if (!paceDom) return [];
    if (speedMode) return niceTicks(paceDom[0], paceDom[1], touch ? 3 : 4);
    const span = paceDom[1] - paceDom[0];
    const step = [10, 15, 30, 60, 120].find((st) => span / st <= (touch ? 3 : 5)) ?? 120;
    const out: number[] = [];
    for (let v = Math.ceil(paceDom[0] / step) * step; v <= paceDom[1]; v += step) out.push(v);
    return out;
  }, [paceDom, touch, speedMode]);
  const hrTicks = useMemo(() => (hrDom ? niceTicks(hrDom[0], hrDom[1], touch ? 3 : 4).filter((v) => v % 10 === 0) : []), [hrDom, touch]);

  const fmtX = (v: number) => (axis === "time" ? fmtClock(v) : `${fmtKm(v, v % 1000 === 0 ? 0 : 1)} km`);
  const fs = touch ? 9.5 : 10;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height, touchAction: touch ? "pan-y" : "auto", userSelect: "none", cursor: editing ? "crosshair" : "default" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => !touch && drag === null && setCursorX(null)}
    >
      {width > 0 && paths && (
        <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-label="Graphique de la séance">
          <defs>
            <clipPath id={clipId}><rect x={m.l} y={plotTop} width={plotW} height={plotH} /></clipPath>
          </defs>
          {/* Fond du tracé */}
          <rect x={m.l} y={plotTop} width={plotW} height={plotH} fill={alpha(C.tx, 0.015)} />

          {/* Tours en fond */}
          {laps.map((l, i) => {
            const a = Math.max(m.l, sx(xOfT(l.startS)));
            const b = Math.min(m.l + plotW, sx(xOfT(l.endS)));
            if (b <= m.l || a >= m.l + plotW || b - a < 0.5) return null;
            const kind = lapKind(l, blocks);
            const station = kind === "station" || kind === "transition";
            const proposed = l.status === "proposed";
            const active = activeLap === i;
            const fill = active
              ? alpha(C.ac, 0.1)
              : station ? alpha(C.o, 0.09) : i % 2 ? alpha(C.tx, 0.035) : "transparent";
            const label = b - a > 70 ? `${i + 1} · ${names[i]}` : b - a > 14 ? String(i + 1) : "";
            return (
              <g key={`lap-${i}`}>
                <rect x={a} y={plotTop} width={b - a} height={plotH} fill={fill} />
                {i > 0 && (
                  <line x1={a} x2={a} y1={plotTop} y2={plotTop + plotH} stroke={proposed ? C.o : alpha(C.tx, 0.14)}
                    strokeDasharray={proposed ? "3 3" : undefined} />
                )}
                {l.needsReview && (
                  <rect x={a + 1} y={plotTop + 1} width={Math.max(0, b - a - 2)} height={plotH - 2} fill="none" stroke={C.ac} strokeDasharray="4 3" />
                )}
                {label && (
                  <text x={a + 5} y={plotTop + 12} fontSize={fs} fill={active ? C.ac : C.tx3} style={{ ...MONO, fontStyle: proposed ? "italic" : "normal" }}>
                    {label.length * 6 > b - a - 8 ? String(i + 1) : label}
                  </text>
                )}
              </g>
            );
          })}

          {/* SV1 / SV2 */}
          {showHr && bounds && hrDom && bounds.map((bpm, k) => (
            bpm > hrDom[0] && bpm < hrDom[1] ? (
              <g key={`sv-${k}`}>
                <line x1={m.l} x2={m.l + plotW} y1={syHr(bpm)} y2={syHr(bpm)} stroke={alpha(C.tx, 0.18)} strokeDasharray="2 4" />
                {!touch && bounds.length === 2 && (
                  <text x={m.l + plotW - 4} y={syHr(bpm) - 4} fontSize={9} textAnchor="end" fill={C.tx3} style={MONO}>
                    SV{k + 1} {bpm}
                  </text>
                )}
              </g>
            ) : null
          ))}

          <g clipPath={`url(#${clipId})`}>
            {showAlt && <path d={paths.altPath} fill={alpha(SERIES_COLORS.altitude, 0.22)} stroke="none" />}
            {showCad && <path d={paths.cadPath} fill="none" stroke={SERIES_COLORS.cadence} strokeWidth={1.1} opacity={0.8} />}
            {showPace && <path d={paths.pacePath} fill="none" stroke={SERIES_COLORS.pace} strokeWidth={1.6} strokeLinejoin="round" />}
            {paths.hrSegs.map((s, k) => (
              <path key={`hr-${k}`} d={s.d} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" />
            ))}
          </g>

          {/* Axes */}
          {showPace && paceTicks.map((v) => (
            <text key={`pt-${v}`} x={m.l - 6} y={syPace(v) + 3} fontSize={fs} textAnchor="end" fill={SERIES_COLORS.pace} style={MONO}>
              {speedMode ? fmtInt(v) : fmtPace(v)}
            </text>
          ))}
          {showHr && hrTicks.map((v) => (
            <text key={`ht-${v}`} x={m.l + plotW + 6} y={syHr(v) + 3} fontSize={fs} fill={C.tx2} style={MONO}>{v}</text>
          ))}

          {/* Bande des zones */}
          {paths.strip.map((s, k) => (
            <rect key={`z-${k}`} x={s.x} y={plotTop + plotH + 3} width={s.w} height={touch ? 5 : 6} fill={s.color} />
          ))}
          {xTicks.map((v) => (
            <text key={`xt-${v}`} x={sx(v)} y={height - 8} fontSize={fs} textAnchor="middle" fill={C.tx3} style={MONO}>{fmtX(v)}</text>
          ))}

          {/* Mode « Modifier les tours » : poignées et coupe */}
          {editing && laps.slice(0, -1).map((l, i) => {
            const x = sx(xOfT(l.endS));
            if (x < m.l || x > m.l + plotW) return null;
            return (
              <g key={`h-${i}`} style={{ cursor: "ew-resize" }}>
                <line x1={x} x2={x} y1={plotTop} y2={plotTop + plotH} stroke={C.ac} strokeWidth={drag === i ? 2 : 1.4} />
                <rect x={x - (touch ? 7 : 5)} y={plotTop + plotH / 2 - 14} width={touch ? 14 : 10} height={28} rx={4} fill={C.ac} />
              </g>
            );
          })}
          {editing && props.cutAtS != null && (() => {
            const x = sx(xOfT(props.cutAtS));
            if (x < m.l || x > m.l + plotW) return null;
            return (
              <g>
                <line x1={x} x2={x} y1={plotTop} y2={plotTop + plotH} stroke={C.tx} strokeDasharray="4 3" />
                <rect x={x - 32} y={plotTop - 20} width={64} height={18} rx={4} fill={C.tx} />
                <text x={x} y={plotTop - 7} fontSize={10} textAnchor="middle" fill={C.bg} style={MONO}>✂ {fmtClock(props.cutAtS)}</text>
              </g>
            );
          })()}

          {/* Curseur */}
          {ci >= 0 && (
            <g pointerEvents="none">
              <line x1={sx(xs[ci])} x2={sx(xs[ci])} y1={plotTop} y2={plotTop + plotH} stroke={C.tx} strokeWidth={1} />
              {showPace && pace?.[ci] != null && <circle cx={sx(xs[ci])} cy={syPace(clampPace(pace[ci]!))} r={3.5} fill={SERIES_COLORS.pace} />}
              {showHr && src.hr?.[ci] != null && (
                <circle cx={sx(xs[ci])} cy={syHr(src.hr[ci]!)} r={3.5} fill={bounds ? zoneColor(zones?.[ci], bounds.length + 1) : C.r} />
              )}
              {touch && <circle cx={sx(xs[ci])} cy={plotTop + plotH * 0.75} r={16} fill={alpha(C.tx, 0.12)} stroke={alpha(C.tx, 0.4)} />}
            </g>
          )}
        </svg>
      )}

      {/* Pictos au-dessus des stations */}
      {props.stationIcons && width > 0 && laps.map((l, i) => {
        const kind = lapKind(l, blocks);
        if (kind !== "station") return null;
        const a = sx(xOfT(l.startS));
        const b = sx(xOfT(l.endS));
        const mid = (a + b) / 2;
        if (mid < m.l || mid > m.l + plotW) return null;
        return (
          <div key={`ic-${i}`} style={{ position: "absolute", left: mid - 11, top: m.t - 2, width: 22, height: 22, borderRadius: 5,
            border: `1px solid ${alpha(C.o, 0.6)}`, background: alpha(C.o, 0.12), display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <StationIcon name={l.name} size={14} />
          </div>
        );
      })}

      {ci >= 0 && (
        <Tooltip
          x={sx(xs[ci])}
          width={width}
          touch={!!touch}
          top={touch ? -6 : plotTop + 6}
          rows={tooltipRows(src, ci, pace, zones, bounds, laps, names, !!touch, speedMode)}
        />
      )}
    </div>
  );
}

function tooltipRows(
  s: ActivityStream,
  i: number,
  pace: Array<number | null> | null,
  zones: Array<number | null> | null,
  bounds: number[] | null,
  laps: readonly DetailLap[],
  names: string[],
  touch: boolean,
  speedMode: boolean,
): Array<{ k: string; v: string; zone?: number | null }> {
  const t = s.t[i];
  const li = lapIndexAt(laps, t);
  const hr = s.hr?.[i] ?? null;
  const rows: Array<{ k: string; v: string; zone?: number | null }> = [
    { k: "Temps", v: fmtClock(t) },
    { k: "Distance", v: s.dist?.[i] != null ? `${fmtKm(s.dist[i], 2)} km` : DASH },
    speedMode
      ? { k: "Vitesse", v: pace?.[i] != null ? `${pace[i]!.toFixed(1).replace(".", ",")} km/h` : DASH }
      : { k: "Allure", v: pace?.[i] != null ? `${fmtPace(pace[i])} /km` : DASH },
    { k: "FC", v: hr != null ? `${Math.round(hr)} bpm` : DASH, zone: bounds && hr != null ? zones?.[i] ?? zoneOf(hr, bounds) : null },
  ];
  if (!touch) {
    rows.push({ k: "Altitude", v: s.alt?.[i] != null ? `${fmtInt(s.alt[i])} m` : DASH });
    rows.push({ k: "Cadence", v: s.cadence?.[i] != null ? `${fmtInt(s.cadence[i])} pas/min` : DASH });
  }
  rows.push({ k: "Tour", v: li >= 0 ? `${li + 1} · ${names[li]}` : DASH });
  return rows;
}

function Tooltip({ x, width, top, rows, touch }: { x: number; width: number; top: number; rows: ReturnType<typeof tooltipRows>; touch: boolean }) {
  const w = touch ? 150 : 176;
  const left = touch
    ? Math.min(width - w - 2, Math.max(2, x - w / 2))
    : x + 12 + w > width ? x - 12 - w : x + 12;
  return (
    <div
      style={{
        position: "absolute", left, top, width: w, transform: touch ? "translateY(-100%)" : undefined,
        background: alpha(C.bg, 0.94), border: `1px solid ${C.brdL}`, borderRadius: 10, padding: "8px 10px",
        pointerEvents: "none", zIndex: 2, boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
      }}
    >
      {rows.map((r) => (
        <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, lineHeight: "17px" }}>
          <span style={{ color: C.tx2 }}>{r.k}</span>
          <span style={{ ...MONO, color: C.tx, display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.v}
            {r.zone ? <ZonePill zone={r.zone} n={3} small /> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ZonePill({ zone, n = 3, small }: { zone: number | null | undefined; n?: number; small?: boolean }) {
  if (!zone) return <span style={{ ...MONO, color: C.tx3, fontSize: 11 }}>{DASH}</span>;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        height: small ? 15 : 18, padding: small ? "0 4px" : "0 6px", borderRadius: 999,
        background: zoneColor(zone, n), color: C.bg, ...MONO, fontSize: small ? 9 : 10, fontWeight: 500,
      }}
    >
      Z{zone}
    </span>
  );
}
