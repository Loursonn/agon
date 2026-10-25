/**
 * Équivalences d'allure : une même intensité exprimée dans toutes les unités
 * que le coach ou l'athlète peut avoir en tête.
 *
 *   « 23 km/h · 2'37/km · 400 m en 1'03 · tour de piste 1'03 · 105 % VMA »
 *
 * Tout est stocké en secondes par km (comme `EnergyTarget.pace`) ; les autres
 * unités ne sont que des vues. Le « % VMA » n'apparaît que si la VMA est connue.
 */

import type { EnergyTarget } from "@/types/energy";
import { paceBounds } from "./paceCompat";

/** Unités dans lesquelles une allure peut être saisie ou affichée. */
export type PaceUnit = "kmh" | "min_per_km" | "rep_distance" | "lap_400" | "vma_pct";

/** Un tour de piste. */
export const LAP_M = 400;

// ── Conversions ──────────────────────────────────────────────────────────────

/** Allure (s/km) → vitesse (km/h), arrondie au dixième. */
export function speedFromPace(sPerKm: number): number {
  if (!(sPerKm > 0)) return 0;
  return Math.round((3600 / sPerKm) * 10) / 10;
}

/** Vitesse (km/h) → allure (s/km), arrondie à la seconde. */
export function paceFromSpeed(kmh: number): number {
  if (!(kmh > 0)) return 0;
  return Math.round(3600 / kmh);
}

/** Temps sur une distance → allure (s/km), arrondie à la seconde. */
export function paceFromTimeOverDistance(seconds: number, meters: number): number {
  if (!(seconds > 0) || !(meters > 0)) return 0;
  return Math.round((seconds / meters) * 1000);
}

/** Temps au tour (400 m) → allure (s/km). */
export function paceFromLapTime(seconds: number): number {
  return paceFromTimeOverDistance(seconds, LAP_M);
}

/** % VMA → allure (s/km). */
export function paceFromVmaPct(pct: number, vma: number): number {
  if (!(pct > 0) || !(vma > 0)) return 0;
  return paceFromSpeed((pct / 100) * vma);
}

/** Temps nécessaire pour couvrir `meters` à l'allure donnée, en secondes. */
export function timeForDistance(sPerKm: number, meters: number): number {
  if (!(sPerKm > 0) || !(meters > 0)) return 0;
  return Math.round((meters / 1000) * sPerKm);
}

/**
 * Allure (s/km) → % de la VMA, arrondi à l'entier.
 * Calculé sur la vitesse exacte : passer par `speedFromPace` cumulerait deux
 * arrondis et ferait apparaître 106 % là où le coach a saisi 105 %.
 */
export function vmaPctFromPace(sPerKm: number, vma: number): number {
  if (!(sPerKm > 0) || !(vma > 0)) return 0;
  return Math.round((3600 / sPerKm / vma) * 100);
}

// ── Formatage ────────────────────────────────────────────────────────────────

/** Secondes → « M'SS » (63 → « 1'03 »). */
export function formatMmSs(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}`;
}

/** Vitesse → « 23 » ou « 22.5 » (le « .0 » inutile est retiré). */
export function formatSpeed(kmh: number): string {
  return String(Math.round(kmh * 10) / 10);
}

/** Formate une valeur ou une fourchette, en évitant « x–x ». */
function rangeText(lo: string, hi: string): string {
  return lo === hi ? lo : `${lo}–${hi}`;
}

// ── Équivalences ─────────────────────────────────────────────────────────────

export interface PaceEquivalentsInput {
  /** Borne rapide de l'allure, en secondes par km. */
  minSPerKm: number;
  /** Borne lente, si la cible est une fourchette. */
  maxSPerKm?: number | null;
  /** Distance de la répétition, en mètres, si elle est connue. */
  repDistanceM?: number | null;
  /** VMA de l'athlète en km/h — sans elle, pas de « % VMA ». */
  vma?: number | null;
  /** Unité choisie par le coach : affichée en premier et en gras. */
  primary?: PaceUnit;
}

export interface PaceEquivalentPart {
  unit: PaceUnit;
  text: string;
  /** Vrai pour l'unité choisie par le coach. */
  primary: boolean;
}

const ORDER: PaceUnit[] = ["kmh", "min_per_km", "rep_distance", "lap_400", "vma_pct"];

/**
 * Équivalences d'une cible d'allure, dans l'ordre d'affichage.
 * L'unité `primary` passe en tête. Liste vide si l'allure est inexploitable.
 */
export function paceEquivalents(input: PaceEquivalentsInput): PaceEquivalentPart[] {
  const { minSPerKm, maxSPerKm, repDistanceM, vma, primary } = input;

  // Bornes normalisées : `lo` est la plus rapide (moins de secondes par km).
  const a = minSPerKm > 0 ? minSPerKm : 0;
  const b = maxSPerKm != null && maxSPerKm > 0 ? maxSPerKm : a;
  if (!a || !b) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  const parts: PaceEquivalentPart[] = [];
  const push = (unit: PaceUnit, text: string) =>
    parts.push({ unit, text, primary: unit === primary });

  // Vitesse : la borne rapide donne la vitesse la plus élevée, donc on inverse
  // pour afficher la fourchette dans l'ordre croissant.
  push("kmh", `${rangeText(formatSpeed(speedFromPace(hi)), formatSpeed(speedFromPace(lo)))} km/h`);

  push("min_per_km", `${rangeText(formatMmSs(lo), formatMmSs(hi))}/km`);

  // « 400 m en 1'03 » ferait doublon avec « tour de piste 1'03 ».
  if (repDistanceM && repDistanceM > 0 && repDistanceM !== LAP_M) {
    const t = rangeText(
      formatMmSs(timeForDistance(lo, repDistanceM)),
      formatMmSs(timeForDistance(hi, repDistanceM)),
    );
    push("rep_distance", `${repDistanceM} m en ${t}`);
  }

  const lap = rangeText(
    formatMmSs(timeForDistance(lo, LAP_M)),
    formatMmSs(timeForDistance(hi, LAP_M)),
  );
  push("lap_400", `tour de piste ${lap}`);

  if (vma && vma > 0) {
    push("vma_pct", `${rangeText(String(vmaPctFromPace(hi, vma)), String(vmaPctFromPace(lo, vma)))} % VMA`);
  }

  if (!primary) return parts;
  return [...parts].sort(
    (x, y) =>
      Number(y.primary) - Number(x.primary) || ORDER.indexOf(x.unit) - ORDER.indexOf(y.unit),
  );
}

/** Les équivalences en une ligne : « 23 km/h · 2'37/km · tour de piste 1'03 ». */
export function formatPaceEquivalents(input: PaceEquivalentsInput): string {
  return paceEquivalents(input).map((p) => p.text).join(" · ");
}

// ── Adaptateur EnergyTarget ──────────────────────────────────────────────────

/** Mètres de l'étape si sa durée est définie sur une distance. */
export function stepDistanceM(
  duration: { kind: string; value?: number } | null | undefined,
): number | null {
  return duration?.kind === "distance" && duration.value ? duration.value : null;
}

export interface TargetEquivalentsOptions {
  /** Distance de la répétition, en mètres, si l'étape en a une. */
  repDistanceM?: number | null;
  /** VMA de l'athlète en km/h. */
  vma?: number | null;
}

/**
 * Équivalences d'une cible d'intensité, ou liste vide si la cible n'exprime pas
 * une allure. `pace_test_pct` n'est exploitable que si la VMA est connue.
 */
export function targetPaceEquivalents(
  target: EnergyTarget | null | undefined,
  opts: TargetEquivalentsOptions = {},
): PaceEquivalentPart[] {
  if (!target) return [];
  const { repDistanceM, vma } = opts;

  if (target.kind === "pace") {
    const { min, max } = paceBounds(target);
    return paceEquivalents({
      minSPerKm: min,
      maxSPerKm: max,
      repDistanceM,
      vma,
      primary: target.unit === "kmh" ? "kmh" : "min_per_km",
    });
  }

  if (target.kind === "pace_test_pct" && vma && vma > 0 && /vma/i.test(target.test_metric ?? "")) {
    return paceEquivalents({
      minSPerKm: paceFromVmaPct(target.max, vma),
      maxSPerKm: paceFromVmaPct(target.min, vma),
      repDistanceM,
      vma,
      primary: "vma_pct",
    });
  }

  return [];
}

/** Les équivalences d'une cible en une ligne, vide si la cible n'est pas une allure. */
export function formatTargetPaceEquivalents(
  target: EnergyTarget | null | undefined,
  opts: TargetEquivalentsOptions = {},
): string {
  return targetPaceEquivalents(target, opts).map((p) => p.text).join(" · ");
}
