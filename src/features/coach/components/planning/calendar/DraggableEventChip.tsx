import { useState } from "react";
import { X as XIcon } from "lucide-react";
import { DragOverlay, useDraggable } from "@dnd-kit/core";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useDeleteCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { PlanningCardState } from "@/lib/planningCard";
import { EventChip } from "./EventChip";
import { EventCard } from "./EventCard";

export function DraggableEventChip({
  event, compact = false, card = false, athleteId = "", coachId = "", onEventClick, watch,
}: {
  event: CalEvent;
  compact?: boolean;
  /** Vue Semaine : carte au lieu de la pastille. */
  card?: boolean;
  athleteId?: string;
  coachId?: string;
  onEventClick?: (event: CalEvent) => void;
  watch?: PlanningCardState;
}) {
  const [hovered, setHovered] = useState(false);
  const draggable = event.type === "workout" || event.type === "energy" || event.type === "test";
  const deletable = event.type === "workout" || event.type === "energy" || event.type === "test";
  const { mutate: del } = useDeleteCalendarEvent();
  // Pas de `transform` ici : le fantôme est rendu par <DragOverlay>. Déplacer
  // aussi la vignette source fausserait le rectangle utilisé au drop.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-event-${event.id}`,
    data: { type: "calendar_event", event },
    disabled: !draggable,
  });

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{
          opacity: isDragging ? 0.35 : 1,
          cursor: draggable ? "grab" : "pointer",
          paddingRight: hovered && deletable ? 14 : 0,
        }}
      >
        {card ? <EventCard event={event} watch={watch} /> : <EventChip event={event} compact={compact} watch={watch} />}
      </div>
      {hovered && deletable && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
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
            position: "absolute", top: 0, right: 0,
            width: card ? 18 : 14, height: "100%", minHeight: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: C.r + "cc", border: "none",
            borderRadius: card ? "0 10px 10px 0" : "0 4px 4px 0",
            cursor: "pointer", padding: 0,
            color: C.tx,
            zIndex: 1,
          }}
        >
          <XIcon size={8} />
        </button>
      )}
    </div>
  );
}
