/**
 * useUnifiedCalendar — single source of truth for all calendar data.
 *
 * Replaces useCalendarEvents (month-scoped) and the inner queries of
 * useWeekSchedule (week-scoped). All mutations invalidate the same
 * partial key ["cal", athleteId] so every active range refetches automatically.
 *
 * Views manage their own date-range; the hook is just a typed Supabase fetch.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Exercise, WeekConfig } from "@/features/shared/types/athlete";
import { syncDocAssignmentsFromEnergy } from "./fiches/syncDocAssignments";
import { QK } from "@/lib/queryKeys";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UCEventType = "workout" | "test" | "competition" | "energy" | "free_activity" | "life_event";

export interface UnifiedCalendarEvent {
  id: string;
  type: UCEventType;
  date: string;           // ISO yyyy-MM-dd
  title: string;
  status?: string;        // planned | completed | missed | skipped
  rpe?: number | null;
  // Workout-specific
  sessionId?: string;          // workout_logs.session_id
  exercises?: Exercise[];      // populated only when includeExercises = true
  rescheduledByAthlete?: boolean;
  coachAlert?: boolean;
  /** Date prévue par le coach avant un déplacement par l'athlète */
  originalScheduledDate?: string;
  // Test-specific
  testType?: string;
  completed?: boolean;
  // Competition-specific
  priority?: string;
  location?: string;
  // Energy-specific
  sessionKind?: string;        // vo2 | tempo | seuil | footing | fartlek | autre | custom
  energySessionId?: string;    // energy_sessions.id
  partial?: boolean;           // some blocks done but not completed
  // Free activity-specific
  sport?: string;
  sportEmoji?: string;
  duration?: number;
  intensity?: number;
  // Life event-specific
  dateEnd?: string;             // multi-day life events
  /** Raw DB row for fields not promoted to typed fields */
  raw: Record<string, unknown>;
}

// ── Query key helpers ─────────────────────────────────────────────────────────

/** Partial key — used by mutations to invalidate ALL ranges for an athlete. */
export const calBaseKey = (athleteId: string) => QK.cal(athleteId);

/** Full key for a specific range query. */
export const calRangeKey = (athleteId: string, start: string, end: string) =>
  ["cal", athleteId, start, end] as const;

// ── Main hook ─────────────────────────────────────────────────────────────────

export interface UseUnifiedCalendarOptions {
  /** Also fetch session_exercises → exercises for workout events. Default: false. */
  includeExercises?: boolean;
  staleTime?: number;
}

export function useUnifiedCalendar(
  athleteId: string,
  range: { start: string; end: string },
  options: UseUnifiedCalendarOptions = {},
) {
  const { includeExercises = false, staleTime = 30_000 } = options;
  const { start, end } = range;

  return useQuery({
    queryKey: calRangeKey(athleteId, start, end),
    enabled: !!athleteId && !!start && !!end,
    staleTime,
    queryFn: async (): Promise<UnifiedCalendarEvent[]> => {
      // ── 1. Parallel fetch: workouts + tests + competitions + energy + free + life events ─
      const [wRes, tRes, cRes, eRes, fRes, leRes] = await Promise.all([
        supabase
          .from("workout_logs")
          .select("id, session_id, session_name, scheduled_date, status, rpe_score, athlete_modifications, rescheduled_by_athlete, coach_alert, original_scheduled_date, week_number")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", start)
          .lte("scheduled_date", end)
          .order("scheduled_date"),

        supabase
          .from("test_sessions")
          .select("id, title, date, completed, type")
          .eq("athlete_id", athleteId)
          .gte("date", start)
          .lte("date", end)
          .order("date"),

        supabase
          .from("competitions")
          .select("id, coach_id, athlete_id, name, type, date, priority, location, notes, athlete_comment")
          .eq("athlete_id", athleteId)
          .gte("date", start)
          .lte("date", end)
          .order("date"),

        supabase
          .from("energy_session_assignments")
          .select("id, athlete_id, energy_session_id, scheduled_date, status, notes, rpe_score, block_logs, energy_sessions(id, name, session_kind)")
          .eq("athlete_id", athleteId)
          .gte("scheduled_date", start)
          .lte("scheduled_date", end)
          .order("scheduled_date"),

        supabase
          .from("app_data")
          .select("value")
          .eq("athlete_id", athleteId)
          .eq("key", "asp:freesess")
          .maybeSingle(),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("athlete_life_events")
          .select("id, athlete_id, date_start, date_end, title")
          .eq("athlete_id", athleteId)
          .lte("date_start", end)
          .gte("date_end", start)
          .order("date_start"),
      ]);

      const logs         = wRes.data ?? [];
      const tests        = tRes.data ?? [];
      const comps        = cRes.data ?? [];
      const energyAssign = eRes.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allFree: any[] = (fRes.data as any)?.value ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lifeEvents: any[] = leRes.data ?? [];

      // ── 2. Optionally fetch exercises ──────────────────────────────────────
      const exercisesBySession: Record<string, Exercise[]> = {};

      if (includeExercises && logs.length > 0) {
        const sessionIds = [
          ...new Set(logs.map((l) => l.session_id).filter((id): id is string => !!id)),
        ];
        if (sessionIds.length > 0) {
          const { data: seData } = await supabase
            .from("session_exercises")
            .select("session_id, exercise_id, order, weeks_config, exercises(id, name, bloc, target, ex_type)")
            .in("session_id", sessionIds)
            .order("order");

          for (const se of seData ?? []) {
            const ex = se.exercises as {
              id: string; name: string; bloc?: string; target?: string; ex_type?: string;
            } | null;
            if (!ex) continue;
            const mapped: Exercise = {
              id: se.exercise_id,
              name: ex.name,
              bloc: ex.bloc ?? undefined,
              target: ex.target ?? undefined,
              exType: ex.ex_type ?? undefined,
              weeks: (se.weeks_config as Record<number, WeekConfig>) ?? {},
            };
            (exercisesBySession[se.session_id] ??= []).push(mapped);
          }
        }
      }

      // ── 3. Build typed events ──────────────────────────────────────────────
      const events: UnifiedCalendarEvent[] = [];

      for (const w of logs) {
        const rpe = (w as Record<string, unknown>).rpe_score as number | null ?? null;
        events.push({
          id:                   w.id,
          type:                 "workout",
          date:                 w.scheduled_date,
          title:                w.session_name,
          status:               w.status,
          rpe,
          sessionId:            w.session_id ?? undefined,
          exercises:            includeExercises ? (exercisesBySession[w.session_id ?? ""] ?? []) : undefined,
          rescheduledByAthlete: w.rescheduled_by_athlete ?? false,
          coachAlert:           w.coach_alert ?? false,
          originalScheduledDate: w.original_scheduled_date ?? undefined,
          raw:                  { ...(w as Record<string, unknown>), session_id: w.session_id },
        });
      }

      for (const t of tests) {
        events.push({
          id:        t.id,
          type:      "test",
          date:      t.date,
          title:     t.title,
          status:    t.completed ? "completed" : "planned",
          completed: t.completed,
          testType:  t.type,
          raw:       t as Record<string, unknown>,
        });
      }

      for (const c of comps) {
        events.push({
          id:       c.id,
          type:     "competition",
          date:     c.date,
          title:    c.name,
          priority: c.priority ?? undefined,
          location: c.location ?? undefined,
          raw:      c as Record<string, unknown>,
        });
      }

      for (const ea of energyAssign) {
        const session = (ea as Record<string, unknown>).energy_sessions as {
          id: string; name: string; session_kind: string;
        } | null;
        const blockLogs = (ea as Record<string, unknown>).block_logs as Record<string, { done: boolean }> | null;
        const blVals = blockLogs ? Object.values(blockLogs) : [];
        const isPartial = blVals.length > 0
          && blVals.some((b) => b.done)
          && blVals.some((b) => !b.done);
        events.push({
          id:              ea.id,
          type:            "energy",
          date:            ea.scheduled_date,
          title:           session?.name ?? "Séance énergie",
          status:          ea.status ?? "planned",
          rpe:             (ea as Record<string, unknown>).rpe_score as number | null ?? null,
          sessionKind:     session?.session_kind,
          energySessionId: ea.energy_session_id,
          partial:         isPartial,
          raw:             ea as Record<string, unknown>,
        });
      }

      for (const f of allFree) {
        if (!f.date || f.date < start || f.date > end) continue;
        events.push({
          id:          f.id,
          type:        "free_activity",
          date:        f.date,
          title:       f.name ?? f.sport ?? "Activité libre",
          status:      f.completed ? "completed" : "planned",
          sport:       f.sport,
          sportEmoji:  f.sportEmoji,
          duration:    f.duration,
          intensity:   f.intensity,
          raw:         f as Record<string, unknown>,
        });
      }

      // Expand multi-day life events into one event per day
      for (const le of lifeEvents) {
        // Midi local + date locale : toISOString() sur minuit local décale
        // d'un jour en UTC+1/+2
        const ds = new Date(le.date_start + "T12:00:00");
        const de = new Date((le.date_end ?? le.date_start) + "T12:00:00");
        for (let d = new Date(ds); d <= de; d.setDate(d.getDate() + 1)) {
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (iso < start || iso > end) continue;
          events.push({
            id:      le.id + "_" + iso,
            type:    "life_event",
            date:    iso,
            title:   le.title,
            dateEnd: le.date_end,
            raw:     le as Record<string, unknown>,
          });
        }
      }

      return events;
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAssignWorkout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      sessionName,
      athleteId,
      coachId,
      date,
      weekNumber,
    }: {
      sessionId: string;
      sessionName: string;
      athleteId: string;
      coachId: string;
      date: string;
      weekNumber?: number;
    }) => {
      const { error } = await supabase.from("workout_logs").insert({
        athlete_id:            athleteId,
        coach_id:              coachId,
        session_id:            sessionId,
        session_name:          sessionName,
        scheduled_date:        date,
        original_scheduled_date: date,
        status:                "planned",
        ...(weekNumber != null ? { week_number: weekNumber } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["activePlan", vars.athleteId] });
      toast.success("Séance ajoutée");
    },
    onError: () => toast.error("Erreur lors de l'ajout"),
  });
}

export function useCreateTestSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      athleteId,
      coachId,
      title,
      type,
      date,
    }: {
      athleteId: string;
      coachId: string;
      title: string;
      type: string;
      date: string;
    }) => {
      const { error } = await supabase.from("test_sessions").insert({
        athlete_id: athleteId,
        coach_id:   coachId,
        title,
        type,
        date,
        completed:  false,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      toast.success("Test créé");
    },
    onError: () => toast.error("Erreur lors de la création"),
  });
}

export function useRescheduleTestSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, date, athleteId }: { id: string; date: string; athleteId: string }) => {
      const { error } = await supabase
        .from("test_sessions")
        .update({ date })
        .eq("id", id);
      if (error) throw error;
      return athleteId;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      toast.success("Test déplacé");
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      type,
      athleteId,
      coachId,
      sessionId,
      sessionName,
      date,
      status,
    }: {
      id: string;
      type: UCEventType;
      athleteId: string;
      coachId?: string;
      sessionId?: string;
      sessionName?: string;
      date?: string;
      status?: string;
    }) => {
      if (type === "competition" || type === "free_activity") return;

      // Energy session assignment: hard delete
      if (type === "energy") {
        const { error } = await supabase.from("energy_session_assignments").delete().eq("id", id);
        if (error) throw error;
        void syncDocAssignmentsFromEnergy(athleteId);
        return;
      }

      // Projected block-plan workout
      if (type === "workout" && id.startsWith("block-") && sessionId && date) {
        // Past or future: a skipped log suppresses this single occurrence of the
        // recurring session (same mechanism as moving it to another day)
        const { error } = await supabase.from("workout_logs").upsert({
          athlete_id:     athleteId,
          coach_id:       coachId ?? null,
          session_id:     sessionId,
          session_name:   sessionName ?? "Séance",
          scheduled_date: date,
          status:         "skipped",
        }, { onConflict: "athlete_id,session_id,scheduled_date" });
        if (error) throw error;
        return;
      }

      if (type === "workout") {
        if (status === "completed") {
          // Séance validée : hard delete pour pouvoir supprimer les doublons
          const { error } = await supabase.from("workout_logs").delete().eq("id", id);
          if (error) throw error;
        } else {
          // Past or future real log: mark skipped. A hard delete would let the
          // recurring projection reappear on the same day.
          const { error } = await supabase.from("workout_logs")
            .update({ status: "skipped" }).eq("id", id);
          if (error) throw error;
        }
        return;
      }

      const { error } = await supabase.from("test_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", vars.athleteId] });
      toast.success("Supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

export function useRescheduleWorkout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      event,
      newDate,
      athleteId,
      coachId,
    }: {
      event: CalEvent;
      newDate: string;
      athleteId: string;
      coachId: string;
    }) => {
      const sessionId   = event.raw?.session_id as string | undefined;
      const sessionName = event.title;
      const isProjected = event.raw?.source === "block_plan";

      if (!sessionId) return;

      // 1. Mark old slot as skipped
      if (isProjected) {
        const { error } = await supabase.from("workout_logs").insert({
          athlete_id:     athleteId,
          coach_id:       coachId,
          session_id:     sessionId,
          session_name:   sessionName,
          scheduled_date: event.date,
          status:         "skipped",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workout_logs")
          .update({ status: "skipped" }).eq("id", event.id);
        if (error) throw error;
      }

      // 2. Create / update planned log on new date
      const { error } = await supabase.from("workout_logs").upsert({
        athlete_id:     athleteId,
        coach_id:       coachId,
        session_id:     sessionId,
        session_name:   sessionName,
        scheduled_date: newDate,
        status:         "planned",
      }, { onConflict: "athlete_id,session_id,scheduled_date" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: calBaseKey(vars.athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["activePlan", vars.athleteId] });
      toast.success("Séance déplacée");
    },
    onError: () => toast.error("Erreur lors du déplacement"),
  });
}

// ── Compat adapter: map UnifiedCalendarEvent → CalEvent ──────────────────────
// Allows gradual migration of components still typed against CalEvent.

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  type: UCEventType;
  status?: string;
  rpe?: number | null;
  sessionKind?: string;
  energySessionId?: string;
  partial?: boolean;
  sport?: string;
  sportEmoji?: string;
  duration?: number;
  intensity?: number;
  dateEnd?: string;
  rescheduledByAthlete?: boolean;
  coachAlert?: boolean;
  originalScheduledDate?: string;
  raw: Record<string, unknown>;
}

export function toCalEvent(e: UnifiedCalendarEvent): CalEvent {
  return {
    id:              e.id,
    title:           e.title,
    date:            e.date,
    type:            e.type,
    status:          e.status,
    rpe:             e.rpe,
    sessionKind:     e.sessionKind,
    energySessionId: e.energySessionId,
    partial:         e.partial,
    sport:           e.sport,
    sportEmoji:      e.sportEmoji,
    duration:        e.duration,
    intensity:       e.intensity,
    dateEnd:         e.dateEnd,
    rescheduledByAthlete:  e.rescheduledByAthlete,
    coachAlert:            e.coachAlert,
    originalScheduledDate: e.originalScheduledDate,
    raw:             e.raw,
  };
}
