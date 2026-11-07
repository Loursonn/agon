import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { C } from "@/lib/theme";
import {
  evaluateLoggedDay, nutritionAdherence, NUTRITION_TOLERANCE_PCT,
  type NutritionDailyLog, type NutritionStrategy,
} from "@/lib/nutrition";

/** Une journée datée (`getDays` de `src/api/nutrition.ts`). */
type NutritionDayRow = NutritionDailyLog & { date: string };

interface NutritionDetailViewProps {
  logs:     NutritionDayRow[];
  /** Plan du coach : la cible est un % SIGNÉ de la dépense, pas des kcal. */
  strategy: NutritionStrategy | null;
  /** Métabolisme de base : dépense du jour = MB + calories actives saisies. */
  bmr?:     number | null;
  onClose:  () => void;
}

const fmtPct = (v: number) => (v > 0 ? "+" : "") + (Math.round(v * 10) / 10) + " %";

type Tab = "calories" | "macros" | "respect";

const TABS: { key: Tab; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "macros",   label: "Macros" },
  { key: "respect",  label: "Respect stratégie" },
];

const STRATEGY_LABEL: Record<string, string> = {
  maintenance:    "Maintenance",
  seche:          "Sèche",
  prise_de_masse: "Prise de masse",
};

const TOOLTIP_STYLE = {
  background:   C.s1,
  border:       "1px solid " + C.brd,
  borderRadius: 4,
  fontSize:     11,
  color:        C.tx,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// ── Custom tooltips ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consumed = payload.find((p: any) => p.dataKey === "consumed")?.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target   = payload.find((p: any) => p.dataKey === "target")?.value;
  const ecart    = consumed != null && target != null ? consumed - target : null; // kcal vs milieu de la zone
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: "8px 12px", minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{label}</div>
      {consumed != null && (
        <div style={{ fontSize: 10, color: C.ac }}>{consumed} kcal consommées</div>
      )}
      {target != null && (
        <div style={{ fontSize: 10, color: C.tx3 }}>Cible : {target} kcal</div>
      )}
      {ecart != null && (
        <div style={{ fontSize: 10, color: ecart >= 0 ? C.o : C.b, marginTop: 2 }}>
          {ecart >= 0 ? "+" : ""}{ecart} kcal
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MacrosTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gluc = payload.find((p: any) => p.dataKey === "glucides")?.value  ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lip  = payload.find((p: any) => p.dataKey === "lipides")?.value   ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prot = payload.find((p: any) => p.dataKey === "proteines")?.value ?? 0;
  const kcal = Math.round(gluc * 4 + lip * 9 + prot * 4);
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: "8px 12px", minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 10, color: C.b  }}>Glucides : {gluc}g &nbsp;({gluc * 4} kcal)</div>
        <div style={{ fontSize: 10, color: C.o  }}>Lipides : {lip}g &nbsp;({lip * 9} kcal)</div>
        <div style={{ fontSize: 10, color: C.g  }}>Protéines : {prot}g &nbsp;({prot * 4} kcal)</div>
        <div style={{ fontSize: 10, color: C.tx, fontWeight: 700, marginTop: 4, borderTop: "1px solid " + C.brd, paddingTop: 4 }}>
          Total : {kcal} kcal
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RespectTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pct    = payload.find((p: any) => p.dataKey === "pct")?.value as number | undefined;
  const row    = payload[0]?.payload as { status: string; reference: number; windowMin: number; windowMax: number } | undefined;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: "8px 12px", minWidth: 150 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{label}</div>
      {pct != null && (
        <div style={{ fontSize: 10, color: pct >= 0 ? C.o : C.b }}>
          {pct <= 0 ? "Déficit" : "Surplus"} {fmtPct(pct)} vs dépense
        </div>
      )}
      {row && (
        <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
          Dépense {row.reference} kcal · visé {row.windowMin === row.windowMax ? fmtPct(row.windowMin) : `${fmtPct(row.windowMin)} à ${fmtPct(row.windowMax)}`}
        </div>
      )}
      {row && (
        <div style={{ fontSize: 10, color: row.status === "ok" ? C.g : row.status === "close" ? C.o : C.r, marginTop: 2, fontWeight: 700 }}>
          {row.status === "ok" ? "✓ Dans l'objectif" : row.status === "close" ? "Proche de l'objectif" : "Hors objectif"}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NutritionDetailView({ logs, strategy, bmr = null, onClose }: NutritionDetailViewProps) {
  const [tab, setTab] = useState<Tab>("calories");

  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // ── Stats ────────────────────────────────────────────────────────────────
  const logsWithCal  = sortedLogs.filter((l) => l.total_calories_consumed != null);
  const logsWithGluc = sortedLogs.filter((l) => l.glucides_consumed != null);
  const logsWithLip  = sortedLogs.filter((l) => l.lipides_consumed != null);
  const logsWithProt = sortedLogs.filter((l) => l.proteines_consumed != null);

  const avgKcal = avg(logsWithCal.map((l) => l.total_calories_consumed!));
  const avgGluc = avg(logsWithGluc.map((l) => l.glucides_consumed!));
  const avgLip  = avg(logsWithLip.map((l) => l.lipides_consumed!));
  const avgProt = avg(logsWithProt.map((l) => l.proteines_consumed!));

  // Respect de la stratégie : même calcul que l'écran Alimentation de l'athlète
  // (% de déficit/surplus vs la dépense du jour). Avant : les % du coach
  // étaient comparés à des kcal, aucun jour n'était jamais « dans la cible ».
  const evals = strategy
    ? logsWithCal.map((l) => ({ l, e: evaluateLoggedDay(strategy, bmr, l) })).filter((x) => x.e != null)
    : [];
  const adherence = nutritionAdherence(strategy, bmr, logsWithCal);
  const okDays = strategy && evals.length ? adherence.ok : null;
  const pctOk = adherence.pctOk;
  const pctOkColor = pctOk == null ? C.tx3 : pctOk >= 80 ? C.g : pctOk >= 50 ? C.o : C.r;
  const window0 = evals[0]?.e ?? null;

  // ── Chart data ───────────────────────────────────────────────────────────
  const targetByDate = new Map(evals.map(({ l, e }) => [l.date, e!.target]));
  const calData = logsWithCal.map((l) => ({
    date:     format(parseISO(l.date), "d MMM", { locale: fr }),
    consumed: l.total_calories_consumed!,
    ...(targetByDate.has(l.date) ? { target: targetByDate.get(l.date)! } : {}),
  }));

  const macrosData = sortedLogs
    .filter((l) => l.glucides_consumed != null || l.lipides_consumed != null || l.proteines_consumed != null)
    .map((l) => ({
      date:      format(parseISO(l.date), "d MMM", { locale: fr }),
      glucides:  l.glucides_consumed  ?? 0,
      lipides:   l.lipides_consumed   ?? 0,
      proteines: l.proteines_consumed ?? 0,
    }));

  const respectData = evals.map(({ l, e }) => ({
    date:      format(parseISO(l.date), "d MMM", { locale: fr }),
    pct:       Math.round(e!.actualPct * 10) / 10,
    status:    e!.status,
    reference: e!.reference,
    windowMin: e!.windowMin,
    windowMax: e!.windowMax,
  }));

  // ── Empty state — no strategy ────────────────────────────────────────────
  if (!strategy) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Nutrition — détails</div>
            <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
          </div>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
              Aucune stratégie nutrition
            </div>
            <div style={{ fontSize: 12, color: C.tx3 }}>
              Le coach n'a pas encore défini de stratégie pour cet athlète.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Nutrition — détails</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              {STRATEGY_LABEL[strategy.strategy] ?? strategy.strategy}
              {window0 && ` · Visé ${window0.windowMin === window0.windowMax ? fmtPct(window0.windowMin) : `${fmtPct(window0.windowMin)} à ${fmtPct(window0.windowMax)}`} vs dépense`}
              {logsWithCal.length > 0 && ` · ${logsWithCal.length} jour${logsWithCal.length > 1 ? "s" : ""} loggé${logsWithCal.length > 1 ? "s" : ""}`}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Kcal moy.",  value: avgKcal,              unit: "kcal/j", color: C.ac  },
            { label: "Glucides",   value: avgGluc,              unit: "g/j",    color: C.b   },
            { label: "Lipides",    value: avgLip,               unit: "g/j",    color: C.o   },
            { label: "Protéines",  value: avgProt,              unit: "g/j",    color: C.g   },
            { label: "% jours OK", value: pctOk != null ? pctOk + "%" : null, unit: `${okDays ?? "—"}/${evals.length || logsWithCal.length}j`, color: pctOkColor },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>
                {value ?? "—"}
              </div>
              <div style={{ fontSize: 9, color: C.tx3 }}>{unit}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.s2, padding: 3, borderRadius: 4 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "6px 0", borderRadius: 6, border: "none",
              background: tab === t.key ? C.s1 : "transparent",
              color:      tab === t.key ? C.tx : C.tx3,
              fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {logs.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
            Aucune donnée nutrition
          </div>
        )}

        {/* TAB — Calories */}
        {logs.length > 0 && tab === "calories" && (
          <>
            {calData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Aucune calorie loggée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={calData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CalTooltip />} />
                  {targetByDate.size > 0 && (
                    <Line
                      type="monotone"
                      dataKey="target"
                      stroke={C.tx3}
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      dot={false}
                      name="Cible du jour"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="consumed"
                    stroke={C.ac}
                    strokeWidth={2}
                    dot={{ r: 3, fill: C.ac }}
                    activeDot={{ r: 5 }}
                    name="Consommées"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </>
        )}

        {/* TAB — Macros */}
        {logs.length > 0 && tab === "macros" && (
          <>
            {macrosData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Aucune macro loggée
              </div>
            ) : (
              <>
                {/* Cibles coach */}
                {(strategy.macros_glucides != null || strategy.macros_lipides != null || strategy.macros_proteines != null) && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    {[
                      { label: "Glucides",  val: strategy.macros_glucides,  color: C.b },
                      { label: "Lipides",   val: strategy.macros_lipides,   color: C.o },
                      { label: "Protéines", val: strategy.macros_proteines, color: C.g },
                    ].filter(({ val }) => val != null).map(({ label, val, color }) => (
                      <div key={label} style={{ fontSize: 10, color: C.tx3 }}>
                        <span style={{ color, fontWeight: 700 }}>{label}</span> cible : {val}g
                      </div>
                    ))}
                  </div>
                )}
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={macrosData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="20%">
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} unit="g" />
                    <Tooltip content={<MacrosTooltip />} cursor={{ fill: C.brd + "50" }} />
                    <Bar dataKey="glucides"  stackId="m" fill={C.b} name="Glucides"  isAnimationActive={false} />
                    <Bar dataKey="lipides"   stackId="m" fill={C.o} name="Lipides"   isAnimationActive={false} />
                    <Bar dataKey="proteines" stackId="m" fill={C.g} name="Protéines" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </>
        )}

        {/* TAB — Respect stratégie */}
        {logs.length > 0 && tab === "respect" && (
          <>
            {respectData.length === 0 && logsWithCal.length > 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Dépense de référence inconnue : renseigne le métabolisme de base ou la dépense du plan
              </div>
            ) : respectData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Aucune calorie loggée
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: C.tx3, marginBottom: 12 }}>
                  % de déficit (−) ou de surplus (+) vs la dépense du jour (MB + calories actives saisies, sinon dépense du plan).
                  {window0 && (
                    <> Objectif : {window0.windowMin === window0.windowMax ? fmtPct(window0.windowMin) : `${fmtPct(window0.windowMin)} à ${fmtPct(window0.windowMax)}`} (±{NUTRITION_TOLERANCE_PCT} pts).</>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={respectData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} unit=" %" width={44} />
                    <Tooltip content={<RespectTooltip />} cursor={{ fill: C.brd + "50" }} />
                    <ReferenceLine y={0} stroke={C.tx3} strokeWidth={1} />
                    {window0 && (
                      <ReferenceLine
                        y={window0.windowMin}
                        stroke={C.o}
                        strokeDasharray="4 4"
                        label={{ value: window0.windowMin === window0.windowMax ? `visé ${fmtPct(window0.windowMin)}` : `min ${fmtPct(window0.windowMin)}`, fill: C.o, fontSize: 9, position: "insideTopLeft" }}
                      />
                    )}
                    {window0 && window0.windowMax !== window0.windowMin && (
                      <ReferenceLine
                        y={window0.windowMax}
                        stroke={C.o}
                        strokeDasharray="4 4"
                        label={{ value: `max ${fmtPct(window0.windowMax)}`, fill: C.o, fontSize: 9, position: "insideTopRight" }}
                      />
                    )}
                    <Bar dataKey="pct" name="Écart" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {respectData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.status === "ok" ? C.g : entry.status === "close" ? C.o : C.r}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: C.s1, borderRadius: "6px 6px 0 0",
  width: "100%", maxWidth: 860,
  maxHeight: "92vh", overflowY: "auto",
  padding: "20px 20px 40px",
};

const closeBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2,
  color: C.tx3, cursor: "pointer", fontFamily: "inherit",
};
