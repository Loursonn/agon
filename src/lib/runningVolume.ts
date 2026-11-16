/** Volume de course à pied : agrégation par semaine (pur, testable). */
import { summarizeKm, type RunEntry, type RunOuting, type WatchActivityInput } from "@/lib/watchRunMatching";
import { watchOrigins } from "@/lib/watchRunLabel";

/** Une sortie comptée dans le volume (déjà dédoublonnée : voir `buildRunLedger`) */
export type { RunEntry } from "@/lib/watchRunMatching";

/** Nombre de semaines d'historique (graphique) */
export const RUNNING_WEEKS = 12;

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

/** Sorties d'une semaine (lundi → dimanche), pour la liste sous le graphique. */
export interface RunningWeekDetail {
  monday: string;
  sunday: string;
  /** Sorties de course comptées, dans l'ordre du calendrier */
  runs: RunOuting[];
  /** Autres activités de montre (vélo, natation…), hors total */
  others: WatchActivityInput[];
  km: number;
  /** Durée cumulée des sorties dont la durée est connue, null si aucune */
  durationS: number | null;
  /** D+ cumulé des sorties qui l'ont mesuré, null si aucune */
  elevationGainM: number | null;
  /** Km de la semaine précédente (0 = aucune course) ; semaine en cours : jusqu'au même jour */
  prevKm: number;
  /** Semaine en cours : la comparaison s'arrête au même jour de la semaine précédente */
  prevToSameDay: boolean;
  /** Écart avec la semaine précédente, null s'il n'y a rien à comparer */
  deltaKm: number | null;
  /** Écart en %, null si la semaine précédente est vide */
  deltaPct: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Détail d'une semaine — pur, testable. `monday` au format yyyy-MM-dd. */
export function weekDetail(
  outings: RunOuting[],
  others: WatchActivityInput[],
  monday: string,
  /** Jour courant (yyyy-MM-dd) : une semaine en cours se compare au même jour de la précédente */
  today?: string,
): RunningWeekDetail {
  const mon = new Date(`${monday}T12:00:00`);
  const sunday = iso(addDays(mon, 6));
  const prevMonday = iso(addDays(mon, -7));
  // Lundi matin, « −100 % » face à une semaine complète ne veut rien dire (Hugo, 16/11/2026).
  const prevToSameDay = today != null && today >= monday && today < sunday;
  const prevEnd = prevToSameDay ? iso(addDays(new Date(`${today}T12:00:00`), -7)) : iso(addDays(mon, -1));
  const runs = outings.filter((o) => o.date >= monday && o.date <= sunday);
  const km = summarizeKm(runs, monday, sunday).km;
  const prevKm = summarizeKm(outings, prevMonday, prevEnd).km;
  const sumKnown = (vals: Array<number | null>) => {
    const known = vals.filter((v): v is number => v != null && Number.isFinite(v));
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };
  const hasAny = km > 0 || prevKm > 0;
  return {
    monday,
    sunday,
    runs,
    others: others.filter((a) => a.localDate >= monday && a.localDate <= sunday),
    km,
    durationS: sumKnown(runs.map((r) => r.durationS)),
    elevationGainM: sumKnown(runs.map((r) => r.elevationGainM)),
    prevKm,
    prevToSameDay,
    deltaKm: hasAny ? round1(km - prevKm) : null,
    deltaPct: prevKm > 0 ? Math.round(((km - prevKm) / prevKm) * 100) : null,
  };
}
