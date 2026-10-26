import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { supabase } from "@/integrations/supabase/client";
import type { Session, Exercise, AthleteModifications } from "../types/athlete";
import { localISO } from "@/lib/date";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import type { Bloc, ExerciceParams } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";
import { fetchOccurrencesForSessions } from "./useSessionOccurrence";

/** Exercice prévu, lu dans la ProgSession (asp:prog) à l'occurrence du jour. */
export interface SessionPreviewItem {
  id: string;
  name: string;
  mode: "classique" | "methode" | "libre";
  params: ExerciceParams | null;
}

export interface TestSess {
  id: string;
  type: string;
  title: string;
  date: string;
  completed: boolean;
}

export interface DayProgram {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** 0=Mon … 6=Sun */
  dow: number;
  sessions: Array<{
    session: Session;
    exercises: Exercise[];
    isCompleted: boolean;
    workoutLogId?: string;
    /** Exercices de la ProgSession (vide si la séance n'y est pas) */
    items?: SessionPreviewItem[];
  }>;
  tests: TestSess[];
}

/** Format local date as YYYY-MM-DD without UTC conversion. */
/**
 * Returns the 7-day programme for a given ISO week start (Monday).
 * Falls back to current week if weekStart is null.
 *
 * Primary source: workout_logs (created by coach when assigning a cycle).
 * Fallback: day_of_week sessions from app_data (legacy).
 */
export function useWeekProgram(weekStart: string | null): DayProgram[] {
  const { sessions, exos, completedSessions, currentWeek, blockConfig, testSessions, athleteId } =
    useAthleteContext();

  // Compute week boundaries
  const { monday, sundayISO, mondayISO } = useMemo(() => {
    const d = weekStart ? new Date(weekStart + "T12:00:00") : new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    const mon = new Date(d);
    const sun = new Date(d);
    sun.setDate(d.getDate() + 6);
    return { monday: mon, mondayISO: localISO(mon), sundayISO: localISO(sun) };
  }, [weekStart]);

  // Fetch workout_logs for this week from Supabase
  const { data: workoutLogs = [] } = useQuery({
    queryKey: ["workout-logs-week", athleteId, mondayISO],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select("id, session_id, session_name, scheduled_date, status, athlete_modifications")
        .eq("athlete_id", athleteId)
        .neq("status", "skipped")
        .gte("scheduled_date", mondayISO)
        .lte("scheduled_date", sundayISO);
      const logs = data ?? [];
      // Occurrence de chaque log : les params multi-semaines en dépendent
      let occ = new Map<string, number>();
      try {
        occ = await fetchOccurrencesForSessions(athleteId!, logs.map((l) => l.session_id), sundayISO);
      } catch { /* aperçu : occurrence 1 par défaut */ }
      return logs.map((l) => ({ ...l, occurrence: occ.get(l.id) ?? 1 }));
    },
  });

  const { data: progSessions = [] } = useProgrammation(athleteId ?? undefined);

  return useMemo(() => {
    // Index workout_logs by date
    const logsByDate = new Map<string, typeof workoutLogs>();
    for (const wl of workoutLogs) {
      const arr = logsByDate.get(wl.scheduled_date) ?? [];
      arr.push(wl);
      logsByDate.set(wl.scheduled_date, arr);
    }

    const hasWorkoutLogs = workoutLogs.length > 0;

    // Compute block week for legacy completed check
    let blockWeek = currentWeek;
    if (blockConfig?.startDate) {
      const tw = blockConfig.totalWeeks || 6;
      const refMonday = (() => {
        const d = new Date(blockConfig.startDate + "T12:00:00");
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        d.setHours(0, 0, 0, 0);
        return d;
      })();
      const days = Math.floor((monday.getTime() - refMonday.getTime()) / 86400000);
      blockWeek = Math.min(Math.max(1, Math.floor(days / 7) + 1), tw);
    }
    const doneThisWeek = new Set(completedSessions[blockWeek] ?? []);

    return Array.from({ length: 7 }, (_, i) => {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);
      const dow = i; // 0=Mon … 6=Sun
      const isoDate = localISO(dayDate);

      let daySessions: DayProgram["sessions"];

      if (hasWorkoutLogs) {
        // Primary path: sessions from workout_logs
        const logsForDay = logsByDate.get(isoDate) ?? [];
        daySessions = logsForDay
          .map((wl) => {
            const exercises: Exercise[] = exos[wl.session_id] ?? [];
            // Look up full session object or build minimal one
            const session: Session = sessions.find((s) => s.id === wl.session_id) ?? {
              id: wl.session_id,
              name: wl.session_name,
              short: wl.session_name.slice(0, 3).toUpperCase(),
              day_of_week: dow,
            };
            // Exercices : ProgSession (ou adaptation du coach pour ce jour)
            const prog = progSessions.find((p) => p.id === wl.session_id);
            const ovr = (wl.athlete_modifications as AthleteModifications | null)?.coachOverride?.blocs as Bloc[] | undefined;
            const blocs: Bloc[] = ovr?.length ? ovr : prog?.blocs ?? [];
            const items: SessionPreviewItem[] = blocs.flatMap((b) => b.exercices.map((ex) => ({
              id: ex.id,
              name: ex.exercise_name,
              mode: ex.mode,
              params: ex.mode === "libre" ? null : resolveExerciceParams(ex.params, wl.occurrence),
            })));
            return {
              session,
              exercises,
              isCompleted: wl.status === "completed",
              workoutLogId: wl.id,
              items,
            };
          });
      } else {
        // No workout_logs for this week — nothing to show (legacy fallback removed)
        daySessions = [];
      }

      const dayTests = (testSessions as TestSess[]).filter((t) => t.date === isoDate);

      return { date: isoDate, dow, sessions: daySessions, tests: dayTests };
    });
  }, [sessions, exos, completedSessions, currentWeek, blockConfig, monday, testSessions, workoutLogs, progSessions]);
}
