import { Dumbbell, Zap, FlaskConical, Ruler } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BankItemType, BANK_TYPE_LABEL } from "./calendarConstants";
import { BANK_TONE } from "./bankTone";

export function DraggableSession({
  session,
  sessionType,
  isDragging,
  variant = "chip",
  meta,
}: {
  session: { id: string; name?: string; label?: string };
  sessionType: BankItemType;
  isDragging: boolean;
  /** "card" : petite carte du bandeau (vue Semaine). */
  variant?: "chip" | "card";
  meta?: string | null;
}) {
  const tone = BANK_TONE[sessionType];

  // Idem : le fantôme est rendu par <DragOverlay>, la vignette source reste en place.
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: session.id,
    data: { ...session, sessionType },
  });
  const name = session.name ?? session.label ?? "Séance";

  const Icon = sessionType === "energy" ? Zap : sessionType === "test" ? FlaskConical : sessionType === "biometric" ? Ruler : Dumbbell;

  if (variant === "card") {
    // Carte du bandeau « Programmer » (planche CoachPlanningLarge3) : aplat
    // 12 %, liseré 3 px, pictogramme plein, titre sur une ligne.
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        title={`${BANK_TYPE_LABEL[sessionType]} · ${name}`}
        className={cn(
          "relative flex h-16 w-[186px] flex-none cursor-grab select-none items-center gap-2.5 overflow-hidden rounded-[10px] border py-2.5 pl-3.5 pr-2.5",
          tone.card,
          isDragging && "opacity-45",
        )}
      >
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} />
        <span aria-hidden className={cn("flex size-6 flex-none items-center justify-center rounded-[7px] text-agon-ink", tone.bar)}>
          <Icon size={13} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-medium text-agon-tx">{name}</div>
          {meta && <div className="agon-mono overflow-hidden text-ellipsis whitespace-nowrap text-[10px] uppercase tracking-[0.06em] text-agon-tx3">{meta}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab select-none items-center gap-1.5 rounded-[4px] border px-2.5 py-[7px] text-[11px] font-semibold transition-opacity duration-[120ms]",
        isDragging ? cn(tone.dragging, "opacity-50") : tone.chip,
      )}
    >
      <Icon size={11} />
      {name}
    </div>
  );
}
