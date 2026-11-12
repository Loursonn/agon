import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { ROUGE, TYPE_COLOR } from "@/lib/peps";
import { isFreshResult } from "@/lib/testEntry";
import {
  TEST_GROUP_LABEL, displayUnit, fmtTestDate, formatPace, formatTestDelta, formatTestValue, paceAtVma, type TestValueCard,
} from "@/lib/athleteTestValues";


type Range = "6m" | "1y" | "all";
const RANGES: Array<{ k: Range; label: string; days: number | null }> = [
  { k: "6m", label: "6 mois", days: 183 },
  { k: "1y", label: "1 an", days: 365 },
  { k: "all", label: "Tout", days: null },
];

const label10 = { ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.tx3 };

/**
 * Détail d'une valeur de test (maquette « Tests athlète · détail VMA ») :
 * dernière valeur et record, progression depuis le 1er test, graphique
 * (chaque point = un test avec sa valeur et sa date), liste des tests ;
 * pour la VMA, les allures qui en découlent.
 */
export function TestDetailView({ card, color, onBack }: { card: TestValueCard; color: string; onBack: () => void }) {
  const [range, setRange] = useState<Range>("all");
  const unit = displayUnit(card.unit, card.valueType);
  const first = card.history[0];
  const since = card.history.length > 1 ? card.latest.value - first.value : null;
  const sincePct = since != null && first.value !== 0 ? Math.round((since / Math.abs(first.value)) * 100) : null;
  const prev = card.history.length > 1 ? card.history[card.history.length - 2] : null;
  const sinceBetter = since == null || since === 0 ? null : card.betterWhen === "lower" ? since < 0 : since > 0;
  const isVma = /\bvma\b/i.test(card.label) && /km\/?h/i.test(card.unit);

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.k === range)?.days ?? null;
    const from = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : "";
    return card.history
      .filter((p) => p.date >= from)
      .map((p) => ({ date: p.date, value: p.value, short: fmtTestDate(p.date, false), shown: formatTestValue(p.value, card.valueType) }));
  }, [card, range]);

  const rows = [...card.history].reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" onClick={onBack} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ‹ Tests
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ ...DISPLAY, fontSize: 28, margin: 0, color: C.tx }}>{card.title}</h1>
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: color, borderRadius: 999, padding: "3px 9px" }}>
            {TEST_GROUP_LABEL[card.group]}
          </span>
        </div>
        <span style={{ fontSize: 13, color: C.tx2 }}>
          {card.title !== card.label ? `${card.label} · ` : ""}{unit ? `${unit} · ` : ""}{card.betterWhen === "lower" ? "plus bas = mieux" : "plus haut = mieux"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ borderRadius: 14, border: `1px solid ${color}73`, background: `${color}1F`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label10}>Dernière valeur</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ ...MONO, fontSize: 30, lineHeight: 1, color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
            <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{unit}</span>
          </span>
          <span style={{ fontSize: 11.5, color: C.tx3 }}>{fmtTestDate(card.latest.date)}</span>
          {prev && card.delta != null && (
            <span style={{ ...MONO, fontSize: 11, color: card.improved === false ? ROUGE : card.improved ? TYPE_COLOR.fait : C.tx2 }}>
              {formatTestDelta(card.delta, card.valueType)} vs {fmtTestDate(prev.date, false)}
            </span>
          )}
        </div>
        <div style={{ borderRadius: 14, border: `1px solid ${C.brd}`, background: C.s1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label10}>Record</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ ...MONO, fontSize: 30, lineHeight: 1, color: C.tx }}>{formatTestValue(card.best.value, card.valueType)}</span>
            <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{unit}</span>
          </span>
          <span style={{ fontSize: 11.5, color: C.tx3 }}>{fmtTestDate(card.best.date)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ borderRadius: 12, border: `1px solid ${C.brd}`, background: C.s1, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={label10}>Depuis le 1er test</span>
          <span style={{ ...MONO, fontSize: 16, color: sinceBetter == null ? C.tx : sinceBetter ? TYPE_COLOR.fait : ROUGE }}>
            {since == null ? "—" : `${formatTestDelta(since, card.valueType)}${unit && card.valueType === "number" ? " " + unit : ""}`}
            {sincePct != null && card.valueType === "number" ? <span style={{ fontSize: 12, color: C.tx3 }}> ({sincePct > 0 ? "+" : sincePct < 0 ? "−" : ""}{Math.abs(sincePct)} %)</span> : null}
          </span>
        </div>
        <div style={{ borderRadius: 12, border: `1px solid ${C.brd}`, background: C.s1, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={label10}>Tests faits</span>
          <span style={{ ...MONO, fontSize: 16, color: C.tx }}>{card.history.length}</span>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={label10}>Évolution</span>
          <div style={{ display: "flex", gap: 4 }}>
            {RANGES.map((r) => (
              <button
                key={r.k}
                type="button"
                aria-pressed={range === r.k}
                onClick={() => setRange(r.k)}
                style={{ height: 28, padding: "0 10px", borderRadius: 999, border: `1px solid ${range === r.k ? color : C.brdL}`, background: range === r.k ? color + "26" : "transparent", color: range === r.k ? color : C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 14, border: `1px solid ${C.brd}`, background: C.s1, padding: "14px 8px 6px" }}>
          {data.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.tx3 }}>Aucun test sur cette période.</div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={data} margin={{ top: 22, right: 18, left: 18, bottom: 4 }}>
                <CartesianGrid stroke="rgba(231,211,168,0.08)" vertical={false} />
                <XAxis dataKey="short" tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis hide domain={["auto", "auto"]} reversed={card.betterWhen === "lower"} />
                <Tooltip
                  contentStyle={{ background: C.bg, border: `1px solid ${C.brdL}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.tx3 }}
                  formatter={(_v, _n, p) => [`${(p?.payload as { shown?: string })?.shown ?? ""} ${unit}`, card.label]}
                />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color, stroke: C.bg, strokeWidth: 2 }} isAnimationActive={false}>
                  <LabelList dataKey="shown" position="top" style={{ ...MONO, fill: C.tx, fontSize: 11 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <span style={{ fontSize: 12, color: C.tx3 }}>Chaque point = un test, avec sa valeur et sa date.</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={label10}>Tous mes tests {card.title} · {card.history.length}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((p, i) => {
            const before = rows[i + 1];
            const d = before ? p.value - before.value : null;
            const better = d == null || d === 0 ? null : card.betterWhen === "lower" ? d < 0 : d > 0;
            return (
              <div key={p.resultId + p.date} style={{ borderRadius: 12, border: `1px solid ${C.brd}`, background: C.s1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: C.tx2, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    {fmtTestDate(p.date)}
                    {isFreshResult(p.createdAt) && (
                      <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 999, background: C.ac, color: C.bg, ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>Nouveau</span>
                    )}
                  </span>
                  <span style={{ ...MONO, fontSize: 16, color: C.tx }}>{formatTestValue(p.value, card.valueType)}</span>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{unit}</span>
                  <span style={{ ...MONO, fontSize: 11, minWidth: 44, textAlign: "right", color: better == null ? C.tx3 : better ? TYPE_COLOR.fait : ROUGE }}>
                    {formatTestDelta(d, card.valueType)}
                  </span>
                </div>
                {((p.testName && p.testName !== card.title) || p.feeling) && (
                  <span style={{ fontSize: 11.5, color: C.tx3 }}>
                    {[p.testName && p.testName !== card.title ? p.testName : null, p.feeling ? `ressenti ${p.feeling} / 5` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                {(p.comment || p.notes) && <span style={{ fontSize: 12.5, color: C.tx2, fontStyle: "italic" }}>« {p.comment || p.notes} »</span>}
              </div>
            );
          })}
        </div>
      </section>

      {isVma && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={label10}>Tes allures, calculées sur {formatTestValue(card.latest.value, "number")} km/h</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {[1, 0.9, 0.8, 0.7].map((pct) => (
              <div key={pct} style={{ borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s1, padding: "8px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ ...MONO, fontSize: 10, color: C.tx3 }}>{Math.round(pct * 100)} %</span>
                <span style={{ ...MONO, fontSize: 16, color }}>{formatPace(paceAtVma(card.latest.value, pct))}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: C.tx3 }}>min / km</span>
        </section>
      )}
    </div>
  );
}
