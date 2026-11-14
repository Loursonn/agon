import { Watch } from "lucide-react";
import { C, H } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { athleteMoveTitle } from "@/lib/athleteChoices";
import type { PlanningCardState } from "@/lib/planningCard";
import { BIO_COLOR, TYPE_COLOR, TYPE_BG, WATCH_MARK } from "./calendarConstants";
import { isBiometric, energyChipColor } from "./calendarUtils";

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
  const baseColor = event.type === "energy" ? energyChipColor(event) : bio ? BIO_COLOR : TYPE_COLOR[event.type];
  const baseBg    = event.type === "energy" ? energyChipColor(event) + "20" : bio ? BIO_COLOR + "20" : TYPE_BG[event.type];

  // Status overrides base type color — partial takes priority over completed
  const isPartialEnergy = event.type === "energy" && event.partial;
  const color = isPartialEnergy     ? C.b
              : st === "completed"  ? C.g
              : st === "missed"     ? C.r
              : baseColor;
  const bg    = isPartialEnergy     ? `${C.b}20`
              : st === "completed"  ? C.gS
              : st === "missed"     ? C.rS
              : baseBg;

  const blockLogs = isPartialEnergy
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined)
    : null;
  const blVals     = blockLogs ? Object.values(blockLogs) : [];
  const doneCount  = blVals.filter(b => b.done).length;
  const totalCount = blVals.length;

  return (
    <div
      style={{
        background: isProjected ? (st === "completed" ? C.gS : st === "missed" ? C.rS : "transparent") : bg,
        borderLeft: `2px ${isProjected && st !== "completed" && st !== "missed" ? "dashed" : "solid"} ${color}`,
        borderRadius: "0 4px 4px 0",
        padding: compact ? "1px 5px" : "2px 6px",
        fontSize: compact ? 9 : 10,
        fontWeight: isProjected ? 400 : 600,
        color: color,
        cursor: "pointer",
        maxWidth: "100%",
        fontStyle: isProjected && st !== "completed" && st !== "missed" ? "italic" : "normal",
        display: "flex",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {event.type === "workout" ? "" : event.type === "competition" ? "" : event.type === "test" ? (bio ? "" : "") : event.type === "energy" ? "" : event.type === "free_activity" ? (event.sportEmoji ? event.sportEmoji + " " : "") : ""}
        {event.title}
        {isPartialEnergy && totalCount > 0 && (
          <span style={{ opacity: 0.45, fontWeight: 500, marginLeft: 3 }}>{doneCount}/{totalCount}</span>
        )}
        {isProjected && st !== "completed" && st !== "missed" && (
          <span style={{ opacity: 0.5, marginLeft: 3, fontSize: 8 }}>prévu</span>
        )}
      </span>
      {event.type === "workout" && event.rescheduledByAthlete && (
        <span
          title={athleteMoveTitle(event.date, event.originalScheduledDate)}
          style={{ flexShrink: 0, marginLeft: 2, fontSize: 8, fontWeight: 800, color: H.ambre }}
        >
          ↷
        </span>
      )}
      {event.type === "workout" && !!(event.raw?.athlete_modifications as { coachOverride?: unknown } | null)?.coachOverride && (
        <span title="Séance adaptée pour ce jour" style={{ flexShrink: 0, marginLeft: 2, color: H.ambre }}></span>
      )}
      {event.rpe != null && (
        <span style={{ flexShrink: 0, opacity: 0.85, fontWeight: 700, marginLeft: 2 }}>RPE {event.rpe}</span>
      )}
      {watch && WATCH_MARK[watch] && (
        <span title={WATCH_MARK[watch]!.title} aria-label={WATCH_MARK[watch]!.title} style={{ flexShrink: 0, display: "inline-flex", marginLeft: 2, color: WATCH_MARK[watch]!.color }}>
          <Watch size={compact ? 9 : 10} strokeWidth={2} />
        </span>
      )}
    </div>
  );
}
