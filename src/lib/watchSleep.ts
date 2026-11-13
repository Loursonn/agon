import type { HealthDay } from "@/api/health";

/** Nuit mesurée par la montre, prête pour le wellness du matin. */
export interface WatchSleep {
  /** Heures dormies, au dixième (comme la saisie manuelle). */
  hours: number;
  /** Coucher / réveil en heure locale, si la montre les donne. */
  start: { h: number; m: number } | null;
  end: { h: number; m: number } | null;
  /** « Garmin Forerunner 265 » : affiché à côté de la mesure. */
  attribution: string;
}

const hm = (iso: string | null): { h: number; m: number } | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : { h: d.getHours(), m: d.getMinutes() };
};

/**
 * Nuit de la montre pour `day` (le jour du réveil), ou null s'il n'y en a pas :
 * le wellness affiche alors la saisie coucher / réveil. Plusieurs sources le
 * même jour : la plus longue nuit (une montre portée la nuit, l'autre non).
 */
export function watchSleepOf(days: HealthDay[] | null | undefined, day: string): WatchSleep | null {
  const best = (days ?? [])
    .filter((d) => d.day === day && d.sleepTotalMin != null && d.sleepTotalMin > 0)
    .sort((a, b) => (b.sleepTotalMin ?? 0) - (a.sleepTotalMin ?? 0))[0];
  if (!best) return null;
  return {
    hours: Math.round(((best.sleepTotalMin ?? 0) / 60) * 10) / 10,
    start: hm(best.sleepStartAt),
    end: hm(best.sleepEndAt),
    attribution: best.attribution,
  };
}
