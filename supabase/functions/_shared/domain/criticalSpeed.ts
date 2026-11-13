/**
 * Vitesse critique (VC) en course — UN calcul pour toute l'app.
 *
 * Modèle distance-temps (Monod-Scherrer, Jones ; méthode de Rémi Rivet) :
 *   distance (m) = VC (m/s) × durée (s) + D′ (m)
 * VC = pente de la régression linéaire de la distance sur la durée d'au moins
 * deux efforts maximaux de durées différentes (2 à 15 min). D′ = ordonnée à
 * l'origine (réserve anaérobie, en mètres).
 *
 * Utilisée par :
 * - l'analyse des tests HYROX (efforts 1200 m / 6 min / 12 min,
 *   `src/lib/hyrox/tests/running.ts`) ;
 * - la VC proposée depuis les courses : meilleurs efforts de 3, 6 et 12 min
 *   pris dans les sorties des 90 derniers jours ;
 * - la charge YOXX (P28) : Zone 2 jusqu'à la VC, Zone 3 au-delà.
 *
 * Choix de la VC de l'athlète (décision d'Hugo, 2026-11-13) : la plus récente
 * entre un test (analyse HYROX) et la VC saisie au profil sportif. La VC des
 * courses n'est qu'une **proposition** au coach, jamais appliquée seule.
 *
 * Pur, sans dépendance : importé par le front (`@shared/domain/criticalSpeed`)
 * et par les Edge Functions. Une mesure absente vaut `null` (« — »).
 */

import type { IsoDay } from "./dates.ts";

export interface DistanceTimePoint {
  /** Durée de l'effort (s). */
  t: number;
  /** Distance couverte (m). */
  d: number;
}

export interface CriticalSpeedFit {
  /** VC en km/h. */
  csKmh: number;
  /** D′ en mètres (peut être négatif si les efforts sont mal choisis). */
  dprimeM: number;
  /** Qualité de l'ajustement (0-1). */
  r2: number;
  /** Nombre d'efforts utilisés. */
  n: number;
}

/** Régression linéaire y = a + b·x. `null` si moins de 2 points ou x constants. */
export function linreg(points: ReadonlyArray<readonly [number, number]>): { a: number; b: number; r2: number; n: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, n };
}

/**
 * VC et D′ depuis des efforts maximaux. `null` s'il y a moins de deux
 * durées différentes ou si la pente n'est pas positive.
 */
export function fitCriticalSpeed(points: ReadonlyArray<DistanceTimePoint>): CriticalSpeedFit | null {
  const ok = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d) && p.t > 0 && p.d > 0);
  const fit = linreg(ok.map((p) => [p.t, p.d] as const));
  if (!fit || !(fit.b > 0)) return null;
  return { csKmh: fit.b * 3.6, dprimeM: fit.a, r2: fit.r2, n: fit.n };
}

// ── VC depuis les courses ────────────────────────────────────────────────────

/** Durées des meilleurs efforts cherchés dans les sorties (3, 6 et 12 min). */
export const RUN_EFFORT_DURATIONS_S = [180, 360, 720] as const;
/** Fenêtre des sorties prises en compte. */
export const RUN_WINDOW_DAYS = 90;
/** Au-delà de cet écart (s) entre deux points, la fenêtre est cassée (pause, trou GPS). */
const MAX_GAP_S = 10;
/** Vitesse plausible maximale en course (m/s, ≈ 36 km/h) : au-delà, saut GPS. */
const MAX_RUN_MPS = 10;

export interface RunStream {
  /** Secondes depuis le départ. */
  t: readonly number[];
  /** Mètres cumulés depuis le départ. */
  dist: ReadonlyArray<number | null>;
}

/**
 * Distance maximale couverte (m) en `durationS` secondes d'affilée dans une
 * sortie, sans pause ni trou de plus de 10 s. `null` si la sortie est trop
 * courte ou sans distance.
 */
export function bestDistanceOver(stream: RunStream, durationS: number): number | null {
  const { t, dist } = stream;
  let best: number | null = null;
  let start = 0;
  for (let end = 0; end < t.length; end++) {
    if (dist[end] == null) { start = end + 1; continue; }
    if (end > 0) {
      const dt = t[end] - t[end - 1];
      const prev = dist[end - 1];
      // Trou d'enregistrement ou saut GPS : la fenêtre repart de ce point.
      if (dt > MAX_GAP_S || (prev != null && dt > 0 && ((dist[end] as number) - prev) / dt > MAX_RUN_MPS)) start = end;
    }
    while (start < end && (dist[start] == null || t[end] - t[start] > durationS)) start++;
    // La fenêtre doit couvrir la durée à 1 s près (sinon, effort plus court).
    if (start >= end || t[end] - t[start] < durationS - 1) continue;
    const d = (dist[end] as number) - (dist[start] as number);
    if (d <= 0 || d / (t[end] - t[start]) > MAX_RUN_MPS) continue;
    if (best === null || d > best) best = d;
  }
  return best;
}

/** Meilleur effort de chaque durée sur plusieurs sorties (efforts absents ignorés). */
export function bestRunEfforts(
  streams: ReadonlyArray<RunStream>,
  durations: readonly number[] = RUN_EFFORT_DURATIONS_S,
): DistanceTimePoint[] {
  const out: DistanceTimePoint[] = [];
  for (const dur of durations) {
    let best: number | null = null;
    for (const s of streams) {
      const d = bestDistanceOver(s, dur);
      if (d !== null && (best === null || d > best)) best = d;
    }
    if (best !== null) out.push({ t: dur, d: best });
  }
  return out;
}

/** VC depuis les courses : au moins 2 durées et un ajustement correct (R² ≥ 0,95). */
export const RUN_FIT_MIN_R2 = 0.95;
export function criticalSpeedFromRuns(streams: ReadonlyArray<RunStream>): CriticalSpeedFit | null {
  const fit = fitCriticalSpeed(bestRunEfforts(streams));
  return fit && fit.r2 >= RUN_FIT_MIN_R2 ? fit : null;
}

// ── Choix de la VC de l'athlète ──────────────────────────────────────────────

export type CriticalSpeedSource = "test" | "reference" | "runs";

export interface CriticalSpeedCandidate {
  source: CriticalSpeedSource;
  day: IsoDay;
  csKmh: number;
  /** Vitesse au seuil 1 (km/h) quand la source la donne (test HYROX). */
  s1Kmh?: number | null;
}

export interface ChosenCriticalSpeed {
  /** VC utilisée : test ou saisie, la plus récente. */
  current: CriticalSpeedCandidate | null;
  /** VC des courses proposée au coach (plus récente que `current` et différente). */
  proposal: CriticalSpeedCandidate | null;
}

/** Écart minimal (km/h) pour proposer la VC des courses. */
export const PROPOSAL_MIN_DIFF_KMH = 0.3;

export function chooseCriticalSpeed(candidates: ReadonlyArray<CriticalSpeedCandidate>): ChosenCriticalSpeed {
  let current: CriticalSpeedCandidate | null = null;
  let runs: CriticalSpeedCandidate | null = null;
  for (const c of candidates) {
    if (!Number.isFinite(c.csKmh) || c.csKmh <= 0) continue;
    if (c.source === "runs") {
      if (!runs || c.day > runs.day) runs = c;
      continue;
    }
    // Même jour : la saisie du coach l'emporte sur le test.
    if (!current || c.day > current.day || (c.day === current.day && c.source === "reference")) current = c;
  }
  const proposal =
    runs && (!current || (runs.day > current.day && Math.abs(runs.csKmh - current.csKmh) >= PROPOSAL_MIN_DIFF_KMH))
      ? runs
      : null;
  return { current, proposal };
}

/**
 * Part de la VC au seuil 1 quand le test ne la donne pas (VC saisie à la
 * main) : valeur médiane de la méthode Rivet (0,82 / 0,84 / 0,85 selon le
 * facteur d'endurance, `GridSet.running.s1_factor`).
 */
export const DEFAULT_S1_FACTOR = 0.84;

/** Vitesse au seuil 1 (km/h) : celle du test, sinon VC × 0,84. */
export function s1SpeedKmh(c: CriticalSpeedCandidate | null): number | null {
  if (!c) return null;
  if (c.s1Kmh != null && Number.isFinite(c.s1Kmh) && c.s1Kmh > 0) return c.s1Kmh;
  return c.csKmh * DEFAULT_S1_FACTOR;
}
