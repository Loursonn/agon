import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { MONO } from "@/features/shared/components/seance/seanceUi";
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

const LABEL10 = "agon-mono text-[10px] uppercase tracking-[0.12em] text-agon-tx3";
/** Écart : vert si mieux, rouge si moins bien, neutre sinon. */
const deltaClass = (better: boolean | null | undefined, neutral: string) =>
  better == null ? neutral : better ? "text-agon-type-fait" : "text-agon-rouge";

/**
 * Détail d'une valeur de test (maquette « Tests athlète · détail VMA ») :
 * dernière valeur et record, progression depuis le 1er test, graphique
 * (chaque point = un test avec sa valeur et sa date), liste des tests ;
 * pour la VMA, les allures qui en découlent.
 */
export function TestDetailView({ card, color, onBack }: { card: TestValueCard; color: string; onBack?: () => void }) {
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
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="cursor-pointer self-start border-none bg-transparent p-0 text-[13px] text-agon-accent [font-family:inherit]">
            ‹ Tests
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="agon-display m-0 text-[28px] text-agon-tx">{card.title}</h1>
          <span className="agon-mono rounded-full px-[9px] py-[3px] text-[10px] uppercase tracking-[0.08em] text-agon-bg" style={{ background: color }}>
            {TEST_GROUP_LABEL[card.group]}
          </span>
        </div>
        <span className="text-[13px] text-agon-tx2">
          {card.title !== card.label ? `${card.label} · ` : ""}{unit ? `${unit} · ` : ""}{card.betterWhen === "lower" ? "plus bas = mieux" : "plus haut = mieux"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div className="flex flex-col gap-1.5 rounded-[14px] border px-3.5 py-3" style={{ borderColor: `${color}73`, background: `${color}1F` }}>
          <span className={LABEL10}>Dernière valeur</span>
          <span className="flex items-baseline gap-[5px]">
            <span className="agon-mono text-[30px] leading-none" style={{ color }}>{formatTestValue(card.latest.value, card.valueType)}</span>
            <span className="agon-mono text-[11px] text-agon-tx2">{unit}</span>
          </span>
          <span className="text-[11.5px] text-agon-tx3">{fmtTestDate(card.latest.date)}</span>
          {prev && card.delta != null && (
            <span className={cn("agon-mono text-[11px]", deltaClass(card.improved, "text-agon-tx2"))}>
              {formatTestDelta(card.delta, card.valueType)} vs {fmtTestDate(prev.date, false)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-agon-brd bg-agon-s1 px-3.5 py-3">
          <span className={LABEL10}>Record</span>
          <span className="flex items-baseline gap-[5px]">
            <span className="agon-mono text-[30px] leading-none text-agon-tx">{formatTestValue(card.best.value, card.valueType)}</span>
            <span className="agon-mono text-[11px] text-agon-tx2">{unit}</span>
          </span>
          <span className="text-[11.5px] text-agon-tx3">{fmtTestDate(card.best.date)}</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div className="flex flex-col gap-1 rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-2.5">
          <span className={LABEL10}>Depuis le 1er test</span>
          <span className={cn("agon-mono text-[16px]", deltaClass(sinceBetter, "text-agon-tx"))}>
            {since == null ? "—" : `${formatTestDelta(since, card.valueType)}${unit && card.valueType === "number" ? " " + unit : ""}`}
            {sincePct != null && card.valueType === "number" ? <span className="text-[12px] text-agon-tx3"> ({sincePct > 0 ? "+" : sincePct < 0 ? "−" : ""}{Math.abs(sincePct)} %)</span> : null}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-2.5">
          <span className={LABEL10}>Tests faits</span>
          <span className="agon-mono text-[16px] text-agon-tx">{card.history.length}</span>
        </div>
      </div>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL10}>Évolution</span>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.k}
                type="button"
                aria-pressed={range === r.k}
                onClick={() => setRange(r.k)}
                className={cn(
                  "h-7 cursor-pointer rounded-full border px-2.5 text-[12px] [font-family:inherit]",
                  range !== r.k && "border-agon-brd-l bg-transparent text-agon-tx2",
                )}
                style={range === r.k ? { borderColor: color, background: color + "26", color } : undefined}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-agon-brd bg-agon-s1 px-2 pb-1.5 pt-3.5">
          {data.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-agon-tx3">Aucun test sur cette période.</div>
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
        <span className="text-[12px] text-agon-tx3">Chaque point = un test, avec sa valeur et sa date.</span>
      </section>

      <section className="flex flex-col gap-2.5">
        <span className={LABEL10}>Tous mes tests {card.title} · {card.history.length}</span>
        <div className="flex flex-col gap-2">
          {rows.map((p, i) => {
            const before = rows[i + 1];
            const d = before ? p.value - before.value : null;
            const better = d == null || d === 0 ? null : card.betterWhen === "lower" ? d < 0 : d > 0;
            return (
              <div key={p.resultId + p.date} className="flex flex-col gap-1.5 rounded-xl border border-agon-brd bg-agon-s1 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex flex-1 items-center gap-2 text-[12.5px] text-agon-tx2">
                    {fmtTestDate(p.date)}
                    {isFreshResult(p.createdAt) && (
                      <span className="agon-mono inline-flex h-5 items-center rounded-full bg-agon-accent px-[7px] text-[9.5px] font-medium uppercase tracking-[0.08em] text-agon-bg">Nouveau</span>
                    )}
                  </span>
                  <span className="agon-mono text-[16px] text-agon-tx">{formatTestValue(p.value, card.valueType)}</span>
                  <span className="agon-mono text-[11px] text-agon-tx3">{unit}</span>
                  <span className={cn("agon-mono min-w-[44px] text-right text-[11px]", deltaClass(better, "text-agon-tx3"))}>
                    {formatTestDelta(d, card.valueType)}
                  </span>
                </div>
                {((p.testName && p.testName !== card.title) || p.feeling) && (
                  <span className="text-[11.5px] text-agon-tx3">
                    {[p.testName && p.testName !== card.title ? p.testName : null, p.feeling ? `ressenti ${p.feeling} / 5` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                {(p.comment || p.notes) && <span className="text-[12.5px] italic text-agon-tx2">« {p.comment || p.notes} »</span>}
              </div>
            );
          })}
        </div>
      </section>

      {isVma && (
        <section className="flex flex-col gap-2.5">
          <span className={LABEL10}>Tes allures, calculées sur {formatTestValue(card.latest.value, "number")} km/h</span>
          <div className="grid grid-cols-[repeat(4,1fr)] gap-1.5">
            {[1, 0.9, 0.8, 0.7].map((pct) => (
              <div key={pct} className="flex flex-col items-center gap-[3px] rounded-[10px] border border-agon-brd bg-agon-s1 px-1 py-2">
                <span className="agon-mono text-[10px] text-agon-tx3">{Math.round(pct * 100)} %</span>
                <span className="agon-mono text-[16px]" style={{ color }}>{formatPace(paceAtVma(card.latest.value, pct))}</span>
              </div>
            ))}
          </div>
          <span className="text-[11.5px] text-agon-tx3">min / km</span>
        </section>
      )}
    </div>
  );
}
