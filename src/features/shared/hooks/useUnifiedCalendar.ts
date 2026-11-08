/**
 * useUnifiedCalendar — single source of truth for all calendar data.
 *
 * Replaces useCalendarEvents (month-scoped) and the inner queries of
 * useWeekSchedule (week-scoped). All mutations invalidate the same
 * partial key ["cal", athleteId] so every active range refetches automatically.
 *
 * Views manage their own date-range; the read is `getCalendarEvents`
 * (src/api/planning.ts).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateWorkouts, moveWorkoutByCoach, planWorkout, removeWorkout, skipOccurrence, skipWorkout,
} from "@/api/workouts";
import {
  getCalendarEvents, planningKeys, type UCEventType, type UnifiedCalendarEvent,
} from "@/api/planning";
import { createTestSession, deleteTestSession, rescheduleTestSession } from "@/api/tests";
import { deleteEnergyAssignment, invalidateEnergy } from "@/api/energy";
import { invalidateTests } from "@/api/tests";
import { toast } from "sonner";
import { syncDocAssignmentsFromEnergy } from "./fiches/syncDocAssignments";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { UCEventType, UnifiedCalendarEvent };

// ── Query key helpers ─────────────────────────────────────────────────────────

/** Partial key — used by mutations to invalidate ALL ranges for an athlete. */
export const calBaseKey = (athleteId: string) => planningKeys.calendarAll(athleteId);

/** Full key for a specific range query. */
export const calRangeKey = (athleteId: string, start: string, end: string) =>
  planningKeys.calendar(athleteId, start, end);

// ── Main hook ─────────────────────────────────────────────────────────────────

export interface UseUnifiedCalendarOptions {
  staleTime?: number;
}

export function useUnifiedCalendar(
  athleteId: string,
  range: { start: string; end: string },
  options: UseUnifiedCalendarOptions = {},
) {
  const { staleTime = 30_000 } = options;
  const { start, end } = range;

  return useQuery({
    queryKey: calRangeKey(athleteId, start, end),
    enabled: !!athleteId && !!start && !!end,
    staleTime,
    queryFn: () => getCalendarEvents(athleteId, start, end),
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
      await planWorkout({ athleteId, coachId, sessionId, sessionName, date, weekNumber });
    },
    onSuccess: (_data, vars) => {
      void invalidateWorkouts(qc, { athleteId: vars.athleteId });
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
      await createTestSession({ athleteId, coachId, title, type, date });
    },
    onSuccess: (_data, vars) => {
      void invalidateTests(qc, vars.athleteId);
      toast.success("Test créé");
    },
    onError: () => toast.error("Erreur lors de la création"),
  });
}

export function useRescheduleTestSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, date, athleteId }: { id: string; date: string; athleteId: string }) => {
      await rescheduleTestSession(id, date);
      return athleteId;
    },
    onSuccess: (_data, vars) => {
      void invalidateTests(qc, vars.athleteId);
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
        await deleteEnergyAssignment(id);
        void syncDocAssignmentsFromEnergy(athleteId);
        return;
      }

      // Projected block-plan workout
      if (type === "workout" && id.startsWith("block-") && sessionId && date) {
        // Past or future: a skipped log suppresses this single occurrence of the
        // recurring session (same mechanism as moving it to another day)
        await skipOccurrence({ athleteId, coachId: coachId ?? null, sessionId, sessionName: sessionName ?? "Séance", date });
        return;
      }

      if (type === "workout") {
        if (status === "completed") {
          // Séance validée : suppression explicite (confirmée) par le coach,
          // pour pouvoir retirer les doublons.
          await removeWorkout(id, { allowCompleted: true });
        } else {
          // Past or future real log: mark skipped. A hard delete would let the
          // recurring projection reappear on the same day.
          await skipWorkout(id);
        }
        return;
      }

      await deleteTestSession(id);
    },
    onSuccess: (_data, vars) => {
      // Calendrier + tout ce qui lit les séances (et les séances énergie, les tests).
      void invalidateWorkouts(qc, { athleteId: vars.athleteId });
      if (vars.type === "test") void invalidateTests(qc, vars.athleteId);
      if (vars.type === "energy") void invalidateEnergy(qc, vars.athleteId);
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

      // Ancienne date annulée, séance prévue à la nouvelle (refusé si l'une
      // des deux est une séance déjà réalisée).
      await moveWorkoutByCoach({
        athleteId, coachId, sessionId, sessionName,
        fromDate: event.date, toDate: newDate,
        logId: isProjected ? null : event.id,
      });
    },
    onSuccess: (_data, vars) => {
      void invalidateWorkouts(qc, { athleteId: vars.athleteId });
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
