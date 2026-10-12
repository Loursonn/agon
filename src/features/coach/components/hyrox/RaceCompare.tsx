import { useMemo } from "react";
import { C } from "@/lib/theme";
import { ArrowLeft } from "lucide-react";
import { formatMmSs, formatDelta } from "@/lib/time";
import { cumulative, runTotal, stationsTotal, roxzoneTotal, shares, radarAxes, type RefLookup } from "@/lib/hyrox/calc";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { SEGMENT_LABEL } from "@/features/shared/types/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import HyroxRadar from "./HyroxRadar";

interface Props {
  raceA: HyroxResult;
  raceB: HyroxResult;
  onBack: () => void;
}

export default function RaceCompare({ raceA, raceB, onBack }: Props) {
  const { data: refs = [] } = useHyroxReferences();
  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  const cumA = cumulative(raceA);
  const cumB = cumulative(raceB);

  const axesA = radarAxes(raceA, refLookup);
  const axesB = radarAxes(raceB, refLookup);

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginBottom: 12, padding: 0 }}>
        <ArrowLeft size={14} /> Retour
      </button>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 16 }}>Comparaison</div>

      {/* Headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <RaceHeader r={raceA} />
        <RaceHeader r={raceB} />
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <TotalPill label="Course" a={runTotal(raceA)} b={runTotal(raceB)} color={C.b} />
        <TotalPill label="Stations" a={stationsTotal(raceA)} b={stationsTotal(raceB)} color={C.ac} />
        <TotalPill label="Roxzone" a={roxzoneTotal(raceA)} b={roxzoneTotal(raceB)} color={C.tx3} />
      </div>

      {/* Segment table */}
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10 }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Segment</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Course A</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Course B</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {cumA.map((segA, i) => {
              const segB = cumB[i];
              const delta = segA.split != null && segB?.split != null ? segA.split - segB.split : null;
              return (
                <tr key={segA.key} style={{ borderBottom: "1px solid " + C.brd }}>
                  <td style={{ padding: "6px 8px", color: C.tx2, fontWeight: 600 }}>{SEGMENT_LABEL[segA.key] ?? segA.key}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(segA.split)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(segB?.split ?? null)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: delta != null ? (delta < 0 ? C.g : delta > 0 ? C.r : C.tx3) : C.tx3 }}>
                    {delta != null ? formatDelta(delta) : "—"}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: "8px 8px", color: C.tx }}>Total</td>
              <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(raceA.total_s, { hours: true })}</td>
              <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(raceB.total_s, { hours: true })}</td>
              <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", color: raceA.total_s - raceB.total_s < 0 ? C.g : C.r }}>
                {formatDelta(raceA.total_s - raceB.total_s)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Radar overlay */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Radar superposé</div>
      <HyroxRadar
        series={[
          { name: raceA.event_name + " (" + raceA.date + ")", color: C.ac, axes: axesA },
          { name: raceB.event_name + " (" + raceB.date + ")", color: C.b, axes: axesB },
        ]}
      />
    </div>
  );
}

function RaceHeader({ r }: { r: HyroxResult }) {
  const sh = shares(r);
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{r.event_name}</div>
      <div style={{ fontSize: 10, color: C.tx3 }}>{r.date}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.tx, fontFamily: "monospace", marginTop: 4 }}>
        {formatMmSs(r.total_s, { hours: true })}
      </div>
      <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
        Course {sh.run ?? "—"}% · Stations {sh.stations ?? "—"}% · Rox {sh.roxzone ?? "—"}%
      </div>
    </div>
  );
}

function TotalPill({ label, a, b, color }: { label: string; a: number | null; b: number | null; color: string }) {
  const delta = a != null && b != null ? a - b : null;
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color, fontFamily: "monospace" }}>
        {formatMmSs(a)} / {formatMmSs(b)}
      </div>
      {delta != null && (
        <div style={{ fontSize: 10, fontWeight: 600, color: delta < 0 ? C.g : delta > 0 ? C.r : C.tx3, fontFamily: "monospace" }}>
          {formatDelta(delta)}
        </div>
      )}
    </div>
  );
}
