import { useState, useMemo } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { radarAxes, typology, percentile, runTotal, stationsTotal, roxzoneTotal, bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { REFERENCE_DIVISION, STATION_KEYS, STATION_META, SEGMENT_LABEL, type StationKey, type HyroxDivision } from "@/features/shared/types/hyrox";
import { formatMmSs } from "@/lib/time";
import HyroxRadar from "./HyroxRadar";

const PROFILE_LABEL = { runner: "Runner", hybrid: "Hybride", powerhouse: "Powerhouse" };

export default function HyroxRadarView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [] } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();

  const officialRaces = races.filter(r => r.is_official && r.status === "finished");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showRecord, setShowRecord] = useState(false);

  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  const race = officialRaces[selectedIdx];
  const record = officialRaces.length > 0
    ? officialRaces.reduce((a, b) => a.total_s < b.total_s ? a : b) : null;

  if (!race) {
    return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course officielle pour afficher le radar.</div>;
  }

  const axes = radarAxes(race, refLookup);
  const series = [{ name: race.event_name + " (" + race.date + ")", color: C.ac, axes }];
  if (showRecord && record && record.id !== race.id) {
    series.push({ name: "Record — " + formatMmSs(record.total_s, { hours: true }), color: C.g, axes: radarAxes(record, refLookup) });
  }

  // Typology
  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);
  const runRef = refLookup(refDiv, "run_total", bracket);
  const rt = runTotal(race);
  const pctRun = runRef && rt != null ? percentile(rt, runRef) : null;

  const stationPcts = STATION_KEYS.map(k => {
    const v = (race as Record<string, unknown>)[k + "_s"] as number | null;
    const ref = refLookup(refDiv, k, bracket);
    return v != null && ref ? percentile(v, ref) : null;
  }).filter(v => v != null) as number[];
  const pctStations = stationPcts.length > 0 ? stationPcts.reduce((a, b) => a + b, 0) / stationPcts.length : null;
  const typo = typology(pctRun, pctStations);

  // Best/worst axes for typology description
  const validAxes = axes.filter(a => a.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const best3 = validAxes.slice(0, 3).map(a => a.label);
  const worst3 = validAxes.slice(-3).map(a => a.label);

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginTop: 16, marginBottom: 12 }}>Radar</div>

      {/* Selectors */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <select
          value={selectedIdx}
          onChange={e => setSelectedIdx(Number(e.target.value))}
          style={{
            padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.brdL,
            background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit",
          }}
        >
          {officialRaces.map((r, i) => (
            <option key={r.id} value={i}>{r.event_name} — {r.date} — {formatMmSs(r.total_s, { hours: true })}</option>
          ))}
        </select>
        {record && record.id !== race.id && (
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.tx2, cursor: "pointer" }}>
            <input type="checkbox" checked={showRecord} onChange={e => setShowRecord(e.target.checked)} style={{ width: 14, height: 14 }} />
            Superposer le record
          </label>
        )}
      </div>

      <HyroxRadar series={series} />

      {/* Global ranking table */}
      <RankingTable race={race} refLookup={refLookup} />

      {/* Typology */}
      {typo && (
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 14px", marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
            Profil : {PROFILE_LABEL[typo]}
          </div>
          <div style={{ fontSize: 11, color: C.tx2 }}>
            {typo === "runner" && `Course et ergos au-dessus de la division (${best3.join(", ")}), ${worst3.join(" et ")} en dessous.`}
            {typo === "powerhouse" && `Stations solides (${best3.join(", ")}), course en retrait (${worst3.join(", ")}).`}
            {typo === "hybrid" && `Profil équilibré. Points forts : ${best3.join(", ")}. Points faibles : ${worst3.join(", ")}.`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ranking table: explicit percentile per segment vs global population ──────

import type { HyroxResult } from "@/features/shared/types/hyrox";

type RankingRow = {
  label: string;
  athlete_s: number | null;
  pct: number | null;
  top1_s: number | null;
  median_s: number | null;
  delta_s: number | null;
  sample: number | null;
};

function pctColor(pct: number | null): string {
  if (pct == null) return C.tx3;
  if (pct <= 25) return C.g;
  if (pct <= 50) return C.ac;
  if (pct <= 75) return C.o;
  return C.r;
}

function pctLabel(pct: number | null): string {
  if (pct == null) return "—";
  return `Top ${pct} %`;
}

const BRACKET_LABEL: Record<string, string> = { sub70: 'sub 1h10', '70_80': '1h10-1h20', '80_90': '1h20-1h30', '90_plus': '1h30+' };

function RankingTable({ race, refLookup }: { race: HyroxResult; refLookup: RefLookup }) {
  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);

  const rows: RankingRow[] = [];

  // Helper to build row
  const makeRow = (label: string, athlete_s: number | null, ref: ReturnType<typeof refLookup>): RankingRow => ({
    label,
    athlete_s,
    pct: athlete_s != null && ref ? percentile(athlete_s, ref) : null,
    top1_s: ref?.p1_s ?? null,
    median_s: ref?.p50_s ?? null,
    delta_s: athlete_s != null && ref ? athlete_s - ref.p50_s : null,
    sample: ref?.sample_size ?? null,
  });

  // Total
  rows.push(makeRow("Total", race.total_s, refLookup(refDiv, "total", bracket)));

  // Run total
  rows.push(makeRow("Course (total runs)", runTotal(race), refLookup(refDiv, "run_total", bracket)));

  // Stations total (no ref)
  rows.push({ label: "Stations (total)", athlete_s: stationsTotal(race), pct: null, top1_s: null, median_s: null, delta_s: null, sample: null });

  // 8 stations
  for (const k of STATION_KEYS) {
    const v = (race as Record<string, unknown>)[k + "_s"] as number | null;
    rows.push(makeRow(STATION_META[k].label, v, refLookup(refDiv, k, bracket)));
  }

  // Roxzone
  const rox = roxzoneTotal(race);
  const roxRef = refLookup(refDiv, "roxzone_total", bracket);
  rows.push({ ...makeRow("Roxzone", rox, roxRef),
  });

  const maxSample = Math.max(...rows.map(r => r.sample ?? 0));
  const sampleLabel = maxSample > 1000 ? `${Math.round(maxSample / 1000)}K` : String(maxSample);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
        Classement global
      </div>
      <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>
        Comparé aux athlètes {BRACKET_LABEL[bracket]} ({sampleLabel}+ résultats, saisons 7-8-9, {refDiv})
      </div>

      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10, fontWeight: 600 }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Segment</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Toi</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Top 1 %</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Médiane</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Écart</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Classement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isHeader = i < 3;
              const hrs = i === 0;
              return (
                <tr key={r.label} style={{
                  borderBottom: "1px solid " + C.brd,
                  background: isHeader ? C.s2 + "60" : "transparent",
                }}>
                  <td style={{ padding: "6px 8px", color: C.tx, fontWeight: isHeader ? 700 : 400 }}>
                    {r.label}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>
                    {r.athlete_s != null ? formatMmSs(r.athlete_s, { hours: hrs }) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: r.top1_s != null && r.athlete_s != null && r.athlete_s <= r.top1_s ? C.g : C.ac }}>
                    {r.top1_s != null ? formatMmSs(r.top1_s, { hours: hrs }) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx3 }}>
                    {r.median_s != null ? formatMmSs(r.median_s, { hours: hrs }) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: r.delta_s != null && r.delta_s < 0 ? C.g : r.delta_s != null && r.delta_s > 0 ? C.r : C.tx3 }}>
                    {r.delta_s != null ? (r.delta_s >= 0 ? "+" : "") + formatMmSs(Math.abs(r.delta_s)) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {r.pct != null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 60, height: 6, borderRadius: 3, background: C.s2,
                          position: "relative", overflow: "hidden",
                        }}>
                          <div style={{
                            position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 3,
                            background: pctColor(r.pct),
                            width: (100 - r.pct) + "%",
                          }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: pctColor(r.pct) }}>
                          {pctLabel(r.pct)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: C.tx3 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
