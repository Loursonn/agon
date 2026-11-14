import { useState } from "react";
import { X as XIcon } from "lucide-react";
import { DragOverlay, useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
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
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={cn(
          draggable ? "cursor-grab" : "cursor-pointer",
          isDragging && "opacity-35",
          hovered && deletable ? "pr-3.5" : "pr-0",
        )}
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
          className={cn(
            "absolute right-0 top-0 z-[1] flex h-full min-h-3.5 cursor-pointer items-center justify-center border-0 bg-agon-erreur/80 p-0 text-agon-tx",
            card ? "w-[18px] rounded-r-[10px]" : "w-3.5 rounded-r-[4px]",
          )}
        >
          <XIcon size={8} />
        </button>
      )}
    </div>
  );
}
