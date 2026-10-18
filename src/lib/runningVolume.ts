/** Volume de course à pied : agrégation par semaine (pur, testable). */

/** Nombre de semaines d'historique (graphique) */
export const RUNNING_WEEKS = 8;

export interface RunningWeek {
  monday: string; // yyyy-MM-dd
  km: number;
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
}

/** Une séance de course comptée dans le volume */
export interface RunEntry {
  date: string;
  km: number;
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
  const sum = (from: string, to: string) =>
    runs.reduce((s, r) => (r.date >= from && r.date <= to ? s + r.km : s), 0);

  const weeks: RunningWeek[] = Array.from({ length: RUNNING_WEEKS }, (_, i) => {
    const mon = addDays(thisMonday, -7 * (RUNNING_WEEKS - 1 - i));
    return { monday: iso(mon), km: sum(iso(mon), iso(addDays(mon, 6))) };
  });

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    weekKm:     round(sum(iso(thisMonday), iso(addDays(thisMonday, 6)))),
    rolling7Km: round(sum(rollingStart, today)),
    lastWeekKm: round(weeks[RUNNING_WEEKS - 2]?.km ?? 0),
    weeks:      weeks.map((w) => ({ ...w, km: round(w.km) })),
  };
}
