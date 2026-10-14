import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { C } from "@/lib/theme";
import type { NutritionStrategy, NutritionDailyLog } from "@/features/shared/types/retours.types";

interface NutritionDetailViewProps {
  logs:     NutritionDailyLog[];
  strategy: NutritionStrategy | null;
  onClose:  () => void;
}

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
  const ecart    = consumed != null && target != null ? consumed - target : null;
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
  const ecart = payload.find((p: any) => p.dataKey === "ecart")?.value;
  const ok    = payload[0]?.payload?.ok as boolean | null;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: "8px 12px", minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{label}</div>
      {ecart != null && (
        <div style={{ fontSize: 10, color: ecart >= 0 ? C.o : C.b }}>
          {ecart >= 0 ? "+" : ""}{ecart} kcal vs cible
        </div>
      )}
      {ok != null && (
        <div style={{ fontSize: 10, color: ok ? C.g : C.o, marginTop: 2, fontWeight: 700 }}>
          {ok ? "✓ Dans la cible" : "Hors cible"}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NutritionDetailView({ logs, strategy, onClose }: NutritionDetailViewProps) {
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

  const target = strategy?.total_calories_coach ?? null;
  const okDays = target != null
    && strategy?.surplus_deficit_min != null
    && strategy?.surplus_deficit_max != null
    ? logsWithCal.filter((l) => {
        const e = l.total_calories_consumed! - target;
        return e >= strategy.surplus_deficit_min! && e <= strategy.surplus_deficit_max!;
      }).length
    : null;
  const pctOk = okDays != null && logsWithCal.length > 0
    ? Math.round((okDays / logsWithCal.length) * 100)
    : null;
  const pctOkColor = pctOk == null ? C.tx3 : pctOk >= 80 ? C.g : pctOk >= 50 ? C.o : C.r;

  // ── Chart data ───────────────────────────────────────────────────────────
  const calData = logsWithCal.map((l) => ({
    date:     format(parseISO(l.date), "d MMM", { locale: fr }),
    consumed: l.total_calories_consumed!,
    ...(target != null ? { target } : {}),
  }));

  const macrosData = sortedLogs
    .filter((l) => l.glucides_consumed != null || l.lipides_consumed != null || l.proteines_consumed != null)
    .map((l) => ({
      date:      format(parseISO(l.date), "d MMM", { locale: fr }),
      glucides:  l.glucides_consumed  ?? 0,
      lipides:   l.lipides_consumed   ?? 0,
      proteines: l.proteines_consumed ?? 0,
    }));

  const respectData = target != null
    ? logsWithCal.map((l) => {
        const ecart = l.total_calories_consumed! - target;
        const ok = strategy?.surplus_deficit_min != null && strategy?.surplus_deficit_max != null
          ? ecart >= strategy.surplus_deficit_min && ecart <= strategy.surplus_deficit_max
          : null;
        return {
          date:  format(parseISO(l.date), "d MMM", { locale: fr }),
          ecart,
          ok,
        };
      })
    : [];

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
              {strategy.total_calories_coach != null && ` · Cible ${strategy.total_calories_coach} kcal/j`}
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
            { label: "% jours OK", value: pctOk != null ? pctOk + "%" : null, unit: `${okDays ?? "—"}/${logsWithCal.length}j`, color: pctOkColor },
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
                  {target != null && (
                    <ReferenceLine
                      y={target}
                      stroke={C.tx3}
                      strokeDasharray="4 4"
                      label={{ value: `${target} kcal`, fill: C.tx3, fontSize: 9, position: "insideTopRight" }}
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
            {target == null ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Aucune cible calorique définie par le coach
              </div>
            ) : respectData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                Aucune calorie loggée
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: C.tx3, marginBottom: 12 }}>
                  Écart journalier vs cible ({target} kcal).
                  {strategy.surplus_deficit_min != null && strategy.surplus_deficit_max != null && (
                    <> Zone OK : [{strategy.surplus_deficit_min >= 0 ? "+" : ""}{strategy.surplus_deficit_min} ; +{strategy.surplus_deficit_max}] kcal.</>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={respectData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} unit=" kcal" width={52} />
                    <Tooltip content={<RespectTooltip />} cursor={{ fill: C.brd + "50" }} />
                    <ReferenceLine y={0} stroke={C.tx3} strokeWidth={1} />
                    {strategy.surplus_deficit_min != null && (
                      <ReferenceLine
                        y={strategy.surplus_deficit_min}
                        stroke={C.o}
                        strokeDasharray="4 4"
                        label={{ value: `min ${strategy.surplus_deficit_min}`, fill: C.o, fontSize: 9, position: "insideTopLeft" }}
                      />
                    )}
                    {strategy.surplus_deficit_max != null && (
                      <ReferenceLine
                        y={strategy.surplus_deficit_max}
                        stroke={C.o}
                        strokeDasharray="4 4"
                        label={{ value: `max +${strategy.surplus_deficit_max}`, fill: C.o, fontSize: 9, position: "insideTopRight" }}
                      />
                    )}
                    <Bar dataKey="ecart" name="Écart" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {respectData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.ok == null ? C.tx3 : entry.ok ? C.g : C.o}
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
