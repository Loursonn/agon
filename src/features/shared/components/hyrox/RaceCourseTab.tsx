import { useState } from "react";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { hyroxPictoColor } from "@/features/shared/components/hyroxStation";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";
import {
  compromisedRunning, roxzoneRecovery, timeAboveHr, type Finding, type RaceWatchAnalysis,
} from "@/lib/hyrox/raceWatch";
import { fmtClock, zoneColor } from "@/lib/seance";
import { FRISE_CADENCE_COLOR, FRISE_PACE_COLOR, type RaceAudience } from "./raceAnalysisShared";
import { Sources } from "./raceAnalysisUi";
import RaceFrise from "./RaceFrise";
import RaceSegmentDetail from "./RaceSegmentDetail";
import RaceSegmentsTable from "./RaceSegmentsTable";
import RaceWatchCards from "./RaceWatchCards";

/**
 * Onglet « Course » : frise, constats, ce que dit la montre, tableau des
 * segments. Athlète (HyroxAnaTel) : « Le film de ta course » puis 3 constats.
 * Coach (HyroxAnaCoachOrdi) : frise avec allure et cadence au survol, puis
 * « Ce que dit la montre » (5 cartes) et le tableau déplié.
 */
export default function RaceCourseTab(props: {
  audience: RaceAudience;
  analysis: RaceWatchAnalysis;
  stream: ActivityStream | null;
  watchLoading: boolean;
  offset: number;
  sv1: number | null;
  sv2: number | null;
  attribution: string | null;
  findings: Finding[];
  above: ReturnType<typeof timeAboveHr>;
  recov: ReturnType<typeof roxzoneRecovery>;
  previous: { name: string; compromised: ReturnType<typeof compromisedRunning> } | null;
  refOf: (seg: string) => HyroxReferenceSegment | null;
  totalS: number;
  totalRef: HyroxReferenceSegment | null;
  timeSource: string;
  division: string;
  bracketText: string;
}) {
  const { audience, analysis, stream, offset, sv1, sv2, attribution } = props;
  const coach = audience === "coach";
  const [selected, setSelected] = useState<string | null>(null);
  const sel = analysis.segments.find((s) => s.key === selected) ?? null;
  const nSeg = analysis.segments.filter((s) => s.kind !== "roxzone").length + 1;
  const hasCadence = !!stream?.cadence?.some((v) => v != null && v > 0);
  const compromised = compromisedRunning(analysis);

  return (
    <>
      {!coach && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: -4 }}>
          <span style={{ ...KICKER, color: C.tx2 }}><span style={{ color: C.ac }}>01 —</span> Le film de ta course</span>
          {attribution && <span style={{ ...LABEL, fontSize: 10.5 }}>{attribution}</span>}
        </div>
      )}
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {coach && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={KICKER}>
            {`01 — Frise de course · ${nSeg} segments à l'échelle du temps`}
            <span style={{ color: C.tx3, textTransform: "none", letterSpacing: 0 }}> · survoler un segment pour le détail</span>
          </span>
          {attribution && <span style={{ ...LABEL, fontSize: 10 }}>{attribution}{sv2 != null ? ` · SV2 ${sv2}${sv1 != null ? ` · SV1 ${sv1}` : ""}` : ""}</span>}
        </div>}
        {!coach && stream && sv2 != null && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={LABEL}>FC</span>
            <span style={{ ...LABEL, fontSize: 10 }}>SV2 {sv2}{sv1 != null ? ` · SV1 ${sv1}` : ""}</span>
          </div>
        )}
        <RaceFrise analysis={analysis} hr={stream ? { t: stream.t, v: stream.hr ?? [] } : null}
          cadence={coach && stream?.cadence ? { t: stream.t, v: stream.cadence } : null}
          offset={offset} sv1={sv1} sv2={sv2} selected={selected} onSelect={(k) => setSelected(k || null)} curves={coach} hover={coach} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.tx3 }}>
          <span><span style={{ color: hyroxPictoColor("course") }}>■</span> Run{coach ? " 1 km" : ""}</span>
          <span><span style={{ color: hyroxPictoColor("skierg") }}>■</span> Station</span>
          <span><span style={{ color: C.brdL }}>■</span> Roxzone{analysis.roxzoneEstimated ? " (répartie)" : ""}</span>
          {stream && [1, 2, 3].map((z) => <span key={z}><span style={{ color: zoneColor(z) }}>■</span> Z{z}</span>)}
          {coach && <span><span style={{ color: FRISE_PACE_COLOR }}>━</span> Allure (plus bas = plus lent)</span>}
          {coach && hasCadence && <span><span style={{ color: FRISE_CADENCE_COLOR }}>━</span> Cadence</span>}
        </div>
        {sel
          ? <RaceSegmentDetail s={sel} fresh={analysis.freshPaceSPerKm} medianS={sel.kind === "roxzone" ? null : props.refOf(sel.key)?.p50_s ?? null} coach={coach} />
          : <div style={{ fontSize: 12, color: C.tx3 }}>{coach ? "Survole ou touche un segment pour voir son détail." : "Touche un segment pour voir son détail."}</div>}
        {!stream && !props.watchLoading && (
          <div style={{ fontSize: 12, color: C.tx2 }}>Aucune activité de montre ce jour-là : seuls les temps sont analysés. FC et cadence apparaîtront si la course est importée ou synchronisée.</div>
        )}
        {stream && offset > 0 && (
          <div style={{ fontSize: 11, color: C.tx3 }}>Départ placé à {fmtClock(offset)} de l'enregistrement (échauffement avant le départ).</div>
        )}
      </div>

      {!coach && props.findings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={KICKER}>02 — {props.findings.length} constat{props.findings.length > 1 ? "s" : ""}</span>
          {props.findings.map((f, i) => (
            <div key={i} style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 14, alignItems: "baseline" }}>
              <span style={{ ...MONO, fontSize: 26, color: C.ac, minWidth: 70 }}>{f.value}<span style={{ fontSize: 11, color: C.tx3 }}> {f.unit}</span></span>
              <span style={{ fontSize: 13, color: C.tx2, lineHeight: 1.45 }}>{f.text}</span>
            </div>
          ))}
        </div>
      )}

      {stream && (
        <RaceWatchCards title={coach ? "02 — Ce que dit la montre" : "Ce que dit la montre"} analysis={analysis}
          above={props.above} recov={props.recov} sv2={sv2} previous={props.previous} />
      )}

      <RaceSegmentsTable analysis={analysis} refOf={props.refOf} stream={stream} sv2={sv2} offset={offset}
        totalS={props.totalS} totalRef={props.totalRef} compromisedAvg={compromised?.avgSPerKm ?? null}
        title={coach ? `${stream ? "03" : "02"} — Les ${nSeg} segments` : "Les segments un par un"} defaultOpen={coach} />
      <Sources>
        temps : {props.timeSource}{attribution ? ` · FC, cadence : ${attribution}` : ""} · médianes : références HYROX ({props.division} {props.bracketText}) · constats calculés par Agon, sans IA · mesure absente : « — »
      </Sources>
    </>
  );
}
