/**
 * Débrief d'une course HYROX et résumé de saison (planches « HYROX · refonte
 * visuelle » validées par Hugo le 15/11/2026) : ce qui a marché, ce qui a
 * coûté, ce qui a progressé depuis la course précédente du même format.
 *
 * Tout est calculé par des règles à partir des temps officiels et des
 * références HYROX (aucune IA, aucune donnée de montre). Pur et testé.
 */
import { RACE_ORDER, STATION_KEYS, STATION_META, type HyroxResult, type SegmentKey, type StationKey } from "@/features/shared/types/hyrox";
import { fmtClock } from "@/lib/seance";
import { POSITION_BRACKET, percentile, roxzoneTotal, runTotal, standing, stationsTotal, type PercentileRef, type RefLookup, type Standing } from "./calc";
import { raceCategory, raceFormat, type RaceFormat } from "./categories";
import { cruisePace, cruiseSpread, levelRunPattern, stationRunCosts, EXCESS_WARN_S, type RunLookup } from "./runPacing";

/** Référence de position d'un segment (toute la catégorie choisie). */
export type PositionLookup = (segment: string) => PercentileRef | null | undefined;
/** Médiane du niveau d'un segment. */
export type LevelMedian = (segment: string) => number | null;

const seg = (r: HyroxResult, k: string): number | null => {
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};
const runOf = (r: HyroxResult): RunLookup => (k) => seg(r, k);

/** « 4′52 » (allure s/km). */
export function fmtPace(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}′${String(t % 60).padStart(2, "0")}`;
}
const signed = (s: number) => `${s > 0 ? "+" : s < 0 ? "−" : "±"}${Math.abs(Math.round(s))}`;

const SHORT: Record<string, string> = {
  ski: "Ski", sled_push: "Push", sled_pull: "Pull", bbj: "BBJ", row: "Row", farmers: "Farm", lunges: "Fent", wall_balls: "WB",
};

// ─────────────────────────────── Frise ───────────────────────────────

export interface StripSegment {
  key: SegmentKey;
  label: string;
  short: string;
  kind: "run" | "station";
  timeS: number;
  /** Top x % de la catégorie, `null` pour le run 1 (départ) ou sans référence. */
  pct: number | null;
  standing: Standing | null;
}

/** Les 16 segments dans l'ordre de course, colorés par leur position. */
export function raceStrip(r: HyroxResult, posOf: PositionLookup): StripSegment[] {
  const out: StripSegment[] = [];
  for (const key of RACE_ORDER) {
    const t = seg(r, key);
    if (t == null) continue;
    const isRun = key.startsWith("run_");
    const ref = key === "run_1" ? null : posOf(key);
    const pct = ref ? percentile(t, ref) : null;
    out.push({
      key, kind: isRun ? "run" : "station", timeS: t, pct, standing: standing(pct),
      label: isRun ? `Run ${key.slice(4)}` : STATION_META[key as StationKey].label,
      short: isRun ? `R${key.slice(4)}` : SHORT[key],
    });
  }
  return out;
}

// ─────────────────────────────── Débrief ───────────────────────────────

export interface DebriefItem {
  key: string;
  /** Chiffre mis en avant (« top 18 % », « −22 s », « +46 s »). */
  value: string;
  title: string;
  why: string;
}

export interface SinceRow {
  key: "chrono" | "stations" | "runs" | "roxzone" | "position";
  label: string;
  from: string;
  to: string;
  /** Écart affiché ; « − » = mieux pour les temps, « + » = mieux pour la position. */
  delta: string;
  better: boolean | null;
}

export interface RaceDebrief {
  headline: string;
  good: DebriefItem[];
  bad: DebriefItem[];
  since: SinceRow[];
  previous: HyroxResult | null;
}

/** Une course se compare à la précédente du même format (solo, duo, relais). */
export function previousComparable(race: HyroxResult, races: readonly HyroxResult[]): HyroxResult | null {
  const fmt = raceFormat(race);
  return races
    .filter((r) => r.id !== race.id && r.date < race.date && r.status === "finished" && raceFormat(r) === fmt)
    .reduce<HyroxResult | null>((best, r) => (best == null || r.date > best.date ? r : best), null);
}

/** Position du chrono dans sa propre catégorie (pour comparer deux courses). */
export function ownTotalPct(r: HyroxResult, refs: RefLookup): number | null {
  const ref = refs(raceCategory(r), "total", POSITION_BRACKET);
  return ref ? percentile(r.total_s, ref) : null;
}

const shortName = (r: HyroxResult) => r.event_name.replace(/^hyrox\s+/i, "").trim() || r.event_name;

const MAX_ITEMS = 3;
/** En dessous, un écart à la médiane ou un progrès n'est pas cité. */
const NOTABLE_S = 10;

export function raceDebrief(input: {
  race: HyroxResult;
  races: readonly HyroxResult[];
  posOf: PositionLookup;
  median: LevelMedian | null;
  refs: RefLookup | null;
  isRecord: boolean;
}): RaceDebrief {
  const { race, races, posOf, median, refs, isRecord } = input;
  const prev = previousComparable(race, races);
  const stationPct = STATION_KEYS.map((k) => {
    const t = seg(race, k);
    const ref = posOf(k);
    const pct = t != null && ref ? percentile(t, ref) : null;
    return { k, t, pct };
  }).filter((x): x is { k: StationKey; t: number; pct: number } => x.t != null && x.pct != null);

  // ── Ce qui a marché ──
  const strong = stationPct.filter((x) => standing(x.pct) === "fort").sort((a, b) => a.pct - b.pct);
  const good: DebriefItem[] = strong.slice(0, 2).map((x) => ({
    key: x.k, value: `top ${x.pct} %`, title: STATION_META[x.k].label,
    why: `${fmtClock(x.t)} · mieux que ${100 - x.pct} % de la catégorie.`,
  }));
  const levelP50: RunLookup | null = median ? (k) => median(k) : null;
  const spread = cruiseSpread(runOf(race), levelP50);
  if (spread && spread.usualSpreadS != null && spread.spreadS <= spread.usualSpreadS + 5) {
    good.push({
      key: "regular", value: `±${spread.spreadS} s`, title: "Runs réguliers",
      why: `Écart de ${spread.spreadS} s/km entre tes runs 2 à 7, d'habitude ${spread.usualSpreadS} s à ton niveau.`,
    });
  }
  if (prev) {
    const best = STATION_KEYS.map((k) => {
      const a = seg(prev, k);
      const b = seg(race, k);
      return { k, a, b, d: a != null && b != null ? b - a : null };
    }).filter((x): x is { k: StationKey; a: number; b: number; d: number } => x.d != null && x.d <= -NOTABLE_S)
      .filter((x) => !good.some((g) => g.key === x.k))
      .sort((a, b) => a.d - b.d)[0];
    if (best) {
      good.push({
        key: `up_${best.k}`, value: `${signed(best.d)} s`, title: STATION_META[best.k].label,
        why: `${fmtClock(best.a)} → ${fmtClock(best.b)} depuis ${shortName(prev)}.`,
      });
    }
  }
  for (const x of strong.slice(2)) good.push({
    key: x.k, value: `top ${x.pct} %`, title: STATION_META[x.k].label,
    why: `${fmtClock(x.t)} · mieux que ${100 - x.pct} % de la catégorie.`,
  });

  // ── Ce qui a coûté (classé par secondes perdues) ──
  const bad: Array<DebriefItem & { lostS: number }> = [];
  const rox = roxzoneTotal(race);
  const roxMed = median?.("roxzone_total") ?? null;
  if (rox != null && roxMed != null && rox - roxMed >= NOTABLE_S) {
    bad.push({
      key: "roxzone", value: `+${Math.round(rox - roxMed)} s`, title: "Roxzone", lostS: rox - roxMed,
      why: `${fmtClock(rox)}, la médiane de ton niveau est à ${fmtClock(roxMed)}.`,
    });
  }
  for (const x of stationPct.filter((s) => standing(s.pct) === "faible")) {
    const m = median?.(x.k) ?? null;
    bad.push({
      key: x.k, value: `top ${x.pct} %`, title: STATION_META[x.k].label, lostS: m != null ? x.t - m : 0,
      why: `${fmtClock(x.t)} · ${x.pct} % de la catégorie font mieux.`,
    });
  }
  const level = levelP50 ? levelRunPattern(levelP50) : null;
  const worstRun = stationRunCosts(runOf(race), level)
    .filter((c) => c.excessS != null && c.excessS >= EXCESS_WARN_S)
    .sort((a, b) => (b.excessS ?? 0) - (a.excessS ?? 0))[0];
  if (worstRun && worstRun.usualS != null) {
    bad.push({
      key: worstRun.run, value: `+${worstRun.excessS} s`, lostS: worstRun.excessS ?? 0,
      title: `Run ${worstRun.run.slice(4)}, après ${STATION_META[worstRun.station].label.toLowerCase()}`,
      why: `${signed(worstRun.costS)} s/km sur ta croisière, d'habitude ${signed(worstRun.usualS)} à ton niveau.${worstRun.special ? " Parcours du run 8 parfois différent." : ""}`,
    });
  }
  bad.sort((a, b) => b.lostS - a.lostS);

  // ── Depuis la course précédente du même format ──
  const since: SinceRow[] = [];
  if (prev) {
    const row = (key: SinceRow["key"], label: string, a: number | null, b: number | null) => {
      if (a == null || b == null) return;
      const d = Math.round(b - a);
      since.push({ key, label, from: fmtClock(a), to: fmtClock(b), delta: d === 0 ? "0" : `${d < 0 ? "−" : "+"}${fmtClock(Math.abs(d))}`, better: d === 0 ? null : d < 0 });
    };
    row("chrono", "Chrono", prev.total_s, race.total_s);
    row("stations", "Stations", stationsTotal(prev), stationsTotal(race));
    row("runs", "Runs", runTotal(prev), runTotal(race));
    row("roxzone", "Roxzone", roxzoneTotal(prev), roxzoneTotal(race));
    const pa = refs ? ownTotalPct(prev, refs) : null;
    const pb = refs ? ownTotalPct(race, refs) : null;
    if (pa != null && pb != null) {
      since.push({ key: "position", label: "Position", from: `top ${pa} %`, to: `top ${pb} %`, delta: pa === pb ? "0" : `${pa > pb ? "+" : "−"}${Math.abs(pa - pb)}`, better: pa === pb ? null : pb < pa });
    }
  }

  // ── Phrase de synthèse ──
  const parts: string[] = [];
  const chronoD = prev ? race.total_s - prev.total_s : null;
  if (isRecord) parts.push("Ta meilleure course.");
  else if (chronoD != null && Math.abs(chronoD) >= 1) parts.push(`${fmtClock(Math.abs(chronoD))} ${chronoD < 0 ? "de mieux" : "de plus"} qu'à ${shortName(prev!)}.`);
  if (strong.length) parts.push(`Point${strong.length > 1 ? "s" : ""} fort${strong.length > 1 ? "s" : ""} : ${listFr(strong.slice(0, 2).map((x) => STATION_META[x.k].label))}.`);
  if (bad[0]) parts.push(`Le plus de temps perdu : ${bad[0].title.toLowerCase()}.`);

  return {
    headline: parts.join(" "),
    good: good.slice(0, MAX_ITEMS),
    bad: bad.slice(0, MAX_ITEMS).map(({ lostS: _lost, ...x }) => x),
    since,
    previous: prev,
  };
}

const listFr = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);

// ─────────────────────────────── Saison ───────────────────────────────

export interface ChronoPoint {
  id: string;
  date: string;
  name: string;
  totalS: number;
}

/** Chronos par format, du plus ancien au plus récent (courbes séparées). */
export function chronoByFormat(races: readonly HyroxResult[]): Record<RaceFormat, ChronoPoint[]> {
  const out: Record<RaceFormat, ChronoPoint[]> = { solo: [], duo: [], relais: [] };
  for (const r of [...races].filter((x) => x.status === "finished" && x.total_s > 0).sort((a, b) => a.date.localeCompare(b.date))) {
    out[raceFormat(r)].push({ id: r.id, date: r.date, name: shortName(r), totalS: r.total_s });
  }
  return out;
}

export interface StationStanding {
  key: StationKey;
  label: string;
  timeS: number;
  pct: number;
  standing: Standing;
}

/** Profil d'une course : les 8 stations, de la plus forte à la plus faible. */
export function stationProfile(r: HyroxResult, refs: RefLookup): StationStanding[] {
  const cat = raceCategory(r);
  return STATION_KEYS.flatMap((k) => {
    const t = seg(r, k);
    const ref = refs(cat, k, POSITION_BRACKET);
    const pct = t != null && ref ? percentile(t, ref) : null;
    const s = standing(pct);
    return t != null && pct != null && s ? [{ key: k, label: STATION_META[k].label, timeS: t, pct, standing: s }] : [];
  }).sort((a, b) => a.pct - b.pct);
}

/** Croisière (runs 2 à 7) d'une course, en s/km. */
export const raceCruise = (r: HyroxResult): number | null => cruisePace(runOf(r));
