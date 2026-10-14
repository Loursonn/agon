import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { percentile, stationPriorities, roxzoneTotal, bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { STATION_KEYS, STATION_META, DIVISION_LOADS, REFERENCE_DIVISION, SEGMENT_LABEL, type StationKey, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";
import { formatMmSs, formatDelta } from "@/lib/time";

function getStation(r: HyroxResult, k: StationKey): number | null {
  return (r as Record<string, unknown>)[k + "_s"] as number | null;
}

export default function StationsView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();

  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  const latest = races[0];
  const officialRaces = races.filter(r => r.is_official && r.status === "finished");

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;
  if (!latest) return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course HYROX saisie.</div>;

  const refDiv = REFERENCE_DIVISION(latest.division as HyroxDivision);
  const bracket = bracketOf(latest.total_s);
  const loads = DIVISION_LOADS[refDiv] ?? {};

  // Station cards (8 + roxzone) — compare within bracket
  const stationCards = STATION_KEYS.map(k => {
    const lastVal = getStation(latest, k);
    const record = officialRaces.reduce<number | null>((best, r) => {
      const v = getStation(r, k);
      if (v == null) return best;
      return best == null || v < best ? v : best;
    }, null);
    const ref = refLookup(refDiv, k, bracket);
    const pct = lastVal != null && ref ? percentile(lastVal, ref) : null;
    const delta = lastVal != null && ref ? lastVal - ref.p50_s : null;
    const sparkData = races.slice().reverse().map(r => getStation(r, k)).filter(v => v != null) as number[];
    return { key: k, label: STATION_META[k].label, lastVal, record, ref, pct, delta, sparkData, load: loads[k] ?? "" };
  });

  // Roxzone card
  const lastRox = roxzoneTotal(latest);
  const roxRef = refLookup(refDiv, "roxzone_total", bracket);
  const roxPct = lastRox != null && roxRef ? percentile(lastRox, roxRef) : null;
  const roxDelta = lastRox != null && roxRef ? lastRox - roxRef.p50_s : null;
  const roxSpark = races.slice().reverse().map(r => roxzoneTotal(r)).filter(v => v != null) as number[];

  // Priorities table
  const prios = stationPriorities(latest, refLookup);

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginTop: 16, marginBottom: 12 }}>Stations</div>

      {/* Grid of station cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 20 }}>
        {stationCards.map(s => (
          <StationCard key={s.key} {...s} />
        ))}
        <StationCard key="roxzone" label="Roxzone" lastVal={lastRox} record={null} ref_={roxRef} pct={roxPct} delta={roxDelta} sparkData={roxSpark} load="" />
      </div>

      {/* Priorities table */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Priorités d'amélioration</div>
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10 }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Station</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Toi</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Top 1 %</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Médiane</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Écart méd.</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Écart top 1 %</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Poids</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {prios.map((p, i) => (
              <tr key={p.key} style={{ borderBottom: "1px solid " + C.brd, background: i < 3 ? C.ac + "08" : "transparent" }}>
                <td style={{ padding: "6px 8px", color: C.tx, fontWeight: i < 3 ? 700 : 400 }}>
                  {i < 3 && <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", background: C.ac + "30", color: C.ac, fontSize: 9, fontWeight: 800, textAlign: "center", lineHeight: "16px", marginRight: 4 }}>{i + 1}</span>}
                  {SEGMENT_LABEL[p.key] ?? p.key}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(p.athlete_s)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: p.top1_s != null && p.athlete_s <= p.top1_s ? C.g : C.ac }}>
                  {p.top1_s != null ? formatMmSs(p.top1_s) : "—"}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx3 }}>{formatMmSs(p.ref_s)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: p.gain_s > 0 ? C.r : C.g }}>
                  {p.gain_s > 0 ? "+" + formatMmSs(p.gain_s) : p.gain_s === 0 ? "—" : formatDelta(-p.gain_s)}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: p.gap_top1_s > 0 ? C.o : C.g }}>
                  {p.gap_top1_s > 0 ? "+" + formatMmSs(p.gap_top1_s) : "= top 1 %"}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: C.tx3 }}>{p.weight}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: C.tx }}>
                  {Math.round(p.score)}
                  {p.key === "roxzone" && p.gain_s > 0 && (
                    <span style={{ fontSize: 9, color: C.tx3, fontWeight: 400, marginLeft: 4 }}>⚠ parcours</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Methodology section */}
      <MethodologySection />
    </div>
  );
}

function StationCard({ label, lastVal, record, ref_, pct, delta, sparkData, load }: {
  label: string;
  lastVal: number | null;
  record: number | null;
  ref_?: { p10_s: number | null; p25_s?: number | null; p50_s: number; p75_s?: number | null; p90_s: number | null; is_estimate: boolean; sample_size?: number | null } | null;
  pct: number | null;
  delta: number | null;
  sparkData: number[];
  load: string;
}) {
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: C.tx, fontFamily: "monospace" }}>{formatMmSs(lastVal)}</span>
        {record != null && record !== lastVal && (
          <span style={{ fontSize: 10, color: C.g }}>Record {formatMmSs(record)}</span>
        )}
      </div>

      {/* Percentile bar */}
      {pct != null ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: C.tx2 }}>Top {pct} %</span>
            <span style={{ color: delta != null && delta < 0 ? C.g : delta != null && delta > 0 ? C.r : C.tx3 }}>
              {delta != null ? formatDelta(delta) + " vs médiane" : ""}
            </span>
          </div>
          <div style={{ marginTop: 3, height: 4, borderRadius: 2, background: C.s2, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 2, background: pct <= 30 ? C.g : pct <= 60 ? C.ac : C.r, width: (100 - pct) + "%", transition: "width 0.3s" }} />
            <div style={{ position: "absolute", left: "50%", top: -1, width: 1, height: 6, background: C.tx3 }} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>réf. n.d.</div>
      )}

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <svg viewBox={`0 0 ${sparkData.length * 10} 20`} style={{ width: "100%", height: 20, marginTop: 6 }}>
          <polyline
            fill="none" stroke={C.ac} strokeWidth={1.5}
            points={sparkData.map((v, i) => {
              const min = Math.min(...sparkData);
              const max = Math.max(...sparkData);
              const range = max - min || 1;
              const y = 18 - ((v - min) / range) * 16;
              return `${i * 10 + 5},${y}`;
            }).join(" ")}
          />
        </svg>
      )}

      {load && <div style={{ fontSize: 9, color: C.tx3, marginTop: 4 }}>{load}</div>}
    </div>
  );
}

function MethodologySection() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 20 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: 0, border: "none", background: "none",
          color: C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {open ? "▾" : "▸"} Comment sont calculées ces données ?
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: "12px 14px", borderRadius: 6,
          background: C.s1, border: "1px solid " + C.brd,
          fontSize: 11, color: C.tx2, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: C.tx, marginBottom: 6 }}>Percentile (Top X %)</div>
          <p style={{ margin: "0 0 8px" }}>
            Ton temps est comparé aux données de référence HYROX (sources : RoxHype 25/26, HYROX Data Lab S7-S8).
            On interpole linéairement entre 3 points : <span style={{ fontFamily: "monospace" }}>p10</span> (top 10 %),{" "}
            <span style={{ fontFamily: "monospace" }}>p50</span> (médiane) et <span style={{ fontFamily: "monospace" }}>p90</span> (top 90 %).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Top 20 %</strong> = tu es plus rapide que 80 % des athlètes de ta division.
            Plus le chiffre est bas, mieux c'est.
          </p>

          <div style={{ fontWeight: 700, color: C.tx, marginBottom: 6, marginTop: 12 }}>Médiane (p50)</div>
          <p style={{ margin: "0 0 8px" }}>
            La médiane est le temps du coureur « du milieu » : 50 % font mieux, 50 % font moins bien.
            L'écart affiché (<span style={{ color: C.g }}>-12s</span> ou <span style={{ color: C.r }}>+30s</span>) montre
            à quel point tu es au-dessus ou en-dessous de cette référence.
          </p>

          <div style={{ fontWeight: 700, color: C.tx, marginBottom: 6, marginTop: 12 }}>Priorités d'amélioration</div>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Écart médiane</strong> = ton temps − médiane (0 si tu es plus rapide).{" "}
            <strong>Écart top 1 %</strong> = ton temps − meilleur temps de la division (toujours {">"} 0 sauf si tu es top 1 %).{" "}
            <strong>Poids</strong> = importance de la station (Wall Balls = 1.0, SkiErg = 0.15).{" "}
            <strong>Score</strong> = (0.6 × écart médiane + 0.4 × écart top 1 %) × Poids.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            Le score combine deux logiques : les gains « faciles » (revenir à la médiane, pondéré 60 %)
            et la marge de progression vers l'élite (distance au top 1 %, pondéré 40 %).
            Même si tu bats la médiane, une station loin du top 1 % reste un axe d'amélioration.
          </p>

          <div style={{ fontWeight: 700, color: C.tx, marginBottom: 6, marginTop: 12 }}>Roxzone</div>
          <p style={{ margin: 0 }}>
            La Roxzone (temps de transition entre stations) dépend fortement du parcours : certaines courses ont des Roxzones
            plus longues que d'autres. On compare ton temps à la médiane Roxzone de ta catégorie de temps (sub-70, 70-80, etc.)
            pour savoir si c'est un vrai point faible ou simplement un parcours long. Si ton % Roxzone est {">"} 7 % du total
            et au-dessus de la médiane de ton bracket, c'est un axe d'amélioration.
          </p>
        </div>
      )}
    </div>
  );
}
