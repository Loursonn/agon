import { useState, type ReactNode } from "react";
import { Move, ZoomIn } from "lucide-react";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, SERIES_COLORS, ZONE_COLORS_3 } from "@/lib/seance";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import { SeanceChart, type SeriesKey, type XAxis } from "./SeanceChart";
import { CARD, MONO, buttonStyle } from "./seanceUi";

interface Props {
  stream: ActivityStream;
  display: ActivityStream;
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  blocks: readonly ExpectedBlock[] | null;
  bounds: number[] | null;
  activeLap: number | null;
  zoomLap: number | null;
  onLapClick: (i: number) => void;
  onExitZoom: () => void;
  compact: boolean;
  stationIcons?: boolean;
  /** Vélo : vitesse (km/h) au lieu de l'allure. */
  speed?: boolean;
  editing?: boolean;
  cutAtS?: number | null;
  onPickTime?: (tS: number) => void;
  onMoveBoundary?: (i: number, tS: number) => void;
  /** Contenu ajouté sous le graphique (barre d'outils d'édition…). */
  children?: ReactNode;
}

/** Carte du graphique : séries affichées, temps / distance, zoom sur un tour ou au pincement. */
export function SeanceChartCard(props: Props) {
  const { stream, display, laps, names, zoomLap, compact, editing } = props;
  const hasDist = !!display.dist?.some((v) => v != null) && !!display.speed?.some((v) => v != null && v > 0.5);
  const hasAlt = !!display.alt?.some((v) => v != null);
  const hasCad = !!display.cadence?.some((v) => v != null);
  const hasHr = !!display.hr?.some((v) => v != null);
  const [axis, setAxis] = useState<XAxis>("time");
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ pace: hasDist, hr: true, alt: true, cadence: false });
  const [pinch, setPinch] = useState<{ startS: number; endS: number } | null>(null);

  const lapZoom = zoomLap !== null && laps[zoomLap] ? { startS: laps[zoomLap].startS, endS: laps[zoomLap].endS } : null;
  const zoom = lapZoom ?? pinch;
  const zoomedLap = lapZoom ? laps[zoomLap!] : null;
  const vis = zoomedLap ? { ...visible, alt: false, cadence: false } : visible;
  const fullSpan = (display.t[display.t.length - 1] ?? 1) - (display.t[0] ?? 0);

  const toggles: Array<{ k: SeriesKey; label: string; color: string; on: boolean }> = [
    { k: "pace", label: props.speed ? "Vitesse" : "Allure", color: SERIES_COLORS.pace, on: hasDist },
    { k: "hr", label: "FC", color: ZONE_COLORS_3[1], on: hasHr },
    { k: "alt", label: "Altitude", color: SERIES_COLORS.altitude, on: hasAlt },
    { k: "cadence", label: "Cadence", color: SERIES_COLORS.cadence, on: hasCad },
  ];

  return (
    <div style={{ ...CARD, padding: compact ? "12px 10px" : "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {toggles.map((t) => {
            const on = vis[t.k] && t.on;
            return (
              <button
                key={t.k}
                type="button"
                disabled={!t.on || (!!zoomedLap && (t.k === "alt" || t.k === "cadence"))}
                onClick={() => setVisible((v) => ({ ...v, [t.k]: !v[t.k] }))}
                aria-pressed={on}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 999,
                  border: `1px ${on ? "solid" : "dashed"} ${on ? C.brdL : C.brd}`, background: on ? alpha(C.tx, 0.05) : "transparent",
                  color: on ? C.tx : C.tx3, fontSize: 12.5, cursor: t.on ? "pointer" : "not-allowed", fontFamily: "inherit",
                  opacity: t.on ? 1 : 0.45,
                }}
              >
                <span style={{ width: 12, height: 2, background: t.color, borderRadius: 2, opacity: on ? 1 : 0.5 }} />
                {t.label}
              </button>
            );
          })}
        </div>
        {hasDist && (
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: C.s2 }} role="tablist">
            {(["time", "distance"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={axis === a}
                onClick={() => setAxis(a)}
                style={{
                  height: 26, padding: "0 10px", borderRadius: 8, border: "none", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                  background: axis === a ? C.s1 : "transparent", color: axis === a ? C.tx : C.tx3,
                }}
              >
                {a === "time" ? "Temps" : "Distance"}
              </button>
            ))}
          </div>
        )}
      </div>

      {zoomedLap && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: alpha(C.ac, 0.08), border: `1px solid ${alpha(C.ac, 0.3)}`, flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.14em", color: C.ac }}>TOUR {zoomLap! + 1}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{names[zoomLap!]}</span>
          <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>
            {fmtClock(zoomedLap.metrics.durationS)}
            {zoomedLap.metrics.distanceM != null && ` · ${fmtKm(zoomedLap.metrics.distanceM, 2)} km`}
            {zoomedLap.metrics.avgPaceSPerKm != null && <> · <span style={{ color: SERIES_COLORS.pace }}>{fmtPaceOrSpeed(zoomedLap.metrics.avgPaceSPerKm, !!props.speed)} {props.speed ? "km/h" : "/km"}</span></>}
            {zoomedLap.metrics.avgHr != null && ` · FC ${fmtInt(zoomedLap.metrics.avgHr)} / ${fmtInt(zoomedLap.metrics.maxHr)}`}
          </span>
          <span style={{ flex: 1 }} />
          {!compact && <span style={{ fontSize: 11.5, color: C.tx3 }}>Zoom : allure et FC seulement</span>}
          <button type="button" onClick={props.onExitZoom} style={buttonStyle()}>Toute la séance</button>
        </div>
      )}
      {!zoomedLap && pinch && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>Zoomé × {Math.max(1, Math.round(fullSpan / (pinch.endS - pinch.startS)))}</span>
          <button type="button" onClick={() => setPinch(null)} style={{ ...buttonStyle(), height: 30 }}>Toute la séance</button>
        </div>
      )}

      <SeanceChart
        stream={stream}
        display={display}
        laps={laps}
        blocks={props.blocks}
        bounds={props.bounds}
        axis={axis}
        visible={vis}
        zoom={zoom}
        onZoomChange={compact && !lapZoom ? setPinch : undefined}
        activeLap={props.activeLap}
        onLapClick={props.onLapClick}
        editing={editing}
        cutAtS={props.cutAtS}
        onPickTime={props.onPickTime}
        onMoveBoundary={props.onMoveBoundary}
        touch={compact}
        stationIcons={props.stationIcons && !compact}
        speed={props.speed}
      />

      {zoom && <Overview display={display} zoom={zoom} />}
      {compact && !editing && (
        <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 11, color: C.tx3 }}>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><ZoomIn size={12} /> 2 doigts : zoomer</span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Move size={12} /> 1 doigt : se déplacer</span>
        </div>
      )}
      {props.children}
    </div>
  );
}

/** Vue d'ensemble sous un zoom : toute la FC, la partie affichée en or. */
function Overview({ display, zoom }: { display: ActivityStream; zoom: { startS: number; endS: number } }) {
  const t0 = display.t[0] ?? 0;
  const t1 = display.t[display.t.length - 1] ?? 1;
  const hr = display.hr ?? [];
  const vals = hr.filter((v): v is number => v != null);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const W = 1000;
  const H = 28;
  let d = "";
  let pen = false;
  display.t.forEach((t, i) => {
    const v = hr[i];
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${(((t - t0) / (t1 - t0)) * W).toFixed(1)},${(H - ((v - lo) / Math.max(1, hi - lo)) * (H - 4) - 2).toFixed(1)}`;
    pen = true;
  });
  const a = ((zoom.startS - t0) / (t1 - t0)) * W;
  const b = ((zoom.endS - t0) / (t1 - t0)) * W;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden>
        <path d={d} fill="none" stroke={C.tx3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={a} y={0} width={Math.max(2, b - a)} height={H} fill={alpha(C.ac, 0.18)} stroke={C.ac} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>Toute la séance · partie affichée en or</div>
    </div>
  );
}
