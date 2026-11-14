import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TYPE_LABEL, type SessionType } from "@/lib/peps";
import { useAuth } from "@/hooks/useAuth";
import {
  toCalEvent, useAssignWorkout, useDeleteCalendarEvent, useRescheduleTestSession, useRescheduleWorkout,
  type UnifiedCalendarEvent,
} from "@/features/shared/hooks/useUnifiedCalendar";
import { assignEnergySession, invalidateEnergy, moveEnergyAssignment, restEnergyAssignment } from "@/api/energy";
import { invalidateWorkouts, skipOccurrence, skipWorkout } from "@/api/workouts";
import type { SheetActions } from "./CoachPhoneSessionSheet";

export function typeOf(e: UnifiedCalendarEvent): SessionType {
  if (e.type === "workout") return "muscu";
  if (e.type === "energy") return e.sessionKind === "specifique" || e.sessionKind === "hyrox" ? "hyrox" : "energie";
  if (e.type === "test") return "test";
  if (e.type === "competition") return "competition";
  return "libre";
}

export const labelOf = (e: UnifiedCalendarEvent) => {
  const t = typeOf(e);
  return t === "hyrox" ? "Spécifique" : t === "energie" ? "Énergie" : TYPE_LABEL[t];
};

export const isDone = (e: UnifiedCalendarEvent) =>
  e.status === "completed" || e.status === "in_progress" || e.rpe != null || !!e.partial;

/** Séance-type d'un événement muscu (occurrence virtuelle « block-… » comprise). */
export const sessionIdOf = (e: UnifiedCalendarEvent) => (e.raw?.session_id as string | undefined) ?? e.sessionId;

/** Lien vers l'écran « Modifier une séance » (téléphone). */
export const editSessionPath = (athleteId: string, sessionId: string, date?: string) =>
  `/coach/athletes/${athleteId}/programmation?edit=${encodeURIComponent(sessionId)}${date ? `&date=${date}` : ""}`;

/**
 * Actions de la feuille « Déplacer / Modifier » d'une séance du calendrier
 * (planning et programmation sur téléphone). `onDone` ferme la feuille.
 */
export function usePhoneEventActions(athleteId: string, onDone: () => void) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const coachId = user?.id ?? "";

  const moveWorkout = useRescheduleWorkout();
  const moveTest = useRescheduleTestSession();
  const assign = useAssignWorkout();
  const del = useDeleteCalendarEvent();
  const energyOp = useMutation({
    mutationFn: async (p: { kind: "move" | "dup" | "rest"; e: UnifiedCalendarEvent; date?: string }) => {
      if (p.kind === "move") await moveEnergyAssignment(p.e.id, p.date!);
      else if (p.kind === "rest") await restEnergyAssignment(p.e.id);
      else await assignEnergySession({
        athlete_id: athleteId, coach_id: coachId, energy_session_id: p.e.energySessionId!, scheduled_date: p.date!, status: "planned",
      } as never);
    },
    onSuccess: (_d, p) => {
      void invalidateEnergy(qc, athleteId);
      void invalidateWorkouts(qc, { athleteId });
      toast.success(p.kind === "move" ? "Séance déplacée" : p.kind === "rest" ? "Passée en repos" : "Séance dupliquée");
    },
    onError: () => toast.error("Refusé : séance réalisée, commencée ou notée, ou erreur réseau"),
  });
  const restWorkout = useMutation({
    mutationFn: async (e: UnifiedCalendarEvent) => {
      if (e.id.startsWith("block-") && e.sessionId) {
        await skipOccurrence({ athleteId, coachId, sessionId: e.sessionId, sessionName: e.title, date: e.date });
      } else {
        await skipWorkout(e.id);
      }
    },
    onSuccess: () => { void invalidateWorkouts(qc, { athleteId }); toast.success("Passée en repos"); },
    onError: () => toast.error("Refusé : séance réalisée, commencée ou notée, ou erreur réseau"),
  });
  const pending = moveWorkout.isPending || moveTest.isPending || assign.isPending || del.isPending || energyOp.isPending || restWorkout.isPending;
  const after = { onSuccess: onDone };

  function actionsFor(e: UnifiedCalendarEvent): SheetActions {
    const done = isDone(e);
    const sessionId = sessionIdOf(e);
    if (e.type === "workout") {
      return {
        onMove: done ? undefined : (date) => moveWorkout.mutate({ event: toCalEvent(e), newDate: date, athleteId, coachId }, after),
        onDuplicate: sessionId ? (date) => assign.mutate({ sessionId, sessionName: e.title, athleteId, coachId, date }, after) : undefined,
        onEdit: sessionId ? () => navigate(editSessionPath(athleteId, sessionId, e.date)) : undefined,
        onRest: done ? undefined : () => restWorkout.mutate(e, after),
        onRemove: done ? undefined : () => del.mutate({ id: e.id, type: e.type, athleteId, coachId, sessionId, sessionName: e.title, date: e.date, status: e.status }, after),
        onOpen: done ? () => navigate(`/coach/athletes/${athleteId}/retours`) : undefined,
        openLabel: "Voir dans les retours",
      };
    }
    if (e.type === "energy") {
      return {
        onMove: done ? undefined : (date) => energyOp.mutate({ kind: "move", e, date }, after),
        onDuplicate: e.energySessionId ? (date) => energyOp.mutate({ kind: "dup", e, date }, after) : undefined,
        onEdit: e.energySessionId ? () => navigate(`/coach/athletes/${athleteId}/energy/${e.energySessionId}/edit`) : undefined,
        onRest: done ? undefined : () => energyOp.mutate({ kind: "rest", e }, after),
        onRemove: done ? undefined : () => del.mutate({ id: e.id, type: e.type, athleteId, coachId }, after),
        onOpen: done ? () => navigate(`/coach/athletes/${athleteId}/retours`) : undefined,
        openLabel: "Voir dans les retours",
      };
    }
    if (e.type === "test") {
      return {
        onMove: e.completed ? undefined : (date) => moveTest.mutate({ id: e.id, date, athleteId }, after),
        onRemove: e.completed ? undefined : () => del.mutate({ id: e.id, type: e.type, athleteId }, after),
        onOpen: () => navigate(`/coach/athletes/${athleteId}/tests`),
        openLabel: "Tests de l’athlète",
      };
    }
    return {};
  }

  return { actionsFor, pending, assign, coachId };
}
