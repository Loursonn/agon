/**
 * Sous la semaine du planning coach (planche « Planning · semaine large +
 * charge », retenue) : séances, volume de course, zones d'intensité YOXX,
 * charge de la semaine en points YOXX sur 6 semaines (prévu en pointillé),
 * charge aiguë / chronique et leur ratio (affiché seulement, D13).
 * Une mesure absente s'affiche « — ».
 */
import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { ratioZone, LOAD_PARAMS, type WeekLoad } from "@shared/domain/trainingLoad";
import { useLoadWeeks } from "@/features/shared/hooks/useLoadWeeks";
import { zoneColor } from "@/lib/seance";


const GOLD = "#FFC933";
const BLUE = "#33B5FF";
const MONO = "'Geist Mono', monospace";
const DASH = "—";

const int = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? DASH : Math.round(x).toLocaleString("fr-FR"));
const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? DASH : `${x > 0 ? "+" : ""}${Math.round(x)} %`);
const dec = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? DASH : x.toFixed(d).replace(".", ","));

/** Numéro de semaine ISO (S45). */
function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - y.getTime()) / 86_400_000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
}

function Kicker({ children, color = C.tx2 }: { children: ReactNode; color?: string }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Card({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", padding: "12px 14px 12px 16px", border: `1px solid ${color}44`, borderRadius: 12, background: C.s1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      {children}
    </div>
  );
}

function Big({ value, unit, color }: { value: string; unit?: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 26, lineHeight: 1, color }}>{value}</span>
      {unit && <span style={{ fontFamily: MONO, fontSize: 11, color: C.tx3 }}>{unit}</span>}
    </div>
  );
}

function Bars({ weeks }: { weeks: WeekLoad[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.done, w.planned ?? 0)));
  const W = 380, H = 96, bw = 40, gap = (W - bw * weeks.length) / Math.max(1, weeks.length - 1);
  return (
    <svg width="100%" height={H + 18} viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Charge par semaine sur ${weeks.length} semaines`}>
      {weeks.map((w, i) => {
        const x = i * (bw + gap);
        const h = (w.done / max) * (H - 8);
        const last = i === weeks.length - 1;
        const ph = w.planned != null ? (w.planned / max) * (H - 8) : null;
        return (
          <g key={w.from}>
            <rect x={x} y={H - h} width={bw} height={h} rx={3} fill={last ? GOLD : "rgba(255,201,51,0.38)"} />
            {ph != null && ph > 0 && (
              <rect x={x + 0.8} y={H - ph} width={bw - 1.6} height={Math.max(2, ph)} rx={3} fill="rgba(255,201,51,0.08)" stroke={GOLD} strokeDasharray="3 2" />
            )}
            <text x={x + bw / 2} y={H + 14} textAnchor="middle" fill={last ? GOLD : C.tx3} style={{ fontFamily: MONO, fontSize: 9.5 }}>
              S{isoWeek(w.from)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RatioGauge({ ratio }: { ratio: number | null }) {
  const [lo, hi] = LOAD_PARAMS.acwrZone;
  const min = 0.6, max = 1.8;
  const pos = (v: number) => `${((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100}%`;
  const zone = ratioZone(ratio);
  const color = zone === "in" ? "#66F03C" : zone ? "#FF9500" : C.tx3;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: C.s2 }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, background: "rgba(102,240,60,0.25)", borderRadius: 4 }} />
        {ratio != null && <span style={{ position: "absolute", top: -3, width: 3, height: 14, left: pos(ratio), background: color, borderRadius: 2 }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9.5, color: C.tx3 }}>
        <span>{dec(min, 1)}</span><span>Zone {dec(lo, 1)}–{dec(hi, 1)}</span><span>{dec(max, 1)}</span>
      </div>
    </div>
  );
}

export function WeekLoadPanel({ athleteId, weekStart }: { athleteId: string; weekStart: string }) {
  const { data, isLoading, isError } = useLoadWeeks(athleteId, weekStart, 6);
  if (isLoading) return <div style={{ height: 180, borderRadius: 12, background: C.s1, border: "1px solid " + C.brd }} />;
  if (isError || !data) return <div style={{ fontSize: 12, color: C.tx3 }}>Charge de la semaine : lecture impossible.</div>;
  const w = data.weeks[data.weeks.length - 1];
  const sessionsDone = w.sessions.filter((s) => s.done !== null).length;
  const sessionsPlanned = w.sessions.filter((s) => s.planned !== null).length;
  const z = w.sessions.reduce<[number, number, number]>((acc, s) => {
    if (s.focus === "endurance" && s.minutes) for (let i = 0; i < 3; i++) acc[i] += s.minutes[i];
    return acc;
  }, [0, 0, 0]);
  const zTotal = z[0] + z[1] + z[2];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Kicker>Charge de la semaine en cours</Kicker>
        <span style={{ fontSize: 11.5, color: C.tx3 }}>Points YOXX : 1 pt = 1 min en zone 1</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Card color={GOLD}>
          <Kicker>Séances</Kicker>
          <Big value={String(sessionsDone)} unit={sessionsPlanned ? `/ ${sessionsPlanned} prévues` : undefined} color={GOLD} />
          <div style={{ fontSize: 11, color: C.tx2 }}>{w.keySessions} séance{w.keySessions > 1 ? "s" : ""} clé{w.keySessions > 1 ? "s" : ""}</div>
        </Card>
        <Card color={BLUE}>
          <Kicker>Volume course</Kicker>
          <Big value={w.km.total > 0 ? dec(w.km.total, 1) : DASH} unit="km" color={BLUE} />
          <div style={{ fontSize: 11, color: C.tx2 }}>
            {pct(w.kmVariationPct)} vs semaine précédente · dont compromised {w.km.compromised > 0 ? dec(w.km.compromised, 1) : DASH} km
          </div>
        </Card>
        <Card color={zoneColor(1, 3)}>
          <Kicker>Zones d’intensité</Kicker>
          {zTotal > 0 ? (
            <>
              <div style={{ display: "flex", gap: 2, borderRadius: 3, overflow: "hidden" }}>
                {z.map((m, i) => m > 0 && <span key={i} style={{ flex: m, height: 10, background: zoneColor(i + 1, 3) }} />)}
              </div>
              <div style={{ display: "flex", gap: 10, fontFamily: MONO, fontSize: 10, color: C.tx2 }}>
                {z.map((m, i) => <span key={i}>Z{i + 1} {Math.round((m / zTotal) * 100)} %</span>)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.tx3 }}>{DASH} Temps par zone : course et ergos, montre ou séance prévue.</div>
          )}
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <Card color={GOLD}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Kicker>Charge semaine</Kicker>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.tx2 }}>prévu {int(w.planned)} · {pct(w.gapPct)}</span>
          </div>
          <Big value={int(w.done)} unit="pts" color={GOLD} />
          <Bars weeks={data.weeks} />
          <div style={{ fontSize: 11, color: C.tx2 }}>
            Monotonie {dec(w.monotony)} · contrainte {int(w.strain)}
            {w.top ? ` · plus coûteuse : ${w.top.label} (${int(w.top.points)} pts, ${Math.round(w.top.sharePct)} %)` : ""}
          </div>
          {data.missingRirSessions > 0 && (
            <div style={{ fontSize: 11, color: "#FF9500" }}>
              {data.missingRirSessions} séance{data.missingRirSessions > 1 ? "s" : ""} de muscu sans RIR : 0,75 par série appliqué.
            </div>
          )}
        </Card>
        <Card color={BLUE}>
          <Kicker>Aiguë 7 j · chronique 28 j</Kicker>
          <Big value={`${int(w.done)} / ${int(w.chronic)}`} unit="pts" color={C.tx} />
          <Kicker color={C.tx3}>Ratio aiguë / chronique</Kicker>
          <Big value={dec(w.ratio)} color={ratioZone(w.ratio) === "in" ? "#66F03C" : ratioZone(w.ratio) ? "#FF9500" : C.tx3} />
          <RatioGauge ratio={w.ratio} />
          <div style={{ fontSize: 11, color: C.tx3 }}>Contexte seulement : le ratio ne déclenche aucune alerte.</div>
        </Card>
      </div>
    </div>
  );
}
