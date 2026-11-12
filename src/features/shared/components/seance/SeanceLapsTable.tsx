import type { CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtInt, fmtKm, fmtPaceOrSpeed, fmtUpDown, SERIES_COLORS, zoneColor } from "@/lib/seance";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import type { LapMetrics } from "@shared/domain/lapMetrics";
import { ZonePill } from "./SeanceChart";
import { MONO } from "./seanceUi";

interface Props {
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  total: LapMetrics | null;
  zonesN: number;
  active: number | null;
  onSelect: (i: number) => void;
  /** Vélo : vitesse (km/h) au lieu de l'allure. */
  speed?: boolean;
}

const COLS = "40px minmax(120px,1.6fr) repeat(10, minmax(54px, 1fr)) 52px";
const head = (speed: boolean) => ["N°", "Nom", "Temps", "Distance", speed ? "Vit. moy." : "Allure moy.", speed ? "Vit. max" : "Allure max", "FC moy.", "FC max", "Cad. moy.", "Cad. max", "D+ / D−", "", "Zone"];

/** Tableau des tours (ordinateur) : une ligne par tour, cliquable (zoom du graphique). */
export function SeanceLapsTable({ laps, names, total, zonesN, active, onSelect, speed = false }: Props) {
  const HEAD = head(speed);
  const pace = (v: number | null | undefined) => fmtPaceOrSpeed(v, speed);
  const cell: CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap" };
  const hrColor = (m: LapMetrics) => (m.meanZone ? zoneColor(m.meanZone, zonesN) : C.tx);
  return (
    <div style={{ border: `1px solid ${C.brd}`, borderRadius: 12, overflow: "hidden", background: C.s1 }} role="table">
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.brd}` }} role="row">
        {HEAD.map((h, i) => (
          <span key={i} style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3, textAlign: i < 2 ? "left" : i === 12 ? "center" : "right" }}>
            {h}
          </span>
        ))}
      </div>
      {laps.map((l, i) => {
        const m = l.metrics;
        const on = active === i;
        return (
          <div
            key={`${l.startS}-${i}`}
            role="row"
            tabIndex={0}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(i)}
            style={{
              display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "0 14px", minHeight: 44,
              borderTop: i ? `1px solid ${C.brd}` : "none", cursor: "pointer",
              background: on ? alpha(C.ac, 0.1) : "transparent", boxShadow: on ? `inset 3px 0 0 ${C.ac}` : "none",
            }}
          >
            <span style={{ ...MONO, fontSize: 11, color: on ? C.ac : C.tx3 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: on ? C.ac : C.tx, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[i]}</span>
            <span style={{ ...cell, fontWeight: 600 }}>{fmtClock(m.durationS)}</span>
            <span style={cell}>{m.distanceM != null ? `${fmtKm(m.distanceM, 2)} km` : "—"}</span>
            <span style={{ ...cell, color: SERIES_COLORS.pace }}>{pace(m.avgPaceSPerKm)}</span>
            <span style={{ ...cell, color: C.tx2 }}>{pace(m.maxPaceSPerKm)}</span>
            <span style={{ ...cell, color: hrColor(m) }}>{fmtInt(m.avgHr)}</span>
            <span style={{ ...cell, color: C.tx2 }}>{fmtInt(m.maxHr)}</span>
            <span style={cell}>{fmtInt(m.avgCadence)}</span>
            <span style={{ ...cell, color: C.tx2 }}>{fmtInt(m.maxCadence)}</span>
            <span style={cell}>{fmtUpDown(m.ascentM, m.descentM)}</span>
            <span />
            <span style={{ textAlign: "center" }}><ZonePill zone={m.meanZone} n={zonesN} /></span>
          </div>
        );
      })}
      {total && (
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "0 14px", minHeight: 44, borderTop: `1px solid ${C.brdL}`, background: alpha(C.tx, 0.02) }} role="row">
          <span />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
          <span style={{ ...cell, fontWeight: 600 }}>{fmtClock(total.durationS)}</span>
          <span style={cell}>{total.distanceM != null ? `${fmtKm(total.distanceM, 2)} km` : "—"}</span>
          <span style={{ ...cell, color: SERIES_COLORS.pace }}>{pace(total.avgPaceSPerKm)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{pace(total.maxPaceSPerKm)}</span>
          <span style={cell}>{fmtInt(total.avgHr)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{fmtInt(total.maxHr)}</span>
          <span style={cell}>{fmtInt(total.avgCadence)}</span>
          <span style={{ ...cell, color: C.tx2 }}>{fmtInt(total.maxCadence)}</span>
          <span style={cell}>{fmtUpDown(total.ascentM, total.descentM)}</span>
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
