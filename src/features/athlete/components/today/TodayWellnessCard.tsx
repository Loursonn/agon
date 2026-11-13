import { useState } from "react";
import { Link } from "react-router-dom";
import { C } from "@/lib/theme";
import { MONO, DISPLAY } from "@/features/shared/components/seance/seanceUi";
import type { ReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import type { WellnessData } from "@/features/shared/types/athlete";
import { DOMS_LEVEL_COLOR, levelsList } from "@/lib/bodyZones";
import type { LightResult } from "@shared/domain/wellnessLight";
import { WellnessLightBadge } from "@/features/shared/components/WellnessLightBadge";

/** Les 5 notes du matin (1 = mauvais, 5 = très bien pour toutes), libellés courts. */
const ITEMS: Array<{ key: string; label: string }> = [
  { key: "fatigue", label: "Récup" },
  { key: "sommeil", label: "Sommeil" },
  { key: "stress", label: "Mental" },
  { key: "energie", label: "Énergie" },
  { key: "doms", label: "Muscles" },
];

/** Échelle 1 → 5 du formulaire wellness : rouge → vert. */
const SCALE5 = ["#FF3B1F", "#FF7A45", "#FF9500", "#B8F03C", "#66F03C"];
const itemColor = (v: number): string => SCALE5[Math.min(5, Math.max(1, Math.round(v))) - 1];

function Ring({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden style={{ flex: "none" }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(231,211,168,0.12)" strokeWidth={6} />
      <circle
        cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${(circ * score) / 100} ${circ}`} transform="rotate(-90 32 32)"
      />
      <text x={32} y={37.5} textAnchor="middle" fill={C.tx} style={{ ...MONO, fontSize: 16 }}>{score}</text>
    </svg>
  );
}

/**
 * Wellness du jour, replié (maquette « Aujourd'hui » du 12/11) : anneau,
 * palier, conseil ; « Voir le détail » déplie les 5 items du matin.
 */
export function TodayWellnessCard({
  readiness,
  advice,
  wellness,
  light,
  onLog,
}: {
  readiness: ReadinessScore | null;
  advice: string | null;
  wellness: WellnessData | null;
  /** Feu du matin calculé (VFC, FC de repos, ressentis, charge) ; absent = non affiché. */
  light?: LightResult | null;
  onLog?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!readiness) {
    // Wellness court du premier lancement (3 réponses) : le score demande les 5.
    const answered = ITEMS.filter((it) => Number((wellness as Record<string, unknown> | null)?.[it.key]) > 0).length;
    return (
      <button
        type="button"
        onClick={onLog}
        disabled={!onLog}
        style={{
          width: "100%", minHeight: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg,
          fontFamily: "inherit", fontWeight: 600, fontSize: 15, cursor: onLog ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {answered > 0 ? `Compléter mon wellness (${answered} / ${ITEMS.length})` : "Remplir mon wellness du matin"}
      </button>
    );
  }

  const { score, color, label } = readiness;
  const values = ITEMS.map((it) => {
    const v = Number((wellness as Record<string, unknown> | null)?.[it.key]);
    return { ...it, v: Number.isFinite(v) && v > 0 ? v : null };
  });
  const fraicheur = values.find((x) => x.key === "doms")?.v ?? null;
  // Écran 2 du wellness : zones de courbatures, douleur, malade ; envie (hors score).
  const zones = levelsList(wellness?.domsLevels);
  const envie = typeof wellness?.envie === "number" ? wellness.envie : null;
  const pain = typeof wellness?.pain === "number" && wellness.pain > 0 ? wellness.pain : null;
  const sick = wellness?.sick === true;
  const chip = (key: string, text: string, col: string) => (
    <span key={key} style={{ ...MONO, fontSize: 11, color: col, border: `1px solid ${col}66`, background: `${col}1A`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{text}</span>
  );

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${color}66`, background: `${color}1A`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" }}>
        <Ring score={score} color={color} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ ...DISPLAY, fontWeight: 500, fontSize: 14, color }}>{label}</span>
            <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{score} / 100</span>
          </div>
          {advice && <div style={{ fontSize: 13, color: C.tx2 }}>{advice}</div>}
        </div>
      </div>
      {light !== undefined && (
        <div style={{ padding: "0 14px 12px" }}>
          <WellnessLightBadge result={light} />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
          borderTop: `1px solid ${color}33`, padding: "10px 14px", color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {open ? "Masquer le détail" : "Voir le détail"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
          <path d={open ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"} />
        </svg>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", gap: 4 }} aria-hidden>
          {values.map((x) => (
            <span key={x.key} style={{ width: 6, height: 6, borderRadius: "50%", background: x.v == null ? C.brdL : itemColor(x.v) }} />
          ))}
        </span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>Muscles {fraicheur ?? "—"}/5</span>
      </button>
      {open && (
        <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {values.map((x) => (
            <div key={x.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 2px", borderRadius: 10, background: C.s1, border: `1px solid ${C.brd}` }}>
              <span style={{ ...MONO, fontSize: 16, color: x.v == null ? C.tx3 : itemColor(x.v) }}>{x.v ?? "—"}</span>
              <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx3 }}>{x.label}</span>
            </div>
          ))}
        </div>
        {(envie != null || pain != null || sick || zones.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {envie != null && chip("envie", `Envie ${envie}/5`, itemColor(envie))}
            {pain != null && chip("pain", `Douleur ${pain}/10`, pain >= 6 ? "#FF3B1F" : pain >= 3 ? "#FF9500" : "#FFC933")}
            {sick && chip("sick", "Malade", "#FF3B1F")}
            {zones.map((z) => chip(z.id, z.label, DOMS_LEVEL_COLOR[z.level]))}
          </div>
        )}
        {/* Planche Ath2Sante : la page Santé s'ouvre depuis le wellness. */}
        <Link to="/athlete/sante" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: C.ac, textDecoration: "none" }}>
          Santé de la nuit (montre)<span aria-hidden>›</span>
        </Link>
        </div>
      )}
    </div>
  );
}
