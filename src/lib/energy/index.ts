/**
 * src/lib/energy/index.ts
 *
 * Helpers purs pour le module énergie.
 * Zéro dépendance React / Supabase / browser.
 * Toutes les fonctions sont déterministes et testables unitairement.
 */

import type { EnergyDuration, EnergyGroup, EnergyInterval, ExerciseInterval, EnergyStep, EnergyTarget } from '@/types/energy';
import { paceBounds } from './paceCompat';

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

export interface FlatInterval {
  /** L'intervalle atomique développé */
  interval: EnergyInterval | ExerciseInterval;
  /** Profondeur d'imbrication (0 = enfant direct du groupe racine) */
  depth: number;
  /** Index de cet intervalle dans son parent immédiat */
  indexInParent: number;
}

export interface SessionTotals {
  /** Durée totale estimée en secondes (lap_button = 0) */
  durationS: number;
  /** Distance totale en mètres (0 si inconnue) */
  distanceM: number;
  /** Nombre d'intervalles de rôle 'work' */
  workCount: number;
}

export interface ZoneDistribution {
  z1: number;  // secondes en zone 1
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  uncategorized: number;  // intensité nulle ou non chiffrable
}

/**
 * Options de calcul nécessitant des données athlète.
 * athleteReferences : map metric_name → value (VMA en km/h, FCmax en bpm, FTP en W…)
 */
export interface EnergyCalcOptions {
  athleteReferences?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// expandIntervals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Développe récursivement un EnergyGroup en liste plate d'intervalles atomiques,
 * en répétant chaque groupe selon son champ `repeat`.
 */
export function expandIntervals(root: EnergyGroup): FlatInterval[] {
  return _expand(root, 0);
}

function _expand(group: EnergyGroup, depth: number): FlatInterval[] {
  const result: FlatInterval[] = [];
  const { repeat, children, rest_between } = group;

  for (let rep = 0; rep < repeat; rep++) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'interval' || child.type === 'exercise') {
        result.push({ interval: child, depth, indexInParent: i });
      } else {
        const nested = _expand(child, depth + 1);
        result.push(...nested);
      }
    }
    if (rest_between && rep < repeat - 1) {
      result.push({ interval: rest_between, depth, indexInParent: -1 });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// estimateIntervalDuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estime la durée d'un intervalle en secondes.
 *
 * Logique de conversion :
 *  - time       → value directement (en s)
 *  - distance   → utilise la cible + références athlète si disponibles, sinon 4 m/s
 *  - calories   → 10 kcal/min = 6 s/kcal
 *  - lap_button → 0 (durée inconnue)
 *
 * Options :
 *  - athleteReferences : map metric_name → valeur absolue (VMA km/h, FCmax bpm, FTP W…)
 *    Permet de résoudre les cibles en % test (pace_test_pct, power_test_pct) en durée réelle.
 */
export function estimateIntervalDuration(
  interval: EnergyInterval | ExerciseInterval,
  options?: EnergyCalcOptions,
): number {
  if (interval.type === 'exercise') {
    if (interval.duration) return _durationToSeconds(interval.duration, interval.target, options);
    // Estimate ~4s per rep when no explicit duration (for chart rendering)
    const reps = interval.reps_max ?? interval.reps_min ?? 10;
    return reps * 4;
  }
  const { duration, target } = interval;
  return _durationToSeconds(duration, target, options);
}

function _durationToSeconds(
  duration: EnergyDuration,
  target?: EnergyTarget,
  options?: EnergyCalcOptions,
): number {
  switch (duration.kind) {
    case 'time':
      return duration.value ?? 0;

    case 'distance': {
      const distM = duration.value ?? 0;
      if (distM === 0) return 0;
      const mPerS = _targetToMetersPerSecond(target, options?.athleteReferences);
      return Math.round(distM / mPerS);
    }

    case 'calories':
      return Math.round((duration.value ?? 0) * 6);

    case 'lap_button':
      return 0;

    default:
      return 0;
  }
}

/**
 * Tente de dériver une vitesse en m/s depuis la cible.
 * Retourne 4 m/s (conservative ≈ 14,4 km/h) si la cible ne donne pas d'allure absolue.
 *
 * Avec références athlète :
 *  - pace_test_pct + refs.VMA (km/h)  → vitesse = VMA * pct/100 → m/s
 *  - pace_test_pct + refs.VC (km/h)   → même logique
 *  - power_test_pct                   → non convertible en m/s, utilise default
 */
function _targetToMetersPerSecond(
  target?: EnergyTarget,
  refs?: Record<string, number>,
): number {
  const DEFAULT_M_PER_S = 4;

  if (!target) return DEFAULT_M_PER_S;

  if (target.kind === 'pace') {
    // Stocké en s/km — m/s = 1000 / sPerKm
    const { min, max } = paceBounds(target);
    const avgSPerKm = (min + max) / 2;
    if (avgSPerKm > 0) return 1000 / avgSPerKm;
  }

  if (target.kind === 'pace_test_pct' && refs) {
    // Cherche une référence de vitesse pour ce test (VMA, VC, Allure 10K…)
    const refValue = refs[target.test_metric];
    if (refValue && refValue > 0) {
      const pct = (target.min + target.max) / 2 / 100;
      // VMA/VC stockés en km/h → m/s
      return (refValue * pct) / 3.6;
    }
  }

  return DEFAULT_M_PER_S;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeTotals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule les totaux d'une séance à partir de sa liste plate d'intervalles.
 */
export function computeTotals(flat: FlatInterval[], options?: EnergyCalcOptions): SessionTotals {
  let durationS = 0;
  let distanceM = 0;
  let workCount = 0;

  for (const { interval } of flat) {
    durationS += estimateIntervalDuration(interval, options);

    if (interval.duration?.kind === 'distance') {
      distanceM += interval.duration.value ?? 0;
    }

    if (interval.role === 'work') workCount++;
  }

  return { durationS, distanceM, workCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// targetToIntensityPct
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit une cible en pourcentage d'intensité (0–100) ou null.
 *
 * Sans références athlète :
 *   hr_zone        → Z1=20, Z2=40, Z3=60, Z4=80, Z5=100
 *   hr_pct         → moyenne(min, max)
 *   pace_test_pct  → moyenne(min, max)  [% de la métrique test = déjà une intensité]
 *   power_test_pct → moyenne(min, max)
 *   hr_bpm         → estimation sur la plage générique 100–200 bpm → 20–100
 *   pace           → estimation sur la plage typique 2:30–8:00 /km → 100–30
 *   power/cadence/x_per_y/text/none → null (pas de référence commune)
 *
 * Avec références athlète (refs) :
 *   pace + refs.VMA (km/h)    → (speed_kmh / VMA) * 100
 *   hr_bpm + refs.FCmax (bpm) → (avg_bpm / FCmax) * 100
 *   power + refs.FTP (W)      → (avg_watts / FTP) * 100
 *   power + refs.PMA (W)      → (avg_watts / PMA) * 100 (fallback)
 */
/**
 * Intensité de fallback basée sur le rôle de l'intervalle.
 * Utilisée quand les références athlète ne sont pas disponibles.
 */
export const ROLE_FALLBACK_PCT: Record<string, number> = {
  warmup:   35,
  work:     80,
  recovery: 45,
  rest:     15,
  cooldown: 30,
  open:     55,
};

export function targetToIntensityPct(
  target: EnergyTarget,
  refs?: Record<string, number>,
): number | null {
  switch (target.kind) {
    case 'hr_zone': {
      const map: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 };
      return map[target.zone];
    }

    case 'hr_pct':
      return (target.min + target.max) / 2;

    case 'pace_test_pct':
      return (target.min + target.max) / 2;

    case 'power_test_pct':
      return (target.min + target.max) / 2;

    case 'pace': {
      const paceRange = paceBounds(target);
      if (refs?.VMA && refs.VMA > 0) {
        const avgSPerKm = (paceRange.min + paceRange.max) / 2;
        if (avgSPerKm <= 0) return null;
        const speedKmh = 3600 / avgSPerKm;
        return Math.min(120, (speedKmh / refs.VMA) * 100);
      }
      // Sans VMA : estimation depuis la plage d'allure typique (2:30–8:00 /km)
      // 2:30 = 150 s/km (sprint élite) → 100%, 8:00 = 480 s/km (footing doux) → 30%
      const avgSPerKm = (paceRange.min + paceRange.max) / 2;
      if (avgSPerKm > 0) {
        const normalized = Math.max(0, Math.min(1, (480 - avgSPerKm) / (480 - 150)));
        return Math.round(30 + normalized * 70); // 30% → 100%
      }
      return null;
    }

    case 'hr_bpm': {
      const avg = (target.min + target.max) / 2;
      if (avg <= 0) return null;

      // Bornes de zones personnalisées (FCzone_Z1_max … FCzone_Z4_max)
      const z1max = refs?.FCzone_Z1_max;
      const z2max = refs?.FCzone_Z2_max;
      const z3max = refs?.FCzone_Z3_max;
      const z4max = refs?.FCzone_Z4_max;
      const fcmax = refs?.FCmax ?? null;

      if (z1max && z2max && z3max && z4max) {
        // Interpolation dans les bornes de zone stockées
        // Zones → [0-30%] [30-50%] [50-70%] [70-85%] [85-100%]
        const z0min = refs?.FCzone_Z0_min ?? 0;
        const zones = [
          { lo: z0min, hi: z1max, pctLo: 0,  pctHi: 30 },
          { lo: z1max, hi: z2max, pctLo: 30, pctHi: 50 },
          { lo: z2max, hi: z3max, pctLo: 50, pctHi: 70 },
          { lo: z3max, hi: z4max, pctLo: 70, pctHi: 85 },
          { lo: z4max, hi: fcmax ?? z4max * 1.08, pctLo: 85, pctHi: 100 },
        ];
        for (const z of zones) {
          if (avg <= z.hi || z === zones[zones.length - 1]) {
            const t = z.hi > z.lo ? Math.max(0, Math.min(1, (avg - z.lo) / (z.hi - z.lo))) : 0.5;
            return Math.round(z.pctLo + t * (z.pctHi - z.pctLo));
          }
        }
      }

      // Fallback FCmax seule
      if (fcmax && fcmax > 0) {
        return Math.min(100, (avg / fcmax) * 100);
      }
      // Estimation générique 100–200 bpm
      const normalized = Math.max(0, Math.min(1, (avg - 100) / 100));
      return Math.round(20 + normalized * 80);
    }

    case 'power': {
      const ref = refs?.FTP ?? refs?.PMA ?? null;
      if (ref && ref > 0) {
        const avg = (target.min + target.max) / 2;
        return Math.min(150, (avg / ref) * 100);
      }
      // Sans FTP/PMA : pas d'estimation universelle possible sans context
      return null;
    }

    case 'cadence':
    case 'x_per_y':
    case 'text':
    case 'none':
      return null;

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// intensityToColor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mappe un pourcentage d'intensité (0–100) sur une couleur HSL.
 * Gradient : vert (140°, 75%, 50%) → rouge (0°, 80%, 45%)
 */
export function intensityToColor(pct: number): string {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const hue = Math.round(140 * (1 - t));  // 140 → 0
  const sat  = Math.round(75 + 5 * t);    // 75% → 80%
  const lum  = Math.round(50 - 5 * t);    // 50% → 45%
  return `hsl(${hue}, ${sat}%, ${lum}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeZoneDistribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Répartit la durée de la séance par zone d'intensité (en secondes).
 *
 * Seuils : ≤30→Z1, ≤50→Z2, ≤70→Z3, ≤85→Z4, >85→Z5, null→uncategorized
 */
export function computeZoneDistribution(
  flat: FlatInterval[],
  options?: EnergyCalcOptions,
): ZoneDistribution {
  const dist: ZoneDistribution = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, uncategorized: 0 };

  for (const { interval } of flat) {
    const dur = estimateIntervalDuration(interval, options);
    const pct = targetToIntensityPct(interval.target, options?.athleteReferences);

    if (pct === null) {
      dist.uncategorized += dur;
    } else if (pct <= 30) {
      dist.z1 += dur;
    } else if (pct <= 50) {
      dist.z2 += dur;
    } else if (pct <= 70) {
      dist.z3 += dur;
    } else if (pct <= 85) {
      dist.z4 += dur;
    } else {
      dist.z5 += dur;
    }
  }

  return dist;
}
