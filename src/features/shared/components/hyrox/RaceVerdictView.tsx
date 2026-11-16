import type { CSSProperties, ReactNode } from "react";
import { Share2 } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { CARD, DISPLAY, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { fmtClock } from "@/lib/seance";
import type { RaceVerdict, VerdictAxis } from "@/lib/hyrox/verdict";
import { fmtGap } from "./raceAnalysisShared";

/**
 * Verdict en tête de l'analyse de course (lot 6, maquette validée par Hugo le
 * 16/11/2026) : Niveau, Profil, Marge. Ordinateur : trois colonnes ; téléphone :
 * empilé, bouton « Partager ma course » en bas. Tous les chiffres viennent de
 * `raceVerdict` (aucune IA).
 */

const BOX: CSSProperties = { ...CARD, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };
const NOTE: CSSProperties = { fontSize: 11.5, color: C.tx3, lineHeight: 1.5 };
const FILET = `1px solid ${C.brd}`;

function Kicker({ lead, children }: { lead: string; children: ReactNode }) {
  return <span style={{ ...KICKER, color: C.tx3 }}><span style={{ color: C.ac }}>{lead} —</span> {children}</span>;
}

function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ ...KICKER, fontSize: 10.5, color: C.tx3 }}>{label}</span>
      {children}
    </div>
  );
}

function PercentBar({ pct }: { pct: number }) {
  return (
    <div aria-hidden style={{ position: "relative", height: 30 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 8, borderRadius: 4, background: C.s2 }} />
      <div style={{ position: "absolute", left: 0, width: `${pct}%`, top: 8, height: 8, borderRadius: 4, background: C.ac }} />
      <div style={{ position: "absolute", left: `${pct}%`, top: 0, width: 2, height: 24, marginLeft: -1, background: C.tx }} />
      <span style={{ ...MONO, position: "absolute", left: 0, top: 20, fontSize: 10.5, color: C.tx3 }}>1 %</span>
      <span style={{ ...MONO, position: "absolute", left: "50%", top: 20, fontSize: 10.5, color: C.tx3, transform: "translateX(-50%)" }}>médiane</span>
      <span style={{ ...MONO, position: "absolute", right: 0, top: 20, fontSize: 10.5, color: C.tx3 }}>100 %</span>
    </div>
  );
}

function AxisList({ title, color, axes }: { title: string; color: string; axes: VerdictAxis[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      <span style={{ ...KICKER, color }}>{title}</span>
      {axes.map((a) => (
        <span key={a.key} style={{ fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
          <span style={{ ...MONO, color, flex: "none", whiteSpace: "nowrap" }}>{a.topPct} %</span>
        </span>
      ))}
    </div>
  );
}

export default function RaceVerdictView({ verdict, totalS, phone, onShare }: {
  verdict: RaceVerdict;
  totalS: number;
  phone: boolean;
  /** Athlète seulement (Q3 du lot 6 : le coach ne génère pas la carte). */
  onShare?: () => void;
}) {
  const { level, place, objective, profile, margin } = verdict;
  if (!level && !objective && !margin) return null;
  const objectiveLine = objective && (
    <Small label="Objectif du jour">
      <span style={{ ...MONO, fontSize: 15 }}>{fmtClock(objective.targetS)}</span>
      <span style={{ fontSize: 12, color: objective.deltaS <= 0 ? C.g : C.o }}>
        {objective.deltaS === 0 ? "pile dans l'objectif" : objective.deltaS < 0 ? `battu de ${fmtGap(objective.deltaS)}` : `manqué de ${fmtGap(objective.deltaS)}`}
      </span>
    </Small>
  );

  const levelBox = (
    <section aria-label="Ton niveau" style={BOX}>
      <Kicker lead="Verdict">Ton niveau</Kicker>
      {level ? <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...DISPLAY, fontWeight: 600, fontSize: phone ? 46 : 44, lineHeight: 0.95, color: C.ac, whiteSpace: "nowrap" }}>TOP {level.topPct} %</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 9px", borderRadius: 999, border: `1px solid ${alpha(C.ac, 0.45)}`, background: alpha(C.ac, 0.1), color: C.ac, fontSize: 12, fontWeight: 500 }}>{level.tierLabel}</span>
        </div>
        <span style={{ fontSize: 15 }}>des {level.categoryLabel}, avec <span style={MONO}>{fmtClock(totalS)}</span></span>
        <PercentBar pct={level.topPct} />
      </> : (
        <span style={{ fontSize: 13.5, color: C.tx2, lineHeight: 1.5 }}>
          Pas de classement pour cette course (simulation, ou catégorie sans référence) : le verdict ne parle que de l'objectif.
        </span>
      )}
      {(place || objective) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, paddingTop: 12, borderTop: FILET }}>
          {place && <Small label="Place"><span style={{ ...MONO, fontSize: 15 }}>{place.rank}ᵉ <span style={{ color: C.tx3 }}>/ {place.of}</span></span></Small>}
          {objectiveLine}
        </div>
      )}
      {level && <span style={NOTE}>Sur {level.sampleSize != null ? `${level.sampleSize.toLocaleString("fr-FR")} courses ` : ""}{level.categoryLabel}{level.source ? `, ${level.source}` : ""}. Arrondi vers le haut.</span>}
    </section>
  );

  const profileBox = profile && (
    <section aria-label="Ton profil" style={BOX}>
      <Kicker lead="Profil">Ce qui te porte, ce qui te freine</Kicker>
      {profile.sentence && <span style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.35 }}>{profile.sentence}</span>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        <AxisList title="Points forts" color={C.g} axes={profile.strengths} />
        <AxisList title={profile.brakes.length > 1 ? "Freins" : "Frein"} color={C.o} axes={profile.brakes} />
      </div>
      <span style={NOTE}>Chiffre = ton rang « top X % » sur la station, dans toute la catégorie.</span>
    </section>
  );

  const marginBox = margin && (
    <section aria-label="Ta marge" style={BOX}>
      <Kicker lead="Marge">Encore dans les jambes</Kicker>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 36, lineHeight: 1 }}>{fmtClock(margin.possibleS)}</span>
        <span style={{ fontSize: 13, color: C.tx2 }}>possible · −{fmtGap(margin.gainS)}</span>
      </div>
      <div>
        {margin.levers.slice(0, 3).map((l) => (
          <div key={l.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, padding: "9px 0", borderTop: FILET, fontSize: 14 }}>
            <span>{l.label}</span><span style={MONO}>−{fmtGap(l.gainS)}</span>
          </div>
        ))}
      </div>
      <span style={NOTE}>Somme des leviers de cette course, pas une prédiction. Le détail est dans « Stratégie ».</span>
    </section>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={phone
        ? { display: "flex", flexDirection: "column", gap: 12 }
        : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, alignItems: "stretch" }}>
        {levelBox}
        {profileBox}
        {marginBox}
      </div>
      {phone && onShare && (
        <button type="button" onClick={onShare} style={{ ...buttonStyle("primary"), height: 48, borderRadius: 12, fontSize: 15 }}>
          <Share2 size={16} /> Partager ma course
        </button>
      )}
    </div>
  );
}
