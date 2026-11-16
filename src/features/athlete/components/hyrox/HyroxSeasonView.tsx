import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { useHyroxSeasonGoals } from "@/features/shared/hooks/hyrox/useHyroxSeasonGoals";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import type { HyroxSeasonGoal } from "@/api/hyroxObjective";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { CATEGORY_LABEL, RACE_FORMAT_LABEL, raceCategory, type RaceFormat } from "@/lib/hyrox/categories";
import { fmtPace } from "@/lib/hyrox/raceDebrief";
import { objectiveFromRun, raceRunAvg } from "@/lib/hyrox/objective/model";
import { seasonLevers, seasonRaces, seasonsWithRaces, type SeasonLever, type SeasonRace } from "@/lib/hyrox/objective/seasonView";
import type { ObjectiveState } from "@/lib/hyrox/objective/vsObjective";
import { effortProfile } from "@/lib/hyrox/effortProfile";
import type { RefLookup } from "@/lib/hyrox/calc";
import { seasonOf } from "@/lib/hyrox/season";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import { ddmm, fmtGap, objectiveColor } from "@/features/shared/components/hyrox/raceAnalysisShared";
import EffortProfile from "@/features/shared/components/hyrox/EffortProfile";

/**
 * « Ma saison » (docs/HYROX_OBJECTIF_CONCEPTION.md §8.1, maquette validée par
 * Hugo le 16/11/2026) : une saison choisie, chaque course contre son objectif
 * (plan, sinon run du jour), l'objectif de saison fixé par le coach, les
 * leviers cumulés (§9.4) et le profil d'effort. Ordinateur : trois colonnes ;
 * téléphone : 01, 02, 05, 03, 04, 06, 07.
 */

const H2: CSSProperties = { ...KICKER, margin: 0, color: C.tx3, fontWeight: 400 };
const SECTION: CSSProperties = { ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 };

const catLabel = (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c;
const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const signed = (d: number) => (d === 0 ? "0" : `${d > 0 ? "+" : "−"}${fmtGap(d)}`);
const stateColor = (s: ObjectiveState | null) => (s === "on" || s == null ? C.tx2 : objectiveColor(s));
const shortName = (name: string) => name.replace(/^hyrox\s+/i, "");

function Title({ n, children, right }: { n: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <h2 style={H2}><span style={{ color: C.ac }}>{n} —</span> {children}</h2>
      {right}
    </div>
  );
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ ...MONO, display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: 999, fontSize: 12, background: alpha(color, 0.12), border: `1px solid ${alpha(color, 0.45)}`, color }}>
      {children}
    </span>
  );
}

function Stat({ label, value, sub, subColor }: { label: string; value: ReactNode; sub?: string; subColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...MONO, fontSize: 16 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: subColor ?? C.tx3 }}>{sub}</span>}
    </div>
  );
}

// ── 01 Dernière course ───────────────────────────────────────────────────────
function LastRace({ item, goal, isRecord, onOpen }: { item: SeasonRace; goal: HyroxSeasonGoal | null; isRecord: boolean; onOpen: () => void }) {
  const { race, view, strategy } = item;
  const total = view?.vs.total ?? null;
  const goalObj = goal ? objectiveFromRun(goal.division, goal.run_avg_s) : null;
  const vsGoal = goalObj ? race.total_s - goalObj.totalS : null;
  return (
    <section aria-label="Dernière course" style={{ ...SECTION, flex: "1 1 320px" }}>
      <Title n="01" right={isRecord ? <Pill color={C.g}>RECORD PERSO</Pill> : undefined}>Dernière course</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 500 }}>{race.event_name}</span>
        <span style={{ fontSize: 13, color: C.tx2 }}>{dayLabel(race.date)} · {catLabel(raceCategory(race))}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 44, lineHeight: 1 }}>{fmtClock(race.total_s)}</span>
        {total && total.state !== "on" && <Pill color={stateColor(total.state)}>{signed(total.deltaS)} {total.deltaS < 0 ? "en avance" : "de retard"}</Pill>}
        {total && total.state === "on" && <Pill color={C.tx2}>dans l'objectif</Pill>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, paddingTop: 12, borderTop: `1px solid ${C.brd}` }}>
        <Stat label={view?.objective.source === "plan" ? "Objectif (plan)" : "Objectif du jour"} value={total ? fmtClock(total.targetS) : "—"}
          sub={view?.objective.runAvgS != null ? `run ${view.objective.source === "plan" ? "visé" : "du jour"} ${fmtPace(view.objective.runAvgS)} /km` : undefined} />
        <Stat label="Rang" value={race.rank_overall != null && race.participants_overall ? <>{race.rank_overall}<span style={{ color: C.tx3 }}> / {race.participants_overall}</span></> : "—"} sub="général" />
        <Stat label="Objectif de saison" value={goalObj ? fmtClock(goalObj.totalS) : "—"}
          sub={vsGoal != null ? (vsGoal <= 0 ? `${fmtGap(vsGoal)} dessous` : `${fmtGap(vsGoal)} au-dessus`) : "pas fixé"}
          subColor={vsGoal != null ? (vsGoal <= 0 ? C.g : C.o) : undefined} />
        <Stat label="Possible" value={strategy && strategy.possibleS < race.total_s ? fmtClock(strategy.possibleS) : "—"} sub="meilleure stratégie" />
      </div>
      <button type="button" onClick={onOpen}
        style={{ marginTop: "auto", minHeight: 48, borderRadius: 10, border: "none", background: C.ac, color: C.ink, fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        Ouvrir l'analyse
      </button>
    </section>
  );
}

// ── 02 Le chrono contre l'objectif ───────────────────────────────────────────
function ChronoChart({ items, goalS, compact }: { items: SeasonRace[]; goalS: number | null; compact: boolean }) {
  const pts = [...items].filter((x) => x.view).sort((a, b) => a.race.date.localeCompare(b.race.date));
  if (pts.length === 0) return <p style={{ margin: 0, fontSize: 13, color: C.tx3 }}>Aucune course de ce format cette saison.</p>;
  const W = compact ? 340 : 560;
  const H = 230;
  const L = 44;
  const Rt = W - 12;
  const T = 24;
  const B = 190;
  const vals = pts.flatMap((x) => [x.race.total_s, x.view!.vs.total.targetS]).concat(goalS != null ? [goalS] : []);
  const lo = Math.floor((Math.min(...vals) - 30) / 60) * 60;
  const hi = Math.ceil((Math.max(...vals) + 30) / 60) * 60;
  const y = (s: number) => T + ((s - lo) / Math.max(60, hi - lo)) * (B - T); // plus rapide = plus haut
  const x = (i: number) => (pts.length === 1 ? (L + Rt) / 2 : L + 40 + (i / (pts.length - 1)) * (Rt - L - 80));
  const step = Math.max(60, Math.ceil((hi - lo) / 4 / 60) * 60);
  const grid: number[] = [];
  for (let s = lo; s <= hi; s += step) grid.push(s);
  const label = pts.map((p) => `${p.race.event_name} ${fmtClock(p.race.total_s)} pour un objectif de ${fmtClock(p.view!.vs.total.targetS)}`).join(" ; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label + (goalS != null ? ` ; objectif de saison ${fmtClock(goalS)}` : "")} style={{ width: "100%", height: "auto", display: "block" }}>
      {grid.map((s) => (
        <g key={s}>
          <line x1={L} x2={Rt} y1={y(s)} y2={y(s)} stroke={C.brd} />
          <text x={0} y={y(s) + 4} fontSize={11} fill={C.tx3} style={MONO}>{fmtClock(s).replace(/:\d\d$/, "")}</text>
        </g>
      ))}
      {goalS != null && (
        <g>
          <line x1={L} x2={Rt} y1={y(goalS)} y2={y(goalS)} stroke={C.b} strokeWidth={1.5} strokeDasharray="6 5" />
          <text x={Rt} y={y(goalS) - 6} textAnchor="end" fontSize={11} fill={C.b} style={MONO}>objectif de saison {fmtClock(goalS)}</text>
        </g>
      )}
      {pts.length > 1 && <polyline fill="none" stroke={C.o} strokeWidth={1.5} points={pts.map((p, i) => `${x(i)},${y(p.race.total_s)}`).join(" ")} />}
      {pts.map((p, i) => {
        const t = p.view!.vs.total;
        return (
          <g key={p.race.id}>
            <line x1={x(i)} x2={x(i)} y1={y(t.actualS)} y2={y(t.targetS)} stroke={alpha(stateColor(t.state), 0.55)} strokeWidth={1.5} />
            <line x1={x(i) - 14} x2={x(i) + 14} y1={y(t.targetS)} y2={y(t.targetS)} stroke={C.tx2} strokeWidth={2.5} />
            <circle cx={x(i)} cy={y(t.actualS)} r={6} fill={C.o} />
            <text x={x(i) + 12} y={y(t.actualS) - 4} fontSize={12} fill={C.tx} style={MONO}>{fmtClock(t.actualS)}</text>
            <text x={x(i) + 20} y={(y(t.actualS) + y(t.targetS)) / 2 + 4} fontSize={12} fill={stateColor(t.state)} style={MONO}>{signed(t.deltaS)}</text>
            <text x={x(i)} y={H - 24} textAnchor="middle" fontSize={12} fill={C.tx2}>{shortName(p.race.event_name).slice(0, 14)}</text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.tx3} style={MONO}>{dayLabel(p.race.date)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ChronoBlock({ items, goals, compact }: { items: SeasonRace[]; goals: HyroxSeasonGoal[]; compact: boolean }) {
  const formats = (["solo", "duo"] as RaceFormat[]).filter((f) => items.some((x) => x.format === f));
  const [pick, setPick] = useState<RaceFormat | null>(null);
  const format = pick && formats.includes(pick) ? pick : formats[0] ?? "solo";
  const mine = items.filter((x) => x.format === format);
  const cat = mine[0] ? raceCategory(mine[0].race) : null;
  const goal = cat ? goals.find((g) => g.division === cat) : undefined;
  const goalS = goal ? objectiveFromRun(goal.division, goal.run_avg_s)?.totalS ?? null : null;
  return (
    <section aria-label="Le chrono contre l'objectif" style={{ ...SECTION, flex: "1.5 1 420px" }}>
      <Title n="02" right={formats.length > 1 ? (
        <div role="tablist" aria-label="Format" style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: C.s2 }}>
          {formats.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={f === format} onClick={() => setPick(f)}
              style={{ minHeight: 32, padding: "0 12px", borderRadius: 8, border: f === format ? `1px solid ${C.brdL}` : "1px solid transparent", background: f === format ? C.bg : "transparent", color: f === format ? C.tx : C.tx3, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>
              {RACE_FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      ) : undefined}>{compact ? "Chrono / objectif" : "Le chrono contre l'objectif"}</Title>
      <ChronoChart items={mine} goalS={goalS} compact={compact} />
      <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", fontSize: 12, color: C.tx2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: C.o }} />Chrono réalisé</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 3, background: C.tx2 }} />Objectif de la course</span>
        {goalS != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, borderTop: `2px dashed ${C.b}` }} />Objectif de saison</span>}
        {!compact && <span style={{ color: C.tx3 }}>Plus haut = plus rapide</span>}
      </div>
    </section>
  );
}

// ── 03 Quoi travailler ───────────────────────────────────────────────────────
function LeversBlock({ levers }: { levers: SeasonLever[] }) {
  const shown = levers.slice(0, 5);
  return (
    <section aria-label="Quoi travailler" style={SECTION}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Title n="03">Quoi travailler</Title>
        <span style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>Ce que chaque levier t'a coûté en moyenne par course cette saison. Récurrent = dans au moins 2 courses sur 3.</span>
      </div>
      {shown.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: C.tx3 }}>Aucun levier chiffré : tes courses de la saison sont dans l'objectif.</p> : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
          {shown.map((l, i) => (
            <li key={l.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: `1px solid ${C.brd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...MONO, width: 18, color: C.tx3, fontSize: 12 }}>{i + 1}</span>
                <span style={{ flex: "1 1 auto", fontSize: 15, fontWeight: 500 }}>{l.label}</span>
                <span style={{ ...MONO, fontSize: 16 }}>−{fmtGap(l.avgS)}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 28 }}>
                {l.recurrent && <span style={{ ...MONO, height: 20, padding: "0 8px", borderRadius: 999, background: C.o, color: C.ink, fontSize: 11, display: "inline-flex", alignItems: "center", letterSpacing: "0.06em" }}>RÉCURRENT</span>}
                <span style={{ height: 20, padding: "0 8px", borderRadius: 999, border: `1px solid ${C.brdL}`, color: C.tx2, fontSize: 11.5, display: "inline-flex", alignItems: "center" }}>
                  {l.group === "strategie" ? "Stratégie" : "Capacité"} · {l.count} course{l.count > 1 ? "s" : ""} sur {l.of}
                </span>
              </div>
              {l.proposal && <span style={{ paddingLeft: 28, fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>{l.proposal}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── 04 Segments × courses ────────────────────────────────────────────────────
const SHORT: Record<string, string> = {
  ski: "Ski", sled_push: "Push", sled_pull: "Pull", bbj: "BBJ", row: "Rame", farmers: "Farm.", lunges: "Fentes", wall_balls: "WB", roxzone_total: "Rox",
};
const shortSeg = (k: string) => SHORT[k] ?? k.replace("run_", "R");

function cellStyle(s: ObjectiveState | null): CSSProperties {
  if (s === "ahead") return { background: alpha(C.g, 0.14), color: C.g };
  if (s === "behind" || s === "fast_start") return { background: alpha(C.o, 0.16), color: C.o };
  return { color: C.tx2 };
}

function SegmentsBlock({ items, compact }: { items: SeasonRace[]; compact: boolean }) {
  const rows = items.filter((x) => x.view);
  if (rows.length === 0) return null;
  const keys = rows[0].view!.vs.segments.map((s) => s.key);
  const nameW = compact ? 76 : 110;
  const cols = `${nameW}px repeat(${keys.length}, minmax(40px, 1fr)) 64px`;
  const cell: CSSProperties = { ...MONO, fontSize: 12, textAlign: "center", padding: "9px 0", borderRadius: 6 };
  return (
    <section aria-label="Segments par course" style={SECTION}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <Title n="04">Segments × courses</Title>
        <span style={{ fontSize: 12, color: C.tx3 }}>écart à l'objectif de chaque course, en secondes{compact ? " · glisser pour voir la suite" : ""}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div role="table" aria-label="Écart à l'objectif par segment et par course" style={{ minWidth: nameW + keys.length * 44 + 70, display: "flex", flexDirection: "column", gap: 4 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 4 }}>
            <span />
            {keys.map((k) => <span role="columnheader" key={k} style={{ ...MONO, fontSize: 11, color: C.tx3, textAlign: "center" }}>{shortSeg(k)}</span>)}
            <span role="columnheader" style={{ ...MONO, fontSize: 11, color: C.tx2, textAlign: "center" }}>Chrono</span>
          </div>
          {rows.map(({ race, view }) => (
            <div role="row" key={race.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "center" }}>
              <span role="rowheader" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shortName(race.event_name)}{!compact && <span style={{ color: C.tx3 }}> {ddmm(race.date)}</span>}
              </span>
              {view!.vs.segments.map((s) => (
                <span role="cell" key={s.key} style={{ ...cell, ...cellStyle(s.state) }}>
                  {s.deltaS == null ? "—" : Math.abs(s.deltaS) >= 100 ? signed(s.deltaS) : s.deltaS > 0 ? `+${s.deltaS}` : s.deltaS < 0 ? `−${-s.deltaS}` : "0"}
                </span>
              ))}
              <span role="cell" style={{ ...cell, ...cellStyle(view!.vs.total.state), fontWeight: 500 }}>{signed(view!.vs.total.deltaS)}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", fontSize: 12, color: C.tx2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: alpha(C.g, 0.3) }} />En avance</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${C.brdL}` }} />Dans l'objectif</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: alpha(C.o, 0.34) }} />En retard ou départ trop rapide</span>
      </div>
    </section>
  );
}

// ── 05 Et avec une meilleure stratégie ? ─────────────────────────────────────
function StrategyBlock({ item }: { item: SeasonRace }) {
  const s = item.strategy;
  if (!s) return null;
  const max = Math.max(1, ...s.levers.map((l) => l.gainS));
  const groups = [["strategie", "Stratégie", C.b], ["capacite", "Capacité", C.o]] as const;
  return (
    <section aria-label="Et avec une meilleure stratégie" style={SECTION}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Title n="05">Et avec une meilleure stratégie ?</Title>
        <span style={{ fontSize: 12.5, color: C.tx2 }}>Dernière course : {item.race.event_name}</span>
      </div>
      {s.levers.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: C.tx3 }}>Rien à gagner de chiffrable : la course colle à son objectif.</p> : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...MONO, fontSize: 22, color: C.tx2 }}>{fmtClock(s.currentS)}</span>
            <span style={{ color: C.tx3 }}>→</span>
            <span style={{ ...MONO, fontSize: 30 }}>{fmtClock(s.possibleS)}</span>
            <span style={{ ...MONO, fontSize: 13, color: C.g }}>−{fmtGap(s.currentS - s.possibleS)}</span>
          </div>
          {groups.map(([g, label, color]) => {
            const ls = s.levers.filter((l) => l.group === g);
            if (ls.length === 0) return null;
            return (
              <div key={g} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ ...LABEL, color }}>{label}</span>
                {ls.map((l) => (
                  <div key={l.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(70px, 120px) 48px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 13.5 }}>{l.label}</span>
                    <span aria-hidden="true" style={{ height: 8, borderRadius: 4, background: C.s2, display: "flex" }}><span style={{ width: `${(l.gainS / max) * 100}%`, borderRadius: 4, background: color }} /></span>
                    <span style={{ ...MONO, fontSize: 13, textAlign: "right" }}>−{fmtGap(l.gainS)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          <span style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>Calculé contre l'objectif de la course. Le détail levier par levier est dans l'analyse.</span>
        </>
      )}
    </section>
  );
}

// ── 06 Les courses de la saison ──────────────────────────────────────────────
function RacesBlock({ items, compact, onOpen }: { items: SeasonRace[]; compact: boolean; onOpen: (id: string) => void }) {
  const gap = (x: SeasonRace) => x.view?.vs.total ?? null;
  const th: CSSProperties = { ...LABEL, fontWeight: 400, padding: "10px 8px", textAlign: "right" };
  const td: CSSProperties = { ...MONO, padding: "12px 8px", textAlign: "right" };
  return (
    <section aria-label="Les courses de la saison" style={{ ...SECTION, gap: compact ? 4 : 10 }}>
      <Title n="06">Les courses de la saison</Title>
      {compact ? items.map((x) => (
        <button key={x.race.id} type="button" onClick={() => onOpen(x.race.id)}
          style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", border: "none", borderTop: `1px solid ${C.brd}`, background: "transparent", color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer", minHeight: 48 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%" }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{x.race.event_name}</span>
            <span style={{ ...MONO, fontSize: 15 }}>{fmtClock(x.race.total_s)}</span>
          </span>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", fontSize: 12.5, color: C.tx2 }}>
            <span>{dayLabel(x.race.date)} · {catLabel(raceCategory(x.race))}{x.race.rank_overall != null && x.race.participants_overall ? ` · ${x.race.rank_overall} / ${x.race.participants_overall}` : ""}</span>
            <span style={{ ...MONO, color: stateColor(gap(x)?.state ?? null) }}>{gap(x) ? signed(gap(x)!.deltaS) : "—"}</span>
          </span>
        </button>
      )) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>Date</th><th style={{ ...th, textAlign: "left" }}>Course</th><th style={{ ...th, textAlign: "left" }}>Catégorie</th>
                <th style={th}>Chrono</th><th style={th}>Objectif</th><th style={th}>Écart</th><th style={th}>Run moyen</th><th style={th}>Rang</th><th style={th}><span className="sr-only">Analyse</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const g = gap(x);
                return (
                  <tr key={x.race.id} style={{ borderTop: `1px solid ${C.brd}` }}>
                    <td style={{ ...td, textAlign: "left", paddingLeft: 0, color: C.tx2 }}>{ddmm(x.race.date)}</td>
                    <td style={{ padding: "12px 8px" }}>{x.race.event_name}</td>
                    <td style={{ padding: "12px 8px", color: C.tx2 }}>{catLabel(raceCategory(x.race))}</td>
                    <td style={td}>{fmtClock(x.race.total_s)}</td>
                    <td style={{ ...td, color: C.tx2 }}>{g ? fmtClock(g.targetS) : "—"}</td>
                    <td style={{ ...td, color: stateColor(g?.state ?? null) }}>{g ? signed(g.deltaS) : "—"}</td>
                    <td style={td}>{raceRunAvg(x.race) != null ? fmtPace(raceRunAvg(x.race) as number) : "—"}</td>
                    <td style={td}>{x.race.rank_overall != null && x.race.participants_overall ? <>{x.race.rank_overall}<span style={{ color: C.tx3 }}> / {x.race.participants_overall}</span></> : "—"}</td>
                    <td style={{ padding: "12px 0", textAlign: "right" }}>
                      <button type="button" onClick={() => onOpen(x.race.id)} style={{ border: "none", background: "transparent", color: C.tx, textDecoration: "underline", fontFamily: "inherit", fontSize: 13, cursor: "pointer", minHeight: 32 }}>Analyse</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── 07 Ton profil d'effort ───────────────────────────────────────────────────
function EffortBlock({ items, refs, compact }: { items: SeasonRace[]; refs: RefLookup; compact: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const item = items.find((x) => x.race.id === id) ?? items[0];
  if (!item) return null;
  const axes = effortProfile(item.race, refs, item.view?.objective.segments ?? null);
  return (
    <section aria-label="Ton profil d'effort" style={SECTION}>
      <Title n="07" right={items.length > 1 ? (
        <select value={item.race.id} onChange={(e) => setId(e.target.value)} aria-label="Course du profil d'effort"
          style={{ minHeight: 36, borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, padding: "0 10px", fontFamily: "inherit", fontSize: 13 }}>
          {items.map((x) => <option key={x.race.id} value={x.race.id}>{x.race.event_name} · {ddmm(x.race.date)}</option>)}
        </select>
      ) : undefined}>Ton profil d'effort</Title>
      <span style={{ fontSize: 12.5, color: C.tx2, marginTop: -6 }}>{item.race.event_name} · plus loin du centre = plus rapide · anneau du milieu = la médiane</span>
      <EffortProfile axes={axes} categoryLabel={catLabel(raceCategory(item.race))} compact={compact} />
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function HyroxSeasonView({ onOpenRace }: { onOpenRace: (id: string) => void }) {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: plans = [] } = useHyroxRacePlans(athleteId);
  const { data: goals = [] } = useHyroxSeasonGoals(athleteId);
  const { data: refRows = [] } = useHyroxReferences();
  const desktop = useIsDesktop();
  const today = localIsoDay();
  const seasons = useMemo(() => seasonsWithRaces(races, today), [races, today]);
  const [pick, setPick] = useState<string | null>(null);
  const seasonKey = pick ?? seasonOf(today)?.key ?? seasons[0]?.key ?? "";
  const season = seasons.find((s) => s.key === seasonKey) ?? null;
  const items = useMemo(() => seasonRaces(races, plans, seasonKey), [races, plans, seasonKey]);
  const levers = useMemo(() => seasonLevers(items), [items]);
  const refs: RefLookup = useMemo(() => (d, s, b) => pickRef(refRows, d, s, b) ?? undefined, [refRows]);
  const seasonGoals = goals.filter((g) => g.season === seasonKey);
  const current = seasonOf(today)?.key;

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;
  if (races.every((r) => r.status !== "finished")) {
    return (
      <div style={{ ...CARD, padding: 20, fontSize: 13.5, color: C.tx2, lineHeight: 1.55 }}>
        Pas encore de course HYROX. Ajoute ta première course dans l'onglet Courses : ta saison se construira ici.
      </div>
    );
  }

  const last = items[0] ?? null;
  const lastCat = last ? raceCategory(last.race) : null;
  const best = last ? races.filter((r) => r.status === "finished" && r.is_official && raceCategory(r) === lastCat).reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null) : null;
  const isRecord = !!last && last.race.is_official && best != null && last.race.total_s <= best;
  const lastGoal = last ? seasonGoals.find((g) => g.division === lastCat) ?? null : null;

  const header = (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px", paddingBottom: 16, borderBottom: `1px solid ${C.brd}` }}>
      <select value={seasonKey} onChange={(e) => setPick(e.target.value)} aria-label="Saison"
        style={{ minHeight: desktop ? 36 : 44, borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, padding: "0 12px", fontFamily: "inherit", fontSize: 13 }}>
        {seasons.map((s) => <option key={s.key} value={s.key}>{s.label}{s.key === current ? " (en cours)" : ""}</option>)}
      </select>
      <div style={{ flex: "1 1 auto" }} />
      {seasonGoals.length === 0
        ? <span style={{ fontSize: 12.5, color: C.tx3 }}>Pas d'objectif de saison : ton coach le fixe dans l'onglet Objectif.</span>
        : seasonGoals.map((g) => {
          const o = objectiveFromRun(g.division, g.run_avg_s);
          return (
            <div key={g.id} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={LABEL}>Objectif de saison</span>
              <span style={{ ...MONO, fontSize: 18 }}>{fmtPace(g.run_avg_s)} <span style={{ fontSize: 12, color: C.tx3 }}>/km</span></span>
              {o && <span style={{ ...MONO, fontSize: 18, color: C.tx2 }}>→ {fmtClock(o.totalS)}</span>}
              <span style={{ fontSize: 12.5, color: C.tx3 }}>{catLabel(g.division)} · fixé par ton coach</span>
            </div>
          );
        })}
    </header>
  );

  if (!last) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        <div style={{ ...CARD, padding: 20, fontSize: 13.5, color: C.tx2 }}>Aucune course terminée sur la {season?.label ?? "saison"}.</div>
      </div>
    );
  }

  const b01 = <LastRace key="01" item={last} goal={lastGoal} isRecord={isRecord} onOpen={() => onOpenRace(last.race.id)} />;
  const b02 = <ChronoBlock key="02" items={items} goals={seasonGoals} compact={!desktop} />;
  const b03 = <LeversBlock key="03" levers={levers} />;
  const b04 = <SegmentsBlock key="04" items={items} compact={!desktop} />;
  const b05 = <StrategyBlock key="05" item={last} />;
  const b06 = <RacesBlock key="06" items={items} compact={!desktop} onOpen={onOpenRace} />;
  const b07 = <EffortBlock key="07" items={items} refs={refs} compact={!desktop} />;

  if (!desktop) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{header}{b01}{b02}{b05}{b03}{b04}{b06}{b07}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {header}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 700px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>{b01}{b02}</div>
          {b04}
          {b06}
          {b07}
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>{b03}{b05}</div>
      </div>
    </div>
  );
}
