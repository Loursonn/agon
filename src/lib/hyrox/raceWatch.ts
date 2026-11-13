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
