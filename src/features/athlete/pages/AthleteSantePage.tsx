import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { headerGlow } from "@/features/athlete/components/headerGlow";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { HealthDay } from "@/api/health";
import {
  HEALTH_METRICS, baselineAt, dailyValues, fmtMinutes, fmtValue, seriesTo, stateOf, streakOf,
  type Baseline, type HealthMetricDef, type HealthState,
} from "@/lib/healthView";

const CARD: CSSProperties = { borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, padding: "12px 13px", minWidth: 0 };
const STATE: Record<"low" | "high" | "normal", { label: string; color: string }> = {
  normal: { label: "Normal", color: C.g },
  low: { label: "↓ Bas", color: C.o },
  high: { label: "↑ Haut", color: C.o },
};
type Span = "day" | "7" | "28";

function StatePill({ state }: { state: HealthState }) {
  if (!state) return null;
  const s = STATE[state];
  return <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: s.color, border: `1px solid ${s.color}88`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

/** Courbe : points du jour, zone habituelle en bande. */
function Spark({ pts, base, h = 34, dots = false }: { pts: Array<{ v: number | null }>; base: Baseline | null; h?: number; dots?: boolean }) {
  const vs = pts.map((p) => p.v).filter((v): v is number => v != null);
  if (!vs.length) return <div style={{ height: h }} />;
  const lo = Math.min(...vs, base?.low ?? Infinity), hi = Math.max(...vs, base?.high ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100);
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  let d = "";
  pts.forEach((p, i) => { if (p.v == null) return; d += `${d && pts[i - 1]?.v != null ? "L" : "M"}${x(i)},${y(p.v)}`; });
  const last = [...pts].reverse().findIndex((p) => p.v != null);
  const li = pts.length - 1 - last;
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
      {base && <rect x={0} width={100} y={y(base.high)} height={Math.max(1, y(base.low) - y(base.high))} fill={C.tx} opacity={0.06} />}
      <path d={d} fill="none" stroke={C.b} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {dots && pts.map((p, i) => p.v != null && <circle key={i} cx={x(i)} cy={y(p.v)} r={1.2} fill={C.b} />)}
      {pts[li]?.v != null && <circle cx={x(li)} cy={y(pts[li].v!)} r={2.2} fill={C.tx} />}
    </svg>
  );
}

interface MetricView { def: HealthMetricDef; v: number | null; source: string | null; base: Baseline | null; state: HealthState; series: Array<{ day: IsoDay; v: number | null }>; values: ReturnType<typeof dailyValues> }

function viewOf(def: HealthMetricDef, days: readonly HealthDay[], day: IsoDay, n: number): MetricView {
  const values = dailyValues(days, def.pick);
  const cur = values.get(day) ?? null;
  const base = baselineAt(values, day);
  return { def, v: cur?.v ?? null, source: cur?.source ?? null, base, state: stateOf(cur?.v ?? null, base), series: seriesTo(values, day, n), values };
}

const fmtDayShort = (d: IsoDay) => { const s = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); return s.charAt(0).toUpperCase() + s.slice(1); };
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * « Santé » (planche Ath2Sante), ouverte depuis le wellness : mesures de la
 * nuit venues de la montre, état comparé à la zone habituelle de l'athlète,
 * courbes ; une mesure touchée ouvre son détail sur 28 jours.
 */
/**
 * @param coachView  Vue coach (planche CoachOrdiASante, onglet Santé de Retours) :
 *   sans en-tête de page, à la 3ᵉ personne, précédée du bloc « Ressenti / mesuré ».
 */
export default function AthleteSantePage({ coachView, top }: { coachView?: { firstName: string }; top?: ReactNode } = {}) {
  const isDesktop = useIsDesktop();
  const { athleteId } = useAthleteContext();
  const day = localIsoDay();
  const { data: days = [], isLoading } = useHealthWindow(athleteId, day);
  const [span, setSpan] = useState<Span>("day");
  const [open, setOpen] = useState<HealthMetricDef["key"] | null>(null);
  const n = span === "28" ? 28 : 7;
  const views = useMemo(() => HEALTH_METRICS.map((m) => viewOf(m, days, day, n)), [days, day, n]);
  const today = days.filter((d) => d.day === day).sort((a) => (a.source === "garmin" ? -1 : 1))[0] ?? null;
  const source = today?.attribution ?? days[days.length - 1]?.attribution ?? null;
  const opened = open ? views.find((v) => v.def.key === open)! : null;

  const tabs = (
    <div style={{ display: "flex", padding: 3, borderRadius: 11, background: C.s2, fontSize: 12 }} role="tablist">
      {([["day", "Jour"], ["7", "7 j"], ["28", "28 j"]] as const).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={span === k} onClick={() => setSpan(k)} style={{
          flex: 1, height: 30, borderRadius: 8, border: span === k ? `1px solid ${C.brdL}` : "1px solid transparent",
          background: span === k ? C.s1 : "transparent", color: span === k ? C.tx : C.tx3, fontFamily: "inherit", fontSize: 12, cursor: "pointer",
        }}>{l}</button>
      ))}
    </div>
  );

  if (opened) {
    const s28 = seriesTo(opened.values, day, 28);
    const vs = s28.map((p) => p.v).filter((v): v is number => v != null);
    const streak = streakOf(opened.values, day, opened.state);
    return (
      <div style={{ maxWidth: 480, margin: coachView ? 0 : "0 auto" }}>
        {!coachView && <AthletePageHeader title={opened.def.label} titleSize={22} background={headerGlow("#33B5FF", undefined)} />}
        <div style={{ padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" onClick={() => setOpen(null)} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.tx3, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>‹ Santé</button>
          {opened.source && <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{opened.source}</div>}
          {tabs}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...MONO, fontSize: 40, lineHeight: 1 }}>{fmtValue(opened.def, opened.v)}</span>
            {opened.def.unit && opened.def.key !== "sleep" && <span style={{ ...MONO, fontSize: 13, color: C.tx3 }}>{opened.def.unit}</span>}
            <StatePill state={opened.state} />
          </div>
          {streak > 1 && <div style={{ fontSize: 13, color: C.o }}>{streak}ᵉ nuit {opened.state === "low" ? "sous" : "au-dessus de"} {coachView ? "sa" : "ta"} zone habituelle</div>}
          <div style={CARD}>
            <Spark pts={span === "day" ? s28 : seriesTo(opened.values, day, n)} base={opened.base} h={120} dots />
            {opened.base && <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 8 }}>▒ {coachView ? "sa" : "ta"} zone habituelle · moyenne {fmtValue(opened.def, opened.base.mean)}{opened.def.key === "sleep" ? "" : ` ${opened.def.unit}`}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {([["Plus bas", vs.length ? Math.min(...vs) : null], ["Moyenne", vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null], ["Plus haut", vs.length ? Math.max(...vs) : null]] as const).map(([k, v]) => (
              <div key={k} style={CARD}>
                <div style={{ fontSize: 11.5, color: C.tx3 }}>{k}</div>
                <div style={{ ...MONO, fontSize: 18, marginTop: 4 }}>{fmtValue(opened.def, v)}<span style={{ fontSize: 11, color: C.tx3 }}> {opened.def.key === "sleep" ? "" : opened.def.unit}</span></div>
              </div>
            ))}
          </div>
          <div style={{ ...CARD, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>C’est quoi ?</div>
            <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>{opened.def.explain}</div>
          </div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>« Bas » ou « Haut » : comparé à {coachView ? "sa" : "ta"} propre zone habituelle des 28 derniers jours, jamais aux autres.</div>
        </div>
      </div>
    );
  }

  const [sleep, ...rest] = views;
  return (
    <div style={{ maxWidth: isDesktop ? 1248 : 480, margin: "0 auto" }}>
      {!coachView && <AthletePageHeader title="Santé" titleSize={24} background={headerGlow("#33B5FF", undefined)} />}
      <div style={{ padding: coachView ? "0 0 40px" : "16px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {top}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: C.tx2 }}>
          <span>{fmtDayShort(day)}</span>
          {source && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{source}</span>}
        </div>
        {tabs}
        {isLoading ? null : !days.length ? (
          <div style={{ ...CARD, padding: 16, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
            Aucune donnée de montre pour l’instant. {coachView ? `${coachView.firstName} n’a pas relié de montre : sommeil, VFC et FC de repos arriveront ici chaque matin une fois sa montre reliée.` : "Relie ta montre dans Profil › Montres et données : sommeil, VFC et FC de repos arriveront ici chaque matin."}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setOpen("sleep")} style={{ ...CARD, padding: 14, textAlign: "left", color: C.tx, fontFamily: "inherit", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, color: C.tx2 }}>Sommeil</span>
                <StatePill state={sleep.state} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...MONO, fontSize: 30, lineHeight: 1.1 }}>{fmtMinutes(sleep.v)}</div>
                  <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 4 }}>
                    {hm(today?.sleepStartAt ?? null)} → {hm(today?.sleepEndAt ?? null)}{sleep.base ? ` · moy. ${fmtMinutes(sleep.base.mean)}` : ""}
                  </div>
                </div>
                {today?.sleepScore != null && (
                  <div style={{ textAlign: "right" }}>
                    <div><span style={{ ...MONO, fontSize: 22 }}>{Math.round(today.sleepScore)}</span><span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>/100</span></div>
                    <div style={{ fontSize: 11, color: C.tx3 }}>score {today.attribution}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
                {([["Profond", today?.sleepDeepMin], ["Léger", today?.sleepLightMin], ["Paradoxal", today?.sleepRemMin], ["Éveil", today?.sleepAwakeMin]] as const).map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10.5, color: C.tx3 }}>{k}</div><div style={{ ...MONO, fontSize: 12.5 }}>{fmtMinutes(v ?? null)}</div></div>
                ))}
              </div>
              <div style={{ marginTop: 8 }}><Spark pts={sleep.series} base={sleep.base} /></div>
            </button>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4, minmax(0, 1fr))" : "1fr 1fr", gap: 8 }}>
              {rest.map((m) => {
                const missing = m.v == null && !m.series.some((p) => p.v != null);
                return (
                  <button key={m.def.key} type="button" disabled={missing} onClick={() => setOpen(m.def.key)} style={{ ...CARD, textAlign: "left", color: C.tx, fontFamily: "inherit", cursor: missing ? "default" : "pointer" }}>
                    <div style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.def.label}</div>
                    {missing ? (
                      <>
                        <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 6 }}>Non fournie par cette montre</div>
                        <div style={{ ...MONO, fontSize: 22, color: C.tx3, marginTop: 4 }}>—</div>
                      </>
                    ) : (
                      <>
                        <div style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                          <span style={{ ...MONO, fontSize: 22 }}>{fmtValue(m.def, m.v)}</span>
                          <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}> {m.def.unit}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, minHeight: 20 }}>
                          <StatePill state={m.state} />
                          {m.base && <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>moy. {fmtValue(m.def, m.base.mean)}</span>}
                        </div>
                        <div style={{ marginTop: 6 }}><Spark pts={m.series} base={m.base} h={26} /></div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: C.tx3 }}>▒ ta moyenne · courbes sur {n} jours · touche une mesure</div>
          </>
        )}
      </div>
    </div>
  );
}
