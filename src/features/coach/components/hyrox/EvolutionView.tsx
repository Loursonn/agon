import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C, alpha } from "@/lib/theme";
import { CARD, DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { useHyroxAnalyses } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { useRaceWatch } from "@/features/shared/hooks/hyrox/useRaceWatch";
import { competitionKeys, daysUntil, listCompetitions } from "@/api/competitions";
import { type HyroxResult } from "@/features/shared/types/hyrox";
import { bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { raceShortName, segmentPositions } from "@/lib/hyrox/raceEvolution";
import { evolutionRaces, nextHyroxCompetition, raceProjection, runEfficiencySeries } from "@/lib/hyrox/raceProjection";
import { crossRaceWithWatch, defaultRaceOffset, raceGains } from "@/lib/hyrox/raceWatch";
import type { CalibrationAnalysis } from "@/lib/hyrox/tests/calibration";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import { Sources } from "@/features/shared/components/hyrox/raceAnalysisUi";
import { ddmm, fmtGap } from "@/features/shared/components/hyrox/raceAnalysisShared";
import EvolutionTimeSplit from "./EvolutionTimeSplit";
import EvolutionStationPositions from "./EvolutionStationPositions";
import { CATEGORY_LABEL, RACE_FORMAT_LABEL, raceCategory, raceFormat, type RaceFormat } from "@/lib/hyrox/categories";

const MONTH = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthOf = (date: string) => MONTH[Number(date.slice(5, 7)) - 1] ?? "";
const comma2 = (x: number) => x.toFixed(2).replace(".", ",");

/**
 * Page « Évolution HYROX » (planche HyroxAnaCoachEvolution, coach) : chrono
 * course après course et projection pour la prochaine compétition HYROX, où
 * passe le temps, efficacité des runs, position par station. Remplace l'ancien
 * « Bilan ». Filtre Toutes / Officielles (simulations incluses par défaut).
 */
export default function EvolutionView({ onBack }: { onBack: () => void }) {
  const { athleteId } = useAthleteContext();
  const { data: all = [] } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();
  const { data: analyses = [] } = useHyroxAnalyses(athleteId);
  const { data: competitions = [] } = useQuery({
    queryKey: competitionKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listCompetitions(athleteId as string),
  });
  const [onlyOfficial, setOnlyOfficial] = useState(false);

  const allRaces = useMemo(() => evolutionRaces(all, false), [all]);
  const officialCount = useMemo(() => allRaces.filter((r) => r.is_official).length, [allRaces]);
  const races = useMemo(() => (onlyOfficial ? allRaces.filter((r) => r.is_official) : allRaces), [allRaces, onlyOfficial]);
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);
  const positions = useMemo(() => segmentPositions(races, refLookup), [races, refLookup]);
  const today = localIsoDay();
  const next = nextHyroxCompetition(competitions, today);
  const projection = useMemo(
    () => raceProjection(analyses as unknown as CalibrationAnalysis[], all),
    [analyses, all],
  );
  const latest = races[races.length - 1] ?? null;
  const categories = [...new Set(races.map(raceCategory))];
  const division = categories.map((c) => CATEGORY_LABEL[c]).join(" · ");
  const levelOf = useCallback(
    (r: HyroxResult) => (refs.length ? (seg: string) => pickRef(refs, raceCategory(r), seg, bracketOf(r.total_s))?.p50_s ?? null : null),
    [refs],
  );
  const levers = useMemo(() => {
    if (!latest || !refs.length) return null;
    const div = raceCategory(latest);
    const b = bracketOf(latest.total_s);
    const g = raceGains(latest, (seg) => pickRef(refs, div, seg, b)?.p50_s ?? null);
    const top = g.items.slice(0, 2);
    return top.length ? { names: top.map((x) => x.label.toLowerCase()), gainS: top.reduce((n, x) => n + x.gainS, 0) } : null;
  }, [latest, refs]);

  const crumb = (
    <nav aria-label="Fil d'Ariane" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.tx2 }}>
      <button type="button" onClick={onBack} aria-label="Retour aux courses" style={{ background: "none", border: "none", padding: 0, color: C.tx2, cursor: "pointer", display: "flex" }}><ChevronLeft size={15} /></button>
      <button type="button" onClick={onBack} style={LINK}>HYROX</button> › <button type="button" onClick={onBack} style={LINK}>Courses</button> › <span style={{ color: C.tx }}>Évolution</span>
    </nav>
  );

  if (allRaces.length === 0) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>{crumb}<div style={{ fontSize: 13, color: C.tx3 }}>Aucune course terminée pour l'instant.</div></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 16 }}>
      {crumb}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 30, letterSpacing: "0.08em", color: C.tx }}>ÉVOLUTION HYROX</h1>
          <div style={{ fontSize: 13, color: C.tx2, marginTop: 6 }}>
            {races.length} course{races.length > 1 ? "s" : ""} · {races.map((r) => `${raceShortName(r)} (${monthOf(r.date)})`).join(" → ")}{division ? ` · ${division}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={LABEL}>Afficher</span>
          <div role="radiogroup" aria-label="Courses affichées" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s1 }}>
            {([[false, `Toutes (${allRaces.length})`], [true, `Officielles (${officialCount})`]] as const).map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={onlyOfficial === v} onClick={() => setOnlyOfficial(v)}
                style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", background: onlyOfficial === v ? C.s2 : "transparent", color: onlyOfficial === v ? C.tx : C.tx2 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Section n="01" title="Chrono et projection" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div style={{ ...CARD, padding: "16px 18px", gridColumn: "span 2", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={LABEL}>Chrono</span>
            <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>
              <Dot color={C.rouge} /> Résultat officiel · <Dot color={C.o} /> Simulation{projection && next ? " · ▭ Estimation solo : calcul Agon" : ""}
              {new Set(races.map(raceFormat)).size > 1 && <> · {[...new Set(races.map(raceFormat))].map((f) => <span key={f} style={{ marginLeft: 6 }}><span style={{ display: "inline-block", width: 12, borderTop: `2px solid ${FORMAT_COLOR[f]}`, marginRight: 3, verticalAlign: "3px" }} />{RACE_FORMAT_LABEL[f]}</span>)}</>}
            </span>
          </div>
          <ChronoChart races={races} projected={projection && next ? { name: raceShortName({ event_name: next.name }), date: next.date, lowS: projection.lowS, highS: projection.highS, midS: projection.medianS } : null} />
        </div>
        <ProjectionCard projection={projection} next={next} today={today} levers={levers} />
      </div>

      <Section n="02" title="Où passe le temps" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
        <EvolutionTimeSplit races={races} levelOf={levelOf} />
        <EfficiencyCard races={races} />
      </div>

      <Section n="03" title="Position par station" right={races.map(raceShortName).join(" · ")} />
      <EvolutionStationPositions rows={positions} formats={races.map(raceFormat)} />
      <Sources>
        position de chaque course dans toute sa catégorie ({division}) · 0 = meilleur, pointillé = médiane, bande verte = top 35 % · une courbe par format (solo, duo, relais) · points : {races.map((r) => `${raceShortName(r)} ${ddmm(r.date)}`).join(" → ")}
      </Sources>
      <Sources>
        {races.some((r) => r.is_official) ? "courses officielles : résultats officiels" : ""}{races.some((r) => !r.is_official) ? " · simulations : temps saisis" : ""} · FC : montre de chaque course · positions et projection : calcul Agon, sans IA · mesure absente : « — »
      </Sources>
    </div>
  );
}

const LINK = { background: "none", border: "none", padding: 0, color: C.tx2, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 } as const;

function Dot({ color }: { color: string }) {
  return <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: color, marginRight: 3 }} />;
}

function Section({ n, title, right }: { n: string; title: string; right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, borderBottom: `1px solid ${C.brd}`, paddingBottom: 8, marginBottom: -4 }}>
      <span style={KICKER}><span style={{ color: C.ac }}>{n} —</span> {title}</span>
      {right && <span style={{ fontSize: 12, color: C.tx3 }}>{right}</span>}
    </div>
  );
}

/** Couleur de la courbe de chaque format : solo, duo et relais ne se comparent pas en temps. */
const FORMAT_COLOR: Record<RaceFormat, string> = { solo: C.tx2, duo: C.b, relais: C.ame };

/**
 * Chrono par course : axe inversé (plus haut = plus rapide), une courbe par
 * format (solo, duo, relais : décision d'Hugo du 15/11/2026), point estimé en
 * pointillé.
 */
function ChronoChart({ races, projected }: {
  races: HyroxResult[];
  projected: { name: string; date: string; lowS: number; highS: number; midS: number } | null;
}) {
  const W = 640;
  const H = 260;
  const PL = 64;
  const PR = 80;
  const PT = 26;
  const PB = 48;
  const vals = [...races.map((r) => r.total_s), ...(projected ? [projected.lowS, projected.highS] : [])];
  const lo = Math.floor((Math.min(...vals) - 60) / 120) * 120;
  const hi = Math.ceil((Math.max(...vals) + 60) / 120) * 120;
  const n = races.length + (projected ? 1 : 0);
  const x = (i: number) => (n <= 1 ? (PL + W - PR) / 2 : PL + (i / (n - 1)) * (W - PL - PR));
  const y = (s: number) => PT + ((s - lo) / Math.max(1, hi - lo)) * (H - PT - PB); // plus rapide = plus haut
  const step = Math.max(120, Math.ceil((hi - lo) / 5 / 60) * 60);
  const ticks: number[] = [];
  for (let s = lo; s <= hi; s += step) ticks.push(s);
  const formats = [...new Set(races.map(raceFormat))];
  // La projection (tests) estime un chrono solo : elle part de la dernière course solo.
  const last = [...races].reverse().find((r) => raceFormat(r) === "solo") ?? null;
  const lastIdx = last ? races.indexOf(last) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 8 }} role="img" aria-label="Chrono par course">
      {ticks.map((s) => (
        <g key={s}>
          <line x1={PL} x2={W - PR + 30} y1={y(s)} y2={y(s)} stroke={C.brd} strokeWidth={1} />
          <text x={PL - 10} y={y(s) + 3.5} fontSize={10} textAnchor="end" fill={C.tx3} style={MONO}>{fmtClock(s)}</text>
        </g>
      ))}
      {formats.map((f) => {
        const pts = races.map((r, i) => (raceFormat(r) === f ? `${x(i)},${y(r.total_s)}` : null)).filter(Boolean);
        return pts.length > 1
          ? <polyline key={f} fill="none" stroke={FORMAT_COLOR[f]} strokeWidth={1.6} strokeDasharray={f === "relais" ? "4 3" : undefined} points={pts.join(" ")} />
          : null;
      })}
      {projected && last && (
        <>
          <line x1={x(lastIdx)} y1={y(last.total_s)} x2={x(races.length)} y2={y(projected.midS)} stroke={C.ac} strokeWidth={1.2} strokeDasharray="3 3" />
          <rect x={x(races.length) - 22} y={y(projected.lowS)} width={44} height={Math.max(4, y(projected.highS) - y(projected.lowS))}
            rx={4} fill={alpha(C.ac, 0.12)} stroke={C.ac} strokeDasharray="3 3" strokeWidth={1} />
          <line x1={x(races.length) - 22} x2={x(races.length) + 22} y1={y(projected.midS)} y2={y(projected.midS)} stroke={C.ac} strokeWidth={1.6} />
          <text x={x(races.length) + 28} y={y(projected.midS) + 4} fontSize={12} fill={C.ac} style={MONO}>{fmtClock(projected.midS)}</text>
          <text x={x(races.length)} y={H - PB + 22} fontSize={11} textAnchor="middle" fill={C.ac}>{projected.name}</text>
          <text x={x(races.length)} y={H - PB + 36} fontSize={9.5} textAnchor="middle" fill={C.tx3} style={MONO}>{ddmm(projected.date)} · estimé</text>
        </>
      )}
      {races.map((r, i) => (
        <g key={r.id}>
          <circle cx={x(i)} cy={y(r.total_s)} r={5} fill={r.is_official ? C.rouge : C.o} stroke={C.bg} strokeWidth={1.5} />
          <text x={x(i)} y={y(r.total_s) - 11} fontSize={12} textAnchor="middle" fill={C.tx} style={MONO}>{fmtClock(r.total_s)}</text>
          <text x={x(i)} y={H - PB + 22} fontSize={11} textAnchor="middle" fill={C.tx}>{r.is_official ? r.event_name : "Simulation"}</text>
          <text x={x(i)} y={H - PB + 36} fontSize={9.5} textAnchor="middle" fill={formats.length > 1 ? FORMAT_COLOR[raceFormat(r)] : C.tx3} style={MONO}>{ddmm(r.date)}{formats.length > 1 ? ` · ${RACE_FORMAT_LABEL[raceFormat(r)]}` : ""}</text>
        </g>
      ))}
    </svg>
  );
}

function ProjectionCard({ projection, next, today, levers }: {
  projection: ReturnType<typeof raceProjection>;
  next: { name: string; date: string } | null;
  today: string;
  levers: { names: string[]; gainS: number } | null;
}) {
  const days = next ? daysUntil(next.date, today) : null;
  return (
    <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={LABEL}>Chrono estimé{next ? ` · ${next.name} ${ddmm(next.date)}` : ""}</span>
        {days != null && <span style={{ ...MONO, fontSize: 11, color: C.tx2, border: `1px solid ${C.brdL}`, borderRadius: 999, padding: "2px 8px" }}>J-{days}</span>}
      </div>
      {!projection ? (
        <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
          Pas encore d'estimation : il faut une analyse de tests HYROX (onglet Tests) avec la vitesse critique.
        </div>
      ) : (
        <>
          <div>
            <div style={{ ...MONO, fontSize: 30, color: C.ac, lineHeight: 1.1 }}>{fmtClock(projection.lowS)} – {fmtClock(projection.highS)}</div>
            <div style={{ fontSize: 13, color: C.tx2, marginTop: 6 }}>
              Valeur centrale <span style={{ ...MONO, color: C.tx }}>{fmtClock(projection.medianS)}</span>
              {" · "}fiabilité : {projection.reliability
                ? `${projection.reliability.inRange} course${projection.reliability.inRange > 1 ? "s" : ""} sur ${projection.reliability.n} dans la fourchette`
                : "— (aucune course officielle après une analyse)"}
            </div>
            {!next && <div style={{ fontSize: 12, color: C.tx3, marginTop: 4 }}>Aucune compétition HYROX à venir au calendrier.</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {([
              ["Course", fmtClock(projection.runS), "vitesse critique"],
              ["Stations", `${fmtClock(projection.stations.lowS)} – ${fmtClock(projection.stations.highS)}`, "niveau aux stations testées"],
              ["Roxzone", `${fmtClock(projection.roxzone.lowS)} – ${fmtClock(projection.roxzone.highS)}`, "athlète médian à ce chrono"],
            ] as const).map(([k, v, how]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "76px 1fr auto", gap: 10, alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${C.brd}` }}>
                <span style={{ fontSize: 13, color: C.tx }}>{k}</span>
                <span style={{ ...MONO, fontSize: 13.5, color: C.tx }}>{v}</span>
                <span style={{ fontSize: 11.5, color: C.tx3, textAlign: "right" }}>{how}</span>
              </div>
            ))}
          </div>
          {levers && (
            <div style={{ background: C.s2, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: C.tx }}>
              Si {levers.names.join(" et ")} rejoignent la médiane : <span style={{ ...MONO, color: C.g }}>−{fmtGap(levers.gainS)}</span>
            </div>
          )}
          <Sources>calcul Agon · tests du {ddmm(projection.analysisDate)} · fourchette « ma méthode » recalée sur les courses de nos athlètes</Sources>
        </>
      )}
    </div>
  );
}

/** Charge la montre d'une course et remonte l'efficacité de ses runs (une ligne par course). */
function EfficiencyLoader({ race, onData }: { race: HyroxResult; onData: (id: string, v: Array<number | null> | null, attribution: string | null) => void }) {
  const watch = useRaceWatch(race);
  const stream = watch.detail?.stream ?? null;
  const attribution = stream ? watch.detail?.attribution ?? null : null;
  useEffect(() => {
    if (watch.loading) return;
    const a = stream ? crossRaceWithWatch(race, stream, defaultRaceOffset(stream, race.total_s)) : null;
    const series = a ? runEfficiencySeries(a) : null;
    onData(race.id, series && series.some((x) => x != null) ? series : null, attribution);
  }, [watch.loading, stream, race, onData, attribution]);
  return null;
}

/** Efficacité des runs (mètres par battement, run 1 → 8), une ligne par course ; « — » sans montre. */
function EfficiencyCard({ races }: { races: HyroxResult[] }) {
  const [data, setData] = useState<Record<string, { v: Array<number | null> | null; attribution: string | null }>>({});
  const onData = useCallback((id: string, v: Array<number | null> | null, attribution: string | null) => {
    setData((d) => (d[id]?.v === v && d[id]?.attribution === attribution ? d : { ...d, [id]: { v, attribution } }));
  }, []);
  const W = 300;
  const H = 90;
  const lines = races.map((r, i) => ({ r, v: data[r.id]?.v ?? null, color: i === races.length - 1 ? C.ac : i === races.length - 2 ? C.tx : C.tx3 }));
  const all = lines.flatMap((l) => (l.v ?? []).filter((x): x is number => x != null));
  const lo = all.length ? Math.min(...all) - 0.03 : 0;
  const hi = all.length ? Math.max(...all) + 0.03 : 1;
  const x = (i: number) => 6 + (i / 7) * (W - 12);
  const y = (v: number) => 6 + (1 - (v - lo) / Math.max(0.01, hi - lo)) * (H - 12);
  const devices = [...new Set(Object.values(data).map((d) => d.attribution).filter(Boolean))];
  return (
    <div style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      {races.map((r) => <EfficiencyLoader key={r.id} race={r} onData={onData} />)}
      <span style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Efficacité des runs</span>
      <div style={{ fontSize: 11.5, color: C.tx3 }}>Mètres parcourus par battement de cœur, run 2 → run 7 (le 1 et le 8 ne se comparent pas)</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.tx2 }}>
        {lines.map((l) => <span key={l.r.id}><span style={{ display: "inline-block", width: 12, borderTop: `2px solid ${l.color}`, marginRight: 4, verticalAlign: "3px" }} />{raceShortName(l.r)}</span>)}
      </div>
      {all.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden>
          {lines.map((l) => {
            const pts = (l.v ?? []).map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
            return pts.length > 1 ? <polyline key={l.r.id} fill="none" stroke={l.color} strokeWidth={1.6} points={pts.join(" ")} /> : null;
          })}
        </svg>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {lines.map((l) => {
          const first = l.v ? l.v.find((v) => v != null) ?? null : null;
          const lastV = l.v ? [...l.v].reverse().find((v) => v != null) ?? null : null;
          const pct = first != null && lastV != null ? Math.round((lastV / first - 1) * 100) : null;
          return (
            <div key={l.r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
              <span style={{ color: C.tx }}>{raceShortName(l.r)}</span>
              <span style={{ ...MONO, color: C.tx2 }}>{first != null && lastV != null ? `${comma2(first)} → ${comma2(lastV)}` : "—"}</span>
              <span style={{ ...MONO, color: pct == null ? C.tx3 : pct < 0 ? C.o : C.g, minWidth: 44, textAlign: "right" }}>
                {pct == null ? "—" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %`}
              </span>
            </div>
          );
        })}
      </div>
      <Sources>{devices.length ? devices.join(", ") : "montre"} · calcul Agon · « — » : pas de FC enregistrée pour cette course</Sources>
    </div>
  );
}
