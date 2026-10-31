/**
 * Profil charge-vitesse au sled (Push ou Pull) et lecture de la semaine 1.
 *
 * Bilan : 3 passages de 12,5 m à 80, 100 et 120 % de la charge de course.
 * vitesse = 12,5 / temps ; régression vitesse = a + b × charge ;
 * charge max estimée L0 = −a / b (charge où la vitesse s'annule) ;
 * réserve de force = charge de course / L0 (plus c'est bas, plus il reste de marge).
 * L0 surestime la charge max réelle : grille de la réserve à recaler (ma méthode).
 */
import type { SledProfileInputs, SledWeek1Inputs } from "./types";
import { linreg, pos } from "./util";

export const SLED_SEGMENT_M = 12.5;
const DEFAULT_FACTORS = [0.8, 1, 1.2] as const;

export type SledProfile =
  | { usable: false; reason: "missing" | "slope_not_negative"; n: number }
  | {
      usable: true;
      n: number;
      /** Vitesse (m/s) à charge nulle et pente (m/s par kg). */
      a: number;
      b: number;
      /** Charge max estimée (kg). */
      l0_kg: number;
      r2: number;
      /** Vitesse à charge de course (m/s) : mesurée au passage à 100 %, sinon lue sur la droite. */
      v_race: number;
      /** Charge de course / charge max estimée. */
      reserve: number;
      /** R² < 0,9 : profil peu fiable. */
      low_fit: boolean;
      two_points: boolean;
      points: { load_kg: number; v: number }[];
    };

export function sledProfile(raceLoadKg: number, input: SledProfileInputs | undefined | null): SledProfile {
  const times = input?.times_s ?? [null, null, null];
  const pts: { load_kg: number; v: number }[] = [];
  DEFAULT_FACTORS.forEach((f, i) => {
    const t = pos(times[i]);
    const load = pos(input?.loads_kg?.[i]) ?? raceLoadKg * f;
    if (t != null) pts.push({ load_kg: load, v: SLED_SEGMENT_M / t });
  });
  if (pts.length < 2) return { usable: false, reason: "missing", n: pts.length };
  const reg = linreg(pts.map(p => [p.load_kg, p.v] as const));
  if (!reg || !(reg.b < 0)) return { usable: false, reason: "slope_not_negative", n: pts.length };
  const l0 = -reg.a / reg.b;
  const t100 = pos(times[1]);
  const v_race = t100 != null ? SLED_SEGMENT_M / t100 : reg.a + reg.b * raceLoadKg;
  return {
    usable: true, n: pts.length, a: reg.a, b: reg.b, l0_kg: l0, r2: reg.r2, v_race,
    reserve: raceLoadKg / l0, low_fit: reg.r2 < 0.9, two_points: pts.length < 3, points: pts,
  };
}

export interface SledWeek1Analysis {
  /** Vitesse moyenne (m/s) de chaque répétition de 50 m. */
  rep_speeds: (number | null)[];
  mean_speed: number | null;
  /** Vitesse moyenne / vitesse à frais (à charge de course, bilan). */
  vs_fresh: number | null;
  /** Chute intra-50 m : vitesse du dernier tronçon / premier, par répétition, et la pire. */
  intra_drop: (number | null)[];
  worst_intra_drop: number | null;
  /** Chute entre répétitions : dernière / première. */
  between_reps_drop: number | null;
}

export function sledWeek1(reps: SledWeek1Inputs | undefined | null, freshSpeed: number | null): SledWeek1Analysis | null {
  if (!reps || !reps.length) return null;
  const rep_speeds: (number | null)[] = [];
  const intra_drop: (number | null)[] = [];
  for (const rep of reps) {
    const segs = rep.map(pos);
    const all = segs.length > 0 && segs.every(s => s != null);
    rep_speeds.push(all ? (SLED_SEGMENT_M * segs.length) / (segs as number[]).reduce((s, x) => s + x, 0) : null);
    const first = segs[0], last = segs[segs.length - 1];
    // vitesse dernier / vitesse premier = temps premier / temps dernier
    intra_drop.push(first != null && last != null && segs.length > 1 ? first / last : null);
  }
  const known = rep_speeds.filter((v): v is number => v != null);
  if (!known.length && intra_drop.every(d => d == null)) return null;
  const mean_speed = known.length ? known.reduce((s, x) => s + x, 0) / known.length : null;
  const drops = intra_drop.filter((d): d is number => d != null);
  const r0 = rep_speeds[0], rN = rep_speeds[rep_speeds.length - 1];
  return {
    rep_speeds, mean_speed,
    vs_fresh: mean_speed != null && freshSpeed ? mean_speed / freshSpeed : null,
    intra_drop, worst_intra_drop: drops.length ? Math.min(...drops) : null,
    between_reps_drop: r0 != null && rN != null && rep_speeds.length > 1 ? rN / r0 : null,
  };
}
