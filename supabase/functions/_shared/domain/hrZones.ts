/**
 * Zones de fréquence cardiaque d'Agon : un calcul, pour N zones.
 *
 * Un modèle est une liste de **bornes basses** des zones 2 à N, en bpm,
 * croissantes : `[152, 172]` = 3 zones, Zone 1 < 152 ≤ Zone 2 < 172 ≤ Zone 3
 * (décision d'Hugo : « Zone 1 < SV1 ≤ Zone 2 < SV2 ≤ Zone 3 »).
 *
 * Modèles :
 * - `three` : [SV1, SV2] saisis dans Agon (jamais les zones Garmin) ;
 * - `five` : lu dans `performance_logs` (`FCzone_Z1_max` … `FCzone_Z4_max`,
 *   bornes HAUTES incluses) → bornes basses = max + 1 ;
 * - `custom` : N − 1 bornes saisies par le coach.
 *
 * Même règle en SQL (`activity_zone_seconds`, `width_bucket`) pour le résumé
 * stocké du planning ; un test vérifie l'égalité. Bornes absentes → `null`
 * (affiché « — »), jamais une zone inventée.
 */

export type ZoneModelKind = "five" | "three" | "custom";

export interface ZoneModel {
  kind: ZoneModelKind;
  /** Bornes basses des zones 2..N, bpm, strictement croissantes. */
  bounds: number[];
}

/** Au-delà de cet écart entre deux points, on ne compte que 10 s (trou d'enregistrement). */
export const MAX_SAMPLE_GAP_S = 10;

/** Bornes valides : au moins une, entières, strictement croissantes, plausibles. */
export function validBounds(bounds: ReadonlyArray<number | null | undefined> | null | undefined): number[] | null {
  if (!bounds || bounds.length === 0 || bounds.length > 9) return null;
  const out: number[] = [];
  for (const b of bounds) {
    if (typeof b !== "number" || !Number.isFinite(b) || b < 30 || b > 250) return null;
    const v = Math.round(b);
    if (out.length > 0 && v <= out[out.length - 1]) return null;
    out.push(v);
  }
  return out;
}

/** Modèle à 5 zones depuis les références `FCzone_*` (bornes hautes incluses). */
export function fiveZoneBounds(refs: Readonly<Record<string, number | null | undefined>>): number[] | null {
  const maxes = ["FCzone_Z1_max", "FCzone_Z2_max", "FCzone_Z3_max", "FCzone_Z4_max"].map((k) => refs[k]);
  if (maxes.some((v) => typeof v !== "number")) return null;
  return validBounds((maxes as number[]).map((v) => v + 1));
}

/** Zone (1..N) d'une fréquence cardiaque, ou `null` si FC ou bornes absentes. */
export function zoneOf(hr: number | null | undefined, bounds: readonly number[] | null): number | null {
  if (hr === null || hr === undefined || !Number.isFinite(hr) || !bounds || bounds.length === 0) return null;
  let z = 1;
  for (const b of bounds) {
    if (hr >= b) z++;
    else break;
  }
  return z;
}

/** Zone de chaque point (couleur de la courbe). */
export function zoneSeries(
  hr: ReadonlyArray<number | null> | null,
  bounds: readonly number[] | null,
): Array<number | null> | null {
  if (!hr) return null;
  return hr.map((v) => zoneOf(v, bounds));
}

/**
 * Durée représentée par chaque point : écart au point suivant, plafonné à
 * `MAX_SAMPLE_GAP_S`, nul si le chronomètre est arrêté (pause). Le dernier
 * point vaut 0. Même règle que la fonction SQL.
 */
export function sampleWeights(t: readonly number[], timer: ReadonlyArray<number | null> | null): number[] {
  const w = new Array<number>(t.length).fill(0);
  for (let i = 0; i + 1 < t.length; i++) {
    let dt = Math.min(t[i + 1] - t[i], MAX_SAMPLE_GAP_S);
    if (timer && timer[i] !== null && timer[i + 1] !== null && timer[i + 1] === timer[i]) dt = 0;
    w[i] = Math.max(0, dt);
  }
  return w;
}

export interface TimeInZones {
  /** Secondes par zone (index 0 = zone 1). */
  seconds: number[];
  /** Secondes sans FC. */
  noHrS: number;
}

/**
 * Temps par zone sur [fromS, toS[ (toute la série par défaut). `null` si les
 * bornes ou la FC manquent : on n'affiche pas une barre de zones vide.
 */
export function timeInZones(
  stream: { t: readonly number[]; timer: ReadonlyArray<number | null> | null; hr: ReadonlyArray<number | null> | null },
  bounds: readonly number[] | null,
  range?: { fromS: number; toS: number },
): TimeInZones | null {
  if (!bounds || bounds.length === 0 || !stream.hr) return null;
  const w = sampleWeights(stream.t, stream.timer);
  const seconds = new Array<number>(bounds.length + 1).fill(0);
  let noHrS = 0;
  for (let i = 0; i < stream.t.length; i++) {
    const t = stream.t[i];
    if (range && (t < range.fromS || t >= range.toS)) continue;
    const z = zoneOf(stream.hr[i], bounds);
    if (z === null) noHrS += w[i];
    else seconds[z - 1] += w[i];
  }
  if (seconds.every((s) => s === 0)) return null;
  return { seconds, noHrS };
}

/** Zone moyenne d'un tour = zone de sa FC moyenne. */
export function meanZone(avgHr: number | null | undefined, bounds: readonly number[] | null): number | null {
  return zoneOf(avgHr, bounds);
}

/** Part de chaque zone (0-100, une décimale), pour la barre. */
export function zoneShares(t: TimeInZones | null): number[] | null {
  if (!t) return null;
  const total = t.seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return t.seconds.map((s) => Math.round((s / total) * 1000) / 10);
}
