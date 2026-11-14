import { Watch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { athleteMoveTitle } from "@/lib/athleteChoices";
import type { PlanningCardState } from "@/lib/planningCard";
import { WATCH_MARK } from "./calendarConstants";
import { isBiometric } from "./calendarUtils";
import { CHIP_TONE, TYPE_TONE, WATCH_TONE, type CardTone } from "./cardTone";

export function EventChip({
  event,
  compact = false,
  watch,
}: {
  event: CalEvent;
  compact?: boolean;
  watch?: PlanningCardState;
}) {
  const isProjected = event.raw?.source === "block_plan";
  const st = event.status;

  // Energy events use session_kind color; biometric tests get their own color
  const bio = isBiometric(event);
  const baseTone: CardTone = event.type === "energy"
    ? (event.sessionKind === "specifique" ? "hyrox" : "energie")
    : bio ? "succes" : TYPE_TONE[event.type];

  // Status overrides base type color — partial takes priority over completed
  const isPartialEnergy = event.type === "energy" && event.partial;
  const tone: CardTone = isPartialEnergy ? "info" : st === "completed" ? "succes" : st === "missed" ? "erreur" : baseTone;
  const bg = isPartialEnergy     ? "bg-agon-info/[0.125]"
           : st === "completed"  ? "bg-agon-succes-doux"
           : st === "missed"     ? "bg-agon-erreur-doux"
           : CHIP_TONE[baseTone].tint;
  const planned = isProjected && st !== "completed" && st !== "missed";

  const blockLogs = isPartialEnergy
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined)
    : null;
  const blVals     = blockLogs ? Object.values(blockLogs) : [];
  const doneCount  = blVals.filter(b => b.done).length;
  const totalCount = blVals.length;

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full cursor-pointer items-center gap-0.5 rounded-r-[4px] border-l-2",
        CHIP_TONE[tone].fg,
        isProjected ? (st === "completed" ? "bg-agon-succes-doux" : st === "missed" ? "bg-agon-erreur-doux" : "bg-transparent") : bg,
        planned ? "border-dashed italic" : "border-solid",
        isProjected ? "font-normal" : "font-semibold",
        compact ? "px-[5px] py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]",
      )}
    >
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {event.type === "free_activity" && event.sportEmoji ? event.sportEmoji + " " : ""}
        {event.title}
        {isPartialEnergy && totalCount > 0 && (
          <span className="ml-[3px] font-medium opacity-45">{doneCount}/{totalCount}</span>
        )}
        {planned && <span className="ml-[3px] text-[8px] opacity-50">prévu</span>}
      </span>
      {event.type === "workout" && event.rescheduledByAthlete && (
        <span title={athleteMoveTitle(event.date, event.originalScheduledDate)} className="ml-0.5 flex-shrink-0 text-[8px] font-extrabold text-agon-alerte">
          ↷
        </span>
      )}
      {event.type === "workout" && !!(event.raw?.athlete_modifications as { coachOverride?: unknown } | null)?.coachOverride && (
        <span title="Séance adaptée pour ce jour" className="ml-0.5 flex-shrink-0 text-agon-alerte"></span>
      )}
      {event.rpe != null && (
        <span className="ml-0.5 flex-shrink-0 font-bold opacity-85">RPE {event.rpe}</span>
      )}
      {watch && WATCH_MARK[watch] && (
        <span title={WATCH_MARK[watch]!.title} aria-label={WATCH_MARK[watch]!.title} className={cn("ml-0.5 inline-flex flex-shrink-0", WATCH_TONE[watch])}>
          <Watch size={compact ? 9 : 10} strokeWidth={2} />
        </span>
      )}
    </div>
  );
}
