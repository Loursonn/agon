import { ArrowLeft } from "lucide-react";
import { C } from "@/lib/theme";
import { AXES, fmtHm, fmtTime, fr, gridRowFor, type HyroxTestAnalysisRow, type MetricKey, type StoredOutputs } from "@/lib/hyrox/tests";
import { useGridSet } from "@/features/shared/hooks/hyrox/useHyroxTests";
import HyroxRadar from "../HyroxRadar";
import { Card, Muted, NoteBadge, SectionTitle } from "./ui";
import { fmtDate, fmtThreshold, kindLabel } from "./format";

function Delta({ a, b, higherBetter, fmt }: { a: number | null | undefined; b: number | null | undefined; higherBetter: boolean | null; fmt: (x: number) => string }) {
  if (a == null || b == null) return <span style={{ color: C.tx3 }}>—</span>;
  const d = b - a;
  if (Math.abs(d) < 1e-9) return <span style={{ color: C.tx3 }}>=</span>;
  const good = higherBetter == null ? null : higherBetter ? d > 0 : d < 0;
  return <span style={{ color: good == null ? C.tx2 : good ? C.g : C.r, fontWeight: 700 }}>{d > 0 ? "+" : "−"}{fmt(Math.abs(d))}</span>;
}

const rowStyle = { display: "grid", gridTemplateColumns: "minmax(140px, 2fr) 1fr 1fr 1fr", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid " + C.brd, fontSize: 12 } as const;

/** Bilan vs retest : deux analyses du même athlète, écarts colorés (vert = mieux). */
export default function CompareAnalyses({ a, b, onBack }: { a: HyroxTestAnalysisRow; b: HyroxTestAnalysisRow; onBack: () => void }) {
  const [older, newer] = a.date <= b.date ? [a, b] : [b, a];
  const oa = older.outputs as unknown as StoredOutputs, ob = newer.outputs as unknown as StoredOutputs;
  const { data: set } = useGridSet(newer.grid_version);
  const keys = [...new Set([...ob.scores.measures, ...oa.scores.measures].filter(m => !m.reading).map(m => m.key))];
  const radar = (o: StoredOutputs) => AXES.map(x => ({ key: x.key, label: x.label === "Système cardio-respiratoire" ? "Cardio-respiratoire" : x.label, value: o.scores.axes.find(y => y.key === x.key)?.score == null ? null : (o.scores.axes.find(y => y.key === x.key)!.score as number) * 20 }));
  const ra = oa.scores.running, rb = ob.scores.running;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
          <ArrowLeft size={18} color={C.tx2} />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{kindLabel(older.kind)} {fmtDate(older.date)} → {kindLabel(newer.kind)} {fmtDate(newer.date)}</div>
          {older.grid_version !== newer.grid_version && <Muted style={{ color: C.o }}>Grilles différentes ({older.grid_version} / {newer.grid_version}) : les notes ne se comparent pas directement, les valeurs oui.</Muted>}
        </div>
      </div>

      <SectionTitle>Radar</SectionTitle>
      <HyroxRadar height={300} series={[{ name: fmtDate(older.date), color: C.b, axes: radar(oa) }, { name: fmtDate(newer.date), color: C.ac, axes: radar(ob) }]} />

      <SectionTitle>Chrono et course</SectionTitle>
      <Card>
        <div style={{ ...rowStyle, borderTop: "none", color: C.tx3, fontSize: 11 }}><span /><span>{fmtDate(older.date)}</span><span>{fmtDate(newer.date)}</span><span>Écart</span></div>
        <div style={rowStyle}><span style={{ color: C.tx }}>Chrono estimé</span><span>{fmtHm(oa.chrono?.median_s)}</span><span>{fmtHm(ob.chrono?.median_s)}</span><Delta a={oa.chrono?.median_s} b={ob.chrono?.median_s} higherBetter={false} fmt={fmtTime} /></div>
        <div style={rowStyle}><span style={{ color: C.tx }}>Vitesse critique</span><span>{fr(ra.cs_kmh)} km/h</span><span>{fr(rb.cs_kmh)} km/h</span><Delta a={ra.cs_kmh} b={rb.cs_kmh} higherBetter fmt={x => `${fr(x)} km/h`} /></div>
        <div style={rowStyle}><span style={{ color: C.tx }}>Seuil 1</span><span>{fr(ra.s1_kmh)} km/h</span><span>{fr(rb.s1_kmh)} km/h</span><Delta a={ra.s1_kmh} b={rb.s1_kmh} higherBetter fmt={x => `${fr(x)} km/h`} /></div>
        <div style={rowStyle}><span style={{ color: C.tx }}>FC seuil</span><span>{ra.hr_threshold ? Math.round(ra.hr_threshold) : "—"}</span><span>{rb.hr_threshold ? Math.round(rb.hr_threshold) : "—"}</span><Delta a={ra.hr_threshold} b={rb.hr_threshold} higherBetter={null} fmt={x => `${Math.round(x)} bpm`} /></div>
      </Card>

      <SectionTitle>Axes</SectionTitle>
      <Card>
        {AXES.map(x => {
          const sa = oa.scores.axes.find(y => y.key === x.key)?.score ?? null, sb = ob.scores.axes.find(y => y.key === x.key)?.score ?? null;
          return (
            <div key={x.key} style={rowStyle}>
              <span style={{ color: C.tx }}>{x.label}</span><NoteBadge note={sa} /><NoteBadge note={sb} />
              <Delta a={sa} b={sb} higherBetter fmt={v => fr(v, 1)} />
            </div>
          );
        })}
      </Card>

      <SectionTitle>Mesures</SectionTitle>
      <Card>
        {keys.map(k => {
          const ma = oa.scores.measures.find(m => m.key === k), mb = ob.scores.measures.find(m => m.key === k);
          const row = set ? gridRowFor(set, k as MetricKey, newer.profile.sex, newer.profile.category) : null;
          return (
            <div key={k} style={rowStyle}>
              <span style={{ color: C.tx }}>{(mb ?? ma)!.label}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><NoteBadge note={ma?.note} size={18} />{ma?.value == null ? "—" : fmtThreshold(k, ma.value)}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><NoteBadge note={mb?.note} size={18} />{mb?.value == null ? "—" : fmtThreshold(k, mb.value)}</span>
              <Delta a={ma?.value} b={mb?.value} higherBetter={row ? row.direction === "higher" : null} fmt={v => fmtThreshold(k, v)} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
