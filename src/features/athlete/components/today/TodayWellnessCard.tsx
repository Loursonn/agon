import { useState } from "react";
import { Link } from "react-router-dom";
import { C, token } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { ReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import type { WellnessData } from "@/features/shared/types/athlete";
import { DOMS_LEVEL_COLOR, PAIN_COLORS, levelsList } from "@/lib/bodyZones";
import { painList } from "@/lib/painZones";
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

/** Échelle 1 → 5 du formulaire wellness : rouge → vert (4 = vert-jaune de la charte, distinct du vert du 5). */
const SCALE5 = [C.rouge, C.blocCore, C.o, token("--agon-zone5-2"), C.g];
const itemColor = (v: number): string => SCALE5[Math.min(5, Math.max(1, Math.round(v))) - 1];

function Ring({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden className="flex-none">
      <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(231,211,168,0.12)" strokeWidth={6} />
      <circle
        cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${(circ * score) / 100} ${circ}`} transform="rotate(-90 32 32)"
      />
      <text x={32} y={37.5} textAnchor="middle" fill={C.tx} className="agon-mono text-[16px]">{score}</text>
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
        className={cn(
          "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-none bg-agon-accent font-[inherit] text-[15px] font-semibold text-agon-ink",
          onLog ? "cursor-pointer" : "cursor-default",
        )}
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
  // Carte douleur : une pastille par zone (ancienne saisie : la note seule).
  const painZones = painList(wellness?.painLevels).filter((z) => z.level != null && z.level > 0);
  const chip = (key: string, text: string, col: string) => (
    <span key={key} className="agon-mono whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[11px]" style={{ color: col, borderColor: `${col}66`, background: `${col}1A` }}>{text}</span>
  );

  return (
    <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: `${color}66`, background: `${color}1A` }}>
      <div className="flex items-center gap-3.5 px-3.5 py-3">
        <Ring score={score} color={color} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
            <span className="agon-display text-[14px] font-medium" style={{ color }}>{label}</span>
            <span className="agon-mono text-[11px] text-agon-tx3">{score} / 100</span>
          </div>
          {advice && <div className="text-[13px] text-agon-tx2">{advice}</div>}
        </div>
      </div>
      {light !== undefined && (
        <div className="px-3.5 pb-3">
          <WellnessLightBadge result={light} />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 border-t bg-transparent px-3.5 py-2.5 font-[inherit] text-[13px] text-agon-accent"
        style={{ borderTopColor: `${color}33` }}
      >
        {open ? "Masquer le détail" : "Voir le détail"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
          <path d={open ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"} />
        </svg>
        <span className="flex-1" />
        <span className="flex gap-1" aria-hidden>
          {values.map((x) => (
            <span key={x.key} className={cn("size-1.5 rounded-full", x.v == null && "bg-agon-brd-l")} style={x.v == null ? undefined : { background: itemColor(x.v) }} />
          ))}
        </span>
        <span className="agon-mono text-[11px] text-agon-tx3">Muscles {fraicheur ?? "—"}/5</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-1">
        <div className="grid grid-cols-[repeat(5,1fr)] gap-1.5">
          {values.map((x) => (
            <div key={x.key} className="flex flex-col items-center gap-1 rounded-[10px] border border-agon-brd bg-agon-s1 px-0.5 py-2">
              <span className={cn("agon-mono text-[16px]", x.v == null && "text-agon-tx3")} style={x.v == null ? undefined : { color: itemColor(x.v) }}>{x.v ?? "—"}</span>
              <span className="agon-mono text-[10px] uppercase tracking-[0.06em] text-agon-tx3">{x.label}</span>
            </div>
          ))}
        </div>
        {(envie != null || pain != null || sick || zones.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {envie != null && chip("envie", `Envie ${envie}/5`, itemColor(envie))}
            {painZones.map((z) => chip("pain-" + z.id, `${z.label} ${z.level}/10`, PAIN_COLORS[z.level!]))}
            {pain != null && painZones.length === 0 && chip("pain", `Douleur ${pain}/10`, pain >= 6 ? C.rouge : pain >= 3 ? C.o : C.ac)}
            {sick && chip("sick", "Malade", C.rouge)}
            {zones.map((z) => chip(z.id, z.label, DOMS_LEVEL_COLOR[z.level]))}
          </div>
        )}
        {/* Planche Ath2Sante : la page Santé s'ouvre depuis le wellness. */}
        <Link to="/athlete/sante" className="flex items-center justify-between text-[12.5px] text-agon-accent no-underline">
          Santé de la nuit (montre)<span aria-hidden>›</span>
        </Link>
        </div>
      )}
    </div>
  );
}
