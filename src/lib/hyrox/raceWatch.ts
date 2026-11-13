/**
 * Analyse de course HYROX : résultat officiel × série de la montre.
 *
 * Le résultat officiel fait foi pour les temps (un run HYROX fait 1 km : son
 * temps officiel *est* son allure au kilomètre). La montre apporte ce que le
 * chronométrage ne voit pas : fréquence cardiaque et cadence de chaque
 * segment. Règles calculées, sans IA ; l'allure « fraîche » est celle du run 1
 * (maquettes HyroxAnaTel / HyroxAnaCoachOrdi, validées le 13/11/2026).
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
  const rox = (i: number) => detailed ? (r.roxzone_splits as number[])[i] : roxTotal / ROX_TRANSITIONS;

  const segments: RaceSegment[] = [];
  let at = 0;
  let t = 0;
  const push = (key: string, kind: RaceSegmentKind, label: string, dur: number) => {
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
  return { segments, roxzoneEstimated: !detailed && roxTotal > 0 };
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
  /** Allure fraîche : temps du run 1, en s/km. */
  freshPaceSPerKm: number;
  /** Écart de chaque run au run 1 (0,12 = 12 % plus lent). */
  runDrift: Array<{ key: string; pct: number }>;
  raceMaxHr: number | null;
  roxzoneEstimated: boolean;
  flags: RaceFlag[];
}

/** Seuils des règles, réglés pour signaler l'inhabituel, pas chaque seconde perdue. */
export const RACE_RULES = {
  /** Run plus lent que le run 1 de plus de 10 %. */
  paceDrop: 0.10,
  /** Cadence d'un run inférieure de 8 pas/min ou plus à celle du run 1. */
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
  const fresh = runs[0].officialS;
  const runDrift = runs.map((s) => ({ key: s.key, pct: s.officialS / fresh - 1 }));
  const hrs = segments.map((s) => s.maxHr).filter((x): x is number => x != null);
  const raceMaxHr = hrs.length ? Math.max(...hrs) : null;

  const flags: RaceFlag[] = [];
  const before = (key: string) => {
    const i = segments.findIndex((s) => s.key === key);
    for (let j = i - 1; j >= 0; j--) if (segments[j].kind === "station") return segments[j].label;
    return null;
  };
  for (const d of runDrift.slice(1)) {
    if (d.pct > RACE_RULES.paceDrop) {
      const st = before(d.key);
      flags.push({
        kind: "allure_chute",
        segment: d.key,
        text: `Run ${d.key.slice(4)} : ${Math.round(d.pct * 100)} % plus lent que le run 1${st ? ` (après ${st})` : ""}`,
      });
    }
  }
  const cad1 = runs[0].avgCadence;
  if (cad1 != null) {
    for (const s of runs.slice(1)) {
      if (s.avgCadence != null && cad1 - s.avgCadence >= RACE_RULES.cadenceDrop) {
        flags.push({
          kind: "cadence_chute",
          segment: s.key,
          text: `${s.label} : cadence ${s.avgCadence} pas/min, ${cad1 - s.avgCadence} de moins qu'au run 1`,
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

  return { segments, freshPaceSPerKm: fresh, runDrift, raceMaxHr, roxzoneEstimated: tl.roxzoneEstimated, flags };
}

// ─────────────────────── Constats complémentaires ────────────────────────────

/** Valeur moyenne d'une colonne sur [from, to[ (secondes de la série). */
function meanAt(stream: ActivityStream, col: Array<number | null> | null, from: number, to: number): number | null {
  return mean(window(stream, col, from, to).vals);
}

/**
 * Efficacité des runs : mètres parcourus par battement (1 000 m ÷ battements
 * du run). Run 1 → dernier run mesuré ; la baisse dit la dérive cardiaque.
 */
export function runEfficiency(a: RaceWatchAnalysis): { first: number; last: number; pct: number } | null {
  const runs = a.segments.filter((s) => s.kind === "run" && s.avgHr != null);
  if (runs.length < 2 || runs[0].key !== "run_1") return null;
  const mpb = (s: SegmentWatch) => 1000 / ((s.avgHr as number) * (s.officialS / 60));
  const first = mpb(runs[0]);
  const last = mpb(runs[runs.length - 1]);
  return { first, last, pct: last / first - 1 };
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

/** Course compromise : perte moyenne des runs 2 à 8 par rapport au run 1, et la pire. */
export function compromisedRunning(a: RaceWatchAnalysis): { avgSPerKm: number; worst: { key: string; after: string | null; sPerKm: number } } | null {
  const runs = a.segments.filter((s) => s.kind === "run");
  if (runs.length < 2) return null;
  const fresh = runs[0].officialS;
  const rest = runs.slice(1).map((s) => {
    const i = a.segments.indexOf(s);
    let after: string | null = null;
    for (let j = i - 1; j >= 0; j--) if (a.segments[j].kind === "station") { after = a.segments[j].label; break; }
    return { key: s.key, after, sPerKm: Math.round(s.officialS - fresh) };
  });
  const worst = rest.reduce((w, r) => (r.sPerKm > w.sPerKm ? r : w));
  return { avgSPerKm: Math.round(rest.reduce((n, r) => n + r.sPerKm, 0) / rest.length), worst };
}

// ───────────────────────────── Où gagner du temps ────────────────────────────

/** Référence d'un segment : médiane (p50) du niveau, et au-delà si connue. */
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
  for (let i = 1; i <= 8; i++) {
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

/**
 * Trois constats au plus, dans l'ordre : course compromise (dernier run vs
 * run 1), stations au-dessus de SV2, Roxzone vs médiane. Phrases calculées.
 */
export function athleteFindings(input: {
  analysis: RaceWatchAnalysis;
  above: ReturnType<typeof timeAboveHr>;
  gains: ReturnType<typeof raceGains> | null;
  sv2: number | null;
}): Finding[] {
  const out: Finding[] = [];
  const { analysis, above, gains, sv2 } = input;
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const last = runs[runs.length - 1];
  const delta = Math.round(last.officialS - analysis.freshPaceSPerKm);
  if (delta > 0) {
    const i = analysis.segments.indexOf(last);
    const st = analysis.segments.slice(0, i).reverse().find((s) => s.kind === "station");
    out.push({
      value: `+${delta}`,
      unit: "s/km",
      text: `${st ? `Après ${st.label.toLowerCase()}, ton` : "Ton"} dernier km a ralenti de ${delta} s/km par rapport au premier.`,
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
      text: `Roxzone : ${fmtMs(rox.athleteS)}, soit ${Math.round(rox.gainS)} s de plus que la médiane de ton niveau.`,
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
