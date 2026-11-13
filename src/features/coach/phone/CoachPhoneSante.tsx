import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import {
  HEALTH_METRICS, baselineAt, dailyValues, fmtMinutes, fmtValue, seriesTo, stateOf, streakOf,
  type Baseline, type HealthMetricDef, type HealthState,
} from "@/lib/healthView";
import type { HealthDay } from "@/api/health";
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";
import { CARD, Chevron, KICKER, MONO, PhonePage, Section, Tag, rowLine } from "./phoneUi";

interface View { def: HealthMetricDef; v: number | null; base: Baseline | null; state: HealthState; streak: number; series: Array<{ day: IsoDay; v: number | null }> }

function Spark({ pts, base, h = 28 }: { pts: Array<{ v: number | null }>; base: Baseline | null; h?: number }) {
  const vs = pts.map((p) => p.v).filter((v): v is number => v != null);
  if (!vs.length) return <div style={{ height: h }} />;
  const lo = Math.min(...vs, base?.low ?? Infinity), hi = Math.max(...vs, base?.high ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100);
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  let d = "";
  pts.forEach((p, i) => { if (p.v == null) return; d += `${d && pts[i - 1]?.v != null ? "L" : "M"}${x(i)},${y(p.v)}`; });
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
      {base && <rect x={0} width={100} y={y(base.high)} height={Math.max(1, y(base.low) - y(base.high))} fill={C.g} opacity={0.12} />}
      <path d={d} fill="none" stroke={C.b} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const show = (def: HealthMetricDef, v: number | null) => (def.key === "sleep" ? fmtMinutes(v) : `${fmtValue(def, v)}${v != null && def.unit ? ` ${def.unit}` : ""}`);

/**
 * Santé d'un athlète sur téléphone (planche CoachTelSante) : nuit mesurée
 * par la montre contre son ressenti, mesures hors de sa normale puis dans sa
 * normale (zone habituelle sur 28 jours), courbes des 14 dernières nuits.
 */
export default function CoachPhoneSante() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { athleteProfile } = useAthleteContext();
  const first = (athleteProfile?.first_name || athleteProfile?.full_name?.split(" ")[0] || "L’athlète").trim();
  const today = localIsoDay();
  const [offset, setOffset] = useState(0);
  const day = addDays(today, offset);
  const { data: days = [], isLoading, isError } = useHealthWindow(athleteId, day);
  const hist = useWellnessHistory(athleteId, { from: addDays(day, -1) } as never);
  const [open, setOpen] = useState<string | null>(null);

  const views = useMemo<View[]>(() => HEALTH_METRICS.map((def) => {
    const values = dailyValues(days as readonly HealthDay[], def.pick);
    const cur = values.get(day) ?? null;
    const base = baselineAt(values, day);
    const state = stateOf(cur?.v ?? null, base);
    return { def, v: cur?.v ?? null, base, state, streak: streakOf(values, day, state), series: seriesTo(values, day, 14) };
  }), [days, day]);
  const night = (days as HealthDay[]).filter((d) => d.day === day).sort((a) => (a.source === "garmin" ? -1 : 1))[0] ?? null;
  const source = night?.attribution ?? (days as HealthDay[])[days.length - 1]?.attribution ?? null;
  const present = views.filter((v) => v.v != null);
  const out = present.filter((v) => v.state === "low" || v.state === "high");
  const inside = present.filter((v) => v.state === "normal" || v.state == null);

  // Ressenti déclaré (wellness du matin) contre la mesure de la nuit.
  const entry = (hist.data as Record<string, { items: { sommeil: number | null; energie: number | null } }> | undefined)?.[day] ?? null;
  const sleepV = views.find((v) => v.def.key === "sleep") ?? null;
  const bbV = views.find((v) => v.def.key === "bodyBattery") ?? null;
  const gaps: Array<{ label: string; declared: number; measured: string; foot: string }> = [];
  if (entry?.items.sommeil != null && sleepV?.v != null && entry.items.sommeil >= 4 && sleepV.state === "low") {
    gaps.push({ label: "Sommeil", declared: entry.items.sommeil, measured: fmtMinutes(sleepV.v), foot: `${night?.sleepScore != null ? `score ${Math.round(night.sleepScore)} · ` : ""}moy. ${fmtMinutes(sleepV.base?.mean ?? null)}` });
  }
  if (entry?.items.energie != null && bbV?.v != null && entry.items.energie >= 4 && bbV.state === "low") {
    gaps.push({ label: "Énergie", declared: entry.items.energie, measured: fmtValue(bbV.def, bbV.v), foot: `Body Battery au réveil · moy. ${fmtValue(bbV.def, bbV.base?.mean ?? null)}` });
  }

  const nightLabel = `Nuit du ${new Date(addDays(day, -1) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric" })} au ${new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  const navBtn: React.CSSProperties = { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" };

  const row = (v: View, i: number, outside: boolean) => {
    const isOpen = open === v.def.key;
    return (
      <button key={v.def.key} type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : v.def.key)} style={{
        display: "block", width: "100%", padding: "11px 0", background: "none", border: "none", boxShadow: rowLine(i),
        color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5 }}>{v.def.label}</div>
            {outside && (
              <div style={{ fontSize: 12, color: C.o }}>
                {v.state === "low" ? "Bas" : "Haut"}{v.streak > 1 ? ` · ${v.streak} j` : ""}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...MONO, fontSize: 14, color: outside ? C.o : C.tx }}>{show(v.def, v.v)}</div>
            {v.base && <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>Moy. {show(v.def, v.base.mean)}</div>}
          </div>
        </div>
        {(outside || isOpen) && <div style={{ marginTop: 8 }}><Spark pts={v.series} base={v.base} h={isOpen ? 70 : 28} /></div>}
        {isOpen && <div style={{ fontSize: 12, color: C.tx2, marginTop: 8, lineHeight: 1.45 }}>{v.def.explain}</div>}
      </button>
    );
  };

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 34 }}>
        <button type="button" aria-label="Nuit précédente" style={navBtn} onClick={() => setOffset((o) => o - 1)}><Chevron dir="left" color={C.tx2} size={20} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{nightLabel}</div>
          {source && <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{source}</div>}
        </div>
        <button type="button" aria-label="Nuit suivante" disabled={offset >= 0} style={{ ...navBtn, opacity: offset >= 0 ? 0.3 : 1 }} onClick={() => setOffset((o) => Math.min(0, o + 1))}><Chevron color={C.tx2} size={20} /></button>
      </div>

      {isError ? (
        <div style={{ fontSize: 12.5, color: C.o }}>Santé : lecture impossible.</div>
      ) : isLoading ? null : days.length === 0 ? (
        <div style={{ ...CARD, padding: 16, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
          Aucune donnée de montre pour {first}. Sommeil, VFC et FC de repos arrivent ici chaque matin une fois sa montre reliée.
        </div>
      ) : (
        <>
          {gaps.length > 0 && (
            <div style={{ padding: 14, borderRadius: 14, background: `radial-gradient(120% 120% at 100% 0%, ${alpha(C.o, 0.14)}, transparent 60%), ${C.s1}`, border: `1px solid ${alpha(C.o, 0.35)}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...KICKER, color: C.tx2 }}>Écart avec son ressenti</span>
                <Tag color={C.o} filled>À vérifier</Tag>
              </div>
              {gaps.map((g) => (
                <div key={g.label} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.tx3 }}>{g.label} déclaré</div>
                    <div style={{ ...MONO, fontSize: 18 }}>{g.declared} / 5 <span style={{ color: C.o }}>≠</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.tx3 }}>mesuré par la montre</div>
                    <div style={{ ...MONO, fontSize: 18, color: C.o }}>{g.measured}</div>
                    <div style={{ fontSize: 11, color: C.tx3 }}>{g.foot}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: C.tx2 }}>{first} se dit en forme, mais la montre mesure moins bien que d’habitude.</div>
            </div>
          )}

          {out.length > 0 && (
            <Section n={1} title="Hors de sa normale" count={out.length}>
              <div style={{ ...CARD, padding: "2px 14px" }}>{out.map((v, i) => row(v, i, true))}</div>
            </Section>
          )}
          {inside.length > 0 && (
            <Section n={out.length > 0 ? 2 : 1} title="Dans sa normale" count={inside.length}>
              <div style={{ ...CARD, padding: "2px 14px" }}>{inside.map((v, i) => row(v, i, false))}</div>
            </Section>
          )}
          {present.length === 0 && <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Pas de mesure pour cette nuit.</div>}
          <div style={{ fontSize: 11.5, color: C.tx3 }}>Bande verte = sa zone habituelle sur 28 jours. Courbes : 14 dernières nuits. Touche une mesure pour le détail.</div>
        </>
      )}
    </PhonePage>
  );
}
