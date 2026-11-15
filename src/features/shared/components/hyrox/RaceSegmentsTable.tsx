import { useState, type CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";
import { percentile } from "@/lib/hyrox/calc";
import { runCostAfter, shareAboveHr, type RaceWatchAnalysis, type SegmentWatch } from "@/lib/hyrox/raceWatch";
import { excessLevel, type RunLookup } from "@/lib/hyrox/runPacing";
import type { StationKey } from "@/features/shared/types/hyrox";
import { DASH, fmtClock } from "@/lib/seance";
import { STATION_PICTO, fmtDelta, segColor } from "./raceAnalysisShared";

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

/** Jauge de position (0 = meilleur, à gauche) et « top x % », rouge au-delà de 75. */
function Position({ p }: { p: number | null }) {
  if (p == null) return <>{DASH}</>;
  const bad = p >= 75;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ position: "relative", width: 34, height: 4, borderRadius: 2, background: C.s2, display: "inline-block" }}>
        <span style={{ position: "absolute", left: `${Math.min(100, Math.max(0, p))}%`, top: -3, width: 3, height: 10, marginLeft: -1.5, borderRadius: 1, background: bad ? C.r : C.tx2 }} />
      </span>
      <span style={{ color: bad ? C.r : C.tx }}>top {p} %</span>
    </span>
  );
}

/**
 * Tableau des 17 segments : 16 runs et stations, la Roxzone (15 passages) et
 * le total. Plan = objectif du plan de course ; Écart = vs la référence
 * « Comparer à » (médiane sans choix) ; Position = top % de toute la
 * catégorie ; % Z3 = part au-dessus de SV2 ; coût run suivant = allure du run
 * qui suit la station − croisière (médiane des runs 2 à 7), avec l'habituel
 * du niveau entre parenthèses.
 */
export default function RaceSegmentsTable({
  analysis, refOf, posOf, levelP50 = null, stream, sv2, offset, totalS, totalRef, title, defaultOpen = false,
  compare = null, timeSource = null, attribution = null,
}: {
  analysis: RaceWatchAnalysis;
  /** Médiane du niveau (colonne Médiane). */
  refOf: (seg: string) => HyroxReferenceSegment | null;
  /** Références de position : toute la catégorie. */
  posOf: (seg: string) => HyroxReferenceSegment | null;
  levelP50?: RunLookup | null;
  stream: ActivityStream | null;
  sv2: number | null;
  offset: number;
  totalS: number;
  totalRef: HyroxReferenceSegment | null;
  title: string;
  defaultOpen?: boolean;
  /** Référence de la colonne Écart et objectifs du plan (coach). */
  compare?: { label: string; target: (seg: string) => number | null; plan: ((seg: string) => number | null) | null } | null;
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
  const target = compare?.target ?? ((seg: string) => refOf(seg)?.p50_s ?? null);
  const plan = compare?.plan ?? null;
  const th: CSSProperties = { ...LABEL, fontSize: 10, textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" };
  const group: CSSProperties = { ...th, fontSize: 9.5, color: C.tx3, textAlign: "center", borderBottom: `1px solid ${C.brd}` };
  const td: CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", padding: "7px 8px", borderTop: `1px solid ${C.brd}`, whiteSpace: "nowrap" };
  const left: CSSProperties = { ...td, fontFamily: "inherit", textAlign: "left" };
  const deltaCell = (d: number | null) => (
    <td style={{ ...td, color: d == null || Math.round(d) === 0 ? C.tx3 : d > 0 ? C.r : C.g }}>{fmtDelta(d, fmtClock)}</td>
  );
  const roxS = rox.reduce((n, s) => n + s.officialS, 0);
  const roxRef = refOf("roxzone_total");
  const roxPos = posOf("roxzone_total");
  const totalMed = totalRef?.p50_s ?? null;
  const vs = (v: number, t: number | null) => (t != null ? v - t : null);
  const rowStyle = (key: string): CSSProperties => (hovered === key ? { background: alpha(C.ac, 0.07), boxShadow: `inset 3px 0 0 ${C.ac}` } : {});
  const watchName = attribution ? attribution.toUpperCase() : "MONTRE";
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...buttonStyle(), width: "100%", justifyContent: "space-between" }}>
        <span style={{ ...KICKER, color: C.tx }}>{title}</span><span style={{ color: C.tx3 }}>{open ? "Replier" : "Déplier"}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
            <thead>
              <tr>
                <th colSpan={2} />
                <th colSpan={3} style={group}>Course · {timeSource ?? "temps"}</th>
                <th colSpan={2} style={group}>Référence · calcul Agon</th>
                <th colSpan={3} style={group}>Montre · {watchName}</th>
                <th colSpan={2} style={group}>Calcul Agon</th>
              </tr>
              <tr>
                <th style={th}>N°</th><th style={{ ...th, textAlign: "left" }}>Segment</th><th style={th}>Temps</th><th style={th}>Plan</th>
                <th style={th}>Écart{compare ? ` · ${compare.label.toLowerCase()}` : ""}</th>
                <th style={th}>Médiane</th><th style={th}>Position</th><th style={th}>FC moy.</th><th style={th}>FC max</th>
                <th style={th}>% Z3</th><th style={th}>Cadence</th><th style={th}>Coût run suiv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const m = refOf(s.key)?.p50_s ?? null;
                const pos = posOf(s.key);
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
                    <td style={{ ...td, color: C.tx3 }}>{fmtClock(plan?.(s.key) ?? null)}</td>
                    {deltaCell(vs(s.officialS, target(s.key)))}
                    <td style={{ ...td, color: C.tx3 }}>{fmtClock(m)}</td>
                    <td style={td}><Position p={pos ? percentile(s.officialS, pos) : null} /></td>
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
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(plan?.("roxzone_total") ?? null)}</td>
                {deltaCell(vs(roxS, target("roxzone_total")))}
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(roxRef?.p50_s ?? null)}</td>
                <td style={td}><Position p={roxPos ? percentile(roxS, roxPos) : null} /></td>
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
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(plan?.("total") ?? null)}</td>
                {deltaCell(vs(totalS, target("total")))}
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(totalMed)}</td>
                <td style={td}><Position p={totalRef ? percentile(totalS, totalRef) : null} /></td>
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

