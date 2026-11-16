import { useId, useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid, LabelList } from "recharts";
import { ChevronLeft, ChevronRight, Clock, Gauge, Mountain } from "lucide-react";
import { C } from "@/lib/theme";
import {
  formatDuration,
  formatElevation,
  formatPace,
  providerAttribution,
  sportLabel,
} from "@/lib/activityDisplay";
import { iso, weekDetail, type RunningWeekDetail } from "@/lib/runningVolume";
import type { RunningVolume, RunOuting, WatchActivityInput } from "@/features/shared/hooks/useRunningVolume";

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS_FR = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

/** Titres de la charte : Archivo étiré, capitales. */
const DISPLAY: CSSProperties = { fontFamily: "var(--agon-font-display)", fontStretch: "125%" };
/** Chiffres : Geist Mono. */
const DATA: CSSProperties = { fontFamily: "var(--agon-font-data)", fontVariantNumeric: "tabular-nums" };

const dateOf = (isoDate: string) => new Date(`${isoDate}T12:00:00`);
const shortDate = (isoDate: string) => {
  const d = dateOf(isoDate);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
};
const kmNum = (km: number) => km.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Km lisibles ; une semaine sans course s'affiche « — », jamais « 0 km ». */
const fmtKm = (km: number | null | undefined) => (km != null && km > 0 ? `${kmNum(km)} km` : "—");

/** « 9 → 15 nov. », ou « 27 oct. → 2 nov. » quand la semaine change de mois. */
function weekRange(monday: string, sunday: string): string {
  const a = dateOf(monday);
  const b = dateOf(sunday);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} → ${b.getDate()} ${MONTHS_FR[b.getMonth()]}`
    : `${shortDate(monday)} → ${shortDate(sunday)}`;
}

function sundayOf(monday: string): string {
  const d = dateOf(monday);
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const signed = (n: number, unit: string) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${unit}`;

const ORIGIN_FALLBACK: Record<RunOuting["origin"], string> = {
  activity: "Course à pied",
  planned: "Séance énergie",
  free: "Course libre",
  strength: "Course en séance de muscu",
};

/** Nom affiché : titre de la sortie, séance prévue, sinon le sport. */
function outingName(o: RunOuting): string {
  if (o.label) return o.label;
  if (o.origin === "activity" && o.sport) return sportLabel(o.sport);
  return ORIGIN_FALLBACK[o.origin];
}

/** Provenance : « Garmin [modèle] » est exigé par Garmin partout où ses données s'affichent. */
function outingSource(o: RunOuting): string {
  if (o.provider) return providerAttribution(o.provider, o.device);
  return "Saisie";
}

/**
 * Volume de course à pied (saisie + montre, dédoublonnés).
 *
 * En tête, la semaine choisie en grand ; dessous, les barres des RUNNING_WEEKS
 * dernières semaines. Un clic (ou un toucher) sur une barre change de semaine et
 * affiche toutes ses sorties de course — et à part, hors total, les autres
 * activités d'endurance de la montre (vélo, natation…). La liste et le total
 * viennent du même calcul (`buildRunLedger`) : ils ne peuvent pas se contredire.
 */
export function RunningVolumeCard({
  volume,
  outings = [],
  others = [],
  isLoading,
  activityHref,
}: {
  volume: RunningVolume;
  outings?: RunOuting[];
  others?: WatchActivityInput[];
  isLoading?: boolean;
  /** Lien vers le détail d'une sortie de montre ; absent = lignes non cliquables */
  activityHref?: (activityId: string) => string;
}) {
  const uid = useId().replace(/:/g, "");
  const lastIndex = volume.weeks.length - 1;
  const [selected, setSelected] = useState(lastIndex);
  const sel = Math.min(Math.max(selected, 0), lastIndex);

  const counts = useMemo(() => {
    const byMonday = new Map<string, number>();
    for (const w of volume.weeks) byMonday.set(w.monday, 0);
    for (const o of outings) {
      const m = volume.weeks.find((w) => o.date >= w.monday && o.date <= sundayOf(w.monday));
      if (m) byMonday.set(m.monday, (byMonday.get(m.monday) ?? 0) + 1);
    }
    return byMonday;
  }, [volume.weeks, outings]);

  const data = volume.weeks.map((w, i) => ({
    monday: w.monday,
    km: w.km,
    count: counts.get(w.monday) ?? 0,
    current: i === lastIndex,
    selLabel: i === sel ? (w.km > 0 ? kmNum(w.km) : "—") : "",
    month: i === 0 || dateOf(w.monday).getMonth() !== dateOf(volume.weeks[i - 1].monday).getMonth(),
  }));

  const hasData = volume.weeks.some((w) => w.km > 0) || others.length > 0;
  // Moyenne des semaines terminées : la semaine en cours, incomplète, la tirerait vers le bas.
  const done = volume.weeks.slice(0, -1);
  const avgKm = done.length ? Math.round((done.reduce((s, w) => s + w.km, 0) / done.length) * 10) / 10 : 0;

  const week = useMemo(
    () => (volume.weeks[sel] ? weekDetail(outings, others, volume.weeks[sel].monday, iso(new Date())) : null),
    [outings, others, volume.weeks, sel],
  );

  const pick = (state: unknown) => {
    const i = Number((state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex);
    if (Number.isInteger(i) && i >= 0 && i <= lastIndex) setSelected(i);
  };

  const gradOn = `vol-on-${uid}`;
  const gradOff = `vol-off-${uid}`;
  const hatch = `vol-hatch-${uid}`;

  return (
    <div
      className="relative overflow-hidden rounded-[10px] border border-agon-brd bg-agon-s1"
      style={{ backgroundImage: `radial-gradient(120% 70% at 100% 0%, ${C.acS}, transparent 60%)` }}
    >
      {!hasData ? (
        <div className="px-4 py-6 text-center text-[11px] leading-normal text-agon-tx3">
          Aucune course enregistrée sur les {volume.weeks.length} dernières semaines. Les km se saisissent en fin de
          séance, ou arrivent d'une montre connectée.
        </div>
      ) : (
        <>
          {week && (
            <WeekHero
              week={week}
              isCurrent={sel === lastIndex}
              isLoading={isLoading}
              canPrev={sel > 0}
              canNext={sel < lastIndex}
              onPrev={() => setSelected(sel - 1)}
              onNext={() => setSelected(sel + 1)}
            />
          )}

          <div
            data-testid="running-volume-chart"
            className="px-2 [&_.recharts-surface:focus]:outline-none [&_.recharts-wrapper:focus]:outline-none [&_svg:focus]:outline-none"
            style={{ cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 26, right: 8, left: -10, bottom: 0 }} barCategoryGap="24%" onClick={pick}>
                <defs>
                  <linearGradient id={gradOn} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--agon-or-vif)" }} />
                    <stop offset="100%" style={{ stopColor: "var(--agon-or-profond)" }} />
                  </linearGradient>
                  <linearGradient id={gradOff} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--agon-or-vif)", stopOpacity: 0.42 }} />
                    <stop offset="100%" style={{ stopColor: "var(--agon-or-profond)", stopOpacity: 0.22 }} />
                  </linearGradient>
                  {/* Semaine en cours : hachurée, elle n'est pas finie */}
                  <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="5" height="5" style={{ fill: "var(--agon-or-vif)", fillOpacity: 0.22 }} />
                    <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--agon-or-vif)", strokeWidth: 2, strokeOpacity: 0.7 }} />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} stroke={C.brd} strokeDasharray="2 4" />
                <XAxis
                  dataKey="monday"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={30}
                  tick={(props: { x?: number | string; y?: number | string; index?: number }) => {
                    const d = data[props.index ?? 0];
                    if (!d) return <g />;
                    const isSel = (props.index ?? -1) === sel;
                    return (
                      <g transform={`translate(${props.x},${props.y})`}>
                        <text textAnchor="middle" dy={10} fontSize={9} fontWeight={isSel ? 700 : 400}
                          style={{ ...DATA, fill: isSel ? C.ac : C.tx3 }}>
                          {d.current ? "AUJ" : dateOf(d.monday).getDate()}
                        </text>
                        {d.month && !d.current && (
                          <text textAnchor="middle" dy={21} fontSize={8} style={{ ...DATA, fill: C.tx3, textTransform: "uppercase" }}>
                            {MONTHS_FR[dateOf(d.monday).getMonth()].replace(".", "")}
                          </text>
                        )}
                      </g>
                    );
                  }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: C.tx3, fontFamily: "var(--agon-font-data)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={30}
                  tickCount={4}
                />
                {avgKm > 0 && (
                  <ReferenceLine
                    y={avgKm}
                    stroke={C.tx2}
                    strokeOpacity={0.6}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{ value: `MOY ${kmNum(avgKm)}`, position: "insideBottomLeft", fontSize: 8, fill: C.tx2, fontFamily: "var(--agon-font-data)" }}
                  />
                )}
                <Tooltip
                  cursor={{ fill: C.ac, fillOpacity: 0.06, radius: 6 } as object}
                  contentStyle={{ background: C.bg, border: "1px solid " + C.brdL, borderRadius: 8, fontSize: 11, color: C.tx, fontFamily: "var(--agon-font-data)" }}
                  labelStyle={{ color: C.tx3 }}
                  labelFormatter={(m) => `Semaine du ${weekRange(String(m), sundayOf(String(m)))}`}
                  formatter={(v, _n, item) => {
                    const n = (item as { payload?: { count?: number } }).payload?.count ?? 0;
                    const sorties = n > 0 ? ` · ${n} sortie${n > 1 ? "s" : ""}` : "";
                    return [`${fmtKm(Number(v))}${sorties}`, "Course"];
                  }}
                />
                <Bar dataKey="km" radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell
                      key={d.monday}
                      fill={i === sel ? `url(#${gradOn})` : d.current ? `url(#${hatch})` : `url(#${gradOff})`}
                      stroke={i === sel ? C.ac : d.current ? C.ac : "none"}
                      strokeOpacity={i === sel ? 1 : 0.6}
                      strokeWidth={1}
                      style={i === sel ? { filter: "drop-shadow(0 0 10px rgba(255,201,51,0.45))" } : undefined}
                    />
                  ))}
                  {/* Valeur de la semaine choisie, dans une pastille au-dessus de sa barre */}
                  <LabelList
                    dataKey="selLabel"
                    content={(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) => {
                      const v = String(p.value ?? "");
                      if (!v) return null;
                      const cx = Number(p.x) + Number(p.width) / 2;
                      const w = v.length * 6.4 + 12;
                      const y = Number(p.y) - 22;
                      return (
                        <g>
                          <rect x={cx - w / 2} y={y} width={w} height={16} rx={8} style={{ fill: C.ac }} />
                          <text x={cx} y={y + 11.5} textAnchor="middle" fontSize={10} fontWeight={700} style={{ ...DATA, fill: "var(--agon-ink)" }}>
                            {v}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Repères : ce qui ne dépend pas de la semaine choisie */}
          <div className="mx-4 mt-1 grid grid-cols-3 border-y border-agon-brd">
            {[
              { l: "Cette semaine", v: fmtKm(volume.weekKm) },
              { l: "7 j glissants", v: fmtKm(volume.rolling7Km) },
              { l: `Moy. ${done.length} sem.`, v: fmtKm(avgKm) },
            ].map(({ l, v }, i) => (
              <div key={l} className={`min-w-0 py-2 ${i > 0 ? "border-l border-agon-brd pl-3" : ""}`}>
                <div className="truncate text-[8.5px] uppercase tracking-[0.12em] text-agon-tx3" style={DATA}>{l}</div>
                <div className="text-[14px] font-semibold text-agon-tx" style={DATA}>{isLoading ? "…" : v}</div>
              </div>
            ))}
          </div>

          {week && <WeekList week={week} activityHref={activityHref} />}

          {/* Provenance : d'où viennent les km (décision « la provenance des chiffres est affichée ») */}
          <div className="px-4 pb-3.5 pt-2.5 text-[9px] leading-[1.45] text-agon-tx3">
            {volume.watchKm > 0
              ? `Dont ${fmtKm(volume.watchKm)} mesurés par la montre ou un fichier importé${volume.watchOrigins.length ? ` (${volume.watchOrigins.join(", ")})` : ""}. Une sortie aussi saisie en fin de séance n'est comptée qu'une fois, à la mesure de la montre.`
              : "Km saisis en fin de séance. Les sorties d'une montre connectée ou d'un fichier importé s'ajoutent ici."}
          </div>
        </>
      )}
    </div>
  );
}

/** En-tête : la semaine choisie en grand, son écart avec la précédente, ses 7 jours. */
function WeekHero({
  week,
  isCurrent,
  isLoading,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  week: RunningWeekDetail;
  isCurrent: boolean;
  isLoading?: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const n = week.runs.length;
  const facts = [
    `${n > 0 ? n : "Aucune"} sortie${n > 1 ? "s" : ""}`,
    week.durationS != null ? formatDuration(week.durationS) : null,
    week.elevationGainM != null && week.elevationGainM > 0 ? `${formatElevation(week.elevationGainM)} D+` : null,
  ].filter(Boolean);

  // Km par jour (lundi → dimanche) pour la frise
  const perDay = Array.from({ length: 7 }, () => 0);
  for (const r of week.runs) {
    const i = Math.round((dateOf(r.date).getTime() - dateOf(week.monday).getTime()) / 86_400_000);
    if (i >= 0 && i < 7) perDay[i] += r.km;
  }
  const maxDay = Math.max(...perDay, 1);
  const up = week.deltaKm != null && week.deltaKm > 0;
  const down = week.deltaKm != null && week.deltaKm < 0;

  const navBtn =
    "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-agon-brd-l bg-agon-bg/40 text-agon-tx2 transition-colors hover:border-agon-accent hover:text-agon-accent disabled:cursor-default disabled:opacity-25 disabled:hover:border-agon-brd-l disabled:hover:text-agon-tx2";

  return (
    <div className="px-4 pb-1 pt-4" data-testid="running-week-panel">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[9px] uppercase tracking-[0.14em] text-agon-tx3" style={DATA}>
          <span className={isCurrent ? "text-agon-accent" : ""}>{isCurrent ? "Cette semaine" : "Semaine"}</span>
          {" · "}
          {weekRange(week.monday, week.sunday)}
        </div>
        <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Semaine précédente" className={navBtn}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Semaine suivante" className={navBtn}>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 text-agon-tx" style={DISPLAY}>
            <span className="text-[40px] font-semibold leading-[0.95] tracking-[-0.01em]">
              {isLoading ? "…" : week.km > 0 ? kmNum(week.km) : "—"}
            </span>
            {week.km > 0 && <span className="text-[14px] uppercase text-agon-tx2">km</span>}
          </div>
          <div className="mt-1.5 truncate text-[10.5px] text-agon-tx2">{facts.join(" · ")}</div>
        </div>

        {/* Frise des 7 jours : quand la semaine a couru */}
        <div className="flex shrink-0 items-end gap-[3px]" aria-hidden>
          {perDay.map((km, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="flex h-[30px] w-[9px] items-end overflow-hidden rounded-[3px] bg-agon-bg/50">
                <div
                  className="w-full rounded-[3px]"
                  style={{
                    height: km > 0 ? `${Math.max(18, (km / maxDay) * 100)}%` : 0,
                    background: "linear-gradient(180deg, var(--agon-or-vif), var(--agon-or-profond))",
                  }}
                />
              </div>
              <span className="text-[7.5px] text-agon-tx3" style={DATA}>{DAY_LETTERS[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {week.deltaKm != null ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold ${
              up ? "border-agon-accent/40 bg-agon-accent-doux text-agon-accent" : "border-agon-brd-l bg-agon-bg/40 text-agon-tx2"
            }`}
            style={DATA}
          >
            {up ? "▲" : down ? "▼" : "="} {signed(week.deltaKm, " km")}
            {week.deltaPct != null && <span className="opacity-80">· {signed(week.deltaPct, " %")}</span>}
          </span>
        ) : null}
        <span className="text-[10px] text-agon-tx3">
          {week.deltaKm != null
            ? week.prevToSameDay
              ? `vs même jour la semaine dernière (${fmtKm(week.prevKm)})`
              : `vs semaine précédente (${fmtKm(week.prevKm)})`
            : week.prevToSameDay ? "Semaine dernière à ce jour : —" : "Semaine précédente : —"}
        </span>
      </div>
    </div>
  );
}

/** Les sorties de la semaine choisie, puis les autres activités hors total. */
function WeekList({ week, activityHref }: { week: RunningWeekDetail; activityHref?: (activityId: string) => string }) {
  return (
    <div className="mt-3">
      {week.runs.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-3">
          {week.runs.map((o) => (
            <OutingRow
              key={o.key}
              date={o.date}
              name={outingName(o)}
              km={o.km}
              duration={o.durationS != null ? formatDuration(o.durationS) : "—"}
              pace={formatPace(o.paceSPerKm)}
              elevation={o.elevationGainM != null ? formatElevation(o.elevationGainM) : "—"}
              source={outingSource(o)}
              href={o.activityId && activityHref ? activityHref(o.activityId) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="mx-3 rounded-[8px] border border-dashed border-agon-brd-l px-3 py-3 text-center text-[11px] text-agon-tx3">
          Aucune course enregistrée cette semaine.
        </div>
      )}

      {week.others.length > 0 && (
        <div className="mt-3">
          <div className="px-4 pb-1.5 text-[8.5px] uppercase tracking-[0.14em] text-agon-tx3" style={DATA}>
            Autres activités · hors total
          </div>
          <div className="flex flex-col gap-1.5 px-3">
            {week.others.map((a) => (
              <OutingRow
                key={a.id}
                muted
                date={a.localDate}
                name={a.title?.trim() || sportLabel(a.sport)}
                km={a.distanceM != null && a.distanceM > 0 ? a.distanceM / 1000 : null}
                duration={formatDuration(a.durationS)}
                pace={null}
                elevation={a.elevationGainM != null ? formatElevation(a.elevationGainM) : "—"}
                source={providerAttribution(a.source, a.deviceName)}
                href={activityHref ? activityHref(a.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutingRow({
  date,
  name,
  km,
  duration,
  pace,
  elevation,
  source,
  href,
  muted,
}: {
  date: string;
  name: string;
  km: number | null;
  duration: string;
  /** null = sans objet (vélo, natation) */
  pace: string | null;
  elevation: string;
  source: string;
  href?: string;
  muted?: boolean;
}) {
  const loc = useLocation();
  const d = dateOf(date);
  const body = (
    <>
      {/* Bloc date façon calendrier */}
      <div
        className={`flex w-[38px] shrink-0 flex-col items-center justify-center rounded-[6px] py-1 ${
          muted ? "bg-agon-bg/40" : "bg-agon-accent-doux"
        }`}
      >
        <span className={`text-[7.5px] tracking-[0.1em] ${muted ? "text-agon-tx3" : "text-agon-accent"}`} style={DATA}>
          {DAYS_FR[d.getDay()]}
        </span>
        <span className={`text-[16px] font-semibold leading-none ${muted ? "text-agon-tx2" : "text-agon-tx"}`} style={DISPLAY}>
          {d.getDate()}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12.5px] font-semibold ${muted ? "text-agon-tx2" : "text-agon-tx"}`}>{name}</div>
        <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap text-[9.5px] tracking-[-0.02em] text-agon-tx2" style={DATA}>
          <span className="inline-flex items-center gap-[3px]"><Clock size={9} className="text-agon-tx3" />{duration}</span>
          {pace !== null && <span className="inline-flex items-center gap-[3px]"><Gauge size={9} className="text-agon-tx3" />{pace.replace(" /km", "/km")}</span>}
          <span className="inline-flex items-center gap-[3px]"><Mountain size={9} className="text-agon-tx3" />{elevation.replace(" m", "m")}</span>
        </div>
        <div className="mt-[3px] truncate text-[8.5px] uppercase tracking-[0.1em] text-agon-tx3" style={DATA}>{source}</div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="text-right" style={DISPLAY}>
          <span className={`text-[18px] font-semibold leading-none ${muted ? "text-agon-tx2" : "text-agon-tx"}`}>
            {km != null && km > 0 ? kmNum(Math.round(km * 10) / 10) : "—"}
          </span>
          {km != null && km > 0 && <span className="ml-0.5 text-[9px] uppercase text-agon-tx3">km</span>}
        </div>
        <span className="w-3 text-agon-tx3">{href ? <ChevronRight size={14} /> : null}</span>
      </div>
    </>
  );
  const cls = `flex w-full items-center gap-2.5 rounded-[8px] border px-2 py-2 text-left no-underline transition-colors ${
    muted ? "border-transparent bg-agon-bg/25" : "border-agon-brd bg-agon-s2/70"
  }`;
  return href ? (
    <Link
      to={href}
      state={{ back: { to: loc.pathname + loc.search, label: "Volume de course" } }}
      className={`${cls} hover:border-agon-accent/40`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
