/**
 * SessionPreview — visualisation d'une séance énergétique structurée.
 *
 * Props:
 *   intervals  EnergyGroup racine de la séance
 *   compact    mode compact (hauteur réduite, sans zone bar)
 */
import { useRef, useState, useLayoutEffect } from "react";
import { C } from "@/lib/theme";
import {
  expandIntervals,
  computeTotals,
  targetToIntensityPct,
  intensityToColor,
  computeZoneDistribution,
  estimateIntervalDuration,
  ROLE_FALLBACK_PCT,
} from "@/lib/energy";
import type { EnergyGroup } from "@/types/energy";
import HatchPattern from "./HatchPattern";
import { formatTarget, formatS, formatSLong } from "@/lib/energy/formatTarget";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";

// ── Zone colors (anchors) ─────────────────────────────────────────────────────
const ZONE_COLORS = {
  z1: intensityToColor(10),
  z2: intensityToColor(40),
  z3: intensityToColor(60),
  z4: intensityToColor(82),
  z5: intensityToColor(95),
  unc: "#3A383C",
} as const;

// ── Tick computation ──────────────────────────────────────────────────────────
function computeTicks(totalS: number, maxTicks = 8): number[] {
  if (totalS === 0) return [0];
  const raw = totalS / maxTicks;
  const steps = [10, 15, 20, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3600];
  const step = steps.find((s) => s >= raw) ?? 3600;
  const ticks: number[] = [];
  for (let t = 0; t <= totalS; t += step) ticks.push(t);
  return ticks;
}

// ── Tooltip state ─────────────────────────────────────────────────────────────
interface TooltipState {
  x: number;
  y: number;
  role: string;
  duration: string;
  target: string;
  equipment?: string;
  notes?: string;
}

// ── Role label ────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  warmup:   "Échauffement",
  work:     "Effort",
  recovery: "Récupération",
  rest:     "Repos",
  cooldown: "Retour calme",
  open:     "Libre",
};

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  intervals: EnergyGroup;
  athleteId?: string;
  compact?: boolean;
}

export default function SessionPreview({ intervals, athleteId, compact = false }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [svgW, setSvgW] = useState(600);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { data: refs } = useAthleteReferences(athleteId);
  const calcOptions = refs && Object.keys(refs).length > 0 ? { athleteReferences: refs } : undefined;

  // Measure container width (ResizeObserver)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSvgW(entry.contentRect.width || 600);
    });
    ro.observe(el);
    setSvgW(el.offsetWidth || 600);
    return () => ro.disconnect();
  }, []);

  // ── Compute data ────────────────────────────────────────────────────────────
  const flat     = expandIntervals(intervals);
  const totals   = computeTotals(flat, calcOptions);
  const zones    = computeZoneDistribution(flat, calcOptions);
  const totalDur = totals.durationS;

  // Build bar list with cumulative start times
  let cumul = 0;
  const bars = flat.map((fi) => {
    const dur        = estimateIntervalDuration(fi.interval, calcOptions);
    const pctFromRef = targetToIntensityPct(fi.interval.target, refs);
    // Fallback : estimation depuis le rôle si pas de référence ni valeur calculable
    const roleFallback = ROLE_FALLBACK_PCT[fi.interval.role] ?? 50;
    const pct      = pctFromRef;
    const displayPct = pctFromRef ?? roleFallback;
    const isFallback = pctFromRef === null;
    const start    = cumul;
    cumul += dur;
    return { fi, dur, pct, displayPct, isFallback, start };
  });

  // ── SVG layout constants ────────────────────────────────────────────────────
  const CHART_H   = compact ? 70 : 200;
  const AXIS_H    = 20;
  const BAR_AREA  = CHART_H - AXIS_H;
  const PAD_LEFT  = 0;
  const ticks     = computeTicks(totalDur);

  function xOf(t: number) {
    if (totalDur === 0) return PAD_LEFT;
    return PAD_LEFT + (t / totalDur) * (svgW - PAD_LEFT);
  }

  // ── Zone bar data ───────────────────────────────────────────────────────────
  const zoneSegments = [
    { key: "z1", label: "Z1", color: ZONE_COLORS.z1, secs: zones.z1 },
    { key: "z2", label: "Z2", color: ZONE_COLORS.z2, secs: zones.z2 },
    { key: "z3", label: "Z3", color: ZONE_COLORS.z3, secs: zones.z3 },
    { key: "z4", label: "Z4", color: ZONE_COLORS.z4, secs: zones.z4 },
    { key: "z5", label: "Z5", color: ZONE_COLORS.z5, secs: zones.z5 },
    { key: "unc", label: "?", color: ZONE_COLORS.unc, secs: zones.uncategorized },
  ].filter((s) => s.secs > 0);

  return (
    <div ref={wrapRef} style={{ width: "100%", userSelect: "none", position: "relative" }}>

      {/* ── Main interval chart ── */}
      <svg
        ref={svgRef}
        width="100%"
        height={CHART_H}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs />

        {/* Background */}
        <rect x={0} y={0} width={svgW} height={BAR_AREA} fill="rgba(255,255,255,0.03)" rx={4} />

        {/* Intensity bars */}
        {bars.map(({ fi, dur, pct, displayPct, isFallback, start }, i) => {
          if (dur === 0) return null;
          const x      = xOf(start);
          const x2     = xOf(start + dur);
          const w      = Math.max(1, x2 - x);
          const isExo  = fi.interval.type === "exercise";
          const barH   = isExo ? Math.max(2, 0.55 * BAR_AREA) : Math.max(2, (displayPct / 100) * BAR_AREA);
          const fill   = isExo ? "#FFC933" : intensityToColor(displayPct);
          const opacity = isExo ? 0.8 : isFallback ? 0.55 : 0.85;
          const barY   = BAR_AREA - barH;

          return (
            <g key={i}>
              <rect
                x={x}
                y={barY}
                width={w}
                height={barH}
                fill={fill}
                opacity={opacity}
                rx={1}
                style={{ cursor: "crosshair" }}
                onMouseEnter={(e) => {
                  const svgRect = svgRef.current?.getBoundingClientRect();
                  if (!svgRect) return;
                  if (isExo) {
                    const exo = fi.interval as import("@/types/energy").ExerciseInterval;
                    const repsLabel = exo.reps_min
                      ? exo.reps_max && exo.reps_max !== exo.reps_min
                        ? `${exo.reps_min}-${exo.reps_max} reps`
                        : `${exo.reps_min} reps`
                      : "";
                    setTooltip({
                      x: e.clientX - svgRect.left,
                      y: barY,
                      role: "Exercice",
                      duration: exo.exercise_name,
                      target: repsLabel,
                      notes: exo.notes,
                    });
                  } else {
                    const p = displayPct;
                    const zone = p <= 30 ? "Zone 1"
                      : p <= 50 ? "Zone 2"
                      : p <= 70 ? "Zone 3"
                      : p <= 85 ? "Zone 4"
                      : "Zone 5";
                    const targetStr = formatTarget(fi.interval.target);
                    const pctLabel = ` ${Math.round(p)}%${isFallback ? " (estimé)" : ""}`;
                    const eq = fi.interval.type === "interval" && fi.interval.equipment && fi.interval.equipment !== "none"
                      ? (EQUIPMENT_LABEL[fi.interval.equipment] ?? fi.interval.equipment) : undefined;
                    setTooltip({
                      x: e.clientX - svgRect.left,
                      y: barY,
                      role: ROLE_LABEL[fi.interval.role] ?? fi.interval.role,
                      duration: formatS(dur),
                      target: `${zone}${pctLabel}${targetStr && targetStr !== "Libre" ? ` · ${targetStr}` : ""}`,
                      equipment: eq,
                      notes: fi.interval.notes,
                    });
                  }
                }}
              />
              {/* Subtle gap between bars */}
              <rect x={x + w - 0.5} y={barY} width={1} height={barH} fill={C.bg} opacity={0.4} />
            </g>
          );
        })}

        {/* X axis ticks + labels */}
        {ticks.map((t) => {
          const x = xOf(t);
          return (
            <g key={t}>
              <line x1={x} y1={BAR_AREA} x2={x} y2={BAR_AREA + 5} stroke={C.tx3} strokeWidth={0.5} />
              <text
                x={x}
                y={CHART_H - 2}
                textAnchor="middle"
                fontSize={9}
                fill={C.tx3}
                fontFamily="inherit"
              >
                {formatS(t)}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={0} y1={BAR_AREA} x2={svgW} y2={BAR_AREA} stroke={C.brd} strokeWidth={1} />

        {/* Zone reference lines at intensity thresholds */}
        {[
          { pct: 30, label: "Z2", color: intensityToColor(30) },
          { pct: 50, label: "Z3", color: intensityToColor(50) },
          { pct: 70, label: "Z4", color: intensityToColor(70) },
          { pct: 85, label: "Z5", color: intensityToColor(85) },
        ].map(({ pct: zonePct, label: zLabel, color }) => {
          const y = BAR_AREA - (zonePct / 100) * BAR_AREA;
          return (
            <g key={zonePct}>
              <line
                x1={0} y1={y} x2={svgW - 28} y2={y}
                stroke={color} strokeWidth={0.8} opacity={0.35}
                strokeDasharray="4 3"
              />
              <rect x={svgW - 26} y={y - 7} width={24} height={13} rx={3}
                fill={color} opacity={0.18} />
              <text
                x={svgW - 14} y={y + 3}
                textAnchor="middle"
                fontSize={8} fill={color} opacity={0.85}
                fontFamily="inherit" fontWeight={700}
              >
                {zLabel}
              </text>
            </g>
          );
        })}

        {/* Tooltip pin line */}
        {tooltip && (
          <line
            x1={tooltip.x}
            y1={0}
            x2={tooltip.x}
            y2={BAR_AREA}
            stroke={C.ac}
            strokeWidth={1}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* ── Floating tooltip ── */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            top: Math.max(0, tooltip.y - 8),
            left: Math.min(tooltip.x + 10, svgW - 160),
            background: C.s1,
            border: `1px solid ${C.brdL}`,
            borderRadius: 4,
            padding: "7px 10px",
            fontSize: 11,
            color: C.tx,
            pointerEvents: "none",
            zIndex: 20,
            minWidth: 130,
          }}
        >
          <div style={{ fontWeight: 700, color: C.ac, marginBottom: 2 }}>{tooltip.role}</div>
          <div style={{ color: C.tx2 }}>Durée : <strong style={{ color: C.tx }}>{tooltip.duration}</strong></div>
          {tooltip.target && tooltip.target !== "Libre" && (
            <div style={{ color: C.tx2 }}>Cible : <strong style={{ color: C.tx }}>{tooltip.target}</strong></div>
          )}
          {tooltip.equipment && (
            <div style={{ color: C.tx2 }}>Matériel : <strong style={{ color: C.tx }}>{tooltip.equipment}</strong></div>
          )}
          {tooltip.notes && (
            <div style={{ color: C.tx3, marginTop: 4, fontStyle: "italic", fontSize: 10 }}>{tooltip.notes}</div>
          )}
        </div>
      )}

      {/* ── Zone distribution bar ── */}
      {!compact && totalDur > 0 && (
        <div style={{ marginTop: 12 }}>
          {/* Stacked bar */}
          <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", gap: 1 }}>
            {zoneSegments.map((seg) => (
              <div
                key={seg.key}
                style={{
                  flex: seg.secs,
                  background: seg.color,
                  minWidth: 2,
                  position: "relative",
                }}
                title={`${seg.label} · ${formatS(seg.secs)}`}
              />
            ))}
          </div>
          {/* Labels */}
          <div style={{ display: "flex", gap: 1, marginTop: 3 }}>
            {zoneSegments.map((seg) => (
              <div
                key={seg.key}
                style={{
                  flex: seg.secs,
                  textAlign: "center",
                  fontSize: 9,
                  color: C.tx3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  minWidth: 0,
                }}
              >
                {(seg.secs / totalDur) > 0.05 ? `${seg.label} · ${formatS(seg.secs)}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Totals ── */}
      {!compact && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 10,
            fontSize: 11,
            color: C.tx2,
            flexWrap: "wrap",
          }}
        >
          <span>
            <span style={{ color: C.tx3 }}>Durée totale</span>{" "}
            <strong style={{ color: C.tx }}>{formatSLong(totalDur)}</strong>
          </span>
          {totals.distanceM > 0 && (
            <span>
              <span style={{ color: C.tx3 }}>Distance</span>{" "}
              <strong style={{ color: C.tx }}>{(totals.distanceM / 1000).toFixed(1)} km</strong>
            </span>
          )}
          <span>
            <span style={{ color: C.tx3 }}>Intervalles d'effort</span>{" "}
            <strong style={{ color: C.tx }}>{totals.workCount}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
