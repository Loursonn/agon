import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SHEET_CLOSE, SHEET_OVERLAY, SHEET_PANEL, SHEET_SUB, SHEET_TITLE, STAT_CARD, STAT_LABEL, STAT_VALUE } from "./detailSheet";
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

const TOOLTIP = "rounded-[4px] border border-agon-brd bg-agon-s1 px-3 py-2 text-[11px] text-agon-tx";
const TOOLTIP_TITLE = "text-[11px] font-bold text-agon-tx";
const EMPTY = "py-10 text-center text-[13px] text-agon-tx3";
const HEAD = "mb-5 flex items-center justify-between";
/** Couleurs des macros, en classes (les courbes gardent C.*). */
const MACRO_TEXT = { glucides: "text-agon-info", lipides: "text-agon-alerte", proteines: "text-agon-succes" };
const STATUS_TEXT: Record<string, string> = { ok: "text-agon-succes", close: "text-agon-alerte" };

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
    <div className={cn(TOOLTIP, "min-w-[140px]")}>
      <div className={cn(TOOLTIP_TITLE, "mb-1")}>{label}</div>
      {consumed != null && (
        <div className="text-[10px] text-agon-accent">{consumed} kcal consommées</div>
      )}
      {target != null && (
        <div className="text-[10px] text-agon-tx3">Cible : {target} kcal</div>
      )}
      {ecart != null && (
        <div className={cn("mt-0.5 text-[10px]", ecart >= 0 ? "text-agon-alerte" : "text-agon-info")}>
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
    <div className={cn(TOOLTIP, "min-w-[160px]")}>
      <div className={cn(TOOLTIP_TITLE, "mb-1.5")}>{label}</div>
      <div className="flex flex-col gap-[3px]">
        <div className={cn("text-[10px]", MACRO_TEXT.glucides)}>Glucides : {gluc}g &nbsp;({gluc * 4} kcal)</div>
        <div className={cn("text-[10px]", MACRO_TEXT.lipides)}>Lipides : {lip}g &nbsp;({lip * 9} kcal)</div>
        <div className={cn("text-[10px]", MACRO_TEXT.proteines)}>Protéines : {prot}g &nbsp;({prot * 4} kcal)</div>
        <div className="mt-1 border-t border-agon-brd pt-1 text-[10px] font-bold text-agon-tx">
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
    <div className={cn(TOOLTIP, "min-w-[150px]")}>
      <div className={cn(TOOLTIP_TITLE, "mb-1")}>{label}</div>
      {pct != null && (
        <div className={cn("text-[10px]", pct >= 0 ? "text-agon-alerte" : "text-agon-info")}>
          {pct <= 0 ? "Déficit" : "Surplus"} {fmtPct(pct)} vs dépense
        </div>
      )}
      {row && (
        <div className="mt-0.5 text-[10px] text-agon-tx3">
          Dépense {row.reference} kcal · visé {row.windowMin === row.windowMax ? fmtPct(row.windowMin) : `${fmtPct(row.windowMin)} à ${fmtPct(row.windowMax)}`}
        </div>
      )}
      {row && (
        <div className={cn("mt-0.5 text-[10px] font-bold", STATUS_TEXT[row.status] ?? "text-agon-erreur")}>
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
  const pctOkColor = pctOk == null ? "text-agon-tx3" : pctOk >= 80 ? "text-agon-succes" : pctOk >= 50 ? "text-agon-alerte" : "text-agon-erreur";
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
      <div className={SHEET_OVERLAY}>
        <div className={SHEET_PANEL}>
          <div className={HEAD}>
            <div className={SHEET_TITLE}>Nutrition — détails</div>
            <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
          </div>
          <div className="py-10 text-center">
            <div className="mb-3 text-[36px]"></div>
            <div className="mb-1.5 text-[14px] font-bold text-agon-tx">
              Aucune stratégie nutrition
            </div>
            <div className="text-[12px] text-agon-tx3">
              Le coach n'a pas encore défini de stratégie pour cet athlète.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={SHEET_OVERLAY}>
      <div className={SHEET_PANEL}>
        {/* Header */}
        <div className={HEAD}>
          <div>
            <div className={SHEET_TITLE}>Nutrition — détails</div>
            <div className={cn(SHEET_SUB, "mt-0.5")}>
              {STRATEGY_LABEL[strategy.strategy] ?? strategy.strategy}
              {window0 && ` · Visé ${window0.windowMin === window0.windowMax ? fmtPct(window0.windowMin) : `${fmtPct(window0.windowMin)} à ${fmtPct(window0.windowMax)}`} vs dépense`}
              {logsWithCal.length > 0 && ` · ${logsWithCal.length} jour${logsWithCal.length > 1 ? "s" : ""} loggé${logsWithCal.length > 1 ? "s" : ""}`}
            </div>
          </div>
          <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[
            { label: "Kcal moy.",  value: avgKcal,              unit: "kcal/j", color: "text-agon-accent" },
            { label: "Glucides",   value: avgGluc,              unit: "g/j",    color: MACRO_TEXT.glucides },
            { label: "Lipides",    value: avgLip,               unit: "g/j",    color: MACRO_TEXT.lipides },
            { label: "Protéines",  value: avgProt,              unit: "g/j",    color: MACRO_TEXT.proteines },
            { label: "% jours OK", value: pctOk != null ? pctOk + "%" : null, unit: `${okDays ?? "—"}/${evals.length || logsWithCal.length}j`, color: pctOkColor },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className={STAT_CARD}>
              <div className={STAT_LABEL}>{label}</div>
              <div className={cn(STAT_VALUE, "text-[20px] leading-none", color)}>
                {value ?? "—"}
              </div>
              <div className="text-[9px] text-agon-tx3">{unit}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-[4px] bg-agon-s2 p-[3px]">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn(
              "flex-1 cursor-pointer rounded-[6px] border-0 py-1.5 text-[11px] [transition:all_120ms]",
              tab === t.key ? "bg-agon-s1 font-bold text-agon-tx" : "bg-transparent font-medium text-agon-tx3",
            )}>
              {t.label}
            </button>
          ))}
        </div>

        {logs.length === 0 && (
          <div className={EMPTY}>
            Aucune donnée nutrition
          </div>
        )}

        {/* TAB — Calories */}
        {logs.length > 0 && tab === "calories" && (
          <>
            {calData.length === 0 ? (
              <div className={EMPTY}>
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
              <div className={EMPTY}>
                Aucune macro loggée
              </div>
            ) : (
              <>
                {/* Cibles coach */}
                {(strategy.macros_glucides != null || strategy.macros_lipides != null || strategy.macros_proteines != null) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      { label: "Glucides",  val: strategy.macros_glucides,  color: MACRO_TEXT.glucides },
                      { label: "Lipides",   val: strategy.macros_lipides,   color: MACRO_TEXT.lipides },
                      { label: "Protéines", val: strategy.macros_proteines, color: MACRO_TEXT.proteines },
                    ].filter(({ val }) => val != null).map(({ label, val, color }) => (
                      <div key={label} className="text-[10px] text-agon-tx3">
                        <span className={cn("font-bold", color)}>{label}</span> cible : {val}g
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
              <div className={EMPTY}>
                Dépense de référence inconnue : renseigne le métabolisme de base ou la dépense du plan
              </div>
            ) : respectData.length === 0 ? (
              <div className={EMPTY}>
                Aucune calorie loggée
              </div>
            ) : (
              <>
                <div className="mb-3 text-[10px] text-agon-tx3">
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
