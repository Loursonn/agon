import { useMemo, useRef, useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle, pillStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { hyroxPictoColor, type HyroxStation } from "@/features/shared/components/hyroxStation";
import { useRaceWatch } from "@/features/shared/hooks/hyrox/useRaceWatch";
import { useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { pickRef } from "@/api/hyrox";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { DIVISION_LABEL, REFERENCE_DIVISION, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";
import { bracketOf, percentile, shares, typology } from "@/lib/hyrox/calc";
import {
  athleteFindings, compromisedRunning, crossRaceWithWatch, defaultRaceOffset, raceGains, roxzoneRecovery,
  runEfficiency, timeAboveHr, type RaceWatchAnalysis, type SegmentWatch,
} from "@/lib/hyrox/raceWatch";
import { DASH, fmtClock, fmtPace, zoneColor } from "@/lib/seance";
import { drawShareCard, shareCardBlob } from "./raceShareCard";

/**
 * Analyse de course HYROX (planches HyroxAnaTel et HyroxAnaCoachOrdi) :
 * résultat officiel croisé avec la montre. Même écran pour l'athlète et le
 * coach ; sur grand écran, le tableau des 17 segments et les constats de la
 * montre s'ajoutent. Toutes les phrases sont des règles calculées (aucune IA).
 */

const TABS = [
  { key: "course", label: "Course" },
  { key: "runs", label: "Runs" },
  { key: "gains", label: "Gains" },
  { key: "partager", label: "Partager" },
] as const;
type TabKey = typeof TABS[number]["key"];

const STATION_PICTO: Record<string, HyroxStation> = {
  ski: "skierg", sled_push: "sled_push", sled_pull: "sled_pull", bbj: "burpee_broad_jump",
  row: "rameur", farmers: "farmers_carry", lunges: "sandbag_lunges", wall_balls: "wall_balls",
};

const segColor = (s: { kind: string }) =>
  s.kind === "run" ? hyroxPictoColor("course") : s.kind === "station" ? hyroxPictoColor("skierg") : C.brdL;

const PROFILE_LABEL = { runner: "Runner", hybrid: "Hybride", powerhouse: "Powerhouse" } as const;

function Sources({ children }: { children: React.ReactNode }) {
  return <div style={{ ...LABEL, fontSize: 10, letterSpacing: "0.08em", textTransform: "none", lineHeight: 1.5 }}>Sources · {children}</div>;
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div style={{ ...CARD, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...MONO, fontSize: 24 }}>{value}{unit && <span style={{ fontSize: 12, color: C.tx3 }}> {unit}</span>}</span>
      {sub && <span style={{ fontSize: 11.5, color: C.tx2, lineHeight: 1.4 }}>{sub}</span>}
    </div>
  );
}

/** Frise des 17 segments à l'échelle du temps, FC par-dessus. */
function Frise({ analysis, hr, offset, sv1, sv2, selected, onSelect }: {
  analysis: RaceWatchAnalysis;
  hr: { t: number[]; v: Array<number | null> } | null;
  offset: number;
  sv1: number | null;
  sv2: number | null;
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const total = analysis.segments[analysis.segments.length - 1].endS;
  const W = 1000;
  const HH = 120;
  const pts = useMemo(() => {
    if (!hr) return null;
    const xs: Array<[number, number]> = [];
    hr.t.forEach((t, i) => {
      const v = hr.v[i];
      const r = t - offset;
      if (v != null && r >= 0 && r <= total) xs.push([r, v]);
    });
    return xs.length > 1 ? xs : null;
  }, [hr, offset, total]);
  const lo = pts ? Math.min(...pts.map((p) => p[1])) - 5 : 0;
  const hi = pts ? Math.max(...pts.map((p) => p[1])) + 5 : 1;
  const yOf = (v: number) => HH - ((v - lo) / Math.max(1, hi - lo)) * HH;
  const zoneOf = (v: number) => (sv2 != null && v > sv2 ? 3 : sv1 != null && v > sv1 ? 2 : 1);
  return (
    <svg viewBox={`0 0 ${W} ${HH + 46}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Frise de course">
      {pts && pts.slice(1).map(([t, v], i) => (
        <line key={i} x1={(pts[i][0] / total) * W} y1={yOf(pts[i][1])} x2={(t / total) * W} y2={yOf(v)}
          stroke={zoneColor(zoneOf(v))} strokeWidth={2.2} />
      ))}
      {sv2 != null && pts && sv2 > lo && sv2 < hi && (
        <line x1={0} x2={W} y1={yOf(sv2)} y2={yOf(sv2)} stroke={C.tx3} strokeDasharray="4 6" strokeWidth={1} />
      )}
      {analysis.segments.map((s) => {
        const x = (s.startS / total) * W;
        const w = Math.max(1.5, ((s.endS - s.startS) / total) * W - 1.5);
        const on = selected === s.key;
        return (
          <g key={s.key} onClick={() => onSelect(s.key)} style={{ cursor: "pointer" }}>
            <rect x={x} y={HH + 8} width={w} height={on ? 22 : 16} rx={2} fill={segColor(s)} opacity={selected && !on ? 0.45 : 1} />
            <rect x={x} y={0} width={w} height={HH + 30} fill="transparent" />
            {s.kind === "run" && (
              <text x={x + 2} y={HH + 44} fontSize={13} fill={C.tx3} style={MONO}>{s.key.slice(4)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SegmentDetail({ s, fresh }: { s: SegmentWatch; fresh: number }) {
  return (
    <div style={{ ...CARD, padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10 }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 14, fontWeight: 600 }}>{s.label}</div>
      <div><div style={LABEL}>Temps</div><div style={{ ...MONO, fontSize: 18 }}>{fmtClock(s.officialS)}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Allure</div><div style={{ ...MONO, fontSize: 18 }}>{fmtPace(s.officialS)} <span style={{ fontSize: 11, color: C.tx3 }}>/km</span></div></div>}
      <div><div style={LABEL}>FC moy. / max</div><div style={{ ...MONO, fontSize: 18 }}>{s.avgHr ?? DASH} / {s.maxHr ?? DASH}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Cadence</div><div style={{ ...MONO, fontSize: 18 }}>{s.avgCadence ?? DASH}</div></div>}
      {s.kind === "run" && s.key !== "run_1" && (
        <div><div style={LABEL}>vs run 1</div><div style={{ ...MONO, fontSize: 18, color: s.officialS > fresh ? C.o : C.g }}>{s.officialS >= fresh ? "+" : "−"}{Math.abs(Math.round(s.officialS - fresh))} s/km</div></div>
      )}
    </div>
  );
}

export default function RaceAnalysis({ race, onBack }: { race: HyroxResult; onBack: () => void }) {
  const [tab, setTab] = useState<TabKey>("course");
  const [selected, setSelected] = useState<string | null>(null);
  const watch = useRaceWatch(race);
  const { data: refs = [] } = useHyroxReferences();
  const { data: allRaces = [] } = useHyroxResults(race.athlete_id);
  const { data: coaches } = useAthleteCoaches(race.athlete_id);

  const detail = watch.detail;
  const stream = detail?.stream ?? null;
  const offset = useMemo(() => defaultRaceOffset(stream, race.total_s), [stream, race.total_s]);
  const sv = detail?.bounds?.kind === "three" ? detail.bounds.bounds : null;
  const sv1 = sv?.[0] ?? null;
  const sv2 = sv?.[1] ?? null;
  const attribution = stream ? detail?.attribution ?? null : null;

  const analysis = useMemo(() => crossRaceWithWatch(race, stream, offset), [race, stream, offset]);
  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);
  const median = useMemo(() => (seg: string) => pickRef(refs, refDiv, seg, bracket)?.p50_s ?? null, [refs, refDiv, bracket]);
  const gains = useMemo(() => (refs.length ? raceGains(race, median) : null), [race, median, refs.length]);
  const above = analysis ? timeAboveHr(analysis, stream, sv2, offset) : null;
  const findings = analysis ? athleteFindings({ analysis, above, gains, sv2 }) : [];
  const eff = analysis ? runEfficiency(analysis) : null;
  const recov = analysis ? roxzoneRecovery(analysis, stream, offset) : null;
  const compromised = analysis ? compromisedRunning(analysis) : null;

  const totalRef = pickRef(refs, refDiv, "total", bracket);
  const totalPct = totalRef ? percentile(race.total_s, totalRef) : null;
  const sh = shares(race);
  const profile = typology(sh.run, sh.stations);
  const best = allRaces
    .filter((r) => r.is_official && r.division === race.division && r.status === race.status)
    .reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null);
  const isRecord = race.is_official && best != null && race.total_s <= best;
  const division = DIVISION_LABEL[race.division as HyroxDivision] ?? race.division;
  const dateLabel = new Date(race.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const sel = analysis?.segments.find((s) => s.key === selected) ?? null;
  const timeSource = race.is_official ? "résultat officiel" : "temps saisis";

  if (!analysis) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button type="button" onClick={onBack} style={{ ...buttonStyle(), alignSelf: "flex-start" }}><ArrowLeft size={14} /> Course</button>
        <div style={{ fontSize: 13, color: C.tx3 }}>Il manque des temps de run ou de station : l'analyse a besoin des 16 temps de la course.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={onBack} style={buttonStyle()}><ArrowLeft size={14} /> Course</button>
        <span style={pillStyle(hyroxPictoColor("skierg"))}>Analyse</span>
      </div>

      <div>
        <div style={KICKER}>{race.is_official ? "Compétition" : "Course"} · {division}</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{race.event_name}</div>
        <div style={{ fontSize: 12, color: C.tx3 }}>{dateLabel}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Stat label="Chrono" value={fmtClock(race.total_s)} sub={isRecord ? "Record" : undefined} />
        {race.rank_overall != null && race.participants_overall
          ? <Stat label="Rang" value={String(race.rank_overall)} unit={`/ ${race.participants_overall}`} sub={`Top ${Math.max(1, Math.round((race.rank_overall / race.participants_overall) * 100))} %`} />
          : totalPct != null && <Stat label="Position" value={`Top ${totalPct} %`} sub={`${division} · ${bracket.replace("_", "–")}`} />}
        {profile && <Stat label="Profil" value={PROFILE_LABEL[profile]} sub={profile === "hybrid" ? "course et stations au même niveau" : undefined} />}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            style={{ ...pillStyle(C.ac, tab === t.key), height: 30, padding: "0 14px", cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "course" && (
        <>
          <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={KICKER}>01 — Le film de ta course</span>
              {attribution && <span style={{ ...LABEL, fontSize: 10 }}>{attribution}{sv2 != null ? ` · SV2 ${sv2}${sv1 != null ? ` · SV1 ${sv1}` : ""}` : ""}</span>}
            </div>
            <Frise analysis={analysis} hr={stream ? { t: stream.t, v: stream.hr ?? [] } : null} offset={offset} sv1={sv1} sv2={sv2} selected={selected} onSelect={setSelected} />
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.tx3 }}>
              <span><span style={{ color: hyroxPictoColor("course") }}>■</span> Run</span>
              <span><span style={{ color: hyroxPictoColor("skierg") }}>■</span> Station</span>
              <span><span style={{ color: C.brdL }}>■</span> Roxzone{analysis.roxzoneEstimated ? " (répartie)" : ""}</span>
              {stream && [1, 2, 3].map((z) => <span key={z}><span style={{ color: zoneColor(z) }}>■</span> Z{z}</span>)}
            </div>
            {sel ? <SegmentDetail s={sel} fresh={analysis.freshPaceSPerKm} /> : <div style={{ fontSize: 12, color: C.tx3 }}>Touche un segment pour voir son détail.</div>}
            {!stream && !watch.loading && (
              <div style={{ fontSize: 12, color: C.tx2 }}>Aucune activité de montre ce jour-là : seuls les temps sont analysés. FC et cadence apparaîtront si la course est importée ou synchronisée.</div>
            )}
            {stream && offset > 0 && (
              <div style={{ fontSize: 11, color: C.tx3 }}>Départ placé à {fmtClock(offset)} de l'enregistrement (échauffement avant le départ).</div>
            )}
          </div>

          {findings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={KICKER}>02 — {findings.length} constat{findings.length > 1 ? "s" : ""}</span>
              {findings.map((f, i) => (
                <div key={i} style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 14, alignItems: "baseline" }}>
                  <span style={{ ...MONO, fontSize: 26, color: C.ac, minWidth: 70 }}>{f.value}<span style={{ fontSize: 11, color: C.tx3 }}> {f.unit}</span></span>
                  <span style={{ fontSize: 13, color: C.tx2, lineHeight: 1.45 }}>{f.text}</span>
                </div>
              ))}
            </div>
          )}

          {stream && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={KICKER}>Ce que dit la montre</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {compromised && <Stat label="Course compromise" value={`+${compromised.avgSPerKm}`} unit="s/km" sub={`Pire : ${compromised.worst.key.replace("run_", "run ")}${compromised.worst.after ? ` après ${compromised.worst.after}` : ""} (+${compromised.worst.sPerKm} s/km) · allure fraîche ${fmtPace(analysis.freshPaceSPerKm)}`} />}
                {eff && <Stat label="Dérive cardiaque" value={`${eff.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(eff.pct * 100))}`} unit="%" sub={`Mètres par battement, run 1 → run 8 : ${eff.first.toFixed(2).replace(".", ",")} → ${eff.last.toFixed(2).replace(".", ",")}`} />}
                {recov && <Stat label="Récupération en Roxzone" value={`−${recov.avgDrop}`} unit="bpm en 60 s" sub={`Le moins bien après ${recov.worst.station} : −${recov.worst.drop} bpm`} />}
                {above && sv2 != null && <Stat label="Au-dessus de SV2" value={fmtClock(above.totalS)} sub={`${Math.round(above.share * 100)} % du chrono au-dessus de ${sv2} bpm`} />}
              </div>
            </div>
          )}

          <SegmentsTable analysis={analysis} median={median} />
          <Sources>temps : {timeSource}{attribution ? ` · FC, cadence : ${attribution}` : ""} · médianes : références HYROX ({division}) · constats calculés par Agon, sans IA</Sources>
        </>
      )}

      {tab === "runs" && <RunsTab analysis={analysis} median={median} attribution={attribution} timeSource={timeSource} />}
      {tab === "gains" && <GainsTab gains={gains} division={division} timeSource={timeSource} />}
      {tab === "partager" && (
        <ShareTab race={race} analysis={analysis} division={division} isRecord={isRecord}
          coachName={coaches?.referent?.full_name ?? null} attribution={attribution}
          hr={stream?.hr ? stream.t.flatMap((t, i) => (t >= offset && t <= offset + race.total_s && i % 10 === 0 ? [stream.hr![i]] : [])) : null} />
      )}
    </div>
  );
}

function SegmentsTable({ analysis, median }: { analysis: RaceWatchAnalysis; median: (seg: string) => number | null }) {
  const [open, setOpen] = useState(false);
  const rows = analysis.segments.filter((s) => s.kind !== "roxzone");
  const th: React.CSSProperties = { ...LABEL, fontSize: 10, textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { ...MONO, fontSize: 12.5, textAlign: "right", padding: "7px 8px", borderTop: `1px solid ${C.brd}` };
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...buttonStyle(), width: "100%", justifyContent: "space-between" }}>
        <span>Les segments un par un</span><span style={{ color: C.tx3 }}>{open ? "Replier" : "Déplier"}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Segment</th><th style={th}>Temps</th><th style={th}>Médiane</th>
              <th style={th}>Écart</th><th style={th}>FC moy.</th><th style={th}>FC max</th><th style={th}>Cadence</th>
            </tr></thead>
            <tbody>
              {rows.map((s) => {
                const m = median(s.key);
                const d = m != null ? s.officialS - m : null;
                return (
                  <tr key={s.key}>
                    <td style={{ ...td, ...{ fontFamily: "inherit" }, textAlign: "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <HyroxPicto station={s.kind === "run" ? "course" : STATION_PICTO[s.key] ?? "autre"} size={14} color={segColor(s)} />{s.label}
                      </span>
                    </td>
                    <td style={td}>{fmtClock(s.officialS)}</td>
                    <td style={{ ...td, color: C.tx3 }}>{fmtClock(m)}</td>
                    <td style={{ ...td, color: d == null ? C.tx3 : d > 0 ? C.o : C.g }}>{d == null ? DASH : `${d > 0 ? "+" : "−"}${fmtClock(Math.abs(d))}`}</td>
                    <td style={td}>{s.avgHr ?? DASH}</td>
                    <td style={td}>{s.maxHr ?? DASH}</td>
                    <td style={td}>{s.avgCadence ?? DASH}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, fontFamily: "inherit", textAlign: "left" }}>Roxzone · 15 passages</td>
                <td style={td}>{fmtClock(analysis.segments.filter((s) => s.kind === "roxzone").reduce((n, s) => n + s.officialS, 0))}</td>
                <td style={{ ...td, color: C.tx3 }}>{fmtClock(median("roxzone_total"))}</td>
                <td style={td} colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunsTab({ analysis, median, attribution, timeSource }: { analysis: RaceWatchAnalysis; median: (s: string) => number | null; attribution: string | null; timeSource: string }) {
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const fresh = analysis.freshPaceSPerKm;
  const maxDelta = Math.max(10, ...runs.map((r) => r.officialS - fresh));
  const prevStation = (s: SegmentWatch) => {
    const i = analysis.segments.indexOf(s);
    return analysis.segments.slice(0, i).reverse().find((x) => x.kind === "station") ?? null;
  };
  const slowest = [...runs.slice(1)].sort((a, b) => b.officialS - a.officialS).slice(0, 2);
  const costly = slowest.map(prevStation).filter((x): x is SegmentWatch => x != null);
  const cad = runs.map((r) => r.avgCadence).filter((x): x is number => x != null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <span style={KICKER}>Allure par km</span>
          <span style={{ ...LABEL, fontSize: 10 }}>Allure fraîche {fmtPace(fresh)} (run 1)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, alignItems: "end", height: 140 }}>
          {runs.map((r, i) => {
            const d = r.officialS - fresh;
            const m = median(r.key);
            return (
              <div key={r.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                <span style={{ ...MONO, fontSize: 10.5, color: i === 0 ? C.tx3 : d > 0 ? C.o : C.g }}>{i === 0 ? fmtPace(r.officialS) : `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`}</span>
                <div title={m != null ? `Médiane ${fmtPace(m)}` : undefined}
                  style={{ width: "70%", height: `${12 + (Math.max(0, d) / maxDelta) * 90}%`, background: i === 0 ? C.tx3 : hyroxPictoColor("course"), borderRadius: 4 }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, justifyItems: "center" }}>
          {runs.map((r, i) => {
            const st = prevStation(r);
            return (
              <div key={r.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{i + 1}</span>
                {st ? <HyroxPicto station={STATION_PICTO[st.key] ?? "autre"} size={14} title={st.label} /> : <span style={{ height: 14 }} />}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.tx3 }}>Sous chaque barre : la station juste avant.</div>
        {cad.length > 0 && (
          <>
            <div style={LABEL}>Cadence · pas/min</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, textAlign: "center" }}>
              {runs.map((r) => <span key={r.key} style={{ ...MONO, fontSize: 12 }}>{r.avgCadence ?? DASH}</span>)}
            </div>
            <div style={LABEL}>FC moyenne · bpm</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, textAlign: "center" }}>
              {runs.map((r) => <span key={r.key} style={{ ...MONO, fontSize: 12 }}>{r.avgHr ?? DASH}</span>)}
            </div>
          </>
        )}
      </div>
      {costly.length > 0 && slowest[0].officialS > fresh && (
        <div style={{ ...CARD, padding: "12px 14px", borderColor: alpha(C.o, 0.5) }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Ce qui te coûte le plus : {costly.map((c) => c.label.toLowerCase()).join(" et ")}.</div>
          <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 4, lineHeight: 1.45 }}>
            Les runs qui suivent sont les plus lents ({slowest.map((s) => `+${Math.round(s.officialS - fresh)}`).join(" et ")} s/km)
            {cad.length > 0 && Math.min(...cad) < cad[0] ? `, ta cadence descend jusqu'à ${Math.min(...cad)} pas/min` : ""}.
          </div>
        </div>
      )}
      <Sources>allures : {timeSource}{attribution ? ` · cadence, FC : ${attribution}` : ""}</Sources>
    </div>
  );
}

function GainsTab({ gains, division, timeSource }: { gains: ReturnType<typeof raceGains> | null; division: string; timeSource: string }) {
  if (!gains) return <div style={{ fontSize: 13, color: C.tx3 }}>Références HYROX en cours de chargement…</div>;
  if (gains.items.length === 0) {
    return <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Partout au niveau de la médiane {division} ou devant : rien à rattraper sur cette course.</div>;
  }
  const total = gains.currentS - gains.possibleS;
  const max = Math.max(...gains.items.map((g) => g.gainS));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Ton chrono" value={fmtClock(gains.currentS)} />
        <Stat label="Possible" value={fmtClock(gains.possibleS)} />
      </div>
      <div style={{ fontSize: 13, color: C.tx2 }}>
        {fmtClock(total)} à gagner sur {gains.items.length} point{gains.items.length > 1 ? "s" : ""}, en revenant à la médiane de ton niveau.
      </div>
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={KICKER}>Du chrono actuel au possible</span>
        {gains.items.map((g) => (
          <div key={g.key} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 2fr 56px", gap: 10, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13 }}>{g.label}</div>
              <div style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{fmtClock(g.athleteS)} · médiane {fmtClock(g.medianS)}</div>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: C.s2 }}>
              <div style={{ width: `${(g.gainS / max) * 100}%`, height: "100%", borderRadius: 5, background: hyroxPictoColor("skierg") }} />
            </div>
            <span style={{ ...MONO, fontSize: 13, color: C.o, textAlign: "right" }}>−{Math.round(g.gainS)} s</span>
          </div>
        ))}
      </div>
      <Sources>temps : {timeSource} · médianes : références HYROX ({division}, même tranche de chrono) · aucune donnée montre</Sources>
    </div>
  );
}

function ShareTab(props: {
  race: HyroxResult; analysis: RaceWatchAnalysis; division: string; isRecord: boolean;
  coachName: string | null; attribution: string | null; hr: Array<number | null> | null;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showHr, setShowHr] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const hasHr = !!props.hr && props.hr.some((v) => v != null);

  useEffect(() => {
    if (!ref.current) return;
    drawShareCard(ref.current, {
      race: props.race, analysis: props.analysis, divisionLabel: props.division, isRecord: props.isRecord,
      coachName: props.coachName, attribution: props.attribution, theme, showHr: showHr && hasHr, hrSeries: props.hr,
    });
  }, [props.race, props.analysis, props.division, props.isRecord, props.coachName, props.attribution, props.hr, theme, showHr, hasHr]);

  const fileName = `hyrox-${props.race.date}.png`;
  const save = async () => {
    if (!ref.current) return;
    const blob = await shareCardBlob(ref.current);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await shareCardBlob(ref.current);
      if (!blob) return;
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: props.race.event_name });
      } else {
        await save();
      }
    } catch {
      /* partage annulé */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <canvas ref={ref} style={{ width: "100%", maxWidth: 320, aspectRatio: "9 / 16", borderRadius: 16, border: `1px solid ${C.brd}` }} aria-label="Carte à partager" />
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ ...LABEL, alignSelf: "center" }}>Fond</span>
        {(["dark", "light"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTheme(t)} style={{ ...pillStyle(C.ac, theme === t), height: 28, cursor: "pointer" }}>{t === "dark" ? "Sombre" : "Clair"}</button>
        ))}
      </div>
      {hasHr && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.tx2 }}>
          <input type="checkbox" checked={showHr} onChange={(e) => setShowHr(e.target.checked)} />
          Afficher la FC <span style={{ color: C.tx3, fontSize: 11 }}>courbe et moyenne de la montre</span>
        </label>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={share} disabled={busy} style={buttonStyle("primary", busy)}>Partager</button>
        <button type="button" onClick={save} style={buttonStyle()}>Enregistrer l’image</button>
      </div>
      <Sources>chrono, stations : {props.race.is_official ? "résultat officiel" : "temps saisis"}{props.attribution ? ` · courbe et FC moyenne : ${props.attribution} (masquables)` : ""} · image créée sur l'appareil, rien n'est envoyé</Sources>
    </div>
  );
}
