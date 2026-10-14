import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import { C } from "@/lib/theme";
import type { DailyData } from "@/features/shared/types/retours.types";

interface SleepGoals {
  bedtime?:        { h: number; m: number };
  wakeup?:         { h: number; m: number };
  durationTarget?: number; // heures
}

interface WellnessDetailViewProps {
  dailyData:   Record<string, DailyData>;
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
    <div style={{ ...TOOLTIP_STYLE, padding: "8px 12px", minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 10, color: C.tx2 }}>
          Coucher : <span style={{ fontWeight: 700, color: C.b }}>{item.bedLabel}</span>
        </div>
        <div style={{ fontSize: 10, color: C.tx2 }}>
          Lever : <span style={{ fontWeight: 700, color: C.g }}>{item.upLabel}</span>
        </div>
        <div style={{ fontSize: 10, color: C.tx2 }}>
          Durée : <span style={{ fontWeight: 700, color: C.tx }}>{item.durLabel}</span>
        </div>
        {!item.isReal && (
          <div style={{ fontSize: 9, color: C.tx3, fontStyle: "italic", marginTop: 2 }}>* estimé</div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WellnessDetailView({ dailyData, avgWellness, sleepGoals, onClose }: WellnessDetailViewProps) {
  const [tab, setTab] = useState<Tab>("score");

  const entries = Object.values(dailyData)
    .filter((d) => d.wellness != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Score chart ──────────────────────────────────────────────────────────
  const scoreData = entries.map((d) => ({
    date:  format(parseISO(d.date), "d MMM", { locale: fr }),
    score: d.wellness!.score,
  }));

  // ── Composantes chart ────────────────────────────────────────────────────
  const composantesData = entries.map((d) => ({
    date:    format(parseISO(d.date), "d MMM", { locale: fr }),
    fatigue: d.wellness!.fatigue,
    sommeil: d.wellness!.sommeil,
    stress:  d.wellness!.stress,
    energie: d.wellness!.energie,
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
  const avgFatigue = avg(entries.map((d) => d.wellness!.fatigue));
  const avgSommeil = avg(entries.map((d) => d.wellness!.sommeil));
  const avgStress  = avg(entries.map((d) => d.wellness!.stress));
  const avgEnergie = avg(entries.map((d) => d.wellness!.energie));

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Wellness — détails</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>{entries.length} jours avec données</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Score moy.", value: avgWellness, unit: "/100", color: C.ac },
            { label: "Fatigue",    value: avgFatigue,  unit: "/5",   color: C.o  },
            { label: "Sommeil",    value: avgSommeil,  unit: "/5",   color: C.b  },
            { label: "Stress",     value: avgStress,   unit: "/5",   color: C.r  },
            { label: "Énergie",    value: avgEnergie,  unit: "/5",   color: C.g  },
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
              color: tab === t.key ? C.tx : C.tx3,
              fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {entries.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
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
              <ReferenceLine y={70} stroke={C.g} strokeDasharray="4 4" label={{ value: "70", fill: C.g, fontSize: 9 }} />
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
              <Line type="monotone" dataKey="fatigue" stroke={C.o} strokeWidth={2} dot={false} name="Fatigue" />
              <Line type="monotone" dataKey="sommeil" stroke={C.b} strokeWidth={2} dot={false} name="Sommeil" />
              <Line type="monotone" dataKey="stress"  stroke={C.r} strokeWidth={2} dot={false} name="Stress" />
              <Line type="monotone" dataKey="energie" stroke={C.g} strokeWidth={2} dot={false} name="Énergie" />
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
                  color: durDelta == null ? C.b : durDelta >= -15 ? C.g : durDelta >= -45 ? C.o : C.r,
                });

              if (avgBedDev != null)
                statCards.push({
                  label: "Régularité coucher",
                  value: `±${avgBedDev}min`,
                  sub: avgBedDev <= 15 ? "Excellent" : avgBedDev <= 30 ? "Bon" : "À améliorer",
                  color: avgBedDev <= 15 ? C.g : avgBedDev <= 30 ? C.o : C.r,
                });

              if (avgUpDev != null)
                statCards.push({
                  label: "Régularité lever",
                  value: `±${avgUpDev}min`,
                  sub: avgUpDev <= 15 ? "Excellent" : avgUpDev <= 30 ? "Bon" : "À améliorer",
                  color: avgUpDev <= 15 ? C.g : avgUpDev <= 30 ? C.o : C.r,
                });

              if (realSleepCount > 0)
                statCards.push({ label: "Données réelles", value: `${realSleepCount}/${entries.length}`, color: C.g });

              return statCards.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${statCards.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
                  {statCards.map(({ label, value, sub, color }) => (
                    <div key={label} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                      {sub && <div style={{ fontSize: 9, color: C.tx3, marginTop: 3 }}>{sub}</div>}
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
              <div style={{ marginTop: 8, fontSize: 10, color: C.tx3, fontStyle: "italic", textAlign: "right" }}>
                Barres transparentes = horaires estimés (pas de données réelles)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10;
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
