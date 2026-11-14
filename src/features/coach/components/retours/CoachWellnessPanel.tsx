/**
 * Wellness coach (P26) : vue globale (planche CoachWellnessGlobal) — feu du
 * matin avec sa phrase, 4 tuiles, « Ce matin » — et page de détails (planche
 * CoachWellness) — critères du feu, VFC et FC de repos, grille des 6 questions,
 * alertes, courbatures après les séances et par zone, saisie du jour.
 * Les mesures de montre sont affichées telles quelles, jamais envoyées à l'IA.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, alpha, token } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEM_LABEL, WELLNESS_ITEM_SHORT, wellnessScore, wellnessBand, type WellnessItem } from "@shared/domain/wellness";
import type { LightResult } from "@shared/domain/wellnessLight";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { baselineAt, dailyValues } from "@/lib/healthView";
import { painList } from "@/lib/painZones";
import { BODY_ZONES, DOMS_LEVEL_COLOR, DOMS_LEVEL_LABEL } from "@/lib/bodyZones";
import { domsByWorkout, domsByZone, domsMaxLevels, feltSummary, itemGrid, type GridItem } from "@/lib/coachWellness";
import { Pill, SectionHead, Segmented } from "@/features/shared/components/ordi/OrdiUi";
import { frDate } from "@/features/shared/components/ordi/ordiStyles";

type Span = "7" | "28" | "90";

/** « Douleur · genou » : la zone la plus forte de la carte douleur (ancienne saisie : « Douleur »). */
function painZoneTitle(levels: Record<string, number> | undefined): string {
  const top = painList(levels).filter((z) => z.level != null && z.level > 0).sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
  return top ? `Douleur · ${top.label.toLowerCase()}` : "Douleur";
}

const SPANS: { value: Span; label: string }[] = [{ value: "7", label: "7 j" }, { value: "28", label: "28 j" }, { value: "90", label: "3 mois" }];

const LIGHT: Record<LightResult["light"], { label: string; color: string }> = {
  green: { label: "Vert", color: C.g },
  orange: { label: "Orange", color: C.o },
  red: { label: "Rouge", color: C.r },
};

const ITEM_NAME: Record<GridItem, string> = { ...WELLNESS_ITEM_LABEL, envie: "Envie de s’entraîner" };
/** Note 1 → 5 : rouge → vert (4 = vert-jaune de la charte, à la place du vert herbe hérité). */
const NOTE_COLOR = ["", C.r, C.o, C.ac, token("--agon-zone5-2"), C.g];

const CARD = "rounded-[14px] border border-agon-brd bg-agon-s1";
const KICK = "agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2";
const LINK_BTN = "cursor-pointer border-0 bg-transparent text-agon-accent";
const COL = "flex flex-col gap-3";
const ROW_TOP = "border-t border-agon-brd";
const EMPTY = "text-[13px] text-agon-tx3";
const LEGEND = "inline-flex items-center gap-1";

const dec = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const int = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : String(Math.round(x)));
const ms = (ln: number | null | undefined) => (ln == null ? null : Math.exp(ln));
const shortDay = (d: IsoDay) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).replace(".", "");

function Tile({ title, state, stateColor, value, unit, line, onMore }: {
  title: string; state: string; stateColor: string; value: string; unit?: string; line: ReactNode; onMore: () => void;
}) {
  return (
    // Planche CoachWellness : tuile teintée de la couleur de l'état, liseré 3 px.
    <div className="relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-[14px] py-3.5 pl-[19px] pr-4" style={{ border: `1px solid ${alpha(stateColor, 0.42)}`, background: alpha(stateColor, 0.12) }}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: stateColor }} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn(KICK, "truncate")}>{title}</span>
        <Pill color={stateColor} filled>{state}</Pill>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("agon-mono text-[32px] leading-none", value === "—" && "text-agon-tx3")} style={value === "—" ? undefined : { color: stateColor }}>{value}</span>
        {unit && <span className="agon-mono text-[12px] text-agon-tx2">{unit}</span>}
      </div>
      <div className="min-h-[34px] text-[12px] leading-[1.45] text-agon-tx2">{line}</div>
      <button type="button" onClick={onMore} className={cn(LINK_BTN, "self-start p-0 text-[12.5px]")}>Détails ›</button>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return <span className={cn("agon-mono inline-block w-4", on ? "text-agon-alerte" : "text-agon-tx3")}>{on ? "✓" : "–"}</span>;
}

/** Carte du corps en lecture : niveau max de chaque zone sur la fenêtre. */
function BodyRead({ levels }: { levels: Record<string, 1 | 2 | 3> }) {
  return (
    <div className="flex gap-[18px]">
      {(["face", "dos"] as const).map((view) => (
        <div key={view} className="flex flex-col items-center gap-1.5">
          <svg viewBox="0 0 120 215" width={110} height={197} aria-label={`Courbatures, ${view}`}>
            {BODY_ZONES.filter((z) => z.view === view).flatMap((z) => z.rects.map((r, i) => {
              const lvl = levels[z.id];
              return (
                <rect key={z.id + i} x={r.x} y={r.y} width={r.w} height={r.h} rx={3}
                  fill={lvl ? alpha(DOMS_LEVEL_COLOR[lvl], 0.75) : "rgba(231,211,168,0.07)"}
                  stroke={lvl ? DOMS_LEVEL_COLOR[lvl] : "rgba(231,211,168,0.16)"} strokeWidth={0.8}>
                  <title>{z.label}{lvl ? ` · ${DOMS_LEVEL_LABEL[lvl]}` : ""}</title>
                </rect>
              );
            }))}
          </svg>
          <span className="agon-mono whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-agon-tx3">{view === "face" ? "Face" : "Dos"}</span>
        </div>
      ))}
    </div>
  );
}

function WatchChart({ title, data, zone, unit, color, note }: {
  title: string; data: { day: IsoDay; v: number | null }[]; zone: { low: number; high: number } | null; unit: string; color: string; note: ReactNode;
}) {
  const vals = data.map((d) => d.v).filter((v): v is number => v != null);
  return (
    <div className={cn(CARD, "flex min-w-0 flex-col gap-2 px-4 py-3.5")}>
      <div className="flex justify-between gap-2">
        <span className="text-[13.5px] text-agon-tx">{title}</span>
        <span className="agon-mono text-[11px] text-agon-tx3">{unit}</span>
      </div>
      {vals.length === 0 ? (
        <div className="py-[30px] text-[12.5px] text-agon-tx3">Pas de mesure de montre sur la période.</div>
      ) : (
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
              {zone && <ReferenceArea y1={zone.low} y2={zone.high} fill={alpha(C.g, 0.1)} stroke="none" />}
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8)} tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.tx3, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => frDate(String(d), false)} formatter={(v) => [`${Math.round(Number(v))} ${unit}`, title]} />
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-[12px] leading-[1.45] text-agon-tx2">{note}</div>
    </div>
  );
}

export function CoachWellnessPanel({ athleteId, firstName }: { athleteId: string; firstName: string }) {
  const today = localIsoDay();
  const [detail, setDetail] = useState(false);
  const [spanKey, setSpan] = useState<Span>("28");
  const span = Number(spanKey);
  const light = useWellnessLight(athleteId, today);
  const { data: wh = {} } = useWellnessHistory(athleteId, { from: addDays(today, -125), includeArchived: false });
  const { data: health = [] } = useHealthWindow(athleteId, today);

  const r = light.data ?? null;
  const felt = useMemo(() => feltSummary(wh, today), [wh, today]);
  const grid = useMemo(() => itemGrid(wh, today, span === 90 ? 28 : span), [wh, today, span]);
  const zones7 = useMemo(() => domsByZone(wh, today, 7), [wh, today]);
  const byWorkout = useMemo(() => domsByWorkout(wh, today, 28), [wh, today]);

  const lastDay = Object.keys(wh).filter((d) => d <= today).sort().pop() ?? null;
  const last = lastDay ? wh[lastDay] : null;
  const lastScore = wellnessScore(last);

  // Montre : VFC et FC de repos, valeurs brutes de la marque retenue.
  const hrvVals = useMemo(() => dailyValues(health, (d) => d.hrvMs), [health]);
  const rhrVals = useMemo(() => dailyValues(health, (d) => d.restingHr), [health]);
  const chartDays = Array.from({ length: Math.min(span, 56) }, (_, i) => addDays(today, -(Math.min(span, 56) - 1 - i)));
  const hrvSeries = chartDays.map((day) => ({ day, v: hrvVals.get(day)?.v ?? null }));
  const rhrSeries = chartDays.map((day) => ({ day, v: rhrVals.get(day)?.v ?? null }));
  const rhrBase = baselineAt(rhrVals, today);
  const attribution = health.find((d) => d.hrvMs != null || d.restingHr != null)?.attribution ?? null;

  const hrv = r?.hrv;
  const hrvMean = ms(hrv?.mean7);
  const hrvZone = hrv?.zoneLow != null && hrv?.zoneHigh != null ? { low: Math.exp(hrv.zoneLow), high: Math.exp(hrv.zoneHigh) } : null;
  const hrvState = hrvMean == null ? { t: "—", c: C.tx3 } : hrv?.below ? { t: "Basse", c: C.o } : hrvZone && hrvMean > hrvZone.high ? { t: "Haute", c: C.g } : { t: "Normale", c: C.g };
  const rz = r?.restingHr.z ?? null;
  const rhrState = r?.restingHr.mean7 == null ? { t: "—", c: C.tx3 } : rz != null && rz > 1 ? { t: "En hausse", c: C.o } : rz != null && rz < -1 ? { t: "Basse", c: C.g } : { t: "Normale", c: C.g };
  const feltGap = felt.score7 != null && felt.scoreHabit != null ? felt.score7 - felt.scoreHabit : null;
  const feltState = felt.score7 == null ? { t: "—", c: C.tx3 } : feltGap != null && feltGap <= -10 ? { t: "Bas", c: C.r } : feltGap != null && feltGap <= -4 ? { t: "Un peu bas", c: C.o } : { t: "Habituel", c: C.g };
  const topZone = zones7[0] ?? null;
  const lt = r ? LIGHT[r.light] : null;

  const morning: Array<[string, string]> = last ? [
    ...(["fatigue", "sommeil", "stress", "energie", "doms"] as WellnessItem[]).map((k) => [WELLNESS_ITEM_SHORT[k], int(last.items[k])] as [string, string]),
    ["Envie", int(last.envie)],
    [painZoneTitle(last.painLevels), last.pain == null ? "—" : String(last.pain)],
    ["Malade", last.sick == null ? "—" : last.sick ? "oui" : "non"],
  ] : [];

  const lightCard = (
    <div className={cn(CARD, "relative flex flex-wrap items-center gap-[22px] overflow-hidden py-[18px] pl-[26px] pr-[22px]")}
      style={lt?.color ? { background: alpha(lt.color, 0.12), border: `1px solid ${alpha(lt.color, 0.42)}` } : undefined}>
      <span className={cn("absolute inset-y-0 left-0 w-1", !lt && "bg-agon-brd-l")} style={lt ? { background: lt.color } : undefined} />
      <span className={cn("agon-display text-[30px] font-medium tracking-[0.08em]", !lt && "text-agon-tx3")} style={lt ? { color: lt.color } : undefined}>
        {light.isLoading ? "…" : lt?.label ?? "—"}
      </span>
      <div className="flex min-w-[260px] flex-1 flex-col gap-1">
        <span className="text-[15px] text-agon-tx">{r?.sentence ?? (light.isLoading ? "Calcul du feu…" : `Pas assez de données pour le feu de ${firstName}.`)}</span>
        {r && r.light === "orange" && (
          <span className="text-[12.5px] text-agon-tx2">
            {r.orange.length} signal{r.orange.length > 1 ? "aux" : ""} orange · {r.redSigns.length} signe{r.redSigns.length > 1 ? "s" : ""} d’accompagnement (rouge à partir de 2 avec la charge qui monte).
          </span>
        )}
      </div>
      {!detail && <button type="button" onClick={() => setDetail(true)} className={cn(LINK_BTN, "text-[13px]")}>Pourquoi ›</button>}
    </div>
  );

  const spanSwitch = <Segmented<Span> value={spanKey} options={SPANS} onChange={setSpan} ariaLabel="Période" />;

  if (!detail) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="flex items-center justify-between gap-3">
          <span className={KICK}>Wellness · {frDate(addDays(today, -(Number(spanKey) - 1)), false)} → {frDate(today, false)}</span>
          {spanSwitch}
        </div>
        {lightCard}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <Tile title="VFC de nuit" state={hrvState.t} stateColor={hrvState.c} value={int(hrvMean)} unit="ms" onMore={() => setDetail(true)}
            line={hrvZone ? <>Zone {int(hrvZone.low)}–{int(hrvZone.high)}{hrv?.belowDays ? ` · ${hrv.belowDays} j dessous` : ""}</> : "Habitude en construction"} />
          <Tile title="FC de repos" state={rhrState.t} stateColor={rhrState.c} value={dec(r?.restingHr.mean7)} unit="bpm" onMore={() => setDetail(true)}
            line={r?.restingHr.baselineMean != null ? <>Habitude {dec(r.restingHr.baselineMean)}</> : "Habitude en construction"} />
          <Tile title="Ressenti" state={feltState.t} stateColor={feltState.c} value={int(felt.score7)} unit="/ 100" onMore={() => setDetail(true)}
            line={<>Habitude {int(felt.scoreHabit)} · envie {dec(felt.envie7)} / 5</>} />
          <Tile title="Courbatures" state={topZone ? DOMS_LEVEL_LABEL[topZone.maxLevel] : "Aucune"} stateColor={topZone ? DOMS_LEVEL_COLOR[topZone.maxLevel] : C.g}
            value={topZone ? topZone.label : "—"} onMore={() => setDetail(true)}
            line={topZone ? <>{topZone.days} jour{topZone.days > 1 ? "s" : ""} sur 7{topZone.workouts[0] ? ` · après ${topZone.workouts[0]}` : ""}</> : "Rien de signalé sur 7 jours"} />
        </div>
        <div className={cn(CARD, "flex flex-col gap-3 px-[18px] py-3.5")}>
          <div className="flex items-center justify-between">
            <span className={KICK}>{lastDay === today ? "Ce matin" : lastDay ? `Dernière saisie · ${frDate(lastDay, false)}` : "Ce matin"}</span>
            <button type="button" onClick={() => setDetail(true)} className={cn(LINK_BTN, "text-[12.5px]")}>Détails ›</button>
          </div>
          {morning.length === 0 ? (
            <div className={EMPTY}>{firstName} n’a pas encore rempli de wellness.</div>
          ) : (
            <div className="grid grid-cols-8 gap-2">
              {morning.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 rounded-[10px] border border-agon-brd bg-agon-bg px-2.5 py-2">
                  <span className="text-[11.5px] text-agon-tx3">{k}</span>
                  <span className="agon-mono text-[20px] text-agon-tx">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Page de détails ─────────────────────────────────────────────────────────
  const alerts = grid
    .map((row) => ({ row, cell: [...row.cells].reverse().find((c) => c.value != null) ?? null }))
    .filter(({ cell }) => cell?.z != null && cell.z < -1.5)
    .map(({ row, cell }) => ({ row, cell: cell! }));
  const painDays = Object.values(wh).filter((e) => e.day > addDays(today, -28) && ((e.pain ?? 0) > 0 || e.sick)).length;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setDetail(false)} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-agon-tx2">‹ Wellness</button>
        {spanSwitch}
      </div>

      <div className={COL}>
        <span className={KICK}>Feu du jour</span>
        {lightCard}
        {r && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
            <div className={cn(CARD, "px-4 py-3.5")}>
              <div className={cn(KICK, "mb-2")}>Signaux orange</div>
              {r.orange.length === 0 ? <div className={EMPTY}>Aucun.</div> : r.orange.map((s) => (
                <div key={s.key} className={cn(ROW_TOP, "flex gap-2 py-1.5 text-[13px] text-agon-tx")}><Check on />{s.text}</div>
              ))}
            </div>
            <div className={cn(CARD, "px-4 py-3.5")}>
              <div className={cn(KICK, "mb-2")}>Rouge si la charge monte et 2 signes ou plus</div>
              {r.redSigns.length === 0 ? <div className={EMPTY}>Aucun signe.</div> : r.redSigns.map((s) => (
                <div key={s.key} className={cn(ROW_TOP, "flex gap-2 py-1.5 text-[13px] text-agon-tx")}><Check on />{s.text}</div>
              ))}
              <div className="mt-2 text-[11.5px] text-agon-tx3">{r.redSigns.length} sur 2 · règles {r.version}</div>
            </div>
          </div>
        )}
      </div>

      <section className={COL}>
        <SectionHead n={1} title="Montre · VFC et FC de repos" right={attribution ? <span className="agon-mono text-[11px] text-agon-tx3">{attribution}</span> : undefined} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
          <WatchChart title="VFC de nuit" unit="ms" color={C.b} data={hrvSeries} zone={hrvZone}
            note={hrvZone ? <>Moyenne 7 j {int(hrvMean)} ms · zone {int(hrvZone.low)}–{int(hrvZone.high)} ms{hrv?.belowDays ? ` · sous la zone depuis ${hrv.belowDays} jour${hrv.belowDays > 1 ? "s" : ""}` : ""}</> : "Zone normale disponible après 14 nuits de mesure."} />
          <WatchChart title="FC de repos" unit="bpm" color={C.o} data={rhrSeries} zone={rhrBase ? { low: rhrBase.low, high: rhrBase.high } : null}
            note={<>Moyenne 7 j {dec(r?.restingHr.mean7)} bpm · habitude {r?.restingHr.baselineMean != null ? `${dec(r.restingHr.baselineMean)} bpm` : "—"}{rz != null ? ` · z ${rz > 0 ? "+" : ""}${dec(rz)}` : ""}</>} />
        </div>
        <div className="text-[11.5px] text-agon-tx3">VFC lue sur 7 nuits (5 valides au moins), zone = moyenne ± 0,5 écart-type des 28 jours précédents.</div>
      </section>

      <section className={COL}>
        <SectionHead n={2} title={`Ressenti · 6 questions sur ${span === 90 ? 28 : span} jours`} />
        <div className={cn(CARD, "overflow-x-auto px-4 py-3.5")}>
          <div className="grid min-w-[520px] items-center gap-[3px]" style={{ gridTemplateColumns: `150px repeat(${grid[0]?.cells.length ?? 0}, minmax(18px, 1fr)) 48px` }}>
            <span />
            {grid[0]?.cells.map((c) => <span key={c.day} title={frDate(c.day, false)} className="agon-mono text-center text-[9px] text-agon-tx3">{c.day.slice(8)}</span>)}
            <span className="agon-mono text-right text-[9.5px] text-agon-tx3">Moy.</span>
            {grid.map((row) => (
              <FragmentRow key={row.item} label={ITEM_NAME[row.item]} cells={row.cells} mean={row.mean} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3.5 text-[11.5px] text-agon-tx3">
            <span>Note 1 → 5 :</span>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={LEGEND}><span className="size-2.5 rounded-[3px]" style={{ background: NOTE_COLOR[n] }} />{n}</span>)}
            <span className={LEGEND}><span className="size-2.5 rounded-[3px] border-[1.5px] border-agon-tx" />Sous l’habitude</span>
            <span className={LEGEND}><span className="size-2.5 rounded-[3px] bg-agon-s2" />Pas de saisie</span>
          </div>
        </div>
      </section>

      <section className={COL}>
        <SectionHead n={3} title="Alertes · écart à l’habitude" />
        <div className={cn(CARD, "px-4 py-1")}>
          {hrv?.below && hrvMean != null && (
            <AlertRow tag="À surveiller" color={C.o} title={`VFC de nuit ${int(hrvMean)} ms, sous la zone ${hrvZone ? `${int(hrvZone.low)}–${int(hrvZone.high)} ms` : ""}`} sub={`${hrv.belowDays} jour${hrv.belowDays > 1 ? "s" : ""} de suite · à croiser avec sommeil, envie, FC de repos`} />
          )}
          {alerts.map(({ row, cell }) => (
            <AlertRow key={row.item} tag={cell.z! < -2 ? "Alerte" : "À surveiller"} color={cell.z! < -2 ? C.r : C.o}
              title={`${ITEM_NAME[row.item]} ${cell.value}/5 (habitude ${dec(row.mean)})`} sub={`Saisie du ${frDate(cell.day, false)} · z ${dec(cell.z)}`} />
          ))}
          <AlertRow tag={painDays ? "À surveiller" : "Aucun"} color={painDays ? C.o : C.g} title="Douleur · malade"
            sub={painDays ? `${painDays} jour${painDays > 1 ? "s" : ""} avec douleur ou maladie sur 28 jours` : "Aucun signalement sur 28 jours"} />
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-start gap-[22px]">
        <section className={COL}>
          <SectionHead n={4} title="Courbatures après les séances · 28 jours" />
          <div className={cn(CARD, "px-4 py-1")}>
            {byWorkout.length === 0 ? <div className={cn(EMPTY, "py-3")}>Aucune séance rattachée à des courbatures.</div> : byWorkout.map((w) => (
              <div key={w.name} className={cn(ROW_TOP, "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[13px]")}>
                <span className="text-agon-tx">{w.name}</span>
                <span className="text-agon-tx2">{w.zones.length ? w.zones.map((z) => z.label).join(" · ") : "—"}</span>
                <span className="agon-mono text-[11px]" style={{ color: w.zones.length ? DOMS_LEVEL_COLOR[Math.max(...w.zones.map((z) => z.level)) as 1 | 2 | 3] : C.tx3 }}>
                  {w.zones.length ? DOMS_LEVEL_LABEL[Math.max(...w.zones.map((z) => z.level)) as 1 | 2 | 3] : "Aucune"}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className={COL}>
          <SectionHead n={5} title="Courbatures · 7 jours" />
          <div className={cn(CARD, "flex flex-wrap gap-[18px] px-4 py-3.5")}>
            <BodyRead levels={domsMaxLevels(zones7)} />
            <div className="flex min-w-[180px] flex-1 flex-col">
              {zones7.length === 0 ? <span className={EMPTY}>Rien de signalé.</span> : zones7.map((z) => (
                <div key={z.id} className={cn(ROW_TOP, "py-2")}>
                  <div className="flex justify-between text-[13px] text-agon-tx"><span>{z.label}</span><span className="agon-mono text-[11px] text-agon-tx2">{z.days} j sur 7</span></div>
                  <div className="text-[11.5px] text-agon-tx3">{DOMS_LEVEL_LABEL[z.maxLevel]}{z.workouts.length ? ` · après ${z.workouts.join(", ")}` : ""} · {z.dates.map(shortDay).join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={COL}>
        <SectionHead n={6} title={lastDay ? `Saisie du jour · ${frDate(lastDay, false)}` : "Saisie du jour"} />
        {!last ? <div className={EMPTY}>Aucune saisie.</div> : (
          <div className={cn(CARD, "flex flex-wrap items-center gap-[22px] px-4 py-3.5")}>
            <div>
              <span className="agon-mono text-[30px] text-agon-tx">{int(lastScore)}</span><span className="agon-mono text-[12px] text-agon-tx3"> / 100</span>
              <div className="text-[12.5px] text-agon-tx2">{wellnessBand(lastScore)?.label ?? "—"}</div>
            </div>
            {morning.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="text-[11.5px] text-agon-tx3">{k}</span>
                <span className="agon-mono text-[16px] text-agon-tx">{v}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FragmentRow({ label, cells, mean }: { label: string; cells: { day: IsoDay; value: number | null; z: number | null }[]; mean: number | null }) {
  return (
    <>
      <span className="truncate text-[12.5px] text-agon-tx2">{label}</span>
      {cells.map((c) => (
        <span key={c.day} title={`${frDate(c.day, false)} · ${c.value ?? "pas de saisie"}`}
          className="h-5 rounded-[4px]" style={{ background: c.value != null ? alpha(NOTE_COLOR[Math.round(c.value)] ?? C.tx3, 0.75) : C.s2, boxShadow: c.z != null && c.z < -1 ? `inset 0 0 0 1.5px ${C.tx}` : "none" }} />
      ))}
      <span className="agon-mono text-right text-[11px] text-agon-tx2">{dec(mean)}</span>
    </>
  );
}

function AlertRow({ tag, color, title, sub }: { tag: string; color: string; title: string; sub: string }) {
  return (
    <div className={cn(ROW_TOP, "flex items-start gap-3 py-2.5")}>
      <Pill color={color}>{tag}</Pill>
      <div className="flex-1">
        <div className="text-[13.5px] text-agon-tx">{title}</div>
        <div className="text-[12px] text-agon-tx3">{sub}</div>
      </div>
    </div>
  );
}

