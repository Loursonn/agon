/**
 * HYROX : comparaison entre courses (planches HyroxAnaTel « Runs › Évolution »,
 * HyroxAnaCoachOrdi « vs record », HyroxAnaCoachEvolution « Où passe le temps »
 * et « Position par station »). Calculs purs à partir des seuls temps : aucune
 * donnée de montre ici.
 */
import {
  REFERENCE_DIVISION, RUN_KEYS, STATION_KEYS, STATION_META,
  type HyroxDivision, type HyroxResult, type StationKey,
} from "@/features/shared/types/hyrox";
import { bracketOf, percentile, roxzoneTotal, runTotal, stationsTotal, type RefLookup } from "./calc";

const seg = (r: HyroxResult, key: string): number | null =>
  (r as unknown as Record<string, number | null>)[`${key}_s`] ?? null;

/** Tranche de chrono lisible : « 1:10–1:20 », « moins de 1:10 ». */
export function bracketLabel(b: ReturnType<typeof bracketOf>): string {
  switch (b) {
    case "sub70": return "moins de 1:10";
    case "70_80": return "1:10–1:20";
    case "80_90": return "1:20–1:30";
    default: return "plus de 1:30";
  }
}

/** Nom court d'une course : « HYROX Lyon » → « Lyon ». */
export function raceShortName(r: Pick<HyroxResult, "event_name">): string {
  const n = r.event_name.replace(/^hyrox\s+/i, "").trim();
  return n || r.event_name;
}

/**
 * Écart au record : meilleure course officielle terminée de la même catégorie,
 * hors course affichée. `null` si la course est elle-même le record ou s'il
 * n'y a pas d'autre course officielle.
 */
export function recordGap(race: HyroxResult, races: readonly HyroxResult[]): { gapS: number; record: HyroxResult } | null {
  const others = races.filter((r) => r.id !== race.id && r.is_official && r.status === "finished" && r.division === race.division);
  if (others.length === 0) return null;
  const record = others.reduce((a, b) => (b.total_s < a.total_s ? b : a));
  const gapS = race.total_s - record.total_s;
  return gapS > 0 ? { gapS, record } : null;
}

/** Course précédente (date strictement antérieure), la plus récente. */
export function previousRace(race: HyroxResult, races: readonly HyroxResult[]): HyroxResult | null {
  return races
    .filter((r) => r.id !== race.id && r.date < race.date && r.status === "finished")
    .reduce<HyroxResult | null>((best, r) => (best == null || r.date > best.date ? r : best), null);
}

export interface RunPaceRow {
  id: string;
  label: string;
  date: string;
  /** Temps des 8 runs (s/km : un run fait 1 km). */
  runs: number[];
  avg: number;
}

/** Allure des 8 runs de chaque course complète, de la plus ancienne à la plus récente (`max` dernières). */
export function runPaceEvolution(races: readonly HyroxResult[], max = 5): RunPaceRow[] {
  return races
    .map((r) => ({ r, runs: RUN_KEYS.map((k) => seg(r, k)) }))
    .filter((x): x is { r: HyroxResult; runs: number[] } => x.runs.every((v) => v != null && v > 0))
    .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : 0))
    .slice(-max)
    .map(({ r, runs }) => ({
      id: r.id,
      label: raceShortName(r),
      date: r.date,
      runs,
      avg: runs.reduce((n, v) => n + v, 0) / runs.length,
    }));
}

export interface TimeSplit {
  run: number | null;
  stations: number | null;
  roxzone: number | null;
  /** Parts du chrono (0-100, une décimale). */
  pct: { run: number | null; stations: number | null; roxzone: number | null };
}

/** Où passe le temps : course, stations, Roxzone, en secondes et en part du chrono. */
export function timeSplit(r: HyroxResult): TimeSplit {
  const run = runTotal(r);
  const stations = stationsTotal(r);
  const roxzone = roxzoneTotal(r);
  const pct = (v: number | null) => (v != null && r.total_s > 0 ? Math.round((v / r.total_s) * 1000) / 10 : null);
  return { run, stations, roxzone, pct: { run: pct(run), stations: pct(stations), roxzone: pct(roxzone) } };
}

export interface SegmentPosition {
  key: string;
  label: string;
  /** Temps et position (top %, 1 = meilleur) course par course, dans l'ordre donné. */
  values: Array<number | null>;
  pcts: Array<number | null>;
  latestPct: number | null;
  /** Évolution en points entre la première et la dernière position connues (négatif = mieux). */
  deltaPts: number | null;
}

/**
 * Position par station sur plusieurs courses (ordre chronologique attendu) :
 * 8 stations, puis les 8 runs ensemble, puis la Roxzone. Référence : division
 * de la dernière course, tranche de chrono de chaque course.
 */
export function segmentPositions(chronological: readonly HyroxResult[], refLookup: RefLookup): SegmentPosition[] {
  if (chronological.length === 0) return [];
  const latest = chronological[chronological.length - 1];
  const refDiv = REFERENCE_DIVISION(latest.division as HyroxDivision);
  const rows: Array<{ key: string; label: string; get: (r: HyroxResult) => number | null }> = [
    ...STATION_KEYS.map((k: StationKey) => ({ key: k as string, label: STATION_META[k].label, get: (r: HyroxResult) => seg(r, k) })),
    { key: "run_total", label: "Runs (8 km)", get: runTotal },
    { key: "roxzone_total", label: "Roxzone", get: roxzoneTotal },
  ];
  return rows.map(({ key, label, get }) => {
    const values = chronological.map(get);
    const pcts = chronological.map((r, i) => {
      const v = values[i];
      const ref = v != null ? refLookup(refDiv, key, bracketOf(r.total_s)) : undefined;
      return v != null && ref ? percentile(v, ref) : null;
    });
    const known = pcts.filter((p): p is number => p != null);
    return {
      key,
      label,
      values,
      pcts,
      latestPct: pcts[pcts.length - 1] ?? null,
      deltaPts: known.length >= 2 ? known[known.length - 1] - known[0] : null,
    };
  });
}

/** Percentiles course et stations (moyenne des 8 stations) d'une course : base du profil. */
export function profilePercentiles(r: HyroxResult, refLookup: RefLookup): { run: number | null; stations: number | null } {
  const refDiv = REFERENCE_DIVISION(r.division as HyroxDivision);
  const bracket = bracketOf(r.total_s);
  const rt = runTotal(r);
  const runRef = refLookup(refDiv, "run_total", bracket);
  const run = runRef && rt != null ? percentile(rt, runRef) : null;
  const st = STATION_KEYS.map((k) => {
    const v = seg(r, k);
    const ref = refLookup(refDiv, k, bracket);
    return v != null && ref ? percentile(v, ref) : null;
  }).filter((p): p is number => p != null);
  return { run, stations: st.length ? Math.round(st.reduce((a, b) => a + b, 0) / st.length) : null };
}
