import { useState } from "react";
import { Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useDeleteCalendarEvent, useRescheduleWorkout } from "@/features/shared/hooks/useUnifiedCalendar";
import { useUpdateEnergyAssignment } from "@/features/shared/hooks/useEnergyAssignments";
import { localIsoDay } from "@shared/domain/dates";
import { AthleteMoveBadge } from "../AthleteChoicesPanel";
import { ENERGY_KIND_LABEL, TYPE_COLOR, STATUS_LABEL } from "./dayDetailsConstants";
import { rpeColor, rpeBg } from "./dayDetailsUtils";

export function EventCard({
  event,
  athleteId,
  coachId,
  onSelect,
}: {
  event: CalEvent;
  athleteId: string;
  coachId: string;
  onSelect: (e: CalEvent) => void;
}) {
  const isEnergy = event.type === "energy";
  const color = event.partial && isEnergy ? C.b : TYPE_COLOR[event.type] ?? C.tx3;
  const { mutate: del } = useDeleteCalendarEvent();
  const { mutate: moveWorkout, isPending: movingWorkout } = useRescheduleWorkout();
  const { mutate: moveEnergy, isPending: movingEnergy } = useUpdateEnergyAssignment();
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const today = localIsoDay();
  // Séance ratée (manquée, ou prévue un jour passé) : le coach la replace à
  // aujourd'hui ou plus tard. Le serveur refuse si elle a une saisie.
  const isMissed = (event.type === "workout" || event.type === "energy")
    && (event.status === "missed" || (event.status === "planned" && event.date < today));
  const moveTo = (newDate: string) => {
    if (!newDate || newDate < today) return;
    const done = { onSuccess: () => setMoveOpen(false) };
    if (event.type === "energy") moveEnergy({ id: event.id, athleteId, scheduled_date: newDate }, done);
    else moveWorkout({ event, newDate, athleteId, coachId }, done);
  };

  const rawBlockLogs = isEnergy
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined) ?? null
    : null;
  const blVals     = rawBlockLogs ? Object.values(rawBlockLogs) : [];
  const doneCount  = blVals.filter((b) => b.done).length;
  const totalCount = blVals.length;

  const statusInfo = event.partial && isEnergy
    ? { label: `Partielle ${doneCount}/${totalCount}`, color: C.b }
    : event.status ? STATUS_LABEL[event.status] : null;

  const isClickable = event.type === "workout" || event.type === "energy" || event.type === "free_activity";
  const isDeletable = event.type === "workout" || event.type === "energy" || event.type === "test";

  const typeLabel =
    event.type === "workout"       ? "Séance"
    : event.type === "test"        ? "Test"
    : event.type === "energy"      ? (ENERGY_KIND_LABEL[event.sessionKind ?? ""] ?? "Énergie")
    : event.type === "free_activity" ? (event.sport ?? "Activité libre")
    : "Compétition";

  const emoji =
    event.type === "workout"         ? ""
    : event.type === "energy"        ? ""
    : event.type === "free_activity" ? (event.sportEmoji ? event.sportEmoji + " " : "")
    : event.type === "test"          ? ""
    : "";

  return (
    <div
      onClick={() => { if (isClickable) onSelect(event); }}
      style={{
        background: C.s2,
        borderRadius: 6,
        borderLeft: `3px solid ${color}`,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 2 }}>
            {emoji}{event.title}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", color }}>
              {typeLabel}
            </span>
            {statusInfo && (
              <span style={{ fontSize: 10, color: statusInfo.color }}>{statusInfo.label}</span>
            )}
            {event.rpe != null && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: rpeBg(event.rpe), color: rpeColor(event.rpe),
              }}>
                RPE {event.rpe}/10
              </span>
            )}
            <AthleteMoveBadge event={event} />
            {event.type === "free_activity" && event.duration != null && (
              <span style={{ fontSize: 9, color: C.tx3 }}>{event.duration} min</span>
            )}
            {isClickable && (
              <span style={{ fontSize: 9, color: C.tx3, marginLeft: "auto" }}>Voir →</span>
            )}
          </div>
        </div>

        {isMissed && (
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); setMoveOpen((v) => !v); }}
            aria-expanded={moveOpen}
            style={{
              height: 28, padding: "0 10px", borderRadius: 4, flexShrink: 0,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Déplacer
          </button>
        )}

        {isDeletable && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              del({
                id:          event.id,
                type:        event.type,
                athleteId,
                coachId,
                sessionId:   event.raw?.session_id as string | undefined,
                sessionName: event.title,
                date:        event.date,
                status:      event.status,
              });
            }}
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: "1px solid " + C.r + "30", background: "transparent",
              color: C.r, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, opacity: 0.6,
            }}
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {isMissed && moveOpen && (
        <label
          onClick={(ev) => ev.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.tx2 }}
        >
          Nouveau jour
          <input
            type="date"
            min={today}
            disabled={movingWorkout || movingEnergy}
            value={moveDate}
            onChange={(ev) => setMoveDate(ev.target.value)}
            style={{ height: 32, padding: "0 8px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontFamily: "inherit", fontSize: 12, colorScheme: "dark" }}
          />
          <button
            type="button"
            disabled={!moveDate || moveDate < today || movingWorkout || movingEnergy}
            onClick={() => moveTo(moveDate)}
            style={{
              height: 32, padding: "0 12px", borderRadius: 4, border: "none", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              background: moveDate && moveDate >= today ? C.ac : C.s2, color: moveDate && moveDate >= today ? C.bg : C.tx3,
              cursor: moveDate && moveDate >= today ? "pointer" : "default",
            }}
          >
            {movingWorkout || movingEnergy ? "…" : "Valider"}
          </button>
        </label>
      )}
    </div>
  );
}
