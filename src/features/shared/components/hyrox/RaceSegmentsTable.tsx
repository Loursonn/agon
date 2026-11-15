import { useState, type CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { ObjectiveState, RaceVsObjective } from "@/lib/hyrox/objective/vsObjective";
import { runCostAfter, shareAboveHr, type RaceWatchAnalysis, type SegmentWatch } from "@/lib/hyrox/raceWatch";
import { excessLevel, type RunLookup } from "@/lib/hyrox/runPacing";
import type { StationKey } from "@/features/shared/types/hyrox";
import { DASH, fmtClock } from "@/lib/seance";
import { STATION_PICTO, fmtDelta, objectiveColor, segColor } from "./raceAnalysisShared";

const pct = (x: number | null) => (x == null ? DASH : `${Math.round(x * 100)} %`);
const sign = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}`;

/** FC moyenne pondérée par la durée des segments mesurés. */
function weightedHr(segs: SegmentWatch[]): number | null {
  let n = 0;
  let w = 0;
  for (const s of segs) if (s.avgHr != null) { n += s.avgHr * s.officialS; w += s.officialS; }
  return w ? Math.round(n / w) : null;
}
const maxHr = (segs: SegmentWatch[]) => {
  const v = segs.map((s) => s.maxHr).filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};

/** Station juste avant un run (« après SkiErg »), ou « départ » pour le run 1. */
function afterLabel(a: RaceWatchAnalysis, s: SegmentWatch): string | null {
  if (s.kind !== "run") return null;
  const i = a.segments.indexOf(s);
  for (let j = i - 1; j >= 0; j--) if (a.segments[j].kind === "station") return `après ${a.segments[j].label}`;
  return "départ";
}

/** Couleur du coût d'une station : selon son surcoût vs l'habituel du niveau (orange ≥ 10 s/km, rouge ≥ 20). */
const costColor = (excess: number | null) => {
  const l = excessLevel(excess);
  return l === "bad" ? C.r : l === "warn" ? C.o : C.tx;
};

/**
 * Tableau des 17 segments : 16 runs et stations, la Roxzone (15 passages) et
 * le total. Objectif = cible de la course ; Écart = vs l'objectif (vert en
 * avance, gris dans l'objectif, orange en retard ou départ rapide), ou vs la
 * course précédente si le coach la choisit ; % Z3 = part au-dessus de SV2 ;
 * coût run suivant = allure du run qui suit la station − croisière (médiane
 * des runs 2 à 7), avec l'écart prévu par l'objectif entre parenthèses.
 */
export default function RaceSegmentsTable({
  analysis, objective, vs, levelP50 = null, stream, sv2, offset, totalS, title, defaultOpen = false,
  compare = null, timeSource = null, attribution = null,
}: {
  analysis: RaceWatchAnalysis;
  /** Cible de l'objectif par segment (colonne Objectif). */
  objective: (seg: string) => number | null;
  /** États contre l'objectif (couleur de l'écart). */
  vs: RaceVsObjective | null;
  levelP50?: RunLookup | null;
  stream: ActivityStream | null;
  sv2: number | null;
  offset: number;
  totalS: number;
  title: string;
  defaultOpen?: boolean;
  /** Coach : autre référence de la colonne Écart (course précédente). */
  compare?: { label: string; target: (seg: string) => number | null } | null;
  timeSource?: string | null;
  attribution?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = analysis.segments.filter((s) => s.kind !== "roxzone");
  const rox = analysis.segments.filter((s) => s.kind === "roxzone");
  const cost = runCostAfter(analysis, levelP50);
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const cads = runs.map((r) => r.avgCadence).filter((x): x is number => x != null);
  const z3 = (keep: (s: SegmentWatch) => boolean) => shareAboveHr(analysis, stream, sv2, offset, keep);
  const target = compare?.target ?? objective;
  const stateOf = (key: string): ObjectiveState | null =>
    key === "total" ? vs?.total.state ?? null : vs?.segments.find((x) => x.key === key)?.state ?? null;
  const th: CSSProperties = { ...LABEL, fontSize: 10, textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" };
  const group: CSSProperties = { ...th, fontSize: 9.5, color: C.tx3, textAlign: "center", borderBottom: `1px solid ${C.brd}` };
  const td: CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", padding: "7px 8px", borderTop: `1px solid ${C.brd}`, whiteSpace: "nowrap" };
  const left: CSSProperties = { ...td, fontFamily: "inherit", textAlign: "left" };
  const deltaCell = (key: string, d: number | null) => {
    const st = compare ? null : stateOf(key);
    const color = d == null ? C.tx3 : st ? (st === "on" ? C.tx2 : objectiveColor(st)) : Math.round(d) === 0 ? C.tx3 : d > 0 ? C.r : C.g;
    return <td style={{ ...td, color }} title={st === "fast_start" ? "Départ rapide" : undefined}>{fmtDelta(d, fmtClock)}</td>;
  };
  const roxS = rox.reduce((n, s) => n + s.officialS, 0);
  const gap = (v: number, t: number | null) => (t != null ? v - t : null);
  const rowStyle = (key: string): CSSProperties => (hovered === key ? { background: alpha(C.ac, 0.07), boxShadow: `inset 3px 0 0 ${C.ac}` } : {});
  const watchName = attribution ? attribution.toUpperCase() : "MONTRE";
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...buttonStyle(), width: "100%", justifyContent: "space-between" }}>
        <span style={{ ...KICKER, color: C.tx }}>{title}</span><span style={{ color: C.tx3 }}>{open ? "Replier" : "Déplier"}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
            <thead>
              <tr>
                <th colSpan={2} />
                <th colSpan={3} style={group}>Course · {timeSource ?? "temps"}</th>
                <th colSpan={3} style={group}>Montre · {watchName}</th>
                <th colSpan={2} style={group}>Calcul Agon</th>
              </tr>
              <tr>
                <th style={th}>N°</th><th style={{ ...th, textAlign: "left" }}>Segment</th><th style={th}>Temps</th><th style={th}>Objectif</th>
                <th style={th}>Écart{compare ? ` · ${compare.label.toLowerCase()}` : ""}</th>
                <th style={th}>FC moy.</th><th style={th}>FC max</th>
                <th style={th}>% Z3</th><th style={th}>Cadence</th><th style={th}>Coût run suiv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const c = s.kind === "station" ? cost[s.key as StationKey] : undefined;
                const after = afterLabel(analysis, s);
                return (
                  <tr key={s.key} style={rowStyle(s.key)} onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}>
                    <td style={{ ...td, color: C.tx3 }}>{i + 1}</td>
                    <td style={left}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <HyroxPicto station={s.kind === "run" ? "course" : STATION_PICTO[s.key] ?? "autre"} size={14} color={segColor(s)} />{s.label}
                        {after && <span style={{ fontSize: 11, color: C.tx3 }}>{after}</span>}
                      </span>
                    </td>
                    <td style={td}>{fmtClock(s.officialS)}</td>
                    <td style={{ ...td, color: C.tx3 }}>{fmtClock(objective(s.key))}</td>
                    {deltaCell(s.key, gap(s.officialS, target(s.key)))}
                    <td style={td}>{s.avgHr ?? DASH}</td>
                    <td style={td}>{s.maxHr ?? DASH}</td>
                    <td style={td}>{pct(z3((x) => x.key === s.key))}</td>
                    <td style={td}>{s.kind === "run" ? s.avgCadence ?? DASH : DASH}</td>
                    <td style={{ ...td, color: c ? costColor(c.excessS) : C.tx }} title={c?.special ? "Run 8 : arrivée et parcours parfois différents" : undefined}>
                      {c ? <>{sign(c.costS)} s/km{c.usualS != null && <span style={{ color: C.tx3, fontSize: 11 }}> (hab. {sign(c.usualS)})</span>}{c.special && <span style={{ color: C.tx3 }}> *</span>}</> : DASH}
                    </td>
                  </tr>
                );
              })}
              <tr style={rowStyle("rox")} onMouseEnter={() => setHovered("rox")} onMouseLeave={() => setHovered(null)}>
                <td style={{ ...td, color: C.tx3 }}>{rows.length + 1}</td>
                <td style={left}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <HyroxPicto station="roxzone" size={14} color={C.tx3} />Roxzone
                    <span style={{ fontSize: 11, color: C.tx3 }}>{rox.length} passages{analysis.roxzoneEstimated ? " (répartis)" : ""}</span>
                  </span>
                </td>
                <td style={td}>{fmtClock(roxS)}</td>
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(objective("roxzone_total"))}</td>
                {deltaCell("roxzone_total", gap(roxS, target("roxzone_total")))}
                <td style={td}>{weightedHr(rox) ?? DASH}</td>
                <td style={td}>{maxHr(rox) ?? DASH}</td>
                <td style={td}>{pct(z3((x) => x.kind === "roxzone"))}</td>
                <td style={td}>{DASH}</td>
                <td style={td}>{DASH}</td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td style={td} />
                <td style={left}>Total</td>
                <td style={td}>{fmtClock(totalS)}</td>
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(objective("total"))}</td>
                {deltaCell("total", gap(totalS, target("total")))}
                <td style={td}>{weightedHr(analysis.segments) ?? DASH}</td>
                <td style={td}>{analysis.raceMaxHr ?? DASH}</td>
                <td style={td}>{pct(z3(() => true))}</td>
                <td style={td}>{cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : DASH}</td>
                <td style={td}>{DASH}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

