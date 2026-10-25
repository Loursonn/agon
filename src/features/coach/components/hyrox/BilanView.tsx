import { useMemo } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import {
  percentile, runTotal, stationsTotal, roxzoneTotal, bracketOf, typology,
  runStats, shares, stationPriorities, formatAvgPerRun, type RefLookup,
} from "@/lib/hyrox/calc";
import {
  STATION_KEYS, STATION_META, SEGMENT_LABEL, REFERENCE_DIVISION, RUN_KEYS,
  type StationKey, type HyroxDivision,
} from "@/features/shared/types/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { formatMmSs, formatDelta } from "@/lib/time";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const PROFILE_LABEL = { runner: "Runner", hybrid: "Hybride", powerhouse: "Powerhouse" };
const PROFILE_EMOJI = { runner: "🏃", hybrid: "⚖️", powerhouse: "💪" };

// ── Trend helper ────────────────────────────────────────────────────────────

type Trend = "improving" | "stable" | "declining";

function linearTrend(values: number[]): { trend: Trend; delta: number } {
  if (values.length < 2) return { trend: "stable", delta: 0 };
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den !== 0 ? num / den : 0;
  const totalDelta = slope * (n - 1); // predicted change over all races
  const threshold = my * 0.02; // 2% of mean = significant
  if (totalDelta < -threshold) return { trend: "improving", delta: totalDelta };
  if (totalDelta > threshold) return { trend: "declining", delta: totalDelta };
  return { trend: "stable", delta: totalDelta };
}

const TREND_ICON: Record<Trend, string> = { improving: "↗", stable: "→", declining: "↘" };
const TREND_COLOR: Record<Trend, string> = { improving: C.g, stable: C.tx3, declining: C.r };

// ── Segment percentile aggregation ──────────────────────────────────────────

type SegmentSummary = {
  key: string;
  label: string;
  avgPct: number;
  bestPct: number;
  trend: Trend;
  trendDelta: number;
  latestVal: number | null;
};

function buildSegmentSummaries(
  races: HyroxResult[],
  refLookup: RefLookup,
): SegmentSummary[] {
  if (races.length === 0) return [];
  const latest = races[0];
  const refDiv = REFERENCE_DIVISION(latest.division as HyroxDivision);
  const chronological = [...races].reverse();

  const segments: { key: string; label: string; getter: (r: HyroxResult) => number | null }[] = [
    { key: "run_total", label: "Course totale", getter: runTotal },
    ...STATION_KEYS.map(k => ({
      key: k,
      label: STATION_META[k].label,
      getter: (r: HyroxResult) => (r as Record<string, unknown>)[k + "_s"] as number | null,
    })),
    { key: "roxzone_total", label: "Roxzone", getter: roxzoneTotal },
  ];

  return segments.map(seg => {
    const vals: number[] = [];
    const pcts: number[] = [];

    for (const r of chronological) {
      const v = seg.getter(r);
      if (v == null) continue;
      vals.push(v);
      const bracket = bracketOf(r.total_s);
      const ref = refLookup(refDiv, seg.key, bracket);
      if (ref) {
        const p = percentile(v, ref);
        if (p != null) pcts.push(p);
      }
    }

    const { trend, delta } = linearTrend(vals);
    const avgPct = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 99;
    const bestPct = pcts.length > 0 ? Math.min(...pcts) : 99;
    const latestVal = vals.length > 0 ? vals[vals.length - 1] : null;

    return { key: seg.key, label: seg.label, avgPct, bestPct, trend, trendDelta: delta, latestVal };
  });
}

// ── Main component ──────────────────────────────────────────────────────────

export default function BilanView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();

  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  const officialRaces = useMemo(
    () => races.filter(r => r.is_official && r.status === "finished"),
    [races],
  );

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;
  if (officialRaces.length === 0) return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course officielle pour afficher le bilan.</div>;

  const record = officialRaces.reduce((a, b) => a.total_s < b.total_s ? a : b);
  const latest = officialRaces[0];
  const chronological = [...officialRaces].reverse();

  const refDiv = REFERENCE_DIVISION(latest.division as HyroxDivision);
  const bracket = bracketOf(record.total_s);

  // Global percentile (on record)
  const totalRef = refLookup(refDiv, "total", bracket);
  const globalPct = totalRef ? percentile(record.total_s, totalRef) : null;

  // Typology on latest
  const runRef = refLookup(refDiv, "run_total", bracket);
  const rt = runTotal(latest);
  const pctRun = runRef && rt != null ? percentile(rt, runRef) : null;
  const stationPcts = STATION_KEYS.map(k => {
    const v = (latest as Record<string, unknown>)[k + "_s"] as number | null;
    const ref = refLookup(refDiv, k, bracketOf(latest.total_s));
    return v != null && ref ? percentile(v, ref) : null;
  }).filter(v => v != null) as number[];
  const pctStations = stationPcts.length > 0 ? stationPcts.reduce((a, b) => a + b, 0) / stationPcts.length : null;
  const typo = typology(pctRun, pctStations);

  // Progression trend
  const totalTrend = linearTrend(chronological.map(r => r.total_s));
  const progressionDelta = officialRaces.length >= 2 ? latest.total_s - record.total_s : null;

  // Segment summaries
  const summaries = buildSegmentSummaries(officialRaces, refLookup);
  const sorted = [...summaries].sort((a, b) => a.avgPct - b.avgPct);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3).reverse();

  // Pacing (latest race)
  const latestRunStats = runStats(latest);
  const latestShares = shares(latest);

  // Chart data
  const chartData = chronological.map(r => ({
    name: r.date.slice(5), // MM-DD
    total: Math.round(r.total_s),
    label: r.event_name,
  }));

  // Coach auto-assessment
  const assessment = generateAssessment({
    officialRaces, record, latest, globalPct, typo, totalTrend,
    strengths, weaknesses, latestRunStats, latestShares, summaries,
  });

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginTop: 16, marginBottom: 16 }}>Bilan global</div>

      {/* ── Header stats ──────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <StatCard label="Courses" value={String(officialRaces.length)} sub={`${chronological[0].date} → ${chronological[chronological.length - 1].date}`} />
        <StatCard label="Record" value={formatMmSs(record.total_s, { hours: true })} sub={record.event_name + " — " + record.date} color={C.g} />
        <StatCard label="Dernier" value={formatMmSs(latest.total_s, { hours: true })} sub={latest.event_name + " — " + latest.date} />
        {globalPct != null && (
          <StatCard label="Classement global" value={`Top ${globalPct} %`} sub={`vs ${refDiv} ${BRACKET_LABEL[bracket]}`} color={pctColor(globalPct)} />
        )}
        {typo && (
          <StatCard label="Profil" value={PROFILE_LABEL[typo]} sub={PROFILE_EMOJI[typo] + " basé sur dernière course"} />
        )}
        <StatCard
          label="Tendance"
          value={TREND_ICON[totalTrend.trend] + " " + (totalTrend.trend === "improving" ? "Progression" : totalTrend.trend === "declining" ? "Régression" : "Stable")}
          sub={totalTrend.delta !== 0 ? formatDelta(totalTrend.delta) + " / course (tendance)" : ""}
          color={TREND_COLOR[totalTrend.trend]}
        />
      </div>

      {/* ── Progression chart ─────────────────────────────────────── */}
      {chartData.length >= 2 && (
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Évolution du total</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <XAxis dataKey="name" tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => formatMmSs(v, { hours: true })}
                domain={["dataMin - 60", "dataMax + 60"]}
              />
              <Tooltip
                contentStyle={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: C.tx, fontWeight: 700 }}
                formatter={(v: number) => [formatMmSs(v, { hours: true }), "Total"]}
              />
              <ReferenceLine y={record.total_s} stroke={C.g} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="total" stroke={C.ac} strokeWidth={2} dot={{ r: 4, fill: C.ac }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Forces & Faiblesses ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.g, marginBottom: 8 }}>🟢 Points forts</div>
          {strengths.map((s, i) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < 2 ? "1px solid " + C.brd : "none" }}>
              <span style={{ fontSize: 11, color: C.tx }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.g }}>Top {s.avgPct} %</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.r, marginBottom: 8 }}>🔴 Axes d'amélioration</div>
          {weaknesses.map((w, i) => (
            <div key={w.key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < 2 ? "1px solid " + C.brd : "none" }}>
              <span style={{ fontSize: 11, color: C.tx }}>{w.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.r }}>Top {w.avgPct} %</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Segment evolution table ───────────────────────────────── */}
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, padding: "10px 12px 6px" }}>Évolution par segment</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10 }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Segment</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Dernier</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Moy. %ile</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Meilleur %ile</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Tendance</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map(s => (
              <tr key={s.key} style={{ borderBottom: "1px solid " + C.brd }}>
                <td style={{ padding: "6px 8px", color: C.tx }}>{s.label}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>
                  {formatMmSs(s.latestVal)}
                  {s.key === "run_total" && s.latestVal != null && (
                    <div style={{ fontSize: 9, color: C.tx3 }}>{formatAvgPerRun(s.latestVal / RUN_KEYS.length)}</div>
                  )}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: pctColor(s.avgPct) }}>
                  Top {s.avgPct} %
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: pctColor(s.bestPct) }}>
                  Top {s.bestPct} %
                </td>
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: TREND_COLOR[s.trend] }}>
                  {TREND_ICON[s.trend]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Coach auto-assessment ─────────────────────────────────── */}
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Avis global</div>
        {assessment.map((line, i) => (
          <p key={i} style={{ fontSize: 12, color: C.tx2, lineHeight: 1.6, margin: "0 0 8px" }}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const BRACKET_LABEL: Record<string, string> = { sub70: "sub 1h10", "70_80": "1h10-1h20", "80_90": "1h20-1h30", "90_plus": "1h30+" };

function pctColor(pct: number): string {
  if (pct <= 25) return C.g;
  if (pct <= 50) return C.ac;
  if (pct <= 75) return C.o;
  return C.r;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color ?? C.tx, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Auto-assessment generator ───────────────────────────────────────────────

function generateAssessment(ctx: {
  officialRaces: HyroxResult[];
  record: HyroxResult;
  latest: HyroxResult;
  globalPct: number | null;
  typo: "runner" | "hybrid" | "powerhouse" | null;
  totalTrend: { trend: Trend; delta: number };
  strengths: SegmentSummary[];
  weaknesses: SegmentSummary[];
  latestRunStats: ReturnType<typeof runStats>;
  latestShares: ReturnType<typeof shares>;
  summaries: SegmentSummary[];
}): string[] {
  const { officialRaces, record, latest, globalPct, typo, totalTrend, strengths, weaknesses, latestRunStats, latestShares } = ctx;
  const lines: string[] = [];

  // Line 1: global level
  const levelLabel = globalPct != null
    ? globalPct <= 10 ? "élite" : globalPct <= 25 ? "avancé" : globalPct <= 50 ? "intermédiaire confirmé" : globalPct <= 75 ? "intermédiaire" : "en développement"
    : null;
  if (levelLabel && globalPct != null) {
    lines.push(`Niveau ${levelLabel} (Top ${globalPct} %) avec un record à ${formatMmSs(record.total_s, { hours: true })} sur ${officialRaces.length} course${officialRaces.length > 1 ? "s" : ""} officielle${officialRaces.length > 1 ? "s" : ""}.`);
  }

  // Line 2: profile
  if (typo) {
    const descs = {
      runner: "Profil Runner : course et endurance au-dessus de la moyenne, stations à renforcer.",
      hybrid: "Profil Hybride : équilibre entre course et stations. Marge de progression sur les deux axes.",
      powerhouse: "Profil Powerhouse : solide sur les stations, mais course en retrait. Travailler la VMA et l'endurance.",
    };
    lines.push(descs[typo]);
  }

  // Line 3: progression
  if (officialRaces.length >= 2) {
    if (totalTrend.trend === "improving") {
      const delta = Math.abs(Math.round(totalTrend.delta));
      lines.push(`Tendance en progression : gain moyen de ${formatMmSs(delta)} sur la trajectoire globale. Bon momentum.`);
    } else if (totalTrend.trend === "declining") {
      lines.push("Tendance en régression : les temps augmentent. Vérifier la charge d'entraînement, la récupération et la gestion de course.");
    } else {
      lines.push("Temps stables sur les dernières courses. Pour franchir un palier, cibler les axes d'amélioration ci-dessous.");
    }
  }

  // Line 4: strengths & weaknesses
  if (strengths.length > 0 && weaknesses.length > 0) {
    const s = strengths.map(x => x.label).join(", ");
    const w = weaknesses.map(x => x.label).join(", ");
    lines.push(`Points forts : ${s}. Axes prioritaires : ${w}.`);
  }

  // Line 5: pacing
  if (latestRunStats.fadeIndex27Pct != null) {
    if (latestRunStats.fadeIndex27Pct > 15) {
      lines.push(`Pacing à améliorer : ${latestRunStats.fadeIndex27Pct} % d'écart entre meilleur et pire run (R2-7). Objectif : < 10 % pour un negative split propre.`);
    } else if (latestRunStats.fadeIndex27Pct <= 8) {
      lines.push(`Excellent pacing : seulement ${latestRunStats.fadeIndex27Pct} % d'écart entre runs (R2-7). Gestion de course maîtrisée.`);
    } else {
      lines.push(`Pacing correct (${latestRunStats.fadeIndex27Pct} % d'écart R2-7). Marge pour être plus régulier.`);
    }
  }

  // Line 6: roxzone
  if (latestShares.roxzone != null) {
    if (latestShares.roxzone > 7) {
      lines.push(`Roxzone à ${latestShares.roxzone} % du total — au-dessus de 7 %. Travailler les transitions.`);
    } else {
      lines.push(`Roxzone à ${latestShares.roxzone} % du total — bien maîtrisée.`);
    }
  }

  return lines;
}
