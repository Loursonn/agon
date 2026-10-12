import { useState, useMemo } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { runStats, runSplits, roxzoneTotal, bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { RUN_KEYS, REFERENCE_DIVISION, SEGMENT_LABEL, STATION_META, type HyroxDivision } from "@/features/shared/types/hyrox";
import { formatMmSs, formatDelta } from "@/lib/time";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  BarChart, Bar, CartesianGrid,
} from "recharts";

export default function RunsView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();

  const officialRaces = races.filter(r => r.is_official && r.status === "finished");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;

  const race = officialRaces[selectedIdx];
  if (!race) return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course officielle.</div>;

  const splits = runSplits(race);
  const stats = runStats(race);
  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);

  // Reference runs for the bracket
  const refRuns = RUN_KEYS.map(k => {
    const ref = refLookup(refDiv, k, bracket) ?? refLookup(refDiv, k, "all");
    return ref?.p50_s ?? null;
  });

  // Station that precedes each run (run_1 = start, run_2 = after ski, etc.)
  const PRECEDING_STATION = ["Départ", "SkiErg", "Sled push", "Sled pull", "BBJ", "Rameur", "Farmers carry", "Sandbag lunges"];

  // Chart data
  const chartData = RUN_KEYS.map((k, i) => ({
    name: `Run ${i + 1}`,
    athlete: splits[i],
    reference: refRuns[i],
  }));

  // Roxzone data
  const rox = roxzoneTotal(race);
  const roxSplits = race.roxzone_splits as number[] | null;

  // Roxzone evolution over races
  const roxEvolution = races.slice().reverse().map(r => ({
    date: r.date,
    rox: roxzoneTotal(r),
  })).filter(d => d.rox != null);

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginTop: 16, marginBottom: 12 }}>Runs et Roxzone</div>

      {/* Race selector */}
      <select
        value={selectedIdx}
        onChange={e => setSelectedIdx(Number(e.target.value))}
        style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", marginBottom: 12 }}
      >
        {officialRaces.map((r, i) => (
          <option key={r.id} value={i}>{r.event_name} — {r.date} — {formatMmSs(r.total_s, { hours: true })}</option>
        ))}
      </select>

      {/* Run splits chart */}
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 8px", marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.brd} />
            <XAxis dataKey="name" tick={{ fill: C.tx3, fontSize: 10 }} />
            <YAxis domain={[150, 'auto']} tick={{ fill: C.tx3, fontSize: 10 }} tickFormatter={v => formatMmSs(v)} />
            <Tooltip
              contentStyle={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 4, fontSize: 11, color: C.tx }}
              formatter={(v: number) => formatMmSs(v)}
            />
            <Line type="monotone" dataKey="athlete" stroke={C.ac} strokeWidth={2} dot={{ r: 3, fill: C.ac }} name="Athlète" />
            <Line type="monotone" dataKey="reference" stroke={C.tx3} strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Référence" />
            {stats.avg27 != null && (
              <ReferenceLine y={stats.avg27} stroke={C.b} strokeDasharray="3 3" label={{ value: `Moy. R2-7 ${formatMmSs(stats.avg27)}`, fill: C.b, fontSize: 10 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Runs 2-7 analysis (core — same distance, comparable) */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 6 }}>Analyse Runs 2 à 7 <span style={{ fontWeight: 400, color: C.tx3 }}>(distance identique, comparable)</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        <StatCard label="Moyenne R2-7" value={stats.avg27 != null ? formatMmSs(stats.avg27) : "—"} color={C.ac} />
        <StatCard label="Fade (R2→R7)" value={stats.fade27 != null ? formatDelta(stats.fade27) : "—"} color={stats.fade27 != null && stats.fade27 > 60 ? C.r : C.tx} />
        <StatCard label="Fade index R2-7" value={stats.fadeIndex27Pct != null ? stats.fadeIndex27Pct + " %" : "—"} color={stats.fadeIndex27Pct != null && stats.fadeIndex27Pct > 15 ? C.o : C.tx} />
        <StatCard label="Meilleur (R2-7)" value={stats.best27 ? `Run ${stats.best27.index + 1} (${formatMmSs(stats.best27.s)})` : "—"} color={C.g} />
        <StatCard label="Pire (R2-7)" value={stats.worst27 ? `Run ${stats.worst27.index + 1} (${formatMmSs(stats.worst27.s)})` : "—"} color={C.r} />
        <StatCard label="Δ mi-courses" value={stats.halvesDelta != null ? formatDelta(stats.halvesDelta) : "—"} color={stats.halvesDelta != null && stats.halvesDelta > 20 ? C.o : C.tx} />
      </div>

      {/* Runs 1 & 8 apart (course-dependent distance) */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 6 }}>Runs 1 et 8 <span style={{ fontWeight: 400, color: C.tx3 }}>(distance variable selon le parcours)</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        <StatCard label="Run 1" value={splits[0] != null ? formatMmSs(splits[0]) : "—"} color={C.tx} />
        <StatCard label="Run 8" value={splits[7] != null ? formatMmSs(splits[7]) : "—"} color={C.tx} />
        <StatCard label="Drop (R1→R2)" value={stats.drop12 != null ? formatDelta(stats.drop12) : "—"} color={stats.drop12 != null && stats.drop12 > 60 ? C.o : C.tx} />
      </div>

      {/* Per-run detail */}
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10 }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Run</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Split</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Réf.</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Après</th>
            </tr>
          </thead>
          <tbody>
            {RUN_KEYS.map((k, i) => {
              const isEdge = i === 0 || i === 7;
              return (
                <tr key={k} style={{ borderBottom: "1px solid " + C.brd, opacity: isEdge ? 0.6 : 1 }}>
                  <td style={{ padding: "6px 8px", color: C.tx, fontWeight: 600 }}>
                    {SEGMENT_LABEL[k]}
                    {isEdge && <span style={{ fontSize: 9, color: C.tx3, fontWeight: 400, marginLeft: 4 }}>*</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>{formatMmSs(splits[i])}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: C.tx3 }}>{formatMmSs(refRuns[i])}</td>
                  <td style={{ padding: "6px 8px", color: C.tx3 }}>{PRECEDING_STATION[i]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "4px 8px 6px", fontSize: 9, color: C.tx3 }}>
          * Runs 1 et 8 : distance variable selon le parcours — non inclus dans l'analyse R2-7
        </div>
      </div>

      {/* Roxzone section */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Roxzone</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <StatCard label="Total" value={rox != null ? formatMmSs(rox) : "—"} color={C.tx} />
        <StatCard label="% du total" value={rox != null ? Math.round(rox / race.total_s * 1000) / 10 + " %" : "—"} color={C.tx} />
        <StatCard label="Par transition" value={rox != null ? formatMmSs(Math.round(rox / 8)) : "—"} color={C.tx} />
      </div>

      {/* Roxzone splits bar chart */}
      {roxSplits && roxSplits.length > 0 && (
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 8px", marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={roxSplits.map((v, i) => ({ name: `T${i + 1}`, value: v }))}>
              <XAxis dataKey="name" tick={{ fill: C.tx3, fontSize: 10 }} />
              <YAxis tick={{ fill: C.tx3, fontSize: 10 }} tickFormatter={v => formatMmSs(v)} />
              <Bar dataKey="value" fill={C.tx3} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Roxzone evolution */}
      {roxEvolution.length > 1 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>Évolution Roxzone</div>
          <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 8px" }}>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={roxEvolution} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: C.tx3, fontSize: 9 }} />
                <YAxis tick={{ fill: C.tx3, fontSize: 10 }} tickFormatter={v => formatMmSs(v)} />
                <Line type="monotone" dataKey="rox" stroke={C.tx3} strokeWidth={2} dot={{ r: 3, fill: C.tx3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}
