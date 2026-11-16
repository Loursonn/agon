import { useState } from "react";
import { C, alpha } from "@/lib/theme";
import { LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { byRank, type EffortAxis } from "@/lib/hyrox/effortProfile";
import { fmtClock } from "@/lib/seance";

/**
 * Profil d'effort (« l'araignée », maquette validée par Hugo le 16/11/2026) :
 * radar à deux toiles superposables (rang dans toute la catégorie, niveau
 * contre l'objectif) et classement par station avec le temps réalisé et le
 * temps du top 1 %. Partagé par Ma saison (bloc 07) et la vue coach Radar.
 */

const CX = 170;
const CY = 170;
const R = 125;
const RANK_COLOR = C.b;
/** Libellés courts du radar (les noms complets restent dans le tableau). */
const RADAR_LABEL: Record<string, string> = {
  run: "Course", ski: "SkiErg", sled_push: "Sled push", sled_pull: "Sled pull", bbj: "BBJ", row: "Rameur",
  farmers: "Farmers", lunges: "Fentes", wall_balls: "Wall balls", roxzone: "Roxzone",
};
const SHORT_LABEL: Record<string, string> = { ...RADAR_LABEL, sled_push: "Push", sled_pull: "Pull", wall_balls: "WB" };
const LEVEL_COLOR = C.o;

const point = (i: number, n: number, v: number): [number, number] => {
  const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
  return [CX + (R * v * Math.cos(a)) / 100, CY + (R * v * Math.sin(a)) / 100];
};
const poly = (vals: Array<number | null>): string =>
  vals.map((v, i) => (v == null ? null : point(i, vals.length, v).map((x) => x.toFixed(1)).join(","))).filter(Boolean).join(" ");

function Radar({ axes, showRank, showLevel, compact }: { axes: EffortAxis[]; showRank: boolean; showLevel: boolean; compact: boolean }) {
  const n = axes.length;
  const ring = (v: number) => poly(axes.map(() => v));
  const label = (a: EffortAxis) => (compact ? SHORT_LABEL : RADAR_LABEL)[a.key] ?? a.label;
  const describe = byRank(axes).filter((a) => a.pct != null).map((a) => `${a.label} top ${a.pct} %`).join(", ");
  return (
    <svg viewBox="-36 0 412 330" role="img" aria-label={`Profil d'effort. Rang dans la catégorie : ${describe || "non disponible"}.`}
      style={{ width: "100%", maxWidth: 460, height: "auto", display: "block" }}>
      <g fill="none" stroke={C.brd} strokeWidth={1}>
        {[25, 75, 100].map((v) => <polygon key={v} points={ring(v)} />)}
        {axes.map((a, i) => { const [x, y] = point(i, n, 100); return <line key={a.key} x1={CX} y1={CY} x2={x} y2={y} />; })}
      </g>
      <polygon points={ring(50)} fill="none" stroke={alpha(C.tx2, 0.45)} strokeWidth={1.2} strokeDasharray="4 4" />
      {showRank && <polygon points={poly(axes.map((a) => a.rankValue))} fill={alpha(RANK_COLOR, 0.14)} stroke={RANK_COLOR} strokeWidth={1.8} strokeLinejoin="round" />}
      {showLevel && <polygon points={poly(axes.map((a) => a.levelValue))} fill={alpha(LEVEL_COLOR, 0.12)} stroke={LEVEL_COLOR} strokeWidth={1.8} strokeLinejoin="round" />}
      {axes.map((a, i) => {
        const [x, y] = point(i, n, 116);
        const anchor = Math.abs(x - CX) < 4 ? "middle" : x > CX ? "start" : "end";
        return <text key={a.key} x={x} y={y + 4} textAnchor={anchor} fontSize={compact ? 13 : 12} fill={C.tx2}>{label(a)}</text>;
      })}
      <text x={CX + 6} y={CY - R / 2 - 4} fontSize={10.5} fill={C.tx3} style={MONO}>médiane</text>
    </svg>
  );
}

function Toggle({ on, color, label, onClick }: { on: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{
        minHeight: 40, padding: "0 12px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
        border: `1px solid ${on ? alpha(color, 0.45) : C.brdL}`, background: on ? alpha(color, 0.12) : "transparent",
        color: on ? C.tx : C.tx3, fontFamily: "inherit", fontSize: 13,
      }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: on ? color : "transparent", border: `1.5px solid ${color}` }} />
      {label}
    </button>
  );
}

const levelColor = (p: number | null) => (p == null ? C.tx3 : p >= 105 ? C.g : p <= 95 ? C.o : C.tx2);
const t = (s: number | null) => (s != null ? fmtClock(s) : "—");

export default function EffortProfile({ axes, categoryLabel, compact = false }: { axes: EffortAxis[]; categoryLabel: string; compact?: boolean }) {
  const [showRank, setShowRank] = useState(true);
  const [showLevel, setShowLevel] = useState(true);
  const rows = byRank(axes);
  const hasRank = axes.some((a) => a.pct != null);
  const clipped = axes.filter((a) => a.levelClipped && a.levelPct != null);
  const cols = compact ? "minmax(0, 1fr) 38px 38px 66px 42px" : "minmax(80px, 1fr) 72px 72px minmax(90px, 1.6fr) 70px 58px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Toggle on={showRank} color={RANK_COLOR} label={compact ? categoryLabel : `Toutes les ${categoryLabel}`} onClick={() => setShowRank((v) => !v)} />
        <Toggle on={showLevel} color={LEVEL_COLOR} label={compact ? "Ton niveau" : "Ton niveau de course"} onClick={() => setShowLevel((v) => !v)} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", justifyContent: "center" }}>
          <Radar axes={axes} showRank={showRank} showLevel={showLevel} compact={compact} />
        </div>
        <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div role="table" aria-label="Classement par station" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: compact ? 8 : 10, alignItems: "end" }}>
              <span role="columnheader" style={LABEL}>Station</span>
              <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>{compact ? "Toi" : "Ton temps"}</span>
              <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>{compact ? "Top 1" : "Réf. top 1 %"}</span>
              {!compact && <span role="columnheader" style={LABEL}>{categoryLabel}</span>}
              <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>Rang</span>
              <span role="columnheader" style={{ ...LABEL, textAlign: "right" }}>{compact ? "Niv." : "Niveau"}</span>
            </div>
            {rows.map((a) => (
              <div role="row" key={a.key} style={{ display: "grid", gridTemplateColumns: cols, gap: compact ? 8 : 10, alignItems: "center", fontSize: compact ? 13 : 13.5 }}>
                <span role="cell">{compact ? RADAR_LABEL[a.key] ?? a.label : a.label}{a.key === "run" && <span style={{ color: C.tx3, fontSize: 11.5 }}> /km</span>}</span>
                <span role="cell" style={{ ...MONO, textAlign: "right" }}>{t(a.actualS)}</span>
                <span role="cell" style={{ ...MONO, textAlign: "right", color: C.tx3 }}>{t(a.top1S)}</span>
                {!compact && (
                  <span role="cell" aria-hidden="true" style={{ position: "relative", height: 8, borderRadius: 4, background: C.s2, display: "flex" }}>
                    {a.rankValue != null && <span style={{ width: `${a.rankValue}%`, borderRadius: 4, background: RANK_COLOR }} />}
                    <span style={{ position: "absolute", left: "50%", top: -3, width: 1, height: 14, background: C.tx2 }} />
                  </span>
                )}
                <span role="cell" style={{ ...MONO, textAlign: "right", whiteSpace: "nowrap" }}>{a.pct != null ? `top ${a.pct} %` : "—"}</span>
                <span role="cell" style={{ ...MONO, textAlign: "right", color: levelColor(a.levelPct) }}>{a.levelPct != null ? `${a.levelPct} %` : "—"}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
            {hasRank
              ? `Réf. top 1 % : le temps des 1 % les plus rapides des ${categoryLabel} sur la station (pyrox, saisons 7 à 9). Rang : ta place parmi toutes les ${categoryLabel}. `
              : "Pas de classement de référence pour cette catégorie. "}
            Niveau : ton temps contre l'objectif de la course, 100 % = la médiane des athlètes qui courent comme toi.
            {clipped.length > 0 && ` Hors échelle sur le radar : ${clipped.map((a) => `${a.label} ${a.levelPct} %`).join(", ")}.`}
          </span>
        </div>
      </div>
    </div>
  );
}
