/**
 * Wellness coach (P26) : vue globale (planche CoachWellnessGlobal) — feu du
 * matin avec sa phrase, 4 tuiles, « Ce matin » — et page de détails (planche
 * CoachWellness) — critères du feu, VFC et FC de repos, grille des 6 questions,
 * alertes, courbatures après les séances et par zone, saisie du jour.
 * Les mesures de montre sont affichées telles quelles, jamais envoyées à l'IA.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, alpha } from "@/lib/theme";
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEM_LABEL, WELLNESS_ITEM_SHORT, wellnessScore, wellnessBand, type WellnessItem } from "@shared/domain/wellness";
import type { LightResult } from "@shared/domain/wellnessLight";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHealthWindow } from "@/features/athlete/hooks/useHealthWindow";
import { baselineAt, dailyValues } from "@/lib/healthView";
import { BODY_ZONES, DOMS_LEVEL_COLOR, DOMS_LEVEL_LABEL } from "@/lib/bodyZones";
import { domsByWorkout, domsByZone, domsMaxLevels, feltSummary, itemGrid, type GridItem } from "@/lib/coachWellness";
import { MONO, ORDI_CARD, Pill, SectionHead, Segmented, KICK } from "@/features/shared/components/ordi/OrdiUi";
import { frDate } from "@/features/shared/components/ordi/ordiStyles";

type Span = "7" | "28" | "90";
const SPANS: { value: Span; label: string }[] = [{ value: "7", label: "7 j" }, { value: "28", label: "28 j" }, { value: "90", label: "3 mois" }];

const LIGHT: Record<LightResult["light"], { label: string; color: string }> = {
  green: { label: "Vert", color: C.g },
  orange: { label: "Orange", color: C.o },
  red: { label: "Rouge", color: C.r },
};

const ITEM_NAME: Record<GridItem, string> = { ...WELLNESS_ITEM_LABEL, envie: "Envie de s’entraîner" };
/** Note 1 → 5 : rouge → vert. */
const NOTE_COLOR = ["", C.r, C.o, C.ac, "#9BD35A", C.g];

const dec = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const int = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : String(Math.round(x)));
const ms = (ln: number | null | undefined) => (ln == null ? null : Math.exp(ln));
const shortDay = (d: IsoDay) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).replace(".", "");

function Tile({ title, state, stateColor, value, unit, line, onMore }: {
  title: string; state: string; stateColor: string; value: string; unit?: string; line: ReactNode; onMore: () => void;
}) {
  return (
    <div style={{ ...ORDI_CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13.5, color: C.tx }}>{title}</span>
        <Pill color={stateColor}>{state}</Pill>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ ...MONO, fontSize: 30, color: C.tx, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45, minHeight: 34 }}>{line}</div>
      <button type="button" onClick={onMore} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Détails ›</button>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return <span style={{ ...MONO, width: 16, display: "inline-block", color: on ? C.o : C.tx3 }}>{on ? "✓" : "–"}</span>;
}

/** Carte du corps en lecture : niveau max de chaque zone sur la fenêtre. */
function BodyRead({ levels }: { levels: Record<string, 1 | 2 | 3> }) {
  return (
    <div style={{ display: "flex", gap: 18 }}>
      {(["face", "dos"] as const).map((view) => (
        <div key={view} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
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
          <span style={{ ...KICK, fontSize: 10, color: C.tx3 }}>{view === "face" ? "Face" : "Dos"}</span>
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
    <div style={{ ...ORDI_CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, color: C.tx }}>{title}</span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{unit}</span>
      </div>
      {vals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.tx3, padding: "30px 0" }}>Pas de mesure de montre sur la période.</div>
      ) : (
        <div style={{ height: 150 }}>
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
      <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>{note}</div>
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
    ["Douleur", last.pain == null ? "—" : String(last.pain)],
    ["Malade", last.sick == null ? "—" : last.sick ? "oui" : "non"],
  ] : [];

  const lightCard = (
    <div style={{ ...ORDI_CARD, position: "relative", overflow: "hidden", padding: "18px 22px 18px 26px", display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: lt?.color ?? C.brdL }} />
      <span style={{ fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 300, fontSize: 30, color: lt?.color ?? C.tx3 }}>
        {light.isLoading ? "…" : lt?.label ?? "—"}
      </span>
      <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, color: C.tx }}>{r?.sentence ?? (light.isLoading ? "Calcul du feu…" : `Pas assez de données pour le feu de ${firstName}.`)}</span>
        {r && r.light === "orange" && (
          <span style={{ fontSize: 12.5, color: C.tx2 }}>
            {r.orange.length} signal{r.orange.length > 1 ? "aux" : ""} orange · {r.redSigns.length} signe{r.redSigns.length > 1 ? "s" : ""} d’accompagnement (rouge à partir de 2 avec la charge qui monte).
          </span>
        )}
      </div>
      {!detail && <button type="button" onClick={() => setDetail(true)} style={{ background: "none", border: "none", color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Pourquoi ›</button>}
    </div>
  );

  const spanSwitch = <Segmented<Span> value={spanKey} options={SPANS} onChange={setSpan} ariaLabel="Période" />;

  if (!detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={KICK}>Wellness · {frDate(addDays(today, -6), false)} → {frDate(today, false)}</span>
          {spanSwitch}
        </div>
        {lightCard}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
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
        <div style={{ ...ORDI_CARD, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={KICK}>{lastDay === today ? "Ce matin" : lastDay ? `Dernière saisie · ${frDate(lastDay, false)}` : "Ce matin"}</span>
            <button type="button" onClick={() => setDetail(true)} style={{ background: "none", border: "none", color: C.ac, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Détails ›</button>
          </div>
          {morning.length === 0 ? (
            <div style={{ fontSize: 13, color: C.tx3 }}>{firstName} n’a pas encore rempli de wellness.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 8 }}>
              {morning.map(([k, v]) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", background: C.bg, borderRadius: 10, border: `1px solid ${C.brd}` }}>
                  <span style={{ fontSize: 11.5, color: C.tx3 }}>{k}</span>
                  <span style={{ ...MONO, fontSize: 20, color: C.tx }}>{v}</span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={() => setDetail(false)} style={{ background: "none", border: "none", padding: 0, color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ Wellness</button>
        {spanSwitch}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={KICK}>Feu du jour</span>
        {lightCard}
        {r && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
            <div style={{ ...ORDI_CARD, padding: "14px 16px" }}>
              <div style={{ ...KICK, marginBottom: 8 }}>Signaux orange</div>
              {r.orange.length === 0 ? <div style={{ fontSize: 13, color: C.tx3 }}>Aucun.</div> : r.orange.map((s) => (
                <div key={s.key} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.brd}`, fontSize: 13, color: C.tx }}><Check on />{s.text}</div>
              ))}
            </div>
            <div style={{ ...ORDI_CARD, padding: "14px 16px" }}>
              <div style={{ ...KICK, marginBottom: 8 }}>Rouge si la charge monte et 2 signes ou plus</div>
              {r.redSigns.length === 0 ? <div style={{ fontSize: 13, color: C.tx3 }}>Aucun signe.</div> : r.redSigns.map((s) => (
                <div key={s.key} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.brd}`, fontSize: 13, color: C.tx }}><Check on />{s.text}</div>
              ))}
              <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 8 }}>{r.redSigns.length} sur 2 · règles {r.version}</div>
            </div>
          </div>
        )}
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={1} title="Montre · VFC et FC de repos" right={attribution ? <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{attribution}</span> : undefined} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <WatchChart title="VFC de nuit" unit="ms" color={C.b} data={hrvSeries} zone={hrvZone}
            note={hrvZone ? <>Moyenne 7 j {int(hrvMean)} ms · zone {int(hrvZone.low)}–{int(hrvZone.high)} ms{hrv?.belowDays ? ` · sous la zone depuis ${hrv.belowDays} jour${hrv.belowDays > 1 ? "s" : ""}` : ""}</> : "Zone normale disponible après 14 nuits de mesure."} />
          <WatchChart title="FC de repos" unit="bpm" color={C.o} data={rhrSeries} zone={rhrBase ? { low: rhrBase.low, high: rhrBase.high } : null}
            note={<>Moyenne 7 j {dec(r?.restingHr.mean7)} bpm · habitude {dec(r?.restingHr.baselineMean)} bpm{rz != null ? ` · z ${rz > 0 ? "+" : ""}${dec(rz)}` : ""}</>} />
        </div>
        <div style={{ fontSize: 11.5, color: C.tx3 }}>VFC lue sur 7 nuits (5 valides au moins), zone = moyenne ± 0,5 écart-type des 28 jours précédents.</div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={2} title={`Ressenti · 6 questions sur ${span === 90 ? 28 : span} jours`} />
        <div style={{ ...ORDI_CARD, padding: "14px 16px", overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `150px repeat(${grid[0]?.cells.length ?? 0}, minmax(18px, 1fr)) 48px`, gap: 3, alignItems: "center", minWidth: 520 }}>
            <span />
            {grid[0]?.cells.map((c) => <span key={c.day} title={frDate(c.day, false)} style={{ ...MONO, fontSize: 9, color: C.tx3, textAlign: "center" }}>{c.day.slice(8)}</span>)}
            <span style={{ ...MONO, fontSize: 9.5, color: C.tx3, textAlign: "right" }}>Moy.</span>
            {grid.map((row) => (
              <FragmentRow key={row.item} label={ITEM_NAME[row.item]} cells={row.cells} mean={row.mean} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11.5, color: C.tx3, flexWrap: "wrap" }}>
            <span>Note 1 → 5 :</span>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: NOTE_COLOR[n] }} />{n}</span>)}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1.5px solid ${C.tx}` }} />Sous l’habitude</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.s2 }} />Pas de saisie</span>
          </div>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={3} title="Alertes · écart à l’habitude" />
        <div style={{ ...ORDI_CARD, padding: "4px 16px" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 22, alignItems: "start" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHead n={4} title="Courbatures après les séances · 28 jours" />
          <div style={{ ...ORDI_CARD, padding: "4px 16px" }}>
            {byWorkout.length === 0 ? <div style={{ fontSize: 13, color: C.tx3, padding: "12px 0" }}>Aucune séance rattachée à des courbatures.</div> : byWorkout.map((w) => (
              <div key={w.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.brd}`, fontSize: 13, alignItems: "center" }}>
                <span style={{ color: C.tx }}>{w.name}</span>
                <span style={{ color: C.tx2 }}>{w.zones.length ? w.zones.map((z) => z.label).join(" · ") : "—"}</span>
                <span style={{ ...MONO, fontSize: 11, color: w.zones.length ? DOMS_LEVEL_COLOR[Math.max(...w.zones.map((z) => z.level)) as 1 | 2 | 3] : C.tx3 }}>
                  {w.zones.length ? DOMS_LEVEL_LABEL[Math.max(...w.zones.map((z) => z.level)) as 1 | 2 | 3] : "Aucune"}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHead n={5} title="Courbatures · 7 jours" />
          <div style={{ ...ORDI_CARD, padding: "14px 16px", display: "flex", gap: 18, flexWrap: "wrap" }}>
            <BodyRead levels={domsMaxLevels(zones7)} />
            <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column" }}>
              {zones7.length === 0 ? <span style={{ fontSize: 13, color: C.tx3 }}>Rien de signalé.</span> : zones7.map((z) => (
                <div key={z.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.brd}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.tx }}><span>{z.label}</span><span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{z.days} j sur 7</span></div>
                  <div style={{ fontSize: 11.5, color: C.tx3 }}>{DOMS_LEVEL_LABEL[z.maxLevel]}{z.workouts.length ? ` · après ${z.workouts.join(", ")}` : ""} · {z.dates.map(shortDay).join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={6} title={lastDay ? `Saisie du jour · ${frDate(lastDay, false)}` : "Saisie du jour"} />
        {!last ? <div style={{ fontSize: 13, color: C.tx3 }}>Aucune saisie.</div> : (
          <div style={{ ...ORDI_CARD, padding: "14px 16px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <span style={{ ...MONO, fontSize: 30, color: C.tx }}>{int(lastScore)}</span><span style={{ ...MONO, fontSize: 12, color: C.tx3 }}> / 100</span>
              <div style={{ fontSize: 12.5, color: C.tx2 }}>{wellnessBand(lastScore)?.label ?? "—"}</div>
            </div>
            {morning.map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11.5, color: C.tx3 }}>{k}</span>
                <span style={{ ...MONO, fontSize: 16, color: C.tx }}>{v}</span>
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
      <span style={{ fontSize: 12.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {cells.map((c) => (
        <span key={c.day} title={`${frDate(c.day, false)} · ${c.value ?? "pas de saisie"}`}
          style={{ height: 20, borderRadius: 4, background: c.value != null ? alpha(NOTE_COLOR[Math.round(c.value)] ?? C.tx3, 0.75) : C.s2, boxShadow: c.z != null && c.z < -1 ? `inset 0 0 0 1.5px ${C.tx}` : "none" }} />
      ))}
      <span style={{ ...MONO, fontSize: 11, color: C.tx2, textAlign: "right" }}>{dec(mean)}</span>
    </>
  );
}

function AlertRow({ tag, color, title, sub }: { tag: string; color: string; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.brd}`, alignItems: "flex-start" }}>
      <Pill color={color}>{tag}</Pill>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: C.tx }}>{title}</div>
        <div style={{ fontSize: 12, color: C.tx3 }}>{sub}</div>
      </div>
    </div>
  );
}

