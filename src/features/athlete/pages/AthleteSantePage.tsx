import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useMemo, useState, type ReactNode } from "react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { DayBars } from "@/features/coach/components/sante/SanteParts";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { HealthDay } from "@/api/health";
import {
  HEALTH_METRICS, baselineAt, dailyValues, fmtMinutes, fmtValue, seriesTo, stateOf, streakOf,
  type Baseline, type HealthMetricDef, type HealthState,
} from "@/lib/healthView";

/** Carte sans padding ; CARD = avec le padding par défaut (12px 13px). */
const CARD_BASE = "min-w-0 rounded-[14px] border border-agon-brd bg-agon-s1";
const CARD = cn(CARD_BASE, "px-[13px] py-3");
/** pill : fond 14 % + texte ; dot : pastille pleine. */
const STATE: Record<"low" | "high" | "normal", { label: string; pill: string; dot: string }> = {
  normal: { label: "Normal", pill: "bg-agon-succes/[0.14] text-agon-succes", dot: "bg-agon-succes" },
  low: { label: "↓ Bas", pill: "bg-agon-alerte/[0.14] text-agon-alerte", dot: "bg-agon-alerte" },
  high: { label: "↑ Haut", pill: "bg-agon-alerte/[0.14] text-agon-alerte", dot: "bg-agon-alerte" },
};
type Span = "day" | "7" | "28";

function StatePill({ state }: { state: HealthState }) {
  if (!state) return null;
  const s = STATE[state];
  return (
    <span className={cn("inline-flex h-5 flex-none items-center gap-[5px] whitespace-nowrap rounded-full px-[7px] text-[11px]", s.pill)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", s.dot)} />{s.label}
    </span>
  );
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
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} aria-hidden>
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

const fmtDayShort = (d: IsoDay, lower = false) => { const s = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); return lower ? s : s.charAt(0).toUpperCase() + s.slice(1); };
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * « Santé » (planche Ath2Sante), ouverte depuis le wellness : mesures de la
 * nuit venues de la montre, état comparé à la zone habituelle de l'athlète,
 * courbes ; une mesure touchée ouvre son détail sur 28 jours.
 */
/**
 * @param coachView  Vue coach (planche CoachOrdiASante, onglet Santé de Retours) :
 *   sans en-tête de page, à la 3ᵉ personne, précédée du bloc « Ressenti / mesuré » (`top`)
 *   et suivie du wellness déclaré et des courbes ressenti / mesuré (`bottom`).
 *   Moyennes « 28 j » explicites et score de sommeil des 7 nuits en barres.
 */
export default function AthleteSantePage({ coachView, top, montreTitle, bottom }: { coachView?: { firstName: string }; top?: ReactNode; montreTitle?: ReactNode; bottom?: ReactNode } = {}) {
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
  // Score de sommeil (Garmin, affiché tel quel) : moyenne 28 j et 7 nuits en barres, vue coach.
  const sleepScores = useMemo(() => dailyValues(days, (d) => d.sleepScore), [days]);
  const sleepScoreMean = baselineAt(sleepScores, day)?.mean ?? null;
  const sleepScore7 = seriesTo(sleepScores, day, 7);

  const tabs = (
    <div className="flex rounded-[11px] bg-agon-s2 p-[3px] text-[12px]" role="tablist">
      {([["day", "Jour"], ["7", "7 j"], ["28", "28 j"]] as const).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={span === k} onClick={() => setSpan(k)}
          className={cn("h-[30px] flex-1 cursor-pointer rounded-[8px] border font-[inherit] text-[12px]", span === k ? "border-agon-brd-l bg-agon-s1 text-agon-tx" : "border-transparent bg-transparent text-agon-tx3")}
        >{l}</button>
      ))}
    </div>
  );

  if (opened) {
    const s28 = seriesTo(opened.values, day, 28);
    const vs = s28.map((p) => p.v).filter((v): v is number => v != null);
    const streak = streakOf(opened.values, day, opened.state);
    return (
      <div className={cn("max-w-[480px]", coachView ? "m-0" : "mx-auto my-0")}>
        {!coachView && <AthletePageHeader title={opened.def.label} titleSize={22} />}
        <div className="flex flex-col gap-3 px-4 pb-10 pt-4">
          <button type="button" onClick={() => setOpen(null)} className="cursor-pointer self-start border-none bg-none p-0 font-[inherit] text-[12.5px] text-agon-tx3">‹ Santé</button>
          {opened.source && <div className="agon-mono text-[11px] text-agon-tx3">{opened.source}</div>}
          {tabs}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="agon-mono text-[40px] leading-none">{fmtValue(opened.def, opened.v)}</span>
            {opened.def.unit && opened.def.key !== "sleep" && <span className="agon-mono text-[13px] text-agon-tx3">{opened.def.unit}</span>}
            <StatePill state={opened.state} />
          </div>
          {streak > 1 && <div className="text-[13px] text-agon-alerte">{streak}ᵉ nuit {opened.state === "low" ? "sous" : "au-dessus de"} {coachView ? "sa" : "ta"} zone habituelle</div>}
          <div className={CARD}>
            <Spark pts={span === "day" ? s28 : seriesTo(opened.values, day, n)} base={opened.base} h={120} dots />
            {opened.base && <div className="mt-2 text-[11.5px] text-agon-tx3">▒ {coachView ? "sa" : "ta"} zone habituelle · moyenne {fmtValue(opened.def, opened.base.mean)}{opened.def.key === "sleep" ? "" : ` ${opened.def.unit}`}</div>}
          </div>
          <div className="grid grid-cols-[repeat(3,1fr)] gap-2">
            {([["Plus bas", vs.length ? Math.min(...vs) : null], ["Moyenne", vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null], ["Plus haut", vs.length ? Math.max(...vs) : null]] as const).map(([k, v]) => (
              <div key={k} className={CARD}>
                <div className="text-[11.5px] text-agon-tx3">{k}</div>
                <div className="agon-mono mt-1 text-[18px]">{fmtValue(opened.def, v)}<span className="text-[11px] text-agon-tx3"> {opened.def.key === "sleep" ? "" : opened.def.unit}</span></div>
              </div>
            ))}
          </div>
          <div className={cn(CARD_BASE, "p-3.5")}>
            <div className="mb-1.5 text-[14px] font-medium">C’est quoi ?</div>
            <div className="text-[12.5px] leading-normal text-agon-tx2">{opened.def.explain}</div>
          </div>
          <div className="text-[12px] leading-normal text-agon-tx3">« Bas » ou « Haut » : comparé à {coachView ? "sa" : "ta"} propre zone habituelle des 28 derniers jours, jamais aux autres.</div>
        </div>
      </div>
    );
  }

  const [sleep, ...rest] = views;
  // Vue coach ordinateur (planche CoachOrdiASante) : pleine largeur, mesures de
  // la montre à gauche, wellness déclaré à droite.
  const coachWide = !!coachView && isDesktop;
  const montre = (
      <>
        <div className="flex justify-between gap-2 text-[12.5px] text-agon-tx2">
          <span>{fmtDayShort(day, !!coachView)}</span>
          {source && <span className="agon-mono text-[11px] text-agon-tx3">{source}</span>}
        </div>
        {tabs}
        {isLoading ? null : !days.length ? (
          <div className={cn(CARD_BASE, "p-4 text-[13px] leading-normal text-agon-tx2")}>
            Aucune donnée de montre pour l’instant. {coachView ? `${coachView.firstName} n’a pas relié de montre : sommeil, VFC et FC de repos arriveront ici chaque matin une fois sa montre reliée.` : "Relie ta montre dans Profil › Montres et données : sommeil, VFC et FC de repos arriveront ici chaque matin."}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setOpen("sleep")} className={cn(CARD_BASE, "cursor-pointer p-3.5 text-left font-[inherit] text-agon-tx")}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] text-agon-tx2">Sommeil</span>
                <StatePill state={sleep.state} />
              </div>
              <div className="mt-1.5 flex items-end gap-3">
                <div className="flex-1">
                  <div className="agon-mono text-[30px] leading-[1.1]">{fmtMinutes(sleep.v)}</div>
                  <div className="mt-1 text-[11.5px] text-agon-tx3">
                    {coachView
                      ? `${sleep.base ? `Moy. 28 j : ${fmtMinutes(sleep.base.mean)}` : "Moy. 28 j : —"}${sleepScoreMean != null ? ` · score ${Math.round(sleepScoreMean)}` : ""} · coucher ${hm(today?.sleepStartAt ?? null)} → lever ${hm(today?.sleepEndAt ?? null)}`
                      : <>{hm(today?.sleepStartAt ?? null)} → {hm(today?.sleepEndAt ?? null)}{sleep.base ? ` · moy. ${fmtMinutes(sleep.base.mean)}` : ""}</>}
                  </div>
                </div>
                {today?.sleepScore != null && (
                  <div className="text-right">
                    <div><span className="agon-mono text-[22px]">{Math.round(today.sleepScore)}</span><span className="agon-mono text-[11px] text-agon-tx3">/100</span></div>
                    <div className="text-[11px] text-agon-tx3">score {today.attribution}</div>
                  </div>
                )}
              </div>
              {(() => {
                const phases = [
                  { k: "Profond", v: today?.sleepDeepMin ?? null, c: C.bP },
                  { k: "Léger", v: today?.sleepLightMin ?? null, c: C.b },
                  { k: "Paradoxal", v: today?.sleepRemMin ?? null, c: C.ame },
                  { k: "Éveil", v: today?.sleepAwakeMin ?? null, c: C.tx3 },
                ];
                const total = phases.reduce((a, p) => a + (p.v ?? 0), 0);
                return (
                  <>
                    {total > 0 && (
                      <div aria-hidden className="mt-3.5 flex h-3 gap-0.5 overflow-hidden rounded-[6px]">
                        {phases.map((p) => (p.v ?? 0) > 0 && <span key={p.k} style={{ width: `${((p.v ?? 0) / total) * 100}%`, background: p.c }} />)}
                      </div>
                    )}
                    <div className="mt-2.5 grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                      {phases.map((p) => (
                        <div key={p.k} className="flex items-center gap-1.5 whitespace-nowrap">
                          <span aria-hidden className="size-2 flex-none rounded-[2px]" style={{ background: p.c }} />
                          <span className="text-agon-tx2">{p.k}</span>
                          <span className="agon-mono text-agon-tx">{fmtMinutes(p.v)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
              {coachView && sleepScore7.some((p) => p.v != null) ? (
                <div className="mt-2.5">
                  <div className="mb-1.5 text-[11px] text-agon-tx3">Score de sommeil · 7 nuits</div>
                  <DayBars pts={sleepScore7} />
                </div>
              ) : (
                <div className="mt-2"><Spark pts={sleep.series} base={sleep.base} /></div>
              )}
            </button>
            <div className={cn("grid gap-2", isDesktop ? "grid-cols-4" : "grid-cols-[1fr_1fr]")}>
              {rest.map((m) => {
                const missing = m.v == null && !m.series.some((p) => p.v != null);
                return (
                  <button key={m.def.key} type="button" disabled={missing} onClick={() => setOpen(m.def.key)} className={cn(CARD, "text-left font-[inherit] text-agon-tx", missing ? "cursor-default" : "cursor-pointer")}>
                    <div className="truncate text-[12px] text-agon-tx2">{m.def.label}</div>
                    {missing ? (
                      <>
                        <div className="mt-1.5 text-[11.5px] text-agon-tx3">Non fournie par cette montre</div>
                        <div className="agon-mono mt-1 text-[22px] text-agon-tx3">—</div>
                      </>
                    ) : (
                      <>
                        <div className="mt-1 whitespace-nowrap">
                          <span className="agon-mono text-[22px]">{fmtValue(m.def, m.v)}</span>
                          <span className="agon-mono text-[11px] text-agon-tx3"> {m.def.unit}</span>
                        </div>
                        <div className="mt-1 flex min-h-5 items-center gap-1.5">
                          <StatePill state={m.state} />
                          {m.base && <span className="whitespace-nowrap text-[11px] text-agon-tx3">moy. {coachView ? `28 j ${fmtValue(m.def, m.base.mean)}${m.def.unit && !m.def.unit.startsWith("/") ? ` ${m.def.unit}` : ""}` : fmtValue(m.def, m.base.mean)}</span>}
                        </div>
                        <div className="mt-1.5"><Spark pts={m.series} base={m.base} h={26} /></div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[11.5px] text-agon-tx3">▒ {coachView ? "sa" : "ta"} moyenne · courbes sur {n} jours · touche une mesure</div>
            {coachView && (
              <div className="text-[11.5px] leading-normal text-agon-tx3">
                Body Battery, score de sommeil et stress sont des scores Garmin : affichés pour information, Agon ne s’en sert dans aucun calcul.
              </div>
            )}
          </>
        )}
      </>
  );

  if (coachWide) {
    return (
      <div className="flex w-full flex-col gap-3 pb-10">
        {top}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6">
          <div className="flex min-w-0 flex-col gap-3">{montreTitle}{montre}</div>
          <div className="flex min-w-0 flex-col gap-3">{bottom}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full", isDesktop ? "max-w-[1248px]" : "max-w-[480px]")}>
      {!coachView && <AthletePageHeader title="Santé" titleSize={24} />}
      <div className={cn("flex flex-col gap-3", coachView ? "pb-10" : "px-4 pb-10 pt-4")}>
        {top}
        {montreTitle}
        {montre}
        {bottom}
      </div>
    </div>
  );
}
