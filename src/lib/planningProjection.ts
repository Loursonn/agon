/**
 * Projection des séances récurrentes sur le planning coach.
 *
 * La source de vérité pour tout ce qui est daté est workout_logs ; asp:prog
 * n'est qu'un modèle. Une séance récurrente n'est donc projetée (« prévu ») que
 * si aucun log ne couvre déjà cette occurrence : même date, même semaine
 * d'origine ou même numéro d'occurrence. Sans ça, une séance déplacée par
 * l'athlète réapparaissait en fantôme à son ancienne date.
 */

export interface ProjectionLog {
  session_id: string | null | undefined;
  scheduled_date: string;
  original_scheduled_date?: string | null;
  week_number?: number | null;
}

/** Lundi (YYYY-MM-DD) de la semaine ISO contenant `iso`. */
export function mondayOfISO(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ProjectionCoverage {
  dates: Set<string>;
  weeks: Set<string>;
  occurrences: Set<string>;
}

/**
 * Index des occurrences déjà couvertes par un log (tous statuts, skipped compris :
 * un skipped supprime volontairement une occurrence).
 * La semaine retenue est celle de la date d'ORIGINE : une séance décalée à la
 * semaine suivante couvre sa semaine d'origine, pas l'occurrence suivante.
 */
export function buildProjectionCoverage(logs: ProjectionLog[]): ProjectionCoverage {
  const dates = new Set<string>();
  const weeks = new Set<string>();
  const occurrences = new Set<string>();
  for (const l of logs) {
    if (!l.session_id) continue;
    const sid = l.session_id;
    dates.add(`${sid}:${l.scheduled_date}`);
    if (l.original_scheduled_date) dates.add(`${sid}:${l.original_scheduled_date}`);
    weeks.add(`${sid}:${mondayOfISO(l.original_scheduled_date || l.scheduled_date)}`);
    if (l.week_number != null) occurrences.add(`${sid}:${l.week_number}`);
  }
  return { dates, weeks, occurrences };
}

/** True quand l'occurrence projetée (séance, date, n° de semaine du bloc) est déjà couverte. */
export function isProjectionCovered(
  cov: ProjectionCoverage,
  sessionId: string,
  date: string,
  weekNumber?: number,
): boolean {
  if (cov.dates.has(`${sessionId}:${date}`)) return true;
  if (cov.weeks.has(`${sessionId}:${mondayOfISO(date)}`)) return true;
  if (weekNumber != null && cov.occurrences.has(`${sessionId}:${weekNumber}`)) return true;
  return false;
}

// ── Séance « faite aujourd'hui » par l'athlète ───────────────────────────────

export interface WeekLogLite {
  id: string;
  session_id: string | null;
  scheduled_date: string;
  status: string;
}

export type UnplannedStartPlan =
  | { action: "open"; logId: string }
  | { action: "move"; logId: string; fromDate: string }
  | { action: "insert" };

/**
 * L'athlète démarre aujourd'hui la séance `sessionId` :
 *  - déjà un log non sauté aujourd'hui → on l'ouvre ;
 *  - prévue un autre jour de la même semaine (pas encore faite) → on DÉPLACE ce
 *    log (le plus ancien d'abord, typiquement celui qu'il a manqué) ;
 *  - sinon, séance vraiment hors programme → nouvelle ligne.
 */
export function planUnplannedStart(
  weekLogs: WeekLogLite[],
  sessionId: string,
  today: string,
): UnplannedStartPlan {
  const mine = weekLogs.filter((l) => l.session_id === sessionId && l.status !== "skipped");
  const todays = mine.find((l) => l.scheduled_date === today);
  if (todays) return { action: "open", logId: todays.id };
  const monday = mondayOfISO(today);
  const movable = mine
    .filter((l) => l.status !== "completed" && mondayOfISO(l.scheduled_date) === monday)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  if (movable.length) return { action: "move", logId: movable[0].id, fromDate: movable[0].scheduled_date };
  return { action: "insert" };
}

// ── « Changer de jour » côté coach ───────────────────────────────────────────

export interface DayChangeLog {
  id: string;
  rescheduled_by_athlete?: boolean | null;
  status?: string | null;
  week_start: string | null;
}

/**
 * Logs à recaler quand le coach change le jour d'une séance récurrente.
 * Les choix de l'athlète (rescheduled_by_athlete) et les séances déjà faites
 * sont conservés tels quels.
 */
export function planDayChange(logs: DayChangeLog[], newDow: number): {
  updates: Array<{ id: string; scheduled_date: string }>;
  keptByAthlete: number;
} {
  const updates: Array<{ id: string; scheduled_date: string }> = [];
  let keptByAthlete = 0;
  for (const l of logs) {
    if (!l.week_start) continue;
    if (l.rescheduled_by_athlete) { keptByAthlete++; continue; }
    // Faite ou commencée : reste au jour où l'athlète l'a faite.
    if (l.status === "completed" || l.status === "in_progress") continue;
    const d = new Date(l.week_start + "T12:00:00");
    d.setDate(d.getDate() + newDow);
    updates.push({
      id: l.id,
      scheduled_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
  }
  return { updates, keptByAthlete };
}

// ── Séance hebdomadaire rendue concrète sur le cycle ─────────────────────────

export interface CycleWeekLite {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
}

export interface SessionLogLite {
  scheduled_date: string;
  original_scheduled_date?: string | null;
  microcycle_id?: string | null;
}

export interface RecurringPlacement {
  date: string;
  microcycleId: string;
  weekNumber: number;
}

/**
 * Séances concrètes à créer pour une séance hebdomadaire (`dow` : 0 = lundi
 * … 6 = dimanche) sur les semaines d'un cycle. Une semaine qui a déjà une
 * séance de cette séance-type (quel que soit son statut : faite, sautée,
 * déplacée par l'athlète…) n'est pas touchée ; aucun jour passé n'est créé ;
 * le jour doit tomber dans la semaine du cycle (cycle commencé un mercredi :
 * pas de lundi la 1re semaine).
 */
export function planRecurringPlacement(
  weeks: CycleWeekLite[],
  logs: SessionLogLite[],
  dow: number,
  today: string,
): RecurringPlacement[] {
  const out: RecurringPlacement[] = [];
  for (const w of weeks) {
    const d = new Date(mondayOfISO(w.start_date) + "T12:00:00");
    d.setDate(d.getDate() + dow);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (date < today || date < w.start_date || date > w.end_date) continue;
    const inWeek = (iso?: string | null) => !!iso && iso >= w.start_date && iso <= w.end_date;
    const covered = logs.some((l) =>
      l.microcycle_id === w.id || inWeek(l.original_scheduled_date) || (!l.original_scheduled_date && inWeek(l.scheduled_date)),
    );
    if (covered) continue;
    out.push({ date, microcycleId: w.id, weekNumber: w.week_number });
  }
  return out;
}
