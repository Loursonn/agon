/**
 * Retours sur une période (mois, cycle) : agrégats par semaine civile et
 * évolution des exercices. Pur, testable.
 */
import type { DailyData, EnergySessionDetail, TestDetail, WorkoutDetail } from "@/features/shared/types/retours.types";

const DAY_MS = 86_400_000;

const parse = (d: string) => new Date(`${d}T12:00:00`);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function mondayOfIso(d: string): string {
  const x = parse(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
}

export function addDaysIso(d: string, n: number): string {
  return iso(new Date(parse(d).getTime() + n * DAY_MS));
}

/** Lundis des semaines qui touchent [from, to]. */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = mondayOfIso(from); m <= to; m = addDaysIso(m, 7)) out.push(m);
  return out;
}

export interface PeriodData {
  workouts: WorkoutDetail[];
  energy_sessions: EnergySessionDetail[];
  daily_data: Record<string, DailyData>;
  test_sessions?: TestDetail[];
}

export interface WeekStats {
  monday: string;
  sessionsDone: number;
  sessionsTotal: number;
  setsDone: number;
  setsPlanned: number;
  km: number;
  watchKm: number;
  rpeAvg: number | null;
  /** Charge interne : RPE × durée (min), séances terminées. */
  load: number;
  wellness: number | null;
  sommeil: number | null;
  fatigue: number | null;
  /** Douleur la plus haute déclarée dans la semaine (0-10), null si aucune. */
  pain: number | null;
}

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

const done = (status: string) => status === "completed";
const counted = (status: string) => status !== "skipped";

export function weekStats(
  weeks: readonly string[],
  data: PeriodData,
  runSummary: (start: string, end: string) => { km: number; watchKm: number },
): WeekStats[] {
  return weeks.map((monday) => {
    const sunday = addDaysIso(monday, 6);
    const inWeek = (d: string) => d >= monday && d <= sunday;
    const w = data.workouts.filter((x) => inWeek(x.scheduled_date) && counted(x.status));
    const e = data.energy_sessions.filter((x) => inWeek(x.date) && counted(x.status));
    const wDone = w.filter((x) => done(x.status));
    const eDone = e.filter((x) => x.completed);

    const setsPlanned = w.reduce((s, x) => s + x.planned_exercises.reduce((a, p) => a + (p.sets || 0), 0), 0);
    const setsDone = wDone.reduce((s, x) => s + x.performed_exercises.reduce((a, p) => a + p.sets.filter((st) => st.done).length, 0), 0);

    const rpes = [...wDone.map((x) => x.rpe_score), ...eDone.map((x) => x.rpe_score)];
    const load = Math.round(
      wDone.reduce((s, x) => s + (x.rpe_score ?? 0) * ((x.duration_s ?? 0) / 60), 0)
      + eDone.reduce((s, x) => s + (x.rpe_score ?? 0) * (x.actual_duration_min ?? x.duration_min ?? 0), 0),
    );

    const days = Object.values(data.daily_data).filter((d) => inWeek(d.date) && d.wellness);
    const pains = days.map((d) => d.wellness!.pain).filter((p): p is number => p != null && p > 0);
    const { km, watchKm } = runSummary(monday, sunday);

    return {
      monday,
      sessionsDone: wDone.length + eDone.length,
      sessionsTotal: w.length + e.length,
      setsDone, setsPlanned,
      km: Math.round(km * 10) / 10,
      watchKm: Math.round(watchKm * 10) / 10,
      rpeAvg: avg(rpes),
      load,
      wellness: avg(days.map((d) => d.wellness!.score)),
      sommeil: avg(days.map((d) => d.wellness!.sommeil)),
      fatigue: avg(days.map((d) => d.wellness!.fatigue)),
      pain: pains.length ? Math.max(...pains) : null,
    };
  });
}

// ── Évolution des exercices ──────────────────────────────────────────────────

export interface ExerciseTrend {
  name: string;
  /** Meilleur 1RM estimé (Epley) par lundi de semaine ; null si non fait. */
  points: { monday: string; e1rm: number | null; best: string | null }[];
  first: number;
  last: number;
  /** Variation en % entre la première et la dernière semaine mesurées. */
  deltaPct: number;
}

const epley = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

/** Exercices chargés les plus suivis (au moins 2 semaines), 1RM estimé semaine par semaine. */
export function exerciseTrends(weeks: readonly string[], workouts: readonly WorkoutDetail[], limit = 3): ExerciseTrend[] {
  const byEx = new Map<string, Map<string, { e1rm: number; best: string }>>();
  for (const w of workouts) {
    if (!done(w.status)) continue;
    const monday = mondayOfIso(w.scheduled_date);
    if (!weeks.includes(monday)) continue;
    for (const ex of w.performed_exercises) {
      for (const s of ex.sets) {
        if (!s.done || !s.kg || !s.reps || s.kg <= 0 || s.reps <= 0 || s.reps > 15) continue;
        const v = epley(s.kg, s.reps);
        const name = ex.exercise_name.trim();
        if (!name) continue;
        const m = byEx.get(name) ?? new Map();
        const cur = m.get(monday);
        if (!cur || v > cur.e1rm) m.set(monday, { e1rm: v, best: `${s.reps} × ${s.kg} kg` });
        byEx.set(name, m);
      }
    }
  }
  const trends: ExerciseTrend[] = [];
  for (const [name, m] of byEx) {
    if (m.size < 2) continue;
    const points = weeks.map((monday) => {
      const p = m.get(monday);
      return { monday, e1rm: p ? Math.round(p.e1rm * 10) / 10 : null, best: p?.best ?? null };
    });
    const vals = points.filter((p) => p.e1rm != null).map((p) => p.e1rm!);
    const first = vals[0];
    const last = vals[vals.length - 1];
    trends.push({ name, points, first, last, deltaPct: Math.round(((last - first) / first) * 1000) / 10 });
  }
  return trends.sort((a, b) => b.points.filter((p) => p.e1rm).length - a.points.filter((p) => p.e1rm).length || b.last - a.last).slice(0, limit);
}

/** Tests passés dans la période, du plus ancien au plus récent. */
export function testsInPeriod(tests: readonly TestDetail[] | undefined, from: string, to: string): TestDetail[] {
  return (tests ?? []).filter((t) => t.completed && t.date >= from && t.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}
