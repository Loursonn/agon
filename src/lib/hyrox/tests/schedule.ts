/**
 * Programmation de la semaine de tests : place chaque test des séances S1 à S5
 * sur une date du calendrier de l'athlète.
 *
 * Pur : aucun accès réseau, dates au format AAAA-MM-JJ calculées en UTC (pas
 * de décalage d'un jour selon le fuseau). La Semaine 1 (sleds 3 × 50 m) n'est
 * pas programmée ici (choix de Hugo du 01/11/2026) : elle se pose dans le bloc
 * d'entraînement.
 */
import type { BatterySession } from "./mapping";

export type ScheduledSession = Exclude<BatterySession, "W1">;

export const SCHEDULED_SESSIONS: ScheduledSession[] = ["S1", "S2", "S3", "S4", "S5"];

/** Semaine type validée le 31/10/2026 : lun S1 · mar S2 · jeu S3 · ven S4 · dim S5 (jours après le lundi). */
export const SESSION_DAY_OFFSET: Record<ScheduledSession, number> = { S1: 0, S2: 1, S3: 3, S4: 4, S5: 6 };

const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Lundi de la semaine qui contient cette date. */
export function mondayOf(iso: string): string {
  const d = parse(iso);
  return addDaysIso(iso, -((d.getUTCDay() + 6) % 7));
}

/** Le lundi qui vient : aujourd'hui si on est lundi, sinon le prochain. */
export function nextMondayIso(todayIso: string): string {
  const monday = mondayOf(todayIso);
  return monday === todayIso.slice(0, 10) ? monday : addDaysIso(monday, 7);
}

/** Dates par défaut des séances pour la semaine qui commence ce lundi. */
export function defaultSessionDates(monday: string): Record<ScheduledSession, string> {
  return Object.fromEntries(
    SCHEDULED_SESSIONS.map(s => [s, addDaysIso(monday, SESSION_DAY_OFFSET[s])]),
  ) as Record<ScheduledSession, string>;
}

export interface PlannedTest {
  testId: string;
  name: string;
  session: ScheduledSession;
  date: string;
  /** Vrai si ce test est déjà prévu ou fait ce jour-là : il n'est pas recréé. */
  alreadyThere: boolean;
}

const sameKey = (title: string, date: string) => `${title.trim().toLowerCase()}|${date.slice(0, 10)}`;

/**
 * Liste des tests à programmer, dans l'ordre de la batterie. Un test déjà
 * présent le même jour (prévu ou fait, même titre) est marqué `alreadyThere`
 * et ne doit pas être recréé.
 */
export function planTestWeek(
  tests: { id: string; name: string; battery_session: BatterySession }[],
  dates: Record<ScheduledSession, string>,
  existing: { title: string; date: string }[],
): PlannedTest[] {
  const taken = new Set(existing.map(e => sameKey(e.title, e.date)));
  return tests
    .filter((t): t is typeof t & { battery_session: ScheduledSession } => t.battery_session !== "W1")
    .map(t => {
      const date = dates[t.battery_session];
      return { testId: t.id, name: t.name, session: t.battery_session, date, alreadyThere: taken.has(sameKey(t.name, date)) };
    });
}
