import { type IsoDay, addDays, localIsoDay } from "@shared/domain/dates";
import { localISO } from "@/lib/date";
import { computeOccurrences } from "@/lib/sessionOccurrence";
import { listTestSessionsBetween } from "./tests";
import { listCompetitions } from "./competitions";
import { listLifeEvents } from "./lifeEvents";
import { readAppData } from "./appData";
import { listEnergyAssignments } from "./energy";
import {
  getCurrentMacrocycle, getCurrentMesocycle, getCycleTree, listAthleteCycles,
  listCycleMicrocycles, type CycleTree,
} from "./cycles";
import { listSessionOccurrenceLogs, listWorkoutLogs, planWorkoutsIfAbsent, type WorkoutLog } from "./workouts";

/**
 * Vues composées du planning : frise coach, plan actif et semaine de
 * l'athlète, calendrier unifié, placement d'une séance.
 *
 * Ce module ne possède aucune table : il assemble les lectures des modules
 * propriétaires (cycles, séances, énergie, tests, compétitions, événements de
 * vie). Les écritures invalident par le module propriétaire
 * (`invalidateWorkouts`, `invalidateCycles`, `invalidateTests`…).
 */

// ── Clés React Query (noms historiques, invalidés par les modules) ───────────

export const planningKeys = {
  activePlan: (aid: string, weekOffset: number) => ["activePlan", aid, weekOffset] as const,
  calendar: (aid: string, start: string, end: string) => ["cal", aid, start, end] as const,
  calendarAll: (aid: string) => ["cal", aid] as const,
  week: (aid: string, monday: string) => ["workout-logs-week", aid, monday] as const,
  occurrence: (aid: string | undefined, sessionId: string | undefined, date: string | undefined) =>
    ["session-occurrence", aid, sessionId, date] as const,
};

// ── Frise coach ───────────────────────────────────────────────────────────────

export interface TimelineCompetition {
  id: string; name: string; date: string;
  priority?: string | null; location?: string | null; notes?: string | null;
  athlete_comment?: string | null;
  coach_id?: string; athlete_id?: string;
  type?: string | null; season_id?: string | null;
}
export interface TimelineTestSession {
  id: string; title: string; date: string; type: string; completed: boolean;
}
export interface TimelineData extends CycleTree {
  competitions: TimelineCompetition[];
  tests: TimelineTestSession[];
}

/** Frise : périodisation + compétitions et tests de la fenêtre affichée. */
export async function getTimeline(athleteId: string, start: IsoDay, end: IsoDay): Promise<TimelineData> {
  const [tree, comps, tests] = await Promise.all([
    getCycleTree(athleteId, { from: start, to: end }),
    listCompetitions(athleteId),
    listTestSessionsBetween(athleteId, start, end),
  ]);
  return {
    ...tree,
    competitions: comps.filter((c) => c.date >= start && c.date <= end) as unknown as TimelineCompetition[],
    tests,
  };
}

// ── Plan actif (athlète) ──────────────────────────────────────────────────────

export interface ActiveMesocycle {
  id: string;
  name: string;
  objective: string | null;
  startDate: string;
  endDate: string;
  frequency: number | null;
  totalWeeks: number;
  currentWeek: number;
  /** 0-100, avancement dans le temps */
  progressPct: number;
  /** 0-100, séances validées / séances non annulées */
  completionPct: number;
  totalLogs: number;
  completedLogs: number;
  macroName: string;
  macroId: string;
}

export interface WeekSession {
  id: string;
  sessionName: string;
  scheduledDate: string;
  status: string;
  kind: "workout" | "energy";
  /** energy_sessions.session_kind */
  sessionKind?: string;
  /** workout_logs.session_id — sert à ouvrir /athlete/log */
  sessionId?: string;
  /** energy_session_assignments.energy_session_id — aperçu */
  energySessionId?: string;
  /** Date d'origine avant un déplacement par l'athlète */
  originalScheduledDate?: string;
  /** L'athlète a décalé cette séance */
  rescheduledByAthlete?: boolean;
  /** Le coach doit être alerté */
  coachAlert?: boolean;
}

export interface TestBrief {
  id: string;
  title: string;
  type: string;
  date: string;
  completed: boolean;
  description: string | null;
  results_note: string | null;
}

/** Compétition posée sur un jour (comme une séance, en tête du jour) */
export interface CompetitionBrief {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string | null;
  priority: "A" | "B" | "C" | null;
  athlete_comment: string | null;
}

export interface WeekDay {
  date: string;   // "YYYY-MM-DD"
  dow: number;    // 0 = lundi … 6 = dimanche
  sessions: WeekSession[];
  tests: TestBrief[];
  competitions: CompetitionBrief[];
  /** Événements de vie couvrant ce jour (vacances, stage, examen…). */
  lifeEvents: LifeEventBrief[];
}

export interface LifeEventBrief {
  id: string;
  title: string;
  kind: string;
  /** L'athlète ne peut pas s'entraîner ce jour-là. */
  unavailable: boolean;
}

/** Cycle terminé (fin < aujourd'hui) — historique côté athlète. */
export interface PastCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  completionPct: number;
  completedLogs: number;
  totalLogs: number;
}

export interface ActivePlanResult {
  mesocycle: ActiveMesocycle | null;
  /** Cycle couvrant aujourd'hui (source = cycles, comme le coach). */
  cycle: ActiveMesocycle | null;
  /** Cycles terminés, du plus récent au plus ancien. */
  pastCycles: PastCycle[];
  weekDays: WeekDay[];
  /** Séances (muscu + énergie) de la semaine affichée */
  weekSessionCount: number;
}

export function localToday(): string {
  return localIsoDay();
}

/** Lundi–dimanche de la semaine d'aujourd'hui, décalée de `weekOffset` semaines. */
export function currentWeekRange(weekOffset = 0): { mondayISO: string; sundayISO: string } {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  const sun = new Date(d);
  sun.setDate(d.getDate() + 6);
  return { mondayISO: localISO(d), sundayISO: localISO(sun) };
}

/** Nombre de semaines entières entre deux jours (au moins 1). */
export function weeksBetween(start: string, end: string): number {
  const ms = new Date(end + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime();
  return Math.max(1, Math.ceil(ms / (7 * 86_400_000)));
}

/** Semaine en cours (1-based) d'une période, bornée à `totalWeeks`. */
export function currentWeekOf(startDate: string, totalWeeks: number): number {
  const today = localToday();
  const ms = new Date(today + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  const week = Math.floor(ms / (7 * 86_400_000)) + 1;
  return Math.min(Math.max(1, week), totalWeeks);
}

/** Avancement 0-100 dans le temps de start → end (borné). */
export function timeProgressPct(startDate: string, endDate: string): number {
  const today = localToday();
  const total = new Date(endDate + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  if (total <= 0) return 100;
  const elapsed = new Date(today + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

async function periodStats(athleteId: string, start: string, end: string) {
  const logs = await listWorkoutLogs({
    athleteIds: [athleteId], from: start, to: end, excludeStatuses: ["skipped"], withMods: false,
  });
  const totalLogs = logs.length;
  const completedLogs = logs.filter((l) => l.status === "completed").length;
  return { totalLogs, completedLogs, totalWeeks: weeksBetween(start, end) };
}

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/**
 * Plan de l'athlète : mésocycle et cycle en cours (avec avancement), cycles
 * terminés, et la semaine affichée (séances muscu + énergie, tests,
 * compétitions) jour par jour.
 */
export async function getActivePlan(athleteId: string, weekOffset = 0): Promise<ActivePlanResult> {
  const today = localToday();
  const { mondayISO, sundayISO } = currentWeekRange(weekOffset);

  // 1-2. Macro → méso en cours
  let mesocycle: ActiveMesocycle | null = null;
  const macro = await getCurrentMacrocycle(athleteId, today);
  if (macro) {
    const meso = await getCurrentMesocycle(macro.id, today);
    if (meso) {
      const { totalLogs, completedLogs, totalWeeks } = await periodStats(athleteId, meso.start_date, meso.end_date);
      mesocycle = {
        id: meso.id,
        name: meso.name,
        objective: meso.objective ?? null,
        startDate: meso.start_date,
        endDate: meso.end_date,
        frequency: meso.frequency ?? null,
        totalWeeks,
        currentWeek: currentWeekOf(meso.start_date, totalWeeks),
        progressPct: timeProgressPct(meso.start_date, meso.end_date),
        completionPct: pct(completedLogs, totalLogs),
        totalLogs,
        completedLogs,
        macroName: macro.name,
        macroId: macro.id,
      };
    }
  }

  // 3. Cycles portant l'athlète (même source que le coach), du plus récent au plus ancien.
  const allCycles = (await listAthleteCycles(athleteId, { direct: true })).reverse();
  const currentCycleRow = allCycles.find((c) => c.start_date <= today && today <= c.end_date) ?? null;
  let cycle: ActiveMesocycle | null = null;
  if (currentCycleRow) {
    const { totalLogs, completedLogs, totalWeeks } = await periodStats(athleteId, currentCycleRow.start_date, currentCycleRow.end_date);
    cycle = {
      id: currentCycleRow.id,
      name: currentCycleRow.name,
      objective: currentCycleRow.objective ?? null,
      startDate: currentCycleRow.start_date,
      endDate: currentCycleRow.end_date,
      frequency: null,
      totalWeeks,
      currentWeek: currentWeekOf(currentCycleRow.start_date, totalWeeks),
      progressPct: timeProgressPct(currentCycleRow.start_date, currentCycleRow.end_date),
      completionPct: pct(completedLogs, totalLogs),
      totalLogs,
      completedLogs,
      macroName: "",
      macroId: "",
    };
  }

  const pastCycles: PastCycle[] = await Promise.all(
    allCycles
      .filter((c) => c.end_date < today)
      .map(async (c) => {
        const { totalLogs, completedLogs, totalWeeks } = await periodStats(athleteId, c.start_date, c.end_date);
        return {
          id: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date,
          totalWeeks, completionPct: pct(completedLogs, totalLogs), completedLogs, totalLogs,
        };
      }),
  );

  // 4. Semaine affichée
  const [wLogs, eAssigns, tSessions, comps, lifeEvents] = await Promise.all([
    listWorkoutLogs({ athleteIds: [athleteId], from: mondayISO, to: sundayISO, excludeStatuses: ["skipped"], withMods: false }),
    listEnergyAssignments({ athleteIds: [athleteId], from: mondayISO, to: sundayISO, join: "summary" }),
    listTestSessionsBetween(athleteId, mondayISO, sundayISO),
    listCompetitions(athleteId),
    listLifeEvents(athleteId),
  ]);

  const byDate = new Map<string, WeekSession[]>();
  const testsByDate = new Map<string, TestBrief[]>();
  const compsByDate = new Map<string, CompetitionBrief[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);

  // Une compétition sur plusieurs jours (`date_end`) apparaît chaque jour de la semaine qu'elle couvre.
  for (const c of comps) {
    const end = String((c as { date_end?: string | null }).date_end ?? c.date).slice(0, 10);
    for (let d = c.date < mondayISO ? mondayISO : c.date; d <= end && d <= sundayISO; d = addDays(d, 1)) {
      push(compsByDate, d, {
        id: c.id, name: c.name, type: c.type, date: c.date, location: c.location ?? null,
        priority: (c.priority ?? null) as CompetitionBrief["priority"], athlete_comment: c.athlete_comment ?? null,
      });
    }
  }
  const lifeByDate = new Map<string, LifeEventBrief[]>();
  for (const le of lifeEvents) {
    const start = String(le.date_start).slice(0, 10);
    const end = String(le.date_end ?? le.date_start).slice(0, 10);
    for (let d = start < mondayISO ? mondayISO : start; d <= end && d <= sundayISO; d = addDays(d, 1)) {
      push(lifeByDate, d, { id: le.id, title: le.title, kind: le.kind ?? "autre", unavailable: le.unavailable !== false });
    }
  }
  for (const t of tSessions) {
    push(testsByDate, t.date, {
      id: t.id, title: t.title, type: t.type, date: t.date, completed: t.completed ?? false,
      description: t.description ?? null, results_note: t.results_note ?? null,
    });
  }
  for (const wl of wLogs) {
    push(byDate, wl.scheduled_date, {
      id: wl.id,
      sessionName: wl.session_name,
      scheduledDate: wl.scheduled_date,
      status: wl.status,
      kind: "workout",
      sessionId: wl.session_id,
      originalScheduledDate: wl.original_scheduled_date ?? undefined,
      rescheduledByAthlete: wl.rescheduled_by_athlete,
      coachAlert: wl.coach_alert,
    });
  }
  for (const ea of eAssigns) {
    const es = (ea as unknown as { energy_sessions?: { name?: string; session_kind?: string } | null }).energy_sessions ?? null;
    push(byDate, ea.scheduled_date, {
      id: ea.id,
      sessionName: es?.name ?? "Séance énergie",
      scheduledDate: ea.scheduled_date,
      status: ea.status,
      kind: "energy",
      sessionKind: es?.session_kind,
      energySessionId: ea.energy_session_id,
    });
  }

  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(mondayISO, i);
    return {
      date: iso, dow: i,
      sessions: byDate.get(iso) ?? [],
      tests: testsByDate.get(iso) ?? [],
      competitions: compsByDate.get(iso) ?? [],
      lifeEvents: lifeByDate.get(iso) ?? [],
    };
  });
  const weekSessionCount = weekDays.reduce((sum, d) => sum + d.sessions.length, 0);

  return { mesocycle, cycle, pastCycles, weekDays, weekSessionCount };
}

// ── Semaine de l'athlète (séances + occurrence) ───────────────────────────────

export type WeekWorkout = WorkoutLog & { occurrence: number };

/**
 * Séances non annulées de la semaine, chacune avec son occurrence (les
 * paramètres multi-semaines en dépendent). Si l'occurrence ne peut pas être
 * lue, l'aperçu prend 1 (la séance elle-même reste affichée).
 */
export async function getWeekWorkouts(athleteId: string, monday: IsoDay, sunday: IsoDay): Promise<WeekWorkout[]> {
  const logs = await listWorkoutLogs({ athleteIds: [athleteId], from: monday, to: sunday, excludeStatuses: ["skipped"] });
  let occ = new Map<string, number>();
  try {
    occ = computeOccurrences(await listSessionOccurrenceLogs(athleteId, logs.map((l) => l.session_id), sunday));
  } catch { /* aperçu : occurrence 1 par défaut */ }
  return logs.map((l) => ({ ...l, occurrence: occ.get(l.id) ?? 1 }));
}

// ── Calendrier unifié ─────────────────────────────────────────────────────────

export type UCEventType = "workout" | "test" | "competition" | "energy" | "free_activity" | "life_event";

export interface UnifiedCalendarEvent {
  id: string;
  type: UCEventType;
  date: string;           // "YYYY-MM-DD"
  title: string;
  status?: string;        // planned | completed | missed | skipped
  rpe?: number | null;
  // Séance muscu
  sessionId?: string;
  rescheduledByAthlete?: boolean;
  coachAlert?: boolean;
  /** Date prévue par le coach avant un déplacement par l'athlète */
  originalScheduledDate?: string;
  // Test
  testType?: string;
  completed?: boolean;
  // Compétition
  priority?: string;
  location?: string;
  // Énergie
  sessionKind?: string;
  energySessionId?: string;
  partial?: boolean;           // des blocs faits, séance non validée
  // Activité libre
  sport?: string;
  sportEmoji?: string;
  duration?: number;
  intensity?: number;
  // Événement de vie
  dateEnd?: string;
  /** Ligne brute, pour les champs non typés */
  raw: Record<string, unknown>;
}

type FreeActivity = {
  id: string; date?: string; name?: string; sport?: string; sportEmoji?: string;
  duration?: number; intensity?: number; completed?: boolean;
};

/**
 * Tous les événements d'un athlète sur une plage : séances (muscu, énergie),
 * tests, compétitions, activités libres (`asp:freesess`), événements de vie
 * (un événement par jour couvert).
 */
export async function getCalendarEvents(
  athleteId: string,
  start: IsoDay,
  end: IsoDay,
): Promise<UnifiedCalendarEvent[]> {
  const [logs, tests, comps, energy, free, lifeEvents] = await Promise.all([
    listWorkoutLogs({ athleteIds: [athleteId], from: start, to: end }),
    listTestSessionsBetween(athleteId, start, end),
    listCompetitions(athleteId),
    listEnergyAssignments({ athleteIds: [athleteId], from: start, to: end, join: "summary" }),
    // Secondaires : une erreur ne doit pas vider tout le calendrier.
    readAppData<FreeActivity[]>(athleteId, "asp:freesess").catch((e) => {
      console.warn("[calendrier] activités libres non chargées", e);
      return { found: false, value: undefined };
    }),
    listLifeEvents(athleteId).catch((e) => {
      console.warn("[calendrier] événements de vie non chargés", e);
      return [];
    }),
  ]);

  const events: UnifiedCalendarEvent[] = [];

  for (const w of logs) {
    events.push({
      id: w.id,
      type: "workout",
      date: w.scheduled_date,
      title: w.session_name,
      status: w.status,
      rpe: w.rpe_score,
      sessionId: w.session_id || undefined,
      rescheduledByAthlete: w.rescheduled_by_athlete,
      coachAlert: w.coach_alert,
      originalScheduledDate: w.original_scheduled_date ?? undefined,
      raw: { ...(w as unknown as Record<string, unknown>), session_id: w.session_id },
    });
  }

  for (const t of tests) {
    events.push({
      id: t.id, type: "test", date: t.date, title: t.title,
      status: t.completed ? "completed" : "planned",
      completed: t.completed, testType: t.type,
      raw: t as unknown as Record<string, unknown>,
    });
  }

  for (const c of comps) {
    if (c.date < start || c.date > end) continue;
    events.push({
      id: c.id, type: "competition", date: c.date, title: c.name,
      priority: c.priority ?? undefined, location: c.location ?? undefined,
      raw: c as unknown as Record<string, unknown>,
    });
  }

  for (const ea of energy) {
    const raw = ea as unknown as Record<string, unknown>;
    const session = raw.energy_sessions as { id: string; name: string; session_kind: string } | null | undefined;
    const blVals = Object.values((ea.block_logs ?? {}) as Record<string, { done?: boolean }>);
    const isPartial = blVals.length > 0 && blVals.some((b) => b?.done) && blVals.some((b) => !b?.done);
    events.push({
      id: ea.id,
      type: "energy",
      date: ea.scheduled_date,
      title: session?.name ?? "Séance énergie",
      status: ea.status ?? "planned",
      rpe: ea.rpe_score ?? null,
      sessionKind: session?.session_kind,
      energySessionId: ea.energy_session_id,
      partial: isPartial,
      raw,
    });
  }

  for (const f of Array.isArray(free.value) ? free.value : []) {
    if (!f?.date || f.date < start || f.date > end) continue;
    events.push({
      id: f.id,
      type: "free_activity",
      date: f.date,
      title: f.name ?? f.sport ?? "Activité libre",
      status: f.completed ? "completed" : "planned",
      sport: f.sport,
      sportEmoji: f.sportEmoji,
      duration: f.duration,
      intensity: f.intensity,
      raw: f as unknown as Record<string, unknown>,
    });
  }

  // Un événement de vie sur plusieurs jours = un événement par jour couvert.
  for (const le of lifeEvents) {
    const from = String(le.date_start).slice(0, 10);
    const to = String(le.date_end ?? le.date_start).slice(0, 10);
    if (from > end || to < start) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d < start || d > end) continue;
      events.push({
        id: le.id + "_" + d,
        type: "life_event",
        date: d,
        title: le.title,
        dateEnd: le.date_end ?? undefined,
        raw: le as unknown as Record<string, unknown>,
      });
    }
  }

  return events;
}

// ── Placement d'une séance de la programmation ────────────────────────────────

/**
 * Pose une séance de la programmation dans le planning. Séance hebdomadaire
 * avec un jour et un cycle : une séance par semaine du cycle non terminée ;
 * sinon une seule séance à `date`. Une séance déjà posée n'est pas touchée.
 */
export async function placeSession(p: {
  session: { id: string; name: string; recurrence?: string; day_of_week?: number };
  athleteId: string;
  coachId: string;
  date: IsoDay;
  cycleId?: string;
  weekNumber?: number;
  today?: IsoDay;
}): Promise<void> {
  const { session } = p;
  const recurring = session.recurrence === "weekly" && session.day_of_week !== undefined && !!p.cycleId;
  if (recurring) {
    const weeks = await listCycleMicrocycles(p.cycleId!);
    if (weeks.length > 0) {
      const today = p.today ?? localIsoDay();
      await planWorkoutsIfAbsent(weeks
        .filter((w) => w.end_date >= today)
        .map((w) => ({
          athleteId: p.athleteId, coachId: p.coachId, sessionId: session.id, sessionName: session.name,
          date: addDays(w.start_date, session.day_of_week ?? 0), microcycleId: w.id,
        })));
      return;
    }
  }
  await planWorkoutsIfAbsent([{
    athleteId: p.athleteId, coachId: p.coachId, sessionId: session.id, sessionName: session.name,
    date: p.date, weekNumber: p.weekNumber ?? null,
  }]);
}
