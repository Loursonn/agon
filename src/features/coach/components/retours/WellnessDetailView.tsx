import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SHEET_CLOSE, SHEET_OVERLAY, SHEET_PANEL, SHEET_SUB, SHEET_TITLE, STAT_CARD, STAT_LABEL, STAT_VALUE } from "./detailSheet";
import { domsReading } from "@/lib/wellnessBaseline";
import { wellnessView } from "@/lib/wellness";
import { WELLNESS_ITEM_SHORT, averageItem, averageScore } from "@shared/domain/wellness";
import type { DailyData } from "@/features/shared/types/retours.types";

interface SleepGoals {
  bedtime?:        { h: number; m: number };
  wakeup?:         { h: number; m: number };
  durationTarget?: number; // heures
}

interface WellnessDetailViewProps {
  dailyData:   Record<string, DailyData>;
  /** Ignoré : la moyenne est recalculée ici depuis les notes (gardé pour les appelants). */
  avgWellness: number | null;
  sleepGoals?: SleepGoals;
  onClose:     () => void;
}

type Tab = "score" | "composantes" | "sommeil";

const TABS: { key: Tab; label: string }[] = [
  { key: "score",       label: "Score global" },
  { key: "composantes", label: "Composantes" },
  { key: "sommeil",     label: "Tunnel de sommeil" },
];

const TONE = {
  succes: "text-agon-succes", alerte: "text-agon-alerte", erreur: "text-agon-erreur",
  info: "text-agon-info", accent: "text-agon-accent", orClair: "text-agon-or-clair",
};
/** Bon / moyen / à améliorer. */
const tier = (good: boolean, ok: boolean) => (good ? TONE.succes : ok ? TONE.alerte : TONE.erreur);
const SMALL = "text-[10px] text-agon-tx2";

/** Bulle Recharts (contentStyle attend un objet). */
const TOOLTIP_STYLE = {
  background: C.s1,
  border: "1px solid " + C.brd,
  borderRadius: 4,
  fontSize: 11,
  color: C.tx,
};

// ── Sleep helpers ─────────────────────────────────────────────────────────────

const RANGE_START = 20; // 20h
const RANGE_END   = 34; // 10h next day (24+10)

/** Hours as decimal: 23h30 → 23.5, 01h00 → 25 (next-day) */
function toDecHour(h: number, m: number): number {
  const dec = h + m / 60;
  return dec < 12 ? dec + 24 : dec; // 01h → 25, 23h → 23
}

function decToLabel(dec: number): string {
  const h = Math.floor(dec % 24);
  const m = Math.round((dec - Math.floor(dec)) * 60);
  return `${String(h).padStart(2, "0")}h${m > 0 ? String(m).padStart(2, "0") : "00"}`;
}

function durLabel(bedDec: number, upDec: number): string {
  const dur = upDec - bedDec;
  const h   = Math.floor(dur);
  const m   = Math.round((dur - h) * 60);
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
}

/** Y-axis value → hour label: 0 → "20h", 4 → "00h", 10 → "06h" */
function yTickFmt(v: number): string {
  const h = Math.round((v + RANGE_START) % 24);
  return `${h}h`;
}

const Y_TICKS = [0, 2, 4, 6, 8, 10, 12, 14]; // 20h 22h 00h 02h 04h 06h 08h 10h

// ── Custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SleepTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="min-w-[130px] rounded-[4px] border border-agon-brd bg-agon-s1 px-3 py-2 text-[11px] text-agon-tx">
      <div className="mb-1 text-[11px] font-bold text-agon-tx">{label}</div>
      <div className="flex flex-col gap-[3px]">
        <div className={SMALL}>
          Coucher : <span className="font-bold text-agon-info">{item.bedLabel}</span>
        </div>
        <div className={SMALL}>
          Lever : <span className="font-bold text-agon-succes">{item.upLabel}</span>
        </div>
        <div className={SMALL}>
          Durée : <span className="font-bold text-agon-tx">{item.durLabel}</span>
        </div>
        {!item.isReal && (
          <div className="mt-0.5 text-[9px] italic text-agon-tx3">* estimé</div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WellnessDetailView({ dailyData, sleepGoals, onClose }: WellnessDetailViewProps) {
  const [tab, setTab] = useState<Tab>("score");

  const entries = Object.values(dailyData)
    .filter((d) => d.wellness != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Score et notes recalculés par le domaine wellness : une saisie incomplète
  // donne un trou (null) dans la courbe, pas un 0.
  const views = entries.map((d) => ({ date: d.date, ...wellnessView(d.wellness) }));

  // ── Score chart ──────────────────────────────────────────────────────────
  const scoreData = views.map((v) => ({
    date:  format(parseISO(v.date), "d MMM", { locale: fr }),
    score: v.score,
  }));

  // ── Composantes chart ────────────────────────────────────────────────────
  const composantesData = views.map((v) => ({
    date:    format(parseISO(v.date), "d MMM", { locale: fr }),
    ...v.items,
  }));

  // ── Sleep tunnel (Garmin-style) ──────────────────────────────────────────
  const sleepData = entries.map((d) => {
    const w = d.wellness!;
    let bedDec: number, upDec: number, isReal = false;

    if (w.coucher && w.reveil) {
      bedDec = toDecHour(w.coucher.h, w.coucher.m);
      upDec  = toDecHour(w.reveil.h,  w.reveil.m);
      isReal = true;
    } else {
      // Simulate from sommeil score (1-5 scale)
      const s = Math.min(w.sommeil, 5);
      bedDec = toDecHour(Math.floor(22 + (5 - s) * 0.7), 0);
      upDec  = toDecHour(Math.floor(6.5 + (5 - s) * 0.3), 0);
    }

    // If sleepDur is available, override wakeup based on it
    if (w.sleepDur != null && isReal) {
      upDec = bedDec + w.sleepDur;
    }

    // Clamp to chart range
    const clampedBed = Math.max(RANGE_START, Math.min(RANGE_END, bedDec));
    const clampedUp  = Math.max(clampedBed,  Math.min(RANGE_END, upDec));

    const offset   = clampedBed - RANGE_START; // distance from 20h to bedtime
    const duration = clampedUp  - clampedBed;  // sleep duration on chart

    return {
      date:     format(parseISO(d.date), "EEE d", { locale: fr }),
      offset,
      duration,
      bedLabel: decToLabel(bedDec),
      upLabel:  decToLabel(upDec),
      durLabel: durLabel(clampedBed, clampedUp),
      isReal,
    };
  });

  // Avg sleep duration
  const sleepDurs = entries
    .map((d) => {
      const w = d.wellness!;
      if (w.sleepDur != null) return w.sleepDur;
      if (w.coucher && w.reveil) {
        const b = toDecHour(w.coucher.h, w.coucher.m);
        const u = toDecHour(w.reveil.h,  w.reveil.m);
        return u > b ? u - b : null;
      }
      return null;
    })
    .filter((n): n is number => n != null);
  const avgSleepDur = sleepDurs.length
    ? Math.round(sleepDurs.reduce((a, b) => a + b, 0) / sleepDurs.length * 10) / 10
    : null;
  const realSleepCount = sleepData.filter((s) => s.isReal).length;

  // ── Stats ────────────────────────────────────────────────────────────────
  // Moyennes sur les seules notes présentes ; le score moyen est recalculé ici
  // (la valeur reçue comptait les jours sans score comme des 0).
  const avgScore   = averageScore(views.map((v) => v.score));
  const avgFatigue = averageItem(views, "fatigue");
  const avgSommeil = averageItem(views, "sommeil");
  const avgStress  = averageItem(views, "stress");
  const avgEnergie = averageItem(views, "energie");
  const avgDoms    = averageItem(views, "doms");

  return (
    <div className={SHEET_OVERLAY}>
      <div className={SHEET_PANEL}>
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className={SHEET_TITLE}>Wellness — détails</div>
            <div className={SHEET_SUB}>{entries.length} jours avec données</div>
          </div>
          <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-2">
          {[
            { label: "Score moy.", value: avgScore, unit: "/100", color: TONE.accent },
            { label: WELLNESS_ITEM_SHORT.fatigue, value: avgFatigue,  unit: "/5",   color: TONE.alerte },
            { label: WELLNESS_ITEM_SHORT.sommeil, value: avgSommeil,  unit: "/5",   color: TONE.info },
            { label: WELLNESS_ITEM_SHORT.stress,  value: avgStress,   unit: "/5",   color: TONE.erreur },
            { label: WELLNESS_ITEM_SHORT.energie, value: avgEnergie,  unit: "/5",   color: TONE.succes },
            // L'athlète note sa fraîcheur (1 = DOMS intenses, 5 = aucune douleur) :
            // on redit la moyenne en courbatures pour éviter la lecture à l'envers.
            {
              label: "Fraîcheur musc.", value: avgDoms, unit: "/5", color: TONE.orClair,
              sub: avgDoms != null ? domsReading(avgDoms) : null,
            },
          ].map(({ label, value, unit, color, sub }: {
            label: string; value: number | null; unit: string; color: string; sub?: string | null;
          }) => (
            <div key={label} className={STAT_CARD}>
              <div className={STAT_LABEL}>{label}</div>
              <div className={cn(STAT_VALUE, "text-[20px] leading-none", color)}>
                {value ?? "—"}
              </div>
              <div className="text-[9px] text-agon-tx3">{unit}</div>
              {sub && <div className={cn("mt-0.5 text-[9px]", color)}>{sub}</div>}
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

        {entries.length === 0 && (
          <div className="py-10 text-center text-[13px] text-agon-tx3">
            Aucune donnée wellness
          </div>
        )}

        {/* Score global */}
        {entries.length > 0 && tab === "score" && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={scoreData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {/* Paliers : ≥ 65 Bon (vert), 50-64 Modéré (orange), < 50 Fatigué (rouge) */}
              <ReferenceLine y={65} stroke={C.g} strokeDasharray="4 4" label={{ value: "65", fill: C.g, fontSize: 9 }} />
              <ReferenceLine y={50} stroke={C.o} strokeDasharray="4 4" label={{ value: "50", fill: C.o, fontSize: 9 }} />
              <Line type="monotone" dataKey="score" stroke={C.ac} strokeWidth={2} dot={{ r: 3, fill: C.ac }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Composantes */}
        {entries.length > 0 && tab === "composantes" && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={composantesData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: C.tx3 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10, color: C.tx3 }} />
              <Line type="monotone" dataKey="fatigue" stroke={C.o} strokeWidth={2} dot={false} name={WELLNESS_ITEM_SHORT.fatigue} />
              <Line type="monotone" dataKey="sommeil" stroke={C.b} strokeWidth={2} dot={false} name={WELLNESS_ITEM_SHORT.sommeil} />
              <Line type="monotone" dataKey="stress"  stroke={C.r} strokeWidth={2} dot={false} name={WELLNESS_ITEM_SHORT.stress} />
              <Line type="monotone" dataKey="energie" stroke={C.g} strokeWidth={2} dot={false} name={WELLNESS_ITEM_SHORT.energie} />
              <Line type="monotone" dataKey="doms"    stroke={C.y} strokeWidth={2} dot={false} name="Fraîcheur musc." />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Tunnel de sommeil — Garmin style */}
        {entries.length > 0 && tab === "sommeil" && (
          <>
            {/* ── Stats row ───────────────────────────────────────────────── */}
            {(() => {
              const goalBedDec = sleepGoals?.bedtime ? toDecHour(sleepGoals.bedtime.h, sleepGoals.bedtime.m) : null;
              const goalUpDec  = sleepGoals?.wakeup  ? toDecHour(sleepGoals.wakeup.h,  sleepGoals.wakeup.m)  : null;
              const goalDurDec = goalBedDec != null && goalUpDec != null ? goalUpDec - goalBedDec : null;

              // Regularity: avg abs deviation from goal (minutes), real data only
              const bedDevs = goalBedDec != null
                ? entries.filter(d => d.wellness?.coucher != null).map(d => {
                    const a = toDecHour(d.wellness!.coucher!.h, d.wellness!.coucher!.m);
                    return Math.abs(a - goalBedDec) * 60;
                  })
                : [];
              const upDevs = goalUpDec != null
                ? entries.filter(d => d.wellness?.reveil != null).map(d => {
                    const a = toDecHour(d.wellness!.reveil!.h, d.wellness!.reveil!.m);
                    return Math.abs(a - goalUpDec) * 60;
                  })
                : [];
              const avgBedDev = bedDevs.length ? Math.round(bedDevs.reduce((a, b) => a + b, 0) / bedDevs.length) : null;
              const avgUpDev  = upDevs.length  ? Math.round(upDevs.reduce((a, b)  => a + b, 0) / upDevs.length)  : null;

              // Duration delta vs goal
              const durDelta = avgSleepDur != null && goalDurDec != null
                ? Math.round((avgSleepDur - goalDurDec) * 60) // minutes
                : null;

              const fmtDur = (dec: number) =>
                `${Math.floor(dec)}h${Math.round((dec % 1) * 60) > 0 ? String(Math.round((dec % 1) * 60)).padStart(2, "0") : ""}`;

              const statCards: { label: string; value: string; sub?: string; color: string }[] = [];

              if (avgSleepDur != null)
                statCards.push({
                  label: "Durée moy.",
                  value: fmtDur(avgSleepDur),
                  sub: durDelta != null ? (durDelta >= 0 ? `+${durDelta}min vs obj.` : `${durDelta}min vs obj.`) : undefined,
                  color: durDelta == null ? TONE.info : tier(durDelta >= -15, durDelta >= -45),
                });

              if (avgBedDev != null)
                statCards.push({
                  label: "Régularité coucher",
                  value: `±${avgBedDev}min`,
                  sub: avgBedDev <= 15 ? "Excellent" : avgBedDev <= 30 ? "Bon" : "À améliorer",
                  color: tier(avgBedDev <= 15, avgBedDev <= 30),
                });

              if (avgUpDev != null)
                statCards.push({
                  label: "Régularité lever",
                  value: `±${avgUpDev}min`,
                  sub: avgUpDev <= 15 ? "Excellent" : avgUpDev <= 30 ? "Bon" : "À améliorer",
                  color: tier(avgUpDev <= 15, avgUpDev <= 30),
                });

              if (realSleepCount > 0)
                statCards.push({ label: "Données réelles", value: `${realSleepCount}/${entries.length}`, color: TONE.succes });

              return statCards.length > 0 ? (
                <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${statCards.length}, 1fr)` }}>
                  {statCards.map(({ label, value, sub, color }) => (
                    <div key={label} className={STAT_CARD}>
                      <div className={STAT_LABEL}>{label}</div>
                      <div className={cn(STAT_VALUE, "text-[18px] leading-none", color)}>{value}</div>
                      {sub && <div className="mt-[3px] text-[9px] text-agon-tx3">{sub}</div>}
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sleepData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%">
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: C.tx3 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, RANGE_END - RANGE_START]}
                  ticks={Y_TICKS}
                  tickFormatter={yTickFmt}
                  tick={{ fontSize: 10, fill: C.tx3 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  reversed
                />
                <Tooltip content={<SleepTooltip />} cursor={{ fill: C.brd + "50" }} />
                {/* Reference lines for midnight and 06h — behind bars */}
                <ReferenceLine y={4}  stroke={C.brd} strokeDasharray="3 3" label={{ value: "00h", fill: C.tx3, fontSize: 9, position: "insideTopRight" }} />
                <ReferenceLine y={10} stroke={C.brd} strokeDasharray="3 3" label={{ value: "06h", fill: C.tx3, fontSize: 9, position: "insideTopRight" }} />
                {/* Bars */}
                <Bar dataKey="offset" stackId="sleep" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="duration" stackId="sleep" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                  {sleepData.map((entry, i) => (
                    <Cell key={i} fill={entry.isReal ? C.b : C.b + "70"} />
                  ))}
                </Bar>
                {/* Goal lines — after bars so they render on top */}
                {sleepGoals?.bedtime && (() => {
                  const dec = toDecHour(sleepGoals.bedtime!.h, sleepGoals.bedtime!.m);
                  const y   = Math.max(0, dec - RANGE_START);
                  return (
                    <ReferenceLine
                      y={y}
                      stroke={C.o}
                      strokeDasharray="5 3"
                      strokeWidth={2}
                      label={{ value: `${sleepGoals.bedtime!.h}h${String(sleepGoals.bedtime!.m).padStart(2, "0")}`, fill: C.o, fontSize: 10, fontWeight: 700, position: "insideTopLeft" }}
                    />
                  );
                })()}
                {sleepGoals?.wakeup && (() => {
                  const dec = toDecHour(sleepGoals.wakeup!.h, sleepGoals.wakeup!.m);
                  const y   = Math.max(0, dec - RANGE_START);
                  return (
                    <ReferenceLine
                      y={y}
                      stroke={C.g}
                      strokeDasharray="5 3"
                      strokeWidth={2}
                      label={{ value: `${sleepGoals.wakeup!.h}h${String(sleepGoals.wakeup!.m).padStart(2, "0")}`, fill: C.g, fontSize: 10, fontWeight: 700, position: "insideTopLeft" }}
                    />
                  );
                })()}
              </BarChart>
            </ResponsiveContainer>

            {sleepData.some((s) => !s.isReal) && (
              <div className="mt-2 text-right text-[10px] italic text-agon-tx3">
                Barres transparentes = horaires estimés (pas de données réelles)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
