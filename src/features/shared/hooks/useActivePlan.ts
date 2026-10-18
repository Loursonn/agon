/**
 * useActivePlan — fetches the current mesocycle + full current week schedule.
 *
 * Data path:
 *   macrocycles (athlete_id, today in [start_date, end_date])
 *     → mesocycles (macrocycle_id, today in [start_date, end_date])
 *       → workout_logs (mesocycle stats)
 *   + workout_logs (current week, all statuses)
 *   + energy_session_assignments (current week, all statuses)
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { localISO } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveMesocycle {
  id: string;
  name: string;
  objective: string | null;
  startDate: string;
  endDate: string;
  frequency: number | null;
  totalWeeks: number;
  currentWeek: number;
  /** 0-100, time-based progress through the mesocycle */
  progressPct: number;
  /** 0-100, completed logs / total non-skipped logs */
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
  /** workout_logs.session_id — used to build initialSess for /athlete/log */
  sessionId?: string;
  /** energy_session_assignments.energy_session_id — used to open preview */
  energySessionId?: string;
  /** Date originale avant reschedule athlète */
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
  date: string;   // ISO yyyy-MM-dd
  dow: number;    // 0=Mon … 6=Sun
  sessions: WeekSession[];
  tests: TestBrief[];
  competitions: CompetitionBrief[];
}

/** Cycle terminé (fin < aujourd'hui) — pour l'historique côté athlète. */
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
  /** Cycle couvrant aujourd'hui (source de vérité = cycles DB, comme le coach). */
  cycle: ActiveMesocycle | null;
  /** Cycles déjà terminés, du plus récent au plus ancien. */
  pastCycles: PastCycle[];
  weekDays: WeekDay[];
  /** Total planned sessions (workout + energy) in the current week */
  weekSessionCount: number;
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns Mon–Sun ISO range for the week containing today, shifted by `weekOffset` weeks. */
export function currentWeekRange(weekOffset = 0): { mondayISO: string; sundayISO: string } {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  const sun = new Date(d);
  sun.setDate(d.getDate() + 6);
  return { mondayISO: localISO(d), sundayISO: localISO(sun) };
}

/** Number of full weeks between two ISO date strings (minimum 1). */
export function weeksBetween(start: string, end: string): number {
  const ms = new Date(end + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime();
  return Math.max(1, Math.ceil(ms / (7 * 86_400_000)));
}

/** 1-indexed week number for today within a mesocycle (clamped to totalWeeks). */
export function currentWeekOf(startDate: string, totalWeeks: number): number {
  const today = localToday();
  const ms = new Date(today + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  const week = Math.floor(ms / (7 * 86_400_000)) + 1;
  return Math.min(Math.max(1, week), totalWeeks);
}

/** 0-100 time-based progress through start→end (clamped). */
export function timeProgressPct(startDate: string, endDate: string): number {
  const today = localToday();
  const total = new Date(endDate + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  if (total <= 0) return 100;
  const elapsed = new Date(today + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useActivePlan(athleteId: string, weekOffset = 0) {
  return useQuery({
    queryKey: [...QK.activePlan(athleteId), weekOffset],
    enabled: !!athleteId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ActivePlanResult> => {
      const today = localToday();
      const { mondayISO, sundayISO } = currentWeekRange(weekOffset);

      // ── 1. Active macrocycle ───────────────────────────────────────────────
      const { data: macros } = await supabase
        .from("macrocycles")
        .select("id, name, start_date, end_date")
        .eq("athlete_id", athleteId)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1);

      const macro = macros?.[0] ?? null;
      let mesocycle: ActiveMesocycle | null = null;

      if (macro) {
        // ── 2. Active mesocycle ──────────────────────────────────────────────
        const { data: mesos } = await supabase
          .from("mesocycles")
          .select("id, name, objective, start_date, end_date, frequency")
          .eq("macrocycle_id", macro.id)
          .lte("start_date", today)
          .gte("end_date", today)
          .order("start_date", { ascending: false })
          .limit(1);

        const meso = mesos?.[0] ?? null;

        if (meso) {
          // ── 3. Completion stats across full mesocycle ──────────────────────
          const { data: mesoLogs } = await supabase
            .from("workout_logs")
            .select("status")
            .eq("athlete_id", athleteId)
            .neq("status", "skipped")
            .gte("scheduled_date", meso.start_date)
            .lte("scheduled_date", meso.end_date);

          const totalLogs = mesoLogs?.length ?? 0;
          const completedLogs = mesoLogs?.filter((l) => l.status === "completed").length ?? 0;
          const totalWeeks = weeksBetween(meso.start_date, meso.end_date);

          mesocycle = {
            id:           meso.id,
            name:         meso.name,
            objective:    meso.objective,
            startDate:    meso.start_date,
            endDate:      meso.end_date,
            frequency:    meso.frequency,
            totalWeeks,
            currentWeek:  currentWeekOf(meso.start_date, totalWeeks),
            progressPct:  timeProgressPct(meso.start_date, meso.end_date),
            completionPct: totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : 0,
            totalLogs,
            completedLogs,
            macroName:    macro.name,
            macroId:      macro.id,
          };
        }
      }

      // ── 3bis. Cycles de l'athlète (même source que le coach) ───────────────
      // Cycle actif = celui qui couvre aujourd'hui ; sinon « aucun cycle en cours ».
      const { data: cyclesRows } = await supabase
        .from("cycles")
        .select("id, name, objective, start_date, end_date")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false });
      const allCycles = cyclesRows ?? [];

      async function cycleStats(c: { start_date: string; end_date: string }) {
        const { data: logs } = await supabase
          .from("workout_logs")
          .select("status")
          .eq("athlete_id", athleteId)
          .neq("status", "skipped")
          .gte("scheduled_date", c.start_date)
          .lte("scheduled_date", c.end_date);
        const totalLogs = logs?.length ?? 0;
        const completedLogs = logs?.filter((l) => l.status === "completed").length ?? 0;
        return { totalLogs, completedLogs, totalWeeks: weeksBetween(c.start_date, c.end_date) };
      }

      const currentCycleRow = allCycles.find((c) => c.start_date <= today && today <= c.end_date) ?? null;
      let cycle: ActiveMesocycle | null = null;
      if (currentCycleRow) {
        const { totalLogs, completedLogs, totalWeeks } = await cycleStats(currentCycleRow);
        cycle = {
          id:            currentCycleRow.id,
          name:          currentCycleRow.name,
          objective:     currentCycleRow.objective ?? null,
          startDate:     currentCycleRow.start_date,
          endDate:       currentCycleRow.end_date,
          frequency:     null,
          totalWeeks,
          currentWeek:   currentWeekOf(currentCycleRow.start_date, totalWeeks),
          progressPct:   timeProgressPct(currentCycleRow.start_date, currentCycleRow.end_date),
          completionPct: totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : 0,
          totalLogs,
          completedLogs,
          macroName:     "",
          macroId:       "",
        };
      }

      const pastCycles: PastCycle[] = await Promise.all(
        allCycles
          .filter((c) => c.end_date < today)
          .map(async (c) => {
            const { totalLogs, completedLogs, totalWeeks } = await cycleStats(c);
            return {
              id:            c.id,
              name:          c.name,
              startDate:     c.start_date,
              endDate:       c.end_date,
              totalWeeks,
              completionPct: totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : 0,
              completedLogs,
              totalLogs,
            };
          }),
      );

      // ── 4. Current week: workout_logs + energy_assignments + tests (parallel) ─
      const [{ data: wLogs }, { data: eAssigns }, { data: tSessions }, { data: comps }] = await Promise.all([
        supabase
          .from("workout_logs")
          .select("id, session_id, session_name, scheduled_date, status, original_scheduled_date, rescheduled_by_athlete, coach_alert")
          .eq("athlete_id", athleteId)
          .neq("status", "skipped")
          .gte("scheduled_date", mondayISO)
          .lte("scheduled_date", sundayISO)
          .order("scheduled_date"),

        supabase
          .from("energy_session_assignments")
          .select("id, scheduled_date, status, energy_session_id, energy_sessions(name, session_kind)")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", mondayISO)
          .lte("scheduled_date", sundayISO)
          .order("scheduled_date"),

        supabase
          .from("test_sessions")
          .select("id, title, type, date, completed, description, results_note")
          .eq("athlete_id", athleteId)
          .gte("date", mondayISO)
          .lte("date", sundayISO)
          .order("date"),

        supabase
          .from("competitions")
          .select("id, name, type, date, location, priority, athlete_comment")
          .eq("athlete_id", athleteId)
          .gte("date", mondayISO)
          .lte("date", sundayISO)
          .order("date"),
      ]);

      // ── 5. Build sessions + tests by date ─────────────────────────────────
      const byDate = new Map<string, WeekSession[]>();
      const testsByDate = new Map<string, TestBrief[]>();
      const compsByDate = new Map<string, CompetitionBrief[]>();

      for (const c of (comps ?? []) as CompetitionBrief[]) {
        compsByDate.set(c.date, [...(compsByDate.get(c.date) ?? []), c]);
      }

      for (const t of tSessions ?? []) {
        const arr = testsByDate.get(t.date) ?? [];
        arr.push({
          id:           t.id,
          title:        t.title,
          type:         t.type,
          date:         t.date,
          completed:    t.completed ?? false,
          description:  (t as Record<string, unknown>).description as string | null ?? null,
          results_note: (t as Record<string, unknown>).results_note as string | null ?? null,
        });
        testsByDate.set(t.date, arr);
      }

      for (const wl of wLogs ?? []) {
        const arr = byDate.get(wl.scheduled_date) ?? [];
        arr.push({
          id:                    wl.id,
          sessionName:           wl.session_name,
          scheduledDate:         wl.scheduled_date,
          status:                wl.status,
          kind:                  "workout",
          sessionId:             wl.session_id,
          originalScheduledDate: (wl as { original_scheduled_date?: string }).original_scheduled_date,
          rescheduledByAthlete:  (wl as { rescheduled_by_athlete?: boolean }).rescheduled_by_athlete ?? false,
          coachAlert:            (wl as { coach_alert?: boolean }).coach_alert ?? false,
        });
        byDate.set(wl.scheduled_date, arr);
      }

      for (const ea of eAssigns ?? []) {
        const es = (ea as Record<string, unknown>).energy_sessions as
          | { name: string; session_kind: string } | null;
        const arr = byDate.get(ea.scheduled_date) ?? [];
        arr.push({
          id:              ea.id,
          sessionName:     es?.name ?? "Séance énergie",
          scheduledDate:   ea.scheduled_date,
          status:          ea.status,
          kind:            "energy",
          sessionKind:     es?.session_kind,
          energySessionId: ea.energy_session_id,
        });
        byDate.set(ea.scheduled_date, arr);
      }

      // ── 6. Build weekDays array (Mon → Sun) ────────────────────────────────
      const monDate = new Date(mondayISO + "T12:00:00");
      const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monDate);
        d.setDate(monDate.getDate() + i);
        const iso = localISO(d);
        return {
          date: iso, dow: i,
          sessions: byDate.get(iso) ?? [],
          tests: testsByDate.get(iso) ?? [],
          competitions: compsByDate.get(iso) ?? [],
        };
      });

      // ── 7. Week session count (planned + completed, all types) ────────────
      const weekSessionCount = weekDays.reduce((sum, day) => sum + day.sessions.length, 0);

      return { mesocycle, cycle, pastCycles, weekDays, weekSessionCount };
    },
  });
}
