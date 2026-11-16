/**
 * Analyse de course HYROX : résultat officiel × série de la montre.
 *
 * Le résultat officiel fait foi pour les temps (un run HYROX fait 1 km : son
 * temps officiel *est* son allure au kilomètre). La montre apporte ce que le
 * chronométrage ne voit pas : fréquence cardiaque et cadence de chaque
 * segment. Règles calculées, sans IA. Le run 1 n'est jamais une référence :
 * l'allure de croisière est la médiane des runs 2 à 7 (`runPacing.ts`,
 * décision d'Hugo du 15/11/2026).
 *
 * Pur et testé. Aucune lecture en base ici.
 */
import type { ActivityStream } from "@shared/activityFiles/stream";
import {
  RACE_ORDER,
  STATION_META,
  type HyroxResult,
  type SegmentKey,
  type StationKey,
} from "@/features/shared/types/hyrox";
import {
  cruisePace, cruiseSpread, levelRunPattern, stationRunCosts, CRUISE_RUNS,
  type RunLookup, type StationRunCost,
} from "./runPacing";

export type RaceSegmentKind = "run" | "station" | "roxzone";

export interface RaceSegment {
  /** `run_3`, `sled_pull`, `rox_in_2` (avant la 2ᵉ station), `rox_out_2` (après). */
  key: string;
  kind: RaceSegmentKind;
  label: string;
  /** Début et fin en secondes depuis le départ de la course. */
  startS: number;
  endS: number;
}

export interface RaceTimeline {
  segments: RaceSegment[];
  /** Roxzone répartie à parts égales faute de temps de passage détaillés. */
  roxzoneEstimated: boolean;
  /**
   * Secondes ajoutées (positif) ou retirées (négatif) pour que la course finisse
   * au chrono officiel : les temps intermédiaires sont arrondis à la seconde,
   * leur somme ne tombe pas pile sur le chrono. 0 sans chrono officiel.
   */
  gapS: number;
}

/** Transitions en roxzone : entrée avant chacune des 8 stations, sortie après les 7 premières. */
const ROX_TRANSITIONS = 15;

const segValue = (r: HyroxResult, key: SegmentKey): number | null =>
  (r as unknown as Record<string, number | null>)[`${key}_s`] ?? null;

/**
 * Découpe la course en segments successifs. `null` si un temps de run ou de
 * station manque : sans lui, tout ce qui suit serait décalé.
 */
export function raceTimeline(r: HyroxResult): RaceTimeline | null {
  const splits = RACE_ORDER.map((k) => segValue(r, k));
  if (splits.some((s) => s == null || s <= 0)) return null;

  const detailed = Array.isArray(r.roxzone_splits) && r.roxzone_splits.length >= ROX_TRANSITIONS
    && r.roxzone_splits.slice(0, ROX_TRANSITIONS).every((x) => typeof x === "number" && x >= 0);
  const roxTotal = r.roxzone_total_s ?? 0;
  const roxRaw = (i: number) => detailed ? (r.roxzone_splits as number[])[i] : roxTotal / ROX_TRANSITIONS;

  // La course finit au chrono officiel (Hugo, 15/11/2026 : « les chronos
  // finaux sont plus longs que le chrono réel »). Runs et stations gardent
  // leur temps officiel ; l'écart d'arrondi va dans la roxzone. Si la roxzone
  // ne suffit pas à l'absorber, tout est mis à l'échelle.
  const runStation = (splits as number[]).reduce((a, s) => a + s, 0);
  const roxSum = Array.from({ length: ROX_TRANSITIONS }, (_, i) => roxRaw(i)).reduce((a, s) => a + s, 0);
  const official = r.total_s != null && r.total_s > 0 ? r.total_s : null;
  const gapS = official != null ? official - (runStation + roxSum) : 0;
  let roxFactor = 1;
  let roxEven = 0; // roxzone vide : l'écart positif se répartit à parts égales
  let scale = 1;
  if (gapS !== 0) {
    if (roxSum > 0 && roxSum + gapS >= 0) roxFactor = (roxSum + gapS) / roxSum;
    else if (roxSum === 0 && gapS > 0) roxEven = gapS / ROX_TRANSITIONS;
    else scale = (official as number) / (runStation + roxSum);
  }
  const rox = (i: number) => roxRaw(i) * roxFactor + roxEven;

  const segments: RaceSegment[] = [];
  let at = 0;
  let t = 0;
  const push = (key: string, kind: RaceSegmentKind, label: string, raw: number) => {
    const dur = raw * scale;
    if (dur <= 0) return;
    segments.push({ key, kind, label, startS: at, endS: at + dur });
    at += dur;
  };
  RACE_ORDER.forEach((key, i) => {
    const dur = splits[i] as number;
    if (key.startsWith("run_")) {
      push(key, "run", `Run ${key.slice(4)}`, dur);
      return;
    }
    const n = (i + 1) / 2; // 1…8
    push(`rox_in_${n}`, "roxzone", "Roxzone", rox(t++));
    push(key, "station", STATION_META[key as StationKey].label, dur);
    if (n < 8) push(`rox_out_${n}`, "roxzone", "Roxzone", rox(t++));
  });
  return { segments, roxzoneEstimated: (!detailed && roxTotal > 0) || roxEven > 0, gapS };
}

export interface SegmentWatch extends RaceSegment {
  /** Temps officiel du segment (estimé pour la roxzone sans détail). */
  officialS: number;
  avgHr: number | null;
  maxHr: number | null;
  /** Pas par minute (course). */
  avgCadence: number | null;
  /** Part des secondes du segment couvertes par la montre (0-1). */
  coverage: number;
}

export type RaceFlagKind = "allure_chute" | "cadence_chute" | "fc_station_haute" | "montre_incomplete";

export interface RaceFlag {
  kind: RaceFlagKind;
  segment: string;
  text: string;
}

export interface RaceWatchAnalysis {
  segments: SegmentWatch[];
  /** Allure de croisière : médiane des runs 2 à 7, en s/km. */
  cruisePaceSPerKm: number;
  /** Écart de chaque run à la croisière (0,12 = 12 % plus lent). Run 1 : affiché, jamais signalé. */
  runDrift: Array<{ key: string; pct: number }>;
  raceMaxHr: number | null;
  roxzoneEstimated: boolean;
  flags: RaceFlag[];
}

/** Seuils des règles, réglés pour signaler l'inhabituel, pas chaque seconde perdue. */
export const RACE_RULES = {
  /** Run (2 à 8) plus lent que la croisière de plus de 10 %. */
  paceDrop: 0.10,
  /** Cadence d'un run (2 à 8) inférieure de 8 pas/min ou plus à la cadence de croisière. */
  cadenceDrop: 8,
  /** Station dont la FC moyenne atteint 95 % de la FC max de la course. */
  stationHr: 0.95,
  /** Segment couvert à moins de 80 % par la montre. */
  coverage: 0.8,
} as const;

function window(stream: ActivityStream, col: Array<number | null> | null, from: number, to: number) {
  const vals: number[] = [];
  let covered = 0;
  for (let i = 0; i < stream.t.length; i++) {
    const t = stream.t[i];
    if (t < from) continue;
    if (t >= to) break;
    covered++;
    const v = col?.[i];
    if (v != null && Number.isFinite(v) && v > 0) vals.push(v);
  }
  return { vals, covered };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round = (x: number | null) => (x == null ? null : Math.round(x));

/**
 * Croise le résultat et la série. `offsetS` : seconde de la série où la course
 * commence (échauffement enregistré avant le départ, par exemple).
 */
export function crossRaceWithWatch(
  r: HyroxResult,
  stream: ActivityStream | null,
  offsetS = 0,
): RaceWatchAnalysis | null {
  const tl = raceTimeline(r);
  if (!tl) return null;

  const segments: SegmentWatch[] = tl.segments.map((s) => {
    const officialS = s.endS - s.startS;
    if (!stream || stream.t.length === 0) {
      return { ...s, officialS, avgHr: null, maxHr: null, avgCadence: null, coverage: 0 };
    }
    const from = offsetS + s.startS;
    const to = offsetS + s.endS;
    const hr = window(stream, stream.hr, from, to);
    const cad = window(stream, stream.cadence, from, to);
    return {
      ...s,
      officialS,
      avgHr: round(mean(hr.vals)),
      maxHr: hr.vals.length ? Math.max(...hr.vals) : null,
      avgCadence: s.kind === "run" ? round(mean(cad.vals)) : null,
      // Échantillons à la seconde : un par seconde de segment au mieux.
      coverage: Math.min(1, hr.vals.length / Math.max(1, Math.round(officialS))),
    };
  });

  const runs = segments.filter((s) => s.kind === "run");
  const cruise = cruisePace(runLookup(segments)) ?? medianOf(runs.map((s) => s.officialS)) ?? runs[0].officialS;
  const runDrift = runs.map((s) => ({ key: s.key, pct: s.officialS / cruise - 1 }));
  const hrs = segments.map((s) => s.maxHr).filter((x): x is number => x != null);
  const raceMaxHr = hrs.length ? Math.max(...hrs) : null;

  const flags: RaceFlag[] = [];
  const before = (key: string) => {
    const i = segments.findIndex((s) => s.key === key);
    for (let j = i - 1; j >= 0; j--) if (segments[j].kind === "station") return segments[j].label;
    return null;
  };
  for (const d of runDrift) {
    if (d.key === "run_1") continue;
    if (d.pct > RACE_RULES.paceDrop) {
      const st = before(d.key);
      flags.push({
        kind: "allure_chute",
        segment: d.key,
        text: `Run ${d.key.slice(4)} : ${Math.round(d.pct * 100)} % plus lent que ta croisière${st ? ` (après ${st})` : ""}`,
      });
    }
  }
  const cadCruise = cruiseCadence(segments);
  if (cadCruise != null) {
    for (const s of runs) {
      if (s.key === "run_1") continue;
      if (s.avgCadence != null && cadCruise - s.avgCadence >= RACE_RULES.cadenceDrop) {
        flags.push({
          kind: "cadence_chute",
          segment: s.key,
          text: `${s.label} : cadence ${s.avgCadence} pas/min, ${cadCruise - s.avgCadence} de moins qu'en croisière`,
        });
      }
    }
  }
  if (raceMaxHr != null) {
    for (const s of segments) {
      if (s.kind === "station" && s.avgHr != null && s.avgHr >= RACE_RULES.stationHr * raceMaxHr) {
        flags.push({
          kind: "fc_station_haute",
          segment: s.key,
          text: `${s.label} : FC moyenne ${s.avgHr} bpm, ${Math.round((s.avgHr / raceMaxHr) * 100)} % de la FC max de la course`,
        });
      }
    }
  }
  if (stream && stream.t.length > 0) {
    const holes = segments.filter((s) => s.kind !== "roxzone" && s.coverage < RACE_RULES.coverage);
    if (holes.length > 0) {
      flags.push({
        kind: "montre_incomplete",
        segment: holes[0].key,
        text: `Montre incomplète sur ${holes.length} segment(s) : FC et cadence partielles (${holes.map((h) => h.label).join(", ")})`,
      });
    }
  }

  return { segments, cruisePaceSPerKm: cruise, runDrift, raceMaxHr, roxzoneEstimated: tl.roxzoneEstimated, flags };
}

function medianOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Temps officiel de chaque run, pour les règles de `runPacing`. */
export function runLookup(segments: SegmentWatch[]): RunLookup {
  return (key) => segments.find((s) => s.key === key)?.officialS ?? null;
}

/** Cadence de croisière : médiane des cadences des runs 2 à 7 (au moins 3 mesurées). */
function cruiseCadence(segments: SegmentWatch[]): number | null {
  const v = CRUISE_RUNS.map((k) => segments.find((s) => s.key === k)?.avgCadence ?? null).filter((x): x is number => x != null);
  return v.length >= 3 ? Math.round(medianOf(v) as number) : null;
}


// ─────────────────────── Constats complémentaires ────────────────────────────

/** Valeur moyenne d'une colonne sur [from, to[ (secondes de la série). */
function meanAt(stream: ActivityStream, col: Array<number | null> | null, from: number, to: number): number | null {
  return mean(window(stream, col, from, to).vals);
}

/**
 * Efficacité des runs : mètres parcourus par battement (1 000 m ÷ battements
 * du run). Premier → dernier run mesuré parmi les runs 2 à 7 (le 1 et le 8 ne
 * se comparent pas) ; la baisse dit la dérive cardiaque.
 */
export function runEfficiency(a: RaceWatchAnalysis): { first: number; last: number; pct: number; firstKey: string; lastKey: string } | null {
  const keep = new Set<string>(CRUISE_RUNS);
  const runs = a.segments.filter((s) => s.kind === "run" && keep.has(s.key) && s.avgHr != null);
  if (runs.length < 2) return null;
  const mpb = (s: SegmentWatch) => 1000 / ((s.avgHr as number) * (s.officialS / 60));
  const first = mpb(runs[0]);
  const last = mpb(runs[runs.length - 1]);
  return { first, last, pct: last / first - 1, firstKey: runs[0].key, lastKey: runs[runs.length - 1].key };
}

/** Part du temps (course entière, et stations seules) au-dessus d'un seuil de FC (SV2). */
export function timeAboveHr(
  a: RaceWatchAnalysis,
  stream: ActivityStream | null,
  thresholdBpm: number | null,
  offsetS = 0,
): { totalS: number; share: number; stationShare: number } | null {
  if (!stream || thresholdBpm == null || !stream.hr) return null;
  let above = 0;
  let measured = 0;
  let stAbove = 0;
  let stMeasured = 0;
  for (const s of a.segments) {
    const w = window(stream, stream.hr, offsetS + s.startS, offsetS + s.endS);
    const up = w.vals.filter((v) => v > thresholdBpm).length;
    above += up;
    measured += w.vals.length;
    if (s.kind === "station") {
      stAbove += up;
      stMeasured += w.vals.length;
    }
  }
  if (measured === 0) return null;
  return { totalS: above, share: above / measured, stationShare: stMeasured ? stAbove / stMeasured : 0 };
}

/**
 * Récupération en roxzone : baisse de FC dans les 60 s qui suivent la fin de
 * chaque station (moyenne des 5 dernières secondes de station → moyenne de
 * 55 à 60 s après). Rend la moins bonne.
 */
export function roxzoneRecovery(
  a: RaceWatchAnalysis,
  stream: ActivityStream | null,
  offsetS = 0,
): { avgDrop: number; worst: { station: string; drop: number } } | null {
  if (!stream || !stream.hr) return null;
  const drops: Array<{ station: string; drop: number }> = [];
  for (const s of a.segments) {
    if (s.kind !== "station") continue;
    const end = offsetS + s.endS;
    const at = meanAt(stream, stream.hr, end - 5, end);
    const after = meanAt(stream, stream.hr, end + 55, end + 60);
    if (at != null && after != null) drops.push({ station: s.label, drop: Math.round(at - after) });
  }
  if (drops.length === 0) return null;
  const worst = drops.reduce((w, d) => (d.drop < w.drop ? d : w));
  return { avgDrop: Math.round(drops.reduce((n, d) => n + d.drop, 0) / drops.length), worst };
}

export interface CompromisedRunning {
  cruiseS: number;
  /** Écart entre le plus rapide et le plus lent des runs 2 à 7 (s/km). */
  spreadS: number;
  /** Même écart chez les athlètes du niveau, `null` sans références. */
  usualSpreadS: number | null;
  /** Run qui coûte le plus : surcoût vs l'habituel si connu, sinon vs la croisière. */
  worst: { key: string; after: string | null; sPerKm: number; usualS: number | null; excessS: number | null } | null;
}

/**
 * Course compromise : les runs 2 à 7 sont censés se ressembler. Leur écart
 * (le plus lent − le plus rapide) mesure ce que les stations coûtent à la
 * course ; on le compare au même écart chez les athlètes du niveau.
 */
export function compromisedRunning(a: RaceWatchAnalysis, levelP50: RunLookup | null = null): CompromisedRunning | null {
  const run = runLookup(a.segments);
  const spread = cruiseSpread(run, levelP50);
  if (!spread) return null;
  const costs = stationRunCosts(run, levelP50 ? levelRunPattern(levelP50) : null);
  const rank = (c: StationRunCost) => c.excessS ?? c.costS;
  const top = costs.length ? costs.reduce((w, c) => (rank(c) > rank(w) ? c : w)) : null;
  return {
    cruiseS: a.cruisePaceSPerKm,
    spreadS: spread.spreadS,
    usualSpreadS: spread.usualSpreadS,
    worst: top && top.costS > 0
      ? { key: top.run, after: STATION_META[top.station].label, sPerKm: top.costS, usualS: top.usualS, excessS: top.excessS }
      : null,
  };
}

// ───────────────────────────── Où gagner du temps ────────────────────────────

/** Référence d'un segment : cible de l'objectif de la course (autrefois médiane du niveau). */
export type MedianLookup = (segment: string) => number | null;

export interface GainItem {
  key: string;
  label: string;
  athleteS: number;
  medianS: number;
  gainS: number;
}

/** Écart au-dessous duquel un point n'est pas cité (bruit de chronométrage). */
export const GAIN_THRESHOLD_S = 10;

/**
 * Cascade « du chrono actuel au chrono possible » : chaque point où
 * l'athlète est derrière la médiane de son niveau, du plus gros au plus petit.
 * Les runs sont regroupés (« Runs 6 à 8 ») : un run isolé est rarement un
 * levier à lui seul.
 */
export function raceGains(r: HyroxResult, median: MedianLookup): { currentS: number; possibleS: number; items: GainItem[] } {
  const items: GainItem[] = [];
  const rox = r.roxzone_total_s;
  const roxMed = median("roxzone_total");
  if (rox != null && roxMed != null && rox - roxMed >= GAIN_THRESHOLD_S) {
    items.push({ key: "roxzone", label: "Roxzone", athleteS: rox, medianS: roxMed, gainS: rox - roxMed });
  }
  for (const k of Object.keys(STATION_META) as StationKey[]) {
    const v = segValue(r, k);
    const m = median(k);
    if (v != null && m != null && v - m >= GAIN_THRESHOLD_S) {
      items.push({ key: k, label: STATION_META[k].label, athleteS: v, medianS: m, gainS: v - m });
    }
  }
  const slowRuns: number[] = [];
  let runGain = 0;
  let runAth = 0;
  let runMed = 0;
  // Run 1 exclu : sa longueur et le départ changent d'une course à l'autre.
  for (let i = 2; i <= 8; i++) {
    const v = segValue(r, `run_${i}` as SegmentKey);
    const m = median(`run_${i}`);
    if (v != null && m != null && v > m) {
      slowRuns.push(i);
      runGain += v - m;
      runAth += v;
      runMed += m;
    }
  }
  if (runGain >= GAIN_THRESHOLD_S) {
    const label = slowRuns.length === 1
      ? `Run ${slowRuns[0]}`
      : slowRuns.every((n, i) => i === 0 || n === slowRuns[i - 1] + 1)
        ? `Runs ${slowRuns[0]} à ${slowRuns[slowRuns.length - 1]}`
        : `Runs ${slowRuns.join(", ")}`;
    items.push({ key: "runs", label, athleteS: runAth, medianS: runMed, gainS: runGain });
  }
  items.sort((a, b) => b.gainS - a.gainS);
  const total = items.reduce((n, x) => n + x.gainS, 0);
  return { currentS: r.total_s, possibleS: r.total_s - total, items };
}

// ─────────────────────────── Constats de l'athlète ───────────────────────────

export interface Finding {
  /** Chiffre mis en avant (« +31 », « 82 »), et son unité. */
  value: string;
  unit: string;
  text: string;
}

const fmtMs = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m} min ${String(r).padStart(2, "0")} s`;
};

/** Surcoût (vs l'habituel du niveau) à partir duquel le run après une station devient un constat. */
export const RUN_COST_FINDING_S = 10;
/** Sans références : coût brut vs la croisière. */
export const RUN_COST_FINDING_NO_REF_S = 15;
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0");

/**
 * Trois constats au plus, dans l'ordre : la station qui coûte le plus au run
 * suivant (vs la croisière et l'habituel du niveau), stations au-dessus de
 * SV2, Roxzone vs médiane. Phrases calculées.
 */
export function athleteFindings(input: {
  analysis: RaceWatchAnalysis;
  above: ReturnType<typeof timeAboveHr>;
  gains: ReturnType<typeof raceGains> | null;
  sv2: number | null;
  /** Médianes des runs au niveau de l'athlète : « habituel ». */
  levelP50?: RunLookup | null;
}): Finding[] {
  const out: Finding[] = [];
  const { analysis, above, gains, sv2 } = input;
  const level = input.levelP50 ? levelRunPattern(input.levelP50) : null;
  const costs = stationRunCosts(runLookup(analysis.segments), level);
  const worst = costs.length ? costs.reduce((w, c) => ((c.excessS ?? c.costS) > (w.excessS ?? w.costS) ? c : w)) : null;
  const notable = worst && (worst.excessS != null ? worst.excessS >= RUN_COST_FINDING_S : worst.costS >= RUN_COST_FINDING_NO_REF_S);
  if (worst && notable) {
    const name = STATION_META[worst.station].label.toLowerCase();
    out.push({
      value: `+${worst.costS}`,
      unit: "s/km",
      text: worst.usualS != null
        ? `Après ${name}, ton run a ralenti de ${worst.costS} s/km par rapport à ta croisière (runs 2 à 7), contre ${signed(worst.usualS)} d'habitude à ton niveau.`
        : `Après ${name}, ton run a ralenti de ${worst.costS} s/km par rapport à ta croisière (runs 2 à 7).`,
    });
  }
  if (above && sv2 != null && above.stationShare > 0) {
    out.push({
      value: String(Math.round(above.stationShare * 100)),
      unit: "%",
      text: `Part des stations passée au-dessus de ${sv2} bpm (SV2).`,
    });
  }
  const rox = gains?.items.find((x) => x.key === "roxzone");
  if (rox) {
    out.push({
      value: `+${Math.round(rox.gainS)}`,
      unit: "s",
      text: `Roxzone : ${fmtMs(rox.athleteS)}, soit ${Math.round(rox.gainS)} s de plus que l'objectif.`,
    });
  }
  return out.slice(0, 3);
}

/**
 * Activité de montre la plus probable pour une course : le même jour, durée
 * la plus proche du chrono (au moins 80 % du chrono : sinon ce n'est pas la course).
 */
export function pickRaceActivity<T extends { durationS: number | null }>(candidates: readonly T[], totalS: number): T | null {
  let best: T | null = null;
  let gap = Infinity;
  for (const c of candidates) {
    if (c.durationS == null || c.durationS < totalS * 0.8) continue;
    const g = Math.abs(c.durationS - totalS);
    if (g < gap) { gap = g; best = c; }
  }
  return best;
}

/**
 * Départ de la course dans la série : l'échauffement enregistré avant décale
 * tout. Par défaut, la course est supposée finir avec l'enregistrement si
 * l'activité est plus longue que le chrono de plus de 2 min, sinon partir à 0.
 */
export function defaultRaceOffset(stream: ActivityStream | null, totalS: number): number {
  if (!stream || stream.t.length === 0) return 0;
  const end = stream.t[stream.t.length - 1];
  return end - totalS > 120 ? Math.max(0, Math.round(end - totalS)) : 0;
}

// ───────────────────── Compléments de l'analyse (13/11) ─────────────────────

/** Station juste avant un segment (libellé), ou `null` pour le run 1. */
function stationBefore(a: RaceWatchAnalysis, s: SegmentWatch): string | null {
  const i = a.segments.indexOf(s);
  for (let j = i - 1; j >= 0; j--) if (a.segments[j].kind === "station") return a.segments[j].label;
  return null;
}

/**
 * Chute de cadence : runs 2 à 8 comparés à la cadence de croisière (médiane
 * des runs 2 à 7, pas/min). Rend les deux plus fortes baisses, ou `null`.
 */
export function cadenceDrop(a: RaceWatchAnalysis): {
  cruiseCadence: number;
  worst: { key: string; after: string | null; drop: number };
  next: { key: string; after: string | null; drop: number } | null;
} | null {
  const runs = a.segments.filter((s) => s.kind === "run" && s.key !== "run_1");
  const fresh = cruiseCadence(a.segments);
  if (fresh == null) return null;
  const drops = runs
    .filter((s) => s.avgCadence != null)
    .map((s) => ({ key: s.key, after: stationBefore(a, s), drop: fresh - (s.avgCadence as number) }))
    .filter((d) => d.drop > 0)
    .sort((x, y) => y.drop - x.drop);
  if (drops.length === 0) return null;
  return { cruiseCadence: fresh, worst: drops[0], next: drops[1] ?? null };
}

/**
 * Part des secondes mesurées au-dessus d'un seuil de FC sur les segments
 * retenus (`% Z3` du tableau). `null` sans série, sans seuil ou sans mesure.
 */
export function shareAboveHr(
  a: RaceWatchAnalysis,
  stream: ActivityStream | null,
  thresholdBpm: number | null,
  offsetS: number,
  keep: (s: SegmentWatch) => boolean,
): number | null {
  if (!stream || !stream.hr || thresholdBpm == null) return null;
  let above = 0;
  let measured = 0;
  for (const s of a.segments) {
    if (!keep(s)) continue;
    const w = window(stream, stream.hr, offsetS + s.startS, offsetS + s.endS);
    above += w.vals.filter((v) => v > thresholdBpm).length;
    measured += w.vals.length;
  }
  return measured ? above / measured : null;
}

/**
 * Coût de chaque station sur le run qui la suit : run suivant − croisière
 * (s/km), et l'habituel du niveau si ses médianes sont fournies.
 */
export function runCostAfter(a: RaceWatchAnalysis, levelP50: RunLookup | null = null): Partial<Record<StationKey, StationRunCost>> {
  const out: Partial<Record<StationKey, StationRunCost>> = {};
  for (const c of stationRunCosts(runLookup(a.segments), levelP50 ? levelRunPattern(levelP50) : null)) out[c.station] = c;
  return out;
}

/** Course compromise à partir des seuls temps (sans montre) : sert à comparer les courses. */
export function compromisedFromTimes(r: HyroxResult, levelP50: RunLookup | null = null): CompromisedRunning | null {
  const a = crossRaceWithWatch(r, null);
  return a ? compromisedRunning(a, levelP50) : null;
}

/**
 * Stations au niveau de la médiane ou devant : médiane connue et absentes de
 * la cascade des gains. Dans l'ordre de la course.
 */
export function stationsAtLevel(r: HyroxResult, median: MedianLookup, gains: { items: GainItem[] }): string[] {
  const behind = new Set(gains.items.map((g) => g.key));
  return (Object.keys(STATION_META) as StationKey[])
    .filter((k) => !behind.has(k) && segValue(r, k) != null && median(k) != null)
    .map((k) => STATION_META[k].label);
}
