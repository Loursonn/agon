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

/** Nombre de zones d'un modèle (bornes = zones 2..N). */
export function zoneCount(bounds: readonly number[] | null | undefined): number | null {
  return bounds && bounds.length > 0 ? bounds.length + 1 : null;
}

/**
 * Bornes hautes incluses des zones 1..5 (références `FCzone_Z1..Z5_max`)
 * proposées depuis FC max (et FC repos si connue, méthode de Karvonen) :
 * 60 / 70 / 80 / 90 % puis FC max. Même règle que l'éditeur historique.
 */
export function defaultFiveZoneMaxes(fcmax: number, fcrep?: number | null): number[] {
  const r = fcrep && fcrep > 0 ? fcrep : 0;
  const k = (pct: number) => (r ? Math.round(r + (fcmax - r) * pct) : Math.round(fcmax * pct));
  return [k(0.6), k(0.7), k(0.8), k(0.9), Math.round(fcmax)];
}

/** Pourcentages (de la réserve, ou de FC max sans FC repos) des bornes basses des zones 2..7. */
export const SEVEN_ZONE_PCTS = [0.55, 0.65, 0.75, 0.82, 0.89, 0.95] as const;

/**
 * 7 zones proposées depuis FC max et FC repos (Karvonen) : bornes basses des
 * zones 2..7 à 55 / 65 / 75 / 82 / 89 / 95 % de la réserve (de FC max si la
 * FC repos manque). `null` si FC max absente ou bornes incohérentes.
 */
export function sevenZoneBounds(fcmax: number | null | undefined, fcrep?: number | null): number[] | null {
  if (!fcmax || !Number.isFinite(fcmax)) return null;
  const r = fcrep && fcrep > 0 && fcrep < fcmax ? fcrep : 0;
  return validBounds(SEVEN_ZONE_PCTS.map((p) => (r ? r + (fcmax - r) * p : fcmax * p)));
}

/** Noms des zones selon le modèle (3, 5 ou 7) ; autre nombre : « Zone n ». */
export function zoneNames(n: number): string[] {
  if (n === 3) return ["Sous SV1", "Entre SV1 et SV2", "Au-dessus de SV2"];
  if (n === 5) return ["Récupération", "Endurance", "Tempo", "Seuil", "VO₂max"];
  if (n === 7) return ["Récupération", "Endurance fondamentale", "Endurance active", "Tempo", "Seuil", "VO₂max", "Anaérobie"];
  return Array.from({ length: n }, (_, i) => `Zone ${i + 1}`);
}

/**
 * Modèle actif à une date parmi des lignes datées (même règle que
 * `hr_zone_bounds_at` : dernier modèle actif dont valid_from ≤ jour).
 */
export function activeModelAt<T extends { status: string; validFrom: string; createdAt?: string | null }>(
  rows: readonly T[],
  day: string,
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.status !== "active" || r.validFrom > day) continue;
    if (!best || r.validFrom > best.validFrom || (r.validFrom === best.validFrom && (r.createdAt ?? "") > (best.createdAt ?? ""))) best = r;
  }
  return best;
}
