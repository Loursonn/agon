/**
 * Métriques d'un tour (ou de la séance entière) calculées sur la série
 * seconde par seconde d'une activité. Pur, partagé coach / athlète.
 *
 * Règles (brief P41, décisions 3 et 4) :
 * - **Allure max** = vitesse la plus élevée parmi les mesures seconde par
 *   seconde. Garde-fou « saut GPS » : une vitesse est ignorée si elle dépasse
 *   le plafond du sport (`MAX_SPEED_FOOT` pour la course / marche, sinon
 *   `MAX_SPEED_OTHER`) ou si elle dépasse ses deux voisines de plus de
 *   `SPIKE_MPS` (pic isolé d'une seconde : aucun humain ne gagne puis ne perd
 *   4 m/s en 2 s). Sur la course de test : 6,354 m/s = `enhancedMaxSpeed`.
 * - **D+ / D−** = montées / descentes de l'altitude, après une moyenne
 *   glissante centrée de ±`ELEVATION_SMOOTH_S` s puis un seuil d'hystérésis
 *   de `ELEVATION_HYSTERESIS_M` m (le baromètre oscille par pas de 0,2 m sur
 *   du plat : la somme brute donnait 70 m pour 5 m réels). Réglage calibré le
 *   2026-11-12 sur les tours FIT d'Hugo : écart moyen 0,17 m par tour (séance entière : D+ 4 / D− 3 m contre 5 / 4 pour la montre).
 * - Un tour qui EST un tour de la montre (mêmes bornes à 1 s près, distance
 *   non corrigée) prend les valeurs de la montre ; le temps par zone est
 *   toujours calculé par Agon (zones d'Agon, jamais celles de Garmin).
 * - Tour de station HYROX : pas d'allure (ni distance), le reste oui.
 * - Une mesure absente vaut `null` (affichée « — »), jamais 0.
 */

import type { ActivityStream, WatchLap, WatchLapValues } from "../activityFiles/stream.ts";
import { isStepSport } from "../activityFiles/stream.ts";
import { meanZone, sampleWeights, timeInZones, type TimeInZones } from "./hrZones.ts";

export const ELEVATION_SMOOTH_S = 2;
export const ELEVATION_HYSTERESIS_M = 1;
/** 45 km/h : au-delà, en course ou marche, c'est un saut GPS. */
export const MAX_SPEED_FOOT = 12.5;
/** 144 km/h : plafond pour les autres sports (vélo en descente compris). */
export const MAX_SPEED_OTHER = 40;
export const SPIKE_MPS = 4;
/** Tolérance pour reconnaître un tour de la montre. */
const WATCH_MATCH_S = 1;

export interface LapRange {
  startS: number;
  endS: number;
  /** Distance saisie à la main (m), prioritaire sur le GPS. */
  distanceOverrideM?: number | null;
  /** Station HYROX (wall balls, sled…) : pas d'allure. */
  isStation?: boolean;
}

export interface LapMetrics {
  /** Temps chronométré (pauses exclues), s. */
  durationS: number;
  /** Temps écoulé (pauses comprises), s. */
  elapsedS: number;
  distanceM: number | null;
  /** Vitesse moyenne m/s = distance / temps chronométré. */
  avgSpeed: number | null;
  maxSpeed: number | null;
  /** Allure en s/km (1000 / vitesse). */
  avgPaceSPerKm: number | null;
  maxPaceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** pas/min (course / marche) ou tr/min (vélo), comme la série. */
  avgCadence: number | null;
  maxCadence: number | null;
  ascentM: number | null;
  descentM: number | null;
  avgPower: number | null;
  maxPower: number | null;
  timeInZones: TimeInZones | null;
  meanZone: number | null;
  /** `watch` : valeurs de la montre ; `computed` : calculées par Agon. */
  source: "watch" | "computed";
}

const round = (v: number | null, d = 0): number | null => {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const pace = (speed: number | null): number | null => (speed && speed > 0 ? round(1000 / speed) : null);

/** Moyenne glissante centrée ±w points, `null` conservés (et ignorés). */
export function smoothSeries(values: ReadonlyArray<number | null>, w: number): Array<number | null> {
  if (w <= 0) return [...values];
  const out: Array<number | null> = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) continue;
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(values.length - 1, i + w); j++) {
      const v = values[j];
      if (v !== null) {
        s += v;
        n++;
      }
    }
    out[i] = s / n;
  }
  return out;
}

/**
 * D+ / D− par hystérésis à paliers : une variation compte quand elle s'éloigne
 * de plus de `threshold` du dernier point retenu. Sous-estime d'au plus un
 * seuil à chaque changement de pente, comme la montre ; une variante « point
 * haut → point bas » a été essayée et surestimait nettement sur de vrais
 * fichiers (le bruit crée des extrêmes) : 1,25 m d'écart par tour contre 0,17.
 */
export function elevationGainLoss(
  alt: ReadonlyArray<number | null>,
  threshold = ELEVATION_HYSTERESIS_M,
): { ascentM: number; descentM: number } | null {
  let ref: number | null = null;
  let up = 0;
  let down = 0;
  let seen = 0;
  for (const a of alt) {
    if (a === null) continue;
    seen++;
    if (ref === null) {
      ref = a;
      continue;
    }
    const d = a - ref;
    if (d >= threshold) {
      up += d;
      ref = a;
    } else if (-d >= threshold) {
      down -= d;
      ref = a;
    }
  }
  if (seen < 2) return null;
  return { ascentM: Math.round(up), descentM: Math.round(down) };
}

/** Vitesses plausibles : plafond du sport et pics isolés retirés (→ `null`). */
export function plausibleSpeeds(speed: ReadonlyArray<number | null>, sport: string | null): Array<number | null> {
  const cap = sport && isStepSport(sport) ? MAX_SPEED_FOOT : MAX_SPEED_OTHER;
  return speed.map((v, i) => {
    if (v === null || v > cap) return null;
    const prev = i > 0 ? speed[i - 1] : null;
    const next = i + 1 < speed.length ? speed[i + 1] : null;
    if (prev !== null && next !== null && v - prev > SPIKE_MPS && v - next > SPIKE_MPS) return null;
    return v;
  });
}

/** Index des points dans [startS, endS] (bornes incluses pour les écarts). */
function indexRange(t: readonly number[], startS: number, endS: number): [number, number] | null {
  let a = 0;
  while (a < t.length && t[a] < startS) a++;
  let b = t.length - 1;
  while (b >= 0 && t[b] > endS) b--;
  return a <= b ? [a, b] : null;
}

/** Tour de la montre de mêmes bornes (à 1 s près), sinon `null`. */
export function matchingWatchLap(range: LapRange, watchLaps: readonly WatchLap[]): WatchLapValues | null {
  const w = watchLaps.find(
    (l) => Math.abs(l.startS - range.startS) <= WATCH_MATCH_S && Math.abs(l.endS - range.endS) <= WATCH_MATCH_S,
  );
  return w?.watch ?? null;
}

export interface MetricsContext {
  sport: string | null;
  /** Bornes de zones valides à la date de la séance (`null` = inconnues). */
  bounds: readonly number[] | null;
  watchLaps?: readonly WatchLap[];
  /** Altitude lissée de toute la série (calculée une fois par activité). */
  smoothedAlt?: ReadonlyArray<number | null> | null;
}

/** Altitude lissée, à calculer une fois et passer dans `MetricsContext`. */
export function smoothedAltitude(stream: ActivityStream): Array<number | null> | null {
  return stream.alt ? smoothSeries(stream.alt, ELEVATION_SMOOTH_S) : null;
}

export function lapMetrics(stream: ActivityStream, range: LapRange, ctx: MetricsContext): LapMetrics {
  const elapsedS = Math.max(0, range.endS - range.startS);
  const idx = indexRange(stream.t, range.startS, range.endS);
  const weights = sampleWeights(stream.t, stream.timer);
  const zones = timeInZones(stream, ctx.bounds ?? null, { fromS: range.startS, toS: range.endS });

  // Temps chronométré : somme des poids des points du tour (pauses = 0).
  let durationS = 0;
  let hrSum = 0;
  let hrW = 0;
  let hrMax: number | null = null;
  let cadSum = 0;
  let cadW = 0;
  let cadMax: number | null = null;
  let powSum = 0;
  let powW = 0;
  let powMax: number | null = null;
  let spdMax: number | null = null;

  const speeds = stream.speed ? plausibleSpeeds(stream.speed, ctx.sport) : null;

  if (idx) {
    for (let i = idx[0]; i <= idx[1]; i++) {
      const w = stream.t[i] < range.endS ? weights[i] : 0;
      durationS += w;
      const hr = stream.hr?.[i] ?? null;
      if (hr !== null) {
        hrSum += hr * w;
        hrW += w;
        hrMax = hrMax === null ? hr : Math.max(hrMax, hr);
      }
      const cad = stream.cadence?.[i] ?? null;
      if (cad !== null && cad > 0) {
        cadSum += cad * w;
        cadW += w;
        cadMax = cadMax === null ? cad : Math.max(cadMax, cad);
      }
      const pw = stream.power?.[i] ?? null;
      if (pw !== null) {
        powSum += pw * w;
        powW += w;
        powMax = powMax === null ? pw : Math.max(powMax, pw);
      }
      const sp = speeds?.[i] ?? null;
      if (sp !== null) spdMax = spdMax === null ? sp : Math.max(spdMax, sp);
    }
  }

  let distanceM: number | null = null;
  if (range.distanceOverrideM !== null && range.distanceOverrideM !== undefined) {
    distanceM = range.distanceOverrideM;
  } else if (idx && stream.dist) {
    const first = stream.dist.slice(idx[0], idx[1] + 1).find((v) => v !== null) ?? null;
    let last: number | null = null;
    for (let i = idx[1]; i >= idx[0]; i--) {
      const v = stream.dist[i];
      if (v !== null) {
        last = v;
        break;
      }
    }
    // Distance du tour = distance cumulée au point avant le tour → fin du tour.
    const before = idx[0] > 0 ? stream.dist[idx[0] - 1] : null;
    const from = before ?? first;
    if (from !== null && last !== null && last >= from) distanceM = last - from;
  }

  let elev: { ascentM: number; descentM: number } | null = null;
  const alt = ctx.smoothedAlt ?? smoothedAltitude(stream);
  if (idx && alt) elev = elevationGainLoss(alt.slice(idx[0], idx[1] + 1));

  const computed: LapMetrics = {
    durationS: Math.round(durationS),
    elapsedS,
    distanceM: round(distanceM, 1),
    avgSpeed: distanceM !== null && durationS > 0 ? round(distanceM / durationS, 3) : null,
    maxSpeed: round(spdMax, 3),
    avgPaceSPerKm: null,
    maxPaceSPerKm: null,
    avgHr: hrW > 0 ? Math.round(hrSum / hrW) : null,
    maxHr: hrMax,
    avgCadence: cadW > 0 ? Math.round(cadSum / cadW) : null,
    maxCadence: cadMax,
    ascentM: elev?.ascentM ?? null,
    descentM: elev?.descentM ?? null,
    avgPower: powW > 0 ? Math.round(powSum / powW) : null,
    maxPower: powMax,
    timeInZones: zones,
    meanZone: null,
    source: "computed",
  };

  const watch = range.distanceOverrideM == null && ctx.watchLaps ? matchingWatchLap(range, ctx.watchLaps) : null;
  const m: LapMetrics = watch ? withWatchValues(computed, watch) : computed;

  if (range.isStation) {
    m.distanceM = range.distanceOverrideM ?? null;
    m.avgSpeed = null;
    m.maxSpeed = null;
  }
  m.avgPaceSPerKm = range.isStation ? null : pace(m.avgSpeed);
  m.maxPaceSPerKm = range.isStation ? null : pace(m.maxSpeed);
  m.meanZone = meanZone(m.avgHr, ctx.bounds ?? null);
  return m;
}

/** Valeurs de la montre prioritaires ; Agon complète ce qu'elle ne donne pas. */
function withWatchValues(c: LapMetrics, w: WatchLapValues): LapMetrics {
  const pick = <T>(watchValue: T | null, mine: T | null): T | null => (watchValue ?? mine);
  return {
    ...c,
    durationS: w.timerS !== null ? Math.round(w.timerS) : c.durationS,
    distanceM: pick(round(w.distanceM, 1), c.distanceM),
    avgSpeed: pick(w.avgSpeed, c.avgSpeed),
    maxSpeed: pick(w.maxSpeed, c.maxSpeed),
    avgHr: pick(w.avgHr, c.avgHr),
    maxHr: pick(w.maxHr, c.maxHr),
    avgCadence: pick(w.avgCadence, c.avgCadence),
    maxCadence: pick(w.maxCadence, c.maxCadence),
    ascentM: pick(w.ascentM, c.ascentM),
    descentM: pick(w.descentM, c.descentM),
    avgPower: pick(w.avgPower, c.avgPower),
    maxPower: pick(w.maxPower, c.maxPower),
    source: "watch",
  };
}

/** Séance entière : un seul « tour » du premier au dernier point. */
export function activityMetrics(stream: ActivityStream, ctx: MetricsContext): LapMetrics | null {
  if (stream.t.length < 2) return null;
  return lapMetrics(stream, { startS: stream.t[0], endS: stream.t[stream.t.length - 1] + 1 }, { ...ctx, watchLaps: [] });
}
