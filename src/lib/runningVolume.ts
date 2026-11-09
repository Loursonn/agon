/** Volume de course à pied : agrégation par semaine (pur, testable). */
import { summarizeKm, type RunEntry } from "@/lib/watchRunMatching";
import { watchOrigins } from "@/lib/watchRunLabel";

/** Une sortie comptée dans le volume (déjà dédoublonnée : voir `buildRunLedger`) */
export type { RunEntry } from "@/lib/watchRunMatching";

/** Nombre de semaines d'historique (graphique) */
export const RUNNING_WEEKS = 8;

export interface RunningWeek {
  monday: string; // yyyy-MM-dd
  km: number;
  /** Part mesurée par une montre ou un fichier importé */
  watchKm: number;
}

export interface RunningVolume {
  /** Semaine calendaire en cours (lundi → dimanche) */
  weekKm: number;
  /** 7 derniers jours glissants (aujourd'hui inclus) */
  rolling7Km: number;
  /** Semaine précédente (lun → dim) */
  lastWeekKm: number;
  /** RUNNING_WEEKS dernières semaines, la plus ancienne d'abord */
  weeks: RunningWeek[];
  /** Km mesurés par la montre sur les RUNNING_WEEKS semaines (provenance affichée) */
  watchKm: number;
  /** Provenances de ces km de montre (« Garmin Forerunner 265 »…), pour l'attribution */
  watchOrigins: string[];
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Agrège les sorties de course par semaine — pur, testable */
export function computeRunningVolume(runs: RunEntry[], now = new Date()): RunningVolume {
  const thisMonday = mondayOf(now);
  const today = iso(now);
  const rollingStart = iso(addDays(now, -6));
  const sum = (from: string, to: string) => summarizeKm(runs, from, to).km;

  const weeks: RunningWeek[] = Array.from({ length: RUNNING_WEEKS }, (_, i) => {
    const mon = addDays(thisMonday, -7 * (RUNNING_WEEKS - 1 - i));
    return { monday: iso(mon), ...summarizeKm(runs, iso(mon), iso(addDays(mon, 6))) };
  });
  const windowEnd = iso(addDays(thisMonday, 6));

  return {
    weekKm:     sum(iso(thisMonday), windowEnd),
    rolling7Km: sum(rollingStart, today),
    lastWeekKm: weeks[RUNNING_WEEKS - 2]?.km ?? 0,
    weeks,
    watchKm:    summarizeKm(runs, weeks[0].monday, windowEnd).watchKm,
    watchOrigins: watchOrigins(runs, weeks[0].monday, windowEnd),
  };
}
