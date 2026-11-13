import { useNavigate } from "react-router-dom";
import { Pencil } from "lucide-react";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import { AthleteChoicesPanel, AthleteMoveBadge } from "../AthleteChoicesPanel";
import { STATUS_LABEL } from "./dayDetailsConstants";
import { rpeColor, rpeBg } from "./dayDetailsUtils";

export function WorkoutDetailView({
  event,
  onAdaptForDay,
  athleteId,
  onOpenRecap,
}: {
  event: CalEvent;
  onAdaptForDay?: () => void;
  athleteId?: string;
  onOpenRecap: () => void;
}) {
  const navigate     = useNavigate();
  const sessionId    = event.raw?.session_id as string | undefined;
  const isProjected  = event.raw?.source === "block_plan";
  const isCompleted  = event.status === "completed";
  const mods = (event.raw?.athlete_modifications as AthleteModifications | null) ?? null;
  const hasOverride  = !!mods?.coachOverride;

  const statusInfo = event.status ? STATUS_LABEL[event.status] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status badge */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {statusInfo && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: statusInfo.color + "20", color: statusInfo.color,
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            {statusInfo.label}
          </span>
        )}
        {event.rpe != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: rpeBg(event.rpe), color: rpeColor(event.rpe),
          }}>
            RPE {event.rpe}/10
          </span>
        )}
        {isProjected && (
          <span style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 6,
            background: C.s2, color: C.tx3, fontStyle: "italic",
          }}>
            Prévu (programme)
          </span>
        )}
        {hasOverride && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: "#F59E0B20", color: "#F59E0B",
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            Adaptée ce jour
          </span>
        )}
        <AthleteMoveBadge event={event} />
      </div>

      <AthleteChoicesPanel event={event} />

      {/* Edit session programme */}
      {sessionId && athleteId && (
        <button
          onClick={() => navigate(`/coach/athletes/${athleteId}/programmation`)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 4,
            border: "1px solid " + C.coach + "40", background: C.coachS,
            color: C.coach, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Pencil size={13} /> Modifier la séance
        </button>
      )}

      {/* Adapt-for-this-day — real, not-yet-done workouts (projected must be assigned first) */}
      {!isProjected && !isCompleted && onAdaptForDay && (
        <button
          onClick={onAdaptForDay}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 4,
            border: "1px solid " + C.ac + "40", background: C.acS,
            color: C.ac, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {hasOverride ? "Modifier l'adaptation du jour" : "Adapter pour ce jour"}
        </button>
      )}

      {/* Recap button */}
      <button
        onClick={onOpenRecap}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 4,
          border: "1px solid " + C.ac + "40", background: C.acS,
          color: C.ac, fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {isCompleted ? "Voir le récap (Prévu vs Réalisé)" : "Voir les exercices prévus"}
      </button>

      {/* Quick athlete feedback summary */}
      {isCompleted && mods?.sessionForme != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.tx3 }}>Forme :</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
            background: mods.sessionForme >= 4 ? C.gS : mods.sessionForme >= 3 ? C.oS : C.rS,
            color: mods.sessionForme >= 4 ? C.g : mods.sessionForme >= 3 ? C.o : C.r,
          }}>
            {mods.sessionForme}/5
          </span>
        </div>
      )}
    </div>
  );
}
