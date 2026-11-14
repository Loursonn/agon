import { useEffect, useMemo, useRef, useState } from "react";
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
import { gapSentence } from "@/lib/santeCoach";
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";
import { CARD, Chevron, KICKER, MONO, PhonePage, Section, Tag, rowLine } from "./phoneUi";

interface View { def: HealthMetricDef; v: number | null; base: Baseline | null; state: HealthState; streak: number; series: Array<{ day: IsoDay; v: number | null }>; series28: Array<{ day: IsoDay; v: number | null }> }

function Spark({ pts, base, h = 28, end }: { pts: Array<{ v: number | null }>; base: Baseline | null; h?: number; end?: string }) {
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
      {base && <rect x={0} width={100} y={y(base.high)} height={Math.max(1, y(base.low) - y(base.high))} fill={C.g} opacity={0.16} />}
      <path d={d} fill="none" stroke={end ?? C.tx2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
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
  // « Détails sur 28 jours » : courbes dépliées sur 28 nuits au lieu de 14.
  const [long, setLong] = useState(false);

  // Nuit pas encore remontée (montre synchronisée plus tard) : on ouvre une
  // seule fois sur la dernière nuit mesurée de la fenêtre.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || isLoading || offset !== 0) return;
    jumped.current = true;
    const rows = days as HealthDay[];
    if (rows.some((d) => d.day === today)) return;
    const last = rows.map((d) => d.day).filter((d) => d < today).sort().pop();
    if (!last) return;
    let n = 0;
    while (n > -28 && addDays(today, n) > last) n--;
    if (addDays(today, n) === last) setOffset(n);
  }, [days, isLoading, offset, today]);

  const views = useMemo<View[]>(() => HEALTH_METRICS.map((def) => {
    const values = dailyValues(days as readonly HealthDay[], def.pick);
    const cur = values.get(day) ?? null;
    const base = baselineAt(values, day);
    const state = stateOf(cur?.v ?? null, base);
    return { def, v: cur?.v ?? null, base, state, streak: streakOf(values, day, state), series: seriesTo(values, day, 14), series28: seriesTo(values, day, 28) };
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
  const sleepGap = entry?.items.sommeil != null && sleepV?.v != null && entry.items.sommeil >= 4 && sleepV.state === "low";
  const energyGap = entry?.items.energie != null && bbV?.v != null && entry.items.energie >= 4 && bbV.state === "low";
  const gapText = gapSentence(first, sleepGap ? Math.max(1, sleepV!.streak) : null, energyGap ? Math.max(1, bbV!.streak) : null);
  if (sleepGap && entry?.items.sommeil != null && sleepV?.v != null) {
    gaps.push({ label: "Sommeil", declared: entry.items.sommeil, measured: fmtMinutes(sleepV.v), foot: `${night?.sleepScore != null ? `score ${Math.round(night.sleepScore)} · ` : ""}moy. ${fmtMinutes(sleepV.base?.mean ?? null)}` });
  }
  if (energyGap && entry?.items.energie != null && bbV?.v != null) {
    gaps.push({ label: "Énergie", declared: entry.items.energie, measured: fmtValue(bbV.def, bbV.v), foot: `Body Battery au réveil · moy. ${fmtValue(bbV.def, bbV.base?.mean ?? null)}` });
  }

  const nightLabel = `Nuit du ${new Date(addDays(day, -1) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric" })} au ${new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  const navBtn: React.CSSProperties = { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" };

  const toggle = (k: string) => setOpen(open === k ? null : k);
  const unitOf = (v: View) => (v.def.key === "sleep" || !v.def.unit ? null : v.def.unit);
  const num = (v: View, x: number | null) => (v.def.key === "sleep" ? fmtMinutes(x) : fmtValue(v.def, x));

  // Hors de sa normale : tuiles deux par ligne, valeur, écart, courbe, moyenne.
  const tile = (v: View) => {
    const isOpen = open === v.def.key;
    const col = v.streak >= 3 ? C.r : C.o;
    return (
      <button key={v.def.key} type="button" aria-expanded={isOpen} onClick={() => toggle(v.def.key)} style={{
        ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
        gridColumn: isOpen ? "1 / -1" : undefined, color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.def.label}</span>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: col, flexShrink: 0 }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
          <span style={{ ...MONO, fontSize: 24, lineHeight: 1.1 }}>{num(v, v.v)}</span>
          {unitOf(v) && <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>{unitOf(v)}</span>}
        </div>
        <div style={{ fontSize: 12, color: col }}>{v.state === "low" ? "Bas" : "Haut"}{v.streak > 1 ? ` · ${v.streak} j` : ""}</div>
        <Spark pts={long ? v.series28 : v.series} base={v.base} h={isOpen ? 70 : 34} end={col} />
        {v.base && <div style={{ fontSize: 11.5, color: C.tx3 }}>Moy. {show(v.def, v.base.mean)}</div>}
        {isOpen && <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>{v.def.explain}</div>}
      </button>
    );
  };

  // Dans sa normale : une ligne par mesure, petite courbe, valeur, point vert.
  const row = (v: View, i: number) => {
    const isOpen = open === v.def.key;
    return (
      <button key={v.def.key} type="button" aria-expanded={isOpen} onClick={() => toggle(v.def.key)} style={{
        display: "block", width: "100%", padding: "12px 0", background: "none", border: "none", boxShadow: rowLine(i),
        color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{v.def.label}</span>
          {!isOpen && <div style={{ width: 72 }}><Spark pts={v.series} base={v.base} h={16} /></div>}
          <span style={{ ...MONO, fontSize: 14.5, minWidth: 74, textAlign: "right", whiteSpace: "nowrap" }}>
            {num(v, v.v)}{unitOf(v) && <span style={{ fontSize: 11, color: C.tx3 }}> {unitOf(v)}</span>}
          </span>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: C.g, flexShrink: 0 }} />
        </div>
        {isOpen && <div style={{ marginTop: 8 }}><Spark pts={long ? v.series28 : v.series} base={v.base} h={70} /></div>}
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
            <div style={{ padding: 18, borderRadius: 16, background: alpha(C.o, 0.08), border: `1px solid ${alpha(C.o, 0.5)}`, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...KICKER, color: C.o }}>Écart avec son ressenti</span>
                <Tag color={C.o} filled>À vérifier</Tag>
              </div>
              {gaps.map((g, i) => (
                <div key={g.label} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12, paddingTop: i ? 14 : 0, boxShadow: rowLine(i) }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: C.tx2 }}>{g.label} déclaré{g.label === "Énergie" ? "e" : ""}</div>
                    <div style={{ marginTop: 4 }}><span style={{ ...MONO, fontSize: 26, color: C.g }}>{g.declared}</span><span style={{ ...MONO, fontSize: 12, color: C.tx3 }}> / 5</span></div>
                  </div>
                  <span style={{ ...MONO, fontSize: 18, color: C.tx3, textAlign: "center" }}>≠</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: C.tx2 }}>mesuré par la montre</div>
                    <div style={{ ...MONO, fontSize: 22, color: C.o, marginTop: 4 }}>{g.measured}</div>
                    <div style={{ fontSize: 11, color: C.tx2 }}>{g.foot}</div>
                  </div>
                </div>
              ))}
              {gapText && <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, boxShadow: rowLine(1), paddingTop: 12 }}>{gapText}</div>}
            </div>
          )}

          {out.length > 0 && (
            <Section n={1} title="Hors de sa normale" count={out.length}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{out.map(tile)}</div>
            </Section>
          )}
          {inside.length > 0 && (
            <Section n={out.length > 0 ? 2 : 1} title="Dans sa normale" count={inside.length}>
              <div style={{ ...CARD, padding: "2px 16px" }}>{inside.map(row)}</div>
            </Section>
          )}
          {present.length === 0 && <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Pas de mesure pour cette nuit.</div>}
          <div style={{ fontSize: 11.5, color: C.tx3 }}>Bande verte = sa zone habituelle sur 28 jours. Courbes : {long ? 28 : 14} dernières nuits. Touche une mesure pour le détail.</div>
          {present.length > 0 && (
            <button type="button" onClick={() => {
              if (long) { setLong(false); return; }
              setLong(true);
              setOpen((out[0] ?? present[0]).def.key);
            }} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {long ? "Revenir aux 14 nuits ›" : "Détails sur 28 jours ›"}
            </button>
          )}
        </>
      )}
    </PhonePage>
  );
}
