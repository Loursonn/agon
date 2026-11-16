/**
 * « Ma saison » (docs/HYROX_OBJECTIF_CONCEPTION.md §8.1 et §9.4, maquette
 * validée par Hugo le 16/11/2026) : les courses terminées d'une saison, chacune
 * contre son objectif (plan, sinon run du jour), et les leviers cumulés sur la
 * saison. Pur et testé.
 */
import { STATION_KEYS, STATION_META, type HyroxRacePlan, type HyroxResult, type StationKey } from "@/features/shared/types/hyrox";
import { raceFormat, type RaceFormat } from "../categories";
import { groupBySeason, seasonOf, type Season } from "../season";
import { objectiveForRace, type RaceObjectiveView } from "./forRace";
import { leverProposal } from "./levers";
import { raceStrategy, type LeverGroup, type LeverKey, type StrategyResult } from "./strategy";
import { segmentTolerance, stateOf, type ObjectiveState } from "./vsObjective";

export interface SeasonRace {
  race: HyroxResult;
  format: RaceFormat;
  /** `null` : catégorie hors grille ou course incomplète. */
  view: RaceObjectiveView | null;
  strategy: StrategyResult | null;
}

export interface SeasonLever {
  key: LeverKey;
  group: LeverGroup;
  label: string;
  /** Somme des gains ÷ nombre de courses analysées de la saison (s, arrondi). */
  avgS: number;
  /** Courses où le levier apparaît, sur `of` courses analysées. */
  count: number;
  of: number;
  /** Présent dans au moins 2 courses et au moins 2 courses sur 3. */
  recurrent: boolean;
  proposal: string | null;
}

/** Saisons qui ont au moins une course terminée, plus la saison en cours, la plus récente d'abord. */
export function seasonsWithRaces(races: readonly HyroxResult[], today: string): Season[] {
  const done = races.filter((r) => r.status === "finished" && r.total_s > 0);
  const out = groupBySeason(done).map((g) => g.season);
  const current = seasonOf(today);
  if (current && !out.some((s) => s.key === current.key)) out.push(current);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

/** Courses terminées de la saison, la plus récente d'abord, chacune contre son objectif. */
export function seasonRaces(races: readonly HyroxResult[], plans: readonly HyroxRacePlan[], seasonKey: string): SeasonRace[] {
  return races
    .filter((r) => r.status === "finished" && r.total_s > 0 && seasonOf(r.date)?.key === seasonKey)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((race) => {
      const view = objectiveForRace(race, plans);
      return { race, format: raceFormat(race), view, strategy: view ? raceStrategy(race, view.objective.segments) : null };
    });
}

/**
 * Leviers de la saison (§9.4) : chaque levier est cumulé sur les courses
 * analysées puis divisé par leur nombre (moyenne par course), trié du plus
 * coûteux au moins coûteux. Une course où il n'apparaît pas compte pour 0.
 */
export function seasonLevers(items: readonly SeasonRace[]): SeasonLever[] {
  const analysed = items.filter((x) => x.strategy);
  const of = analysed.length;
  if (of === 0) return [];
  const by = new Map<LeverKey, { group: LeverGroup; label: string; sum: number; count: number; focus?: StationKey }>();
  for (const { strategy } of analysed) {
    for (const l of strategy!.levers) {
      const cur = by.get(l.key) ?? { group: l.group, label: l.label, sum: 0, count: 0, focus: l.focus };
      cur.sum += l.gainS;
      cur.count += 1;
      by.set(l.key, cur);
    }
  }
  return [...by.entries()]
    .map(([key, v]) => ({
      key,
      group: v.group,
      label: v.label,
      avgS: Math.round(v.sum / of),
      count: v.count,
      of,
      recurrent: v.count >= 2 && v.count * 3 >= of * 2,
      proposal: leverProposal({ key, focus: v.focus }),
    }))
    .sort((a, b) => b.avgS - a.avgS || b.count - a.count);
}

export interface SegmentGapRow {
  key: string;
  label: string;
  /** Réalisé − objectif (s), course par course dans l'ordre donné ; `null` sans objectif ou sans mesure. */
  deltas: Array<number | null>;
  states: Array<ObjectiveState | null>;
  /** Dernier écart connu − premier (s) ; négatif = progrès. */
  changeS: number | null;
}

const GAP_ROWS: Array<{ key: string; label: string; parts: readonly string[] }> = [
  { key: "total", label: "Chrono", parts: [] },
  ...STATION_KEYS.map((k) => ({ key: k as string, label: STATION_META[k].label, parts: [k as string] })),
  { key: "runs", label: "Runs (8 km)", parts: ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"] },
  { key: "roxzone_total", label: "Roxzone", parts: ["roxzone_total"] },
];

/**
 * Écart à l'objectif par station, runs et Roxzone sur plusieurs courses (ordre
 * chronologique attendu ; Q8 : la carte de chaleur coach en secondes, plus en
 * positions). Chaque course contre son propre objectif (plan, sinon run du jour).
 */
export function segmentGaps(chronological: readonly HyroxResult[], plans: readonly HyroxRacePlan[]): SegmentGapRow[] {
  const views = chronological.map((r) => objectiveForRace(r, plans));
  return GAP_ROWS.map(({ key, label, parts }) => {
    const cells = views.map((v): { d: number | null; s: ObjectiveState | null } => {
      if (!v) return { d: null, s: null };
      if (key === "total") return { d: v.vs.total.deltaS, s: v.vs.total.state };
      const segs = parts.map((p) => v.vs.segments.find((x) => x.key === p));
      if (segs.some((x) => !x || x.deltaS == null)) return { d: null, s: null };
      if (segs.length === 1) return { d: segs[0]!.deltaS, s: segs[0]!.state };
      const d = segs.reduce((n, x) => n + (x!.deltaS as number), 0);
      const target = segs.reduce((n, x) => n + x!.targetS, 0);
      return { d, s: stateOf(d, segmentTolerance(target)) };
    });
    const known = cells.map((c) => c.d).filter((d): d is number => d != null);
    return {
      key, label,
      deltas: cells.map((c) => c.d),
      states: cells.map((c) => c.s),
      changeS: known.length >= 2 ? known[known.length - 1] - known[0] : null,
    };
  });
}
