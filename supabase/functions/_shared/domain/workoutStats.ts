/**
 * Série et total de séances réalisées d'un athlète, calculés depuis
 * `workout_logs` (la seule source des séances depuis le lot 2).
 *
 * Avant : calculés sur `asp:completed` (ancien stockage abandonné en juin),
 * donc ≈ 0 pour tout le monde.
 *
 * Pur, sans dépendance : front (`@shared/domain/workoutStats`) et Edge Functions.
 */
import { addDays, type IsoDay } from "./dates.ts";

export interface StatLog {
  scheduled_date: string;
  status: string;
}

/** Lundi (ISO) de la semaine d'un jour "YYYY-MM-DD". */
export function mondayOf(day: IsoDay): IsoDay {
  const [y, m, d] = day.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lundi = 0
  return addDays(day, -dow);
}

/** Séances qui « comptent » dans une semaine : tout sauf ce qui a été annulé. */
const DUE = new Set(["planned", "in_progress", "completed", "missed"]);

export interface WorkoutStats {
  /** Séances validées, depuis toujours. */
  totalDone: number;
  /**
   * Semaines consécutives où tout ce qui était prévu (hors séances annulées)
   * a été validé, au moins une séance validée.
   * - On remonte depuis la semaine dernière ; une semaine sans aucune séance
   *   prévue (vacances, coupure) ne casse pas la série et ne la prolonge pas.
   * - La semaine en cours s'ajoute si tout ce qui était prévu jusqu'à
   *   aujourd'hui est validé ; sinon elle ne casse rien (elle n'est pas finie).
   */
  streak: number;
}

export function workoutStats(logs: StatLog[], today: IsoDay): WorkoutStats {
  const weeks = new Map<IsoDay, { due: number; done: number }>();
  let totalDone = 0;
  let oldest: IsoDay | null = null;
  for (const l of logs) {
    const day = (l.scheduled_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (l.status === "completed") totalDone++;
    if (!DUE.has(l.status) || day > today) continue;
    const wk = mondayOf(day);
    const w = weeks.get(wk) ?? { due: 0, done: 0 };
    w.due++;
    if (l.status === "completed") w.done++;
    weeks.set(wk, w);
    if (!oldest || wk < oldest) oldest = wk;
  }

  const held = (w: { due: number; done: number } | undefined) => !!w && w.done > 0 && w.done === w.due;
  const thisWeek = mondayOf(today);
  let streak = held(weeks.get(thisWeek)) ? 1 : 0;
  if (!oldest) return { totalDone, streak };
  for (let wk = addDays(thisWeek, -7); wk >= oldest; wk = addDays(wk, -7)) {
    const w = weeks.get(wk);
    if (!w || w.due === 0) continue;
    if (!held(w)) break;
    streak++;
  }
  return { totalDone, streak };
}
