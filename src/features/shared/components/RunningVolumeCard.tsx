import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, LabelList } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { C } from "@/lib/theme";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  providerAttribution,
  sportLabel,
} from "@/lib/activityDisplay";
import { weekDetail, type RunningWeekDetail } from "@/lib/runningVolume";
import type { RunningVolume, RunOuting, WatchActivityInput } from "@/features/shared/hooks/useRunningVolume";

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const dateOf = (isoDate: string) => new Date(`${isoDate}T12:00:00`);
const shortDate = (isoDate: string) => {
  const d = dateOf(isoDate);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
};

/** Km lisibles ; une semaine sans course s'affiche « — », jamais « 0 km ». */
const fmtKm = (km: number | null | undefined) =>
  km != null && km > 0 ? `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km` : "—";

/** « 9 → 15 nov. », ou « 27 oct. → 2 nov. » quand la semaine change de mois. */
function weekRange(monday: string, sunday: string): string {
  const a = dateOf(monday);
  const b = dateOf(sunday);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} → ${b.getDate()} ${MONTHS_FR[b.getMonth()]}`
    : `${shortDate(monday)} → ${shortDate(sunday)}`;
}

/** « Lun. 9 nov. » : majuscule au jour seulement. */
function dayLabel(isoDate: string): string {
  const t = formatActivityDate(isoDate);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function deltaText(w: RunningWeekDetail): string | null {
  if (w.deltaKm == null) return null;
  const sign = w.deltaKm > 0 ? "+" : w.deltaKm < 0 ? "−" : "±";
  const km = `${sign}${Math.abs(w.deltaKm).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
  const pct = w.deltaPct != null ? ` (${w.deltaPct > 0 ? "+" : w.deltaPct < 0 ? "−" : "±"}${Math.abs(w.deltaPct)} %)` : "";
  return `${km}${pct}`;
}

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
 * Barres des RUNNING_WEEKS dernières semaines ; un clic (ou un toucher) sur une
 * semaine ouvre, sous le graphique, toutes ses sorties de course — et à part,
 * hors total, les autres activités d'endurance de la montre (vélo, natation…).
 * La liste et le total viennent du même calcul (`buildRunLedger`) : ils ne
 * peuvent pas se contredire.
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
    watchKm: w.watchKm,
    count: counts.get(w.monday) ?? 0,
    current: i === lastIndex,
    selLabel: i === sel ? (w.km > 0 ? w.km.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—") : "",
    month: i === 0 || dateOf(w.monday).getMonth() !== dateOf(volume.weeks[i - 1].monday).getMonth(),
  }));

  const hasData = volume.weeks.some((w) => w.km > 0) || others.length > 0;
  // Moyenne des semaines terminées : la semaine en cours, incomplète, la tirerait vers le bas.
  const done = volume.weeks.slice(0, -1);
  const avgKm = done.length ? Math.round((done.reduce((s, w) => s + w.km, 0) / done.length) * 10) / 10 : 0;

  const week = useMemo(
    () => (volume.weeks[sel] ? weekDetail(outings, others, volume.weeks[sel].monday) : null),
    [outings, others, volume.weeks, sel],
  );

  const pick = (state: unknown) => {
    const i = Number((state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex);
    if (Number.isInteger(i) && i >= 0 && i <= lastIndex) setSelected(i);
  };

  return (
    <div className="rounded-[6px] border border-agon-brd bg-agon-s1 p-4">
      <div className="mb-3.5 grid grid-cols-3 gap-2">
        {[
          { l: "Cette semaine", v: fmtKm(volume.weekKm), sub: "lun → dim" },
          { l: "7 jours glissants", v: fmtKm(volume.rolling7Km), sub: "jusqu'à aujourd'hui" },
          { l: "Moyenne / semaine", v: fmtKm(avgKm), sub: `${done.length} sem. terminées` },
        ].map(({ l, v, sub }) => (
          <div key={l} className="min-w-0 rounded-[4px] bg-agon-s2 px-2.5 py-2">
            <div className="truncate text-[9px] text-agon-tx3">{l}</div>
            <div className="text-[16px] font-extrabold leading-[1.3] text-agon-tx">{isLoading ? "…" : v}</div>
            <div className="truncate text-[9px] text-agon-tx3">{sub}</div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="py-2 text-center text-[11px] text-agon-tx3">
          Aucune course enregistrée sur les {volume.weeks.length} dernières semaines. Les km se saisissent en fin de
          séance, ou arrivent d'une montre connectée.
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0 truncate text-[10px] text-agon-tx3">
              Km de course · {volume.weeks.length} dernières semaines
            </div>
            <div className="shrink-0 text-[9px] text-agon-tx3">Touche une semaine</div>
          </div>
          <div
            data-testid="running-volume-chart"
            className="[&_.recharts-surface:focus]:outline-none [&_.recharts-wrapper:focus]:outline-none [&_svg:focus]:outline-none"
            style={{ cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={data} margin={{ top: 18, right: 4, left: -6, bottom: 0 }} barCategoryGap="22%" onClick={pick}>
                <XAxis
                  dataKey="monday"
                  axisLine={{ stroke: C.brd }}
                  tickLine={false}
                  interval={0}
                  height={30}
                  tick={(props: { x?: number | string; y?: number | string; index?: number }) => {
                    const d = data[props.index ?? 0];
                    if (!d) return <g />;
                    const isSel = (props.index ?? -1) === sel;
                    const day = dateOf(d.monday).getDate();
                    return (
                      <g transform={`translate(${props.x},${props.y})`}>
                        <text textAnchor="middle" dy={10} fontSize={9} fontWeight={isSel || d.current ? 700 : 400}
                          fill={isSel ? C.tx : C.tx3}>
                          {d.current ? "auj." : day}
                        </text>
                        {d.month && !d.current && (
                          <text textAnchor="middle" dy={21} fontSize={8} fill={C.tx3}>
                            {MONTHS_FR[dateOf(d.monday).getMonth()]}
                          </text>
                        )}
                      </g>
                    );
                  }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: C.tx3 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={30}
                  tickCount={4}
                />
                {/* Colonne de la semaine choisie : visible même quand la semaine est vide */}
                {data[sel] && (
                  <ReferenceArea x1={data[sel].monday} x2={data[sel].monday} fill={C.ac} fillOpacity={0.08} strokeOpacity={0} />
                )}
                {avgKm > 0 && (
                  <ReferenceLine
                    y={avgKm}
                    stroke={C.tx3}
                    strokeDasharray="3 3"
                    ifOverflow="extendDomain"
                    label={{ value: "moy.", position: "insideTopLeft", fontSize: 8, fill: C.tx3 }}
                  />
                )}
                <Tooltip
                  cursor={{ fill: C.s2 }}
                  contentStyle={{ background: C.s2, border: "1px solid " + C.brd, borderRadius: 4, fontSize: 11, color: C.tx }}
                  labelStyle={{ color: C.tx3 }}
                  labelFormatter={(m) => `Semaine du ${weekRange(String(m), sundayOf(String(m)))}`}
                  formatter={(v, _n, item) => {
                    const p = (item as { payload?: { watchKm?: number; count?: number } }).payload;
                    const n = p?.count ?? 0;
                    const sorties = n > 0 ? ` · ${n} sortie${n > 1 ? "s" : ""}` : "";
                    return [`${fmtKm(Number(v))}${sorties}`, "Course"];
                  }}
                />
                <Bar dataKey="km" radius={[4, 4, 0, 0]} maxBarSize={26} minPointSize={0} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell
                      key={d.monday}
                      fill={C.ac}
                      fillOpacity={i === sel ? 1 : d.current ? 0.7 : 0.38}
                      stroke={d.current && i !== sel ? C.ac : undefined}
                      strokeDasharray={d.current && i !== sel ? "3 2" : undefined}
                    />
                  ))}
                  {/* Valeur de la semaine choisie, au-dessus de sa barre */}
                  <LabelList dataKey="selLabel" position="top" offset={5} fontSize={10} fontWeight={800} fill={C.tx} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {week && (
            <WeekPanel
              week={week}
              isCurrent={sel === lastIndex}
              canPrev={sel > 0}
              canNext={sel < lastIndex}
              onPrev={() => setSelected(sel - 1)}
              onNext={() => setSelected(sel + 1)}
              activityHref={activityHref}
            />
          )}

          {/* Provenance : d'où viennent les km (décision « la provenance des chiffres est affichée ») */}
          <div className="mt-2.5 text-[9px] leading-[1.4] text-agon-tx3">
            {volume.watchKm > 0
              ? `Dont ${fmtKm(volume.watchKm)} mesurés par la montre ou un fichier importé${volume.watchOrigins.length ? ` (${volume.watchOrigins.join(", ")})` : ""}. Une sortie aussi saisie en fin de séance n'est comptée qu'une fois, à la mesure de la montre.`
              : "Km saisis en fin de séance. Les sorties d'une montre connectée ou d'un fichier importé s'ajoutent ici."}
          </div>
        </>
      )}
    </div>
  );
}

function sundayOf(monday: string): string {
  const d = dateOf(monday);
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** La semaine choisie : total, écart avec la précédente, et chaque sortie. */
function WeekPanel({
  week,
  isCurrent,
  canPrev,
  canNext,
  onPrev,
  onNext,
  activityHref,
}: {
  week: RunningWeekDetail;
  isCurrent: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  activityHref?: (activityId: string) => string;
}) {
  const n = week.runs.length;
  const delta = deltaText(week);
  const facts = [
    `${n > 0 ? n : "Aucune"} sortie${n > 1 ? "s" : ""}`,
    week.durationS != null ? formatDuration(week.durationS) : null,
    week.elevationGainM != null && week.elevationGainM > 0 ? `${formatElevation(week.elevationGainM)} D+` : null,
  ].filter(Boolean);

  return (
    <div className="mt-2 rounded-[4px] border border-agon-brd bg-agon-s2" data-testid="running-week-panel">
      <div className="flex items-center gap-1 border-b border-agon-brd px-1.5 py-1.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Semaine précédente"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-agon-tx2 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[11px] font-semibold text-agon-tx">
            {isCurrent ? "Cette semaine" : "Semaine"} · {weekRange(week.monday, week.sunday)}
          </div>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Semaine suivante"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-agon-tx2 disabled:cursor-default disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3 px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <div className="text-[22px] font-extrabold leading-none text-agon-tx">{fmtKm(week.km)}</div>
          <div className="mt-1 text-[10px] text-agon-tx3">{facts.join(" · ")}</div>
        </div>
        <div className="shrink-0 text-right text-[10px] leading-[1.4] text-agon-tx3">
          {delta ? (
            <>
              <div className="text-[12px] font-bold text-agon-tx2">{delta}</div>
              <div>vs sem. précédente ({fmtKm(week.prevKm)})</div>
            </>
          ) : (
            <div>Semaine précédente : —</div>
          )}
        </div>
      </div>

      {n > 0 && (
        <div className="flex flex-col">
          {week.runs.map((o) => (
            <OutingRow
              key={o.key}
              day={dayLabel(o.date)}
              name={outingName(o)}
              distance={formatDistance(o.km * 1000)}
              duration={o.durationS != null ? formatDuration(o.durationS) : "—"}
              pace={formatPace(o.paceSPerKm)}
              elevation={o.elevationGainM != null ? formatElevation(o.elevationGainM) : "—"}
              source={outingSource(o)}
              href={o.activityId && activityHref ? activityHref(o.activityId) : undefined}
            />
          ))}
        </div>
      )}
      {n === 0 && (
        <div className="px-3 pb-3 text-[11px] text-agon-tx3">Aucune course enregistrée cette semaine.</div>
      )}

      {week.others.length > 0 && (
        <div className="border-t border-agon-brd">
          <div className="px-3 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
            Autres activités <span className="font-normal normal-case">· hors total</span>
          </div>
          {week.others.map((a) => (
            <OutingRow
              key={a.id}
              muted
              day={dayLabel(a.localDate)}
              name={a.title?.trim() || sportLabel(a.sport)}
              distance={a.distanceM != null && a.distanceM > 0 ? formatDistance(a.distanceM) : "—"}
              duration={formatDuration(a.durationS)}
              pace={null}
              elevation={a.elevationGainM != null ? formatElevation(a.elevationGainM) : "—"}
              source={providerAttribution(a.source, a.deviceName)}
              href={activityHref ? activityHref(a.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutingRow({
  day,
  name,
  distance,
  duration,
  pace,
  elevation,
  source,
  href,
  muted,
}: {
  day: string;
  name: string;
  distance: string;
  duration: string;
  /** null = sans objet (vélo, natation) */
  pace: string | null;
  elevation: string;
  source: string;
  href?: string;
  muted?: boolean;
}) {
  const body = (
    <>
      <div className="w-[62px] shrink-0 pt-px text-[10px] leading-tight text-agon-tx3">{day}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12px] font-bold ${muted ? "text-agon-tx2" : "text-agon-tx"}`}>
            {name}
          </span>
          <span className={`shrink-0 text-[12px] font-bold ${muted ? "text-agon-tx2" : "text-agon-tx"}`}>{distance}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-agon-tx2">
          <span>{duration}</span>
          {pace !== null && <span>{pace}</span>}
          <span>{elevation === "—" ? "D+ —" : `${elevation}`}</span>
          <span className="rounded-[8px] border border-agon-brd px-1.5 py-px text-[9px] text-agon-tx3">{source}</span>
        </div>
      </div>
      <div className="flex w-3 shrink-0 items-center self-center text-agon-tx3">
        {href ? <ChevronRight size={14} /> : null}
      </div>
    </>
  );
  const loc = useLocation();
  const cls = "flex w-full items-start gap-2 border-t border-agon-brd px-3 py-2 text-left no-underline first:border-t-0";
  return href ? (
    <Link to={href} state={{ back: { to: loc.pathname + loc.search, label: "Volume de course" } }} className={`${cls} hover:bg-agon-s1`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
