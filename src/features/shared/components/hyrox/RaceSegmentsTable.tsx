import { useState, type CSSProperties } from "react";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";
import { percentile } from "@/lib/hyrox/calc";
import { runCostAfter, shareAboveHr, type RaceWatchAnalysis, type SegmentWatch } from "@/lib/hyrox/raceWatch";
import { DASH, fmtClock } from "@/lib/seance";
import { STATION_PICTO, fmtDelta, segColor } from "./raceAnalysisShared";

const pct = (x: number | null) => (x == null ? DASH : `${Math.round(x * 100)} %`);
const top = (p: number | null) => (p == null ? DASH : `top ${p} %`);

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

/**
 * Tableau des 17 segments : 16 runs et stations, la Roxzone (15 passages) et
 * le total. Position = top % du niveau ; % Z3 = part au-dessus de SV2 ;
 * coût run suivant = allure du run qui suit la station − allure du run 1.
 */
export default function RaceSegmentsTable({ analysis, refOf, stream, sv2, offset, totalS, totalRef, compromisedAvg, title, defaultOpen = false }: {
  analysis: RaceWatchAnalysis;
  refOf: (seg: string) => HyroxReferenceSegment | null;
  stream: ActivityStream | null;
  sv2: number | null;
  offset: number;
  totalS: number;
  totalRef: HyroxReferenceSegment | null;
  compromisedAvg: number | null;
  title: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = analysis.segments.filter((s) => s.kind !== "roxzone");
  const rox = analysis.segments.filter((s) => s.kind === "roxzone");
  const cost = runCostAfter(analysis);
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const cads = runs.map((r) => r.avgCadence).filter((x): x is number => x != null);
  const z3 = (keep: (s: SegmentWatch) => boolean) => shareAboveHr(analysis, stream, sv2, offset, keep);
  const th: CSSProperties = { ...LABEL, fontSize: 10, textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" };
  const td: CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", padding: "7px 8px", borderTop: `1px solid ${C.brd}`, whiteSpace: "nowrap" };
  const left: CSSProperties = { ...td, fontFamily: "inherit", textAlign: "left" };
  const deltaCell = (d: number | null) => (
    <td style={{ ...td, color: d == null || Math.round(d) === 0 ? C.tx3 : d > 0 ? C.o : C.g }}>{fmtDelta(d, fmtClock)}</td>
  );
  const roxS = rox.reduce((n, s) => n + s.officialS, 0);
  const roxRef = refOf("roxzone_total");
  const totalMed = totalRef?.p50_s ?? null;
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...buttonStyle(), width: "100%", justifyContent: "space-between" }}>
        <span style={{ ...KICKER, color: C.tx }}>{title}</span><span style={{ color: C.tx3 }}>{open ? "Replier" : "Déplier"}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
            <thead><tr>
              <th style={th}>N°</th><th style={{ ...th, textAlign: "left" }}>Segment</th><th style={th}>Temps</th><th style={th}>Écart</th>
              <th style={th}>Médiane</th><th style={th}>Position</th><th style={th}>FC moy.</th><th style={th}>FC max</th>
              <th style={th}>% Z3</th><th style={th}>Cadence</th><th style={th}>Coût run suiv.</th>
            </tr></thead>
            <tbody>
              {rows.map((s, i) => {
                const ref = refOf(s.key);
                const m = ref?.p50_s ?? null;
                const c = cost[s.key];
                return (
                  <tr key={s.key}>
                    <td style={{ ...td, color: C.tx3 }}>{i + 1}</td>
                    <td style={left}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <HyroxPicto station={s.kind === "run" ? "course" : STATION_PICTO[s.key] ?? "autre"} size={14} color={segColor(s)} />{s.label}
                      </span>
                    </td>
                    <td style={td}>{fmtClock(s.officialS)}</td>
                    {deltaCell(m != null ? s.officialS - m : null)}
                    <td style={{ ...td, color: C.tx3 }}>{fmtClock(m)}</td>
                    <td style={td}>{top(ref ? percentile(s.officialS, ref) : null)}</td>
                    <td style={td}>{s.avgHr ?? DASH}</td>
                    <td style={td}>{s.maxHr ?? DASH}</td>
                    <td style={td}>{pct(z3((x) => x.key === s.key))}</td>
                    <td style={td}>{s.avgCadence ?? DASH}</td>
                    <td style={{ ...td, color: c != null && c > 0 ? C.o : C.tx }}>{c != null ? `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.abs(c)} s/km` : DASH}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, color: C.tx3 }}>{rows.length + 1}</td>
                <td style={left}>Roxzone · {rox.length} passages{analysis.roxzoneEstimated ? " (répartis)" : ""}</td>
                <td style={td}>{fmtClock(roxS)}</td>
                {deltaCell(roxRef ? roxS - roxRef.p50_s : null)}
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(roxRef?.p50_s ?? null)}</td>
                <td style={td}>{top(roxRef ? percentile(roxS, roxRef) : null)}</td>
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
                {deltaCell(totalMed != null ? totalS - totalMed : null)}
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(totalMed)}</td>
                <td style={td}>{top(totalRef ? percentile(totalS, totalRef) : null)}</td>
                <td style={td}>{weightedHr(analysis.segments) ?? DASH}</td>
                <td style={td}>{analysis.raceMaxHr ?? DASH}</td>
                <td style={td}>{pct(z3(() => true))}</td>
                <td style={td}>{cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : DASH}</td>
                <td style={td}>{compromisedAvg != null ? `${compromisedAvg > 0 ? "+" : compromisedAvg < 0 ? "−" : ""}${Math.abs(compromisedAvg)} s/km` : DASH}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
