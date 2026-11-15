/**
 * Débrief d'une course HYROX et résumé de saison, contre l'objectif de la
 * course (docs/HYROX_OBJECTIF_CONCEPTION.md §4) : ce qui a marché, ce qui a
 * coûté, en secondes contre l'objectif, et ce qui a progressé depuis la course
 * précédente du même format. Aucune position dans la catégorie.
 *
 * Tout est calculé par des règles à partir des temps (aucune IA, aucune donnée
 * de montre). Pur et testé.
 */
import { RACE_ORDER, STATION_KEYS, STATION_META, type HyroxResult, type SegmentKey, type StationKey } from "@/features/shared/types/hyrox";
import { fmtClock } from "@/lib/seance";
import { roxzoneTotal, runTotal, stationsTotal } from "./calc";
import { raceFormat, type RaceFormat } from "./categories";
import { cruisePace, cruiseSpread, type RunLookup } from "./runPacing";
import { STATE_LABEL, objectiveLookup, type ObjectiveState, type RaceVsObjective, type SegmentVsObjective } from "./objective/vsObjective";
import type { PlanSegments } from "./racePlan";

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

/** « Run 3 », « SkiErg », « Roxzone ». */
export function segmentLabel(key: string): string {
  if (key === "roxzone_total") return "Roxzone";
  if (key.startsWith("run_")) return `Run ${key.slice(4)}`;
  return STATION_META[key as StationKey]?.label ?? key;
}

// ─────────────────────────────── Frise ───────────────────────────────

export interface StripSegment {
  key: SegmentKey;
  label: string;
  short: string;
  kind: "run" | "station";
  timeS: number;
  /** Réalisé − objectif (s) ; `null` sans objectif. */
  deltaS: number | null;
  state: ObjectiveState | null;
}

/** Les 16 segments dans l'ordre de course, colorés par leur écart à l'objectif. */
export function raceStrip(r: HyroxResult, vs: RaceVsObjective | null): StripSegment[] {
  const out: StripSegment[] = [];
  for (const key of RACE_ORDER) {
    const t = seg(r, key);
    if (t == null) continue;
    const isRun = key.startsWith("run_");
    const v = vs?.segments.find((x) => x.key === key) ?? null;
    out.push({
      key, kind: isRun ? "run" : "station", timeS: t, deltaS: v?.deltaS ?? null, state: v?.state ?? null,
      label: segmentLabel(key),
      short: isRun ? `R${key.slice(4)}` : SHORT[key],
    });
  }
  return out;
}

// ─────────────────────────────── Débrief ───────────────────────────────

export interface DebriefItem {
  key: string;
  /** Chiffre mis en avant (« −22 s », « +46 s », « ±6 s »). */
  value: string;
  title: string;
  why: string;
}

export interface SinceRow {
  key: "chrono" | "stations" | "runs" | "roxzone";
  label: string;
  from: string;
  to: string;
  /** Écart affiché ; « − » = mieux. */
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

const shortName = (r: HyroxResult) => r.event_name.replace(/^hyrox\s+/i, "").trim() || r.event_name;

const MAX_ITEMS = 3;
/** En dessous, un progrès depuis la course précédente n'est pas cité. */
const NOTABLE_S = 10;

const vsWhy = (x: SegmentVsObjective) => `${fmtClock(x.actualS)} pour un objectif de ${fmtClock(x.targetS)}.`;

/**
 * Débrief contre l'objectif. Sans objectif (`vs` nul : temps de run manquants,
 * relais), seuls le progrès depuis la course précédente et la régularité sont cités.
 */
export function raceDebrief(input: {
  race: HyroxResult;
  races: readonly HyroxResult[];
  objective: PlanSegments | null;
  vs: RaceVsObjective | null;
  isRecord: boolean;
}): RaceDebrief {
  const { race, races, objective, vs, isRecord } = input;
  const prev = previousComparable(race, races);
  const judged = (vs?.segments ?? []).filter((x): x is SegmentVsObjective & { deltaS: number; actualS: number } => x.deltaS != null && x.actualS != null);

  // ── Ce qui a marché : segments en avance (le run 1 en avance est un départ rapide, pas un point fort) ──
  const ahead = judged.filter((x) => x.state === "ahead").sort((a, b) => a.deltaS - b.deltaS);
  const good: DebriefItem[] = ahead.slice(0, 2).map((x) => ({ key: x.key, value: `${signed(x.deltaS)} s`, title: segmentLabel(x.key), why: vsWhy(x) }));
  const spread = cruiseSpread(runOf(race), objective ? objectiveLookup(objective) : null);
  if (spread && spread.usualSpreadS != null && spread.spreadS <= spread.usualSpreadS + 5) {
    good.push({
      key: "regular", value: `±${spread.spreadS} s`, title: "Runs réguliers",
      why: `Écart de ${spread.spreadS} s/km entre tes runs 2 à 7, ${spread.usualSpreadS} s prévus par l'objectif.`,
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
  for (const x of ahead.slice(2)) good.push({ key: x.key, value: `${signed(x.deltaS)} s`, title: segmentLabel(x.key), why: vsWhy(x) });

  // ── Ce qui a coûté : segments en retard, classés par secondes perdues ; départ rapide ──
  const bad: Array<DebriefItem & { lostS: number }> = judged
    .filter((x) => x.state === "behind")
    .map((x) => ({
      key: x.key, value: `${signed(x.deltaS)} s`, title: segmentLabel(x.key), lostS: x.deltaS,
      why: `${vsWhy(x)}${x.key === "run_8" ? " Parcours du run 8 parfois différent." : ""}`,
    }));
  const r1 = judged.find((x) => x.key === "run_1" && x.state === "fast_start");
  if (r1) {
    bad.push({
      key: "run_1", value: `${signed(r1.deltaS)} s`, title: `Run 1 · ${STATE_LABEL.fast_start}`, lostS: Math.abs(r1.deltaS),
      why: `${fmtClock(r1.actualS)} pour un objectif de ${fmtClock(r1.targetS)} : une avance prise au départ se paie souvent plus tard.`,
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
  }

  // ── Phrase de synthèse : l'objectif d'abord ──
  const parts: string[] = [];
  if (vs) {
    const d = vs.total.deltaS;
    parts.push(vs.total.state === "on"
      ? `Dans l'objectif (${fmtClock(vs.total.targetS)}).`
      : `${fmtClock(Math.abs(d))} ${d < 0 ? "sous" : "au-dessus de"} l'objectif (${fmtClock(vs.total.targetS)}).`);
  }
  const chronoD = prev ? race.total_s - prev.total_s : null;
  if (isRecord) parts.push("Ta meilleure course.");
  else if (chronoD != null && Math.abs(chronoD) >= 1) parts.push(`${fmtClock(Math.abs(chronoD))} ${chronoD < 0 ? "de mieux" : "de plus"} qu'à ${shortName(prev!)}.`);
  if (bad[0]) parts.push(`Le plus de temps perdu : ${bad[0].title.toLowerCase()}.`);

  return {
    headline: parts.join(" "),
    good: good.slice(0, MAX_ITEMS),
    bad: bad.slice(0, MAX_ITEMS).map(({ lostS: _lost, ...x }) => x),
    since,
    previous: prev,
  };
}

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

/** Croisière (runs 2 à 7) d'une course, en s/km. */
export const raceCruise = (r: HyroxResult): number | null => cruisePace(runOf(r));
