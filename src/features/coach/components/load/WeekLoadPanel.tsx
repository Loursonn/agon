/**
 * Sous la semaine du planning coach (planche « Planning · semaine large +
 * charge », retenue) : séances, volume de course, zones d'intensité YOXX,
 * charge de la semaine en points YOXX sur 6 semaines (prévu en pointillé),
 * charge aiguë / chronique et leur ratio (affiché seulement, D13).
 * Une mesure absente s'affiche « — ».
 */
import type { ReactNode } from "react";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ratioZone, LOAD_PARAMS, type WeekLoad } from "@shared/domain/trainingLoad";
import { useLoadWeeks } from "@/features/shared/hooks/useLoadWeeks";
import { zoneColor } from "@/lib/seance";


const GOLD = C.ac;
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

function Kicker({ children, className = "text-agon-tx2" }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em]", className)}>
      {children}
    </span>
  );
}

type Tone = "gold" | "blue";
const CARD_EDGE: Record<Tone, { edge: string; bar: string }> = {
  gold: { edge: "border-agon-accent/[0.267]", bar: "bg-agon-accent" },
  blue: { edge: "border-agon-info/[0.267]", bar: "bg-agon-info" },
};

/** Carte à liseré : ton de la charte, ou couleur calculée (zones). */
function Card({ tone, color, children }: { tone?: Tone; color?: string; children: ReactNode }) {
  const t = tone ? CARD_EDGE[tone] : null;
  return (
    <div
      className={cn("relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[12px] border bg-agon-s1 py-3 pl-4 pr-3.5", t?.edge)}
      style={color ? { borderColor: alpha(color, 0.267) } : undefined}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", t?.bar)} style={color ? { background: color } : undefined} />
      {children}
    </div>
  );
}

function Big({ value, unit, className }: { value: string; unit?: string; className: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cn("agon-mono text-[26px] leading-none", className)}>{value}</span>
      {unit && <span className="agon-mono text-[11px] text-agon-tx3">{unit}</span>}
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
            <text x={x + bw / 2} y={H + 14} textAnchor="middle" fill={last ? GOLD : C.tx3} className="agon-mono text-[9.5px]">
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
  const color = zone === "in" ? "bg-agon-succes" : zone ? "bg-agon-alerte" : "bg-agon-tx3";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 rounded-[4px] bg-agon-s2">
        <span className="absolute inset-y-0 rounded-[4px] bg-agon-succes/25" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
        {ratio != null && <span className={cn("absolute -top-[3px] h-3.5 w-[3px] rounded-[2px]", color)} style={{ left: pos(ratio) }} />}
      </div>
      <div className="agon-mono flex justify-between text-[9.5px] text-agon-tx3">
        <span>{dec(min, 1)}</span><span>Zone {dec(lo, 1)}–{dec(hi, 1)}</span><span>{dec(max, 1)}</span>
      </div>
    </div>
  );
}

export function WeekLoadPanel({ athleteId, weekStart }: { athleteId: string; weekStart: string }) {
  const { data, isLoading, isError } = useLoadWeeks(athleteId, weekStart, 6);
  if (isLoading) return <div className="h-[180px] rounded-[12px] border border-agon-brd bg-agon-s1" />;
  if (isError || !data) return <div className="text-[12px] text-agon-tx3">Charge de la semaine : lecture impossible.</div>;
  const w = data.weeks[data.weeks.length - 1];
  const sessionsDone = w.sessions.filter((s) => s.done !== null).length;
  const sessionsPlanned = w.sessions.filter((s) => s.planned !== null).length;
  const z = w.sessions.reduce<[number, number, number]>((acc, s) => {
    if (s.focus === "endurance" && s.minutes) for (let i = 0; i < 3; i++) acc[i] += s.minutes[i];
    return acc;
  }, [0, 0, 0]);
  const zTotal = z[0] + z[1] + z[2];

  const ratioTone = ratioZone(w.ratio) === "in" ? "text-agon-succes" : ratioZone(w.ratio) ? "text-agon-alerte" : "text-agon-tx3";
  const NOTE = "text-[11px] text-agon-tx2";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Kicker>Charge de la semaine en cours</Kicker>
        <span className="text-[11.5px] text-agon-tx3">Points YOXX : 1 pt = 1 min en zone 1</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        <Card tone="gold">
          <Kicker>Séances</Kicker>
          <Big value={String(sessionsDone)} unit={sessionsPlanned ? `/ ${sessionsPlanned} prévues` : undefined} className="text-agon-accent" />
          <div className={NOTE}>{w.keySessions} séance{w.keySessions > 1 ? "s" : ""} clé{w.keySessions > 1 ? "s" : ""}</div>
        </Card>
        <Card tone="blue">
          <Kicker>Volume course</Kicker>
          <Big value={w.km.total > 0 ? dec(w.km.total, 1) : DASH} unit="km" className="text-agon-info" />
          <div className={NOTE}>
            {pct(w.kmVariationPct)} vs semaine précédente · dont compromised {w.km.compromised > 0 ? dec(w.km.compromised, 1) : DASH} km
          </div>
        </Card>
        <Card color={zoneColor(1, 3)}>
          <Kicker>Zones d’intensité</Kicker>
          {zTotal > 0 ? (
            <>
              <div className="flex gap-0.5 overflow-hidden rounded-[3px]">
                {z.map((m, i) => m > 0 && <span key={i} className="h-2.5" style={{ flex: m, background: zoneColor(i + 1, 3) }} />)}
              </div>
              <div className="agon-mono flex gap-2.5 text-[10px] text-agon-tx2">
                {z.map((m, i) => <span key={i}>Z{i + 1} {Math.round((m / zTotal) * 100)} %</span>)}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-agon-tx3">{DASH} Temps par zone : course et ergos, montre ou séance prévue.</div>
          )}
        </Card>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
        <Card tone="gold">
          <div className="flex justify-between">
            <Kicker>Charge semaine</Kicker>
            <span className="agon-mono text-[11px] text-agon-tx2">prévu {int(w.planned)} · {pct(w.gapPct)}</span>
          </div>
          <Big value={int(w.done)} unit="pts" className="text-agon-accent" />
          <Bars weeks={data.weeks} />
          <div className={NOTE}>
            Monotonie {dec(w.monotony)} · contrainte {int(w.strain)}
            {w.top ? ` · plus coûteuse : ${w.top.label} (${int(w.top.points)} pts, ${Math.round(w.top.sharePct)} %)` : ""}
          </div>
          {data.missingRirSessions > 0 && (
            <div className="text-[11px] text-agon-alerte">
              {data.missingRirSessions} séance{data.missingRirSessions > 1 ? "s" : ""} de muscu sans RIR : 0,75 par série appliqué.
            </div>
          )}
        </Card>
        <Card tone="blue">
          <Kicker>Aiguë 7 j · chronique 28 j</Kicker>
          <Big value={`${int(w.done)} / ${int(w.chronic)}`} unit="pts" className="text-agon-tx" />
          <Kicker className="text-agon-tx3">Ratio aiguë / chronique</Kicker>
          <Big value={dec(w.ratio)} className={ratioTone} />
          <RatioGauge ratio={w.ratio} />
          <div className="text-[11px] text-agon-tx3">Contexte seulement : le ratio ne déclenche aucune alerte.</div>
        </Card>
      </div>
    </div>
  );
}
