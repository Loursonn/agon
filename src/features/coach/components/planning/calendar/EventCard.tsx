import { Check, Watch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { athleteMoveTitle } from "@/lib/athleteChoices";
import type { PlanningCardState } from "@/lib/planningCard";
import { WATCH_MARK, CARD_KIND_LABEL } from "./calendarConstants";
import { isBiometric } from "./calendarUtils";
import { CARD_TONE, WATCH_TONE, eventTone } from "./cardTone";

/**
 * Carte de séance de la vue Semaine (planche CoachPlanningLarge3) : type en
 * capitales, titre sur deux lignes, statut. Même code couleur que les pastilles du mois.
 */
export function EventCard({ event, watch }: { event: CalEvent; watch?: PlanningCardState }) {
  const isProjected = event.raw?.source === "block_plan";
  const st = event.status;
  const bio = isBiometric(event);
  const spec = event.type === "energy" && event.sessionKind === "specifique";
  const tone = CARD_TONE[eventTone(event)];
  const label = spec ? "Spécifique" : bio ? "Biométrie" : CARD_KIND_LABEL[event.type];
  const blockLogs = event.type === "energy" && event.partial
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined)
    : null;
  const bl = blockLogs ? Object.values(blockLogs) : [];
  const status = st === "completed" ? null : st === "missed" ? { t: "Manquée", c: "text-agon-erreur" }
    : bl.length ? { t: `${bl.filter((b) => b.done).length}/${bl.length} blocs`, c: "text-agon-info" }
    : isProjected ? { t: "Prévue · programme", c: "text-agon-tx3" } : null;
  const dashed = isProjected && st !== "completed";
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[12px] border py-3 pl-4 pr-3",
        tone.tint,
        st === "missed" ? cn(tone.edgeMissed, "opacity-70") : tone.edge,
        dashed && "border-dashed",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", tone.solid)} />
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("agon-mono min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[9px] py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-agon-ink", tone.solid)}>{label}</span>
        <span className="flex-1" />
        {st === "completed" && (
          <span title="Réalisée" aria-label="Réalisée" className="inline-flex flex-shrink-0 text-agon-succes">
            <Check size={12} strokeWidth={2.5} />
          </span>
        )}
        {event.type === "workout" && event.rescheduledByAthlete && (
          <span title={athleteMoveTitle(event.date, event.originalScheduledDate)} className="text-[10px] font-extrabold text-agon-alerte">↷</span>
        )}
        {watch && WATCH_MARK[watch] && (
          <span title={WATCH_MARK[watch]!.title} aria-label={WATCH_MARK[watch]!.title} className={cn("inline-flex", WATCH_TONE[watch])}>
            <Watch size={11} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className={cn("line-clamp-2 text-[14px] font-medium leading-[1.3] text-agon-tx", dashed && "italic")}>
        {event.type === "free_activity" && event.sportEmoji ? event.sportEmoji + " " : ""}{event.title}
      </div>
      {(status || event.rpe != null) && (
        <div className="agon-mono flex items-center gap-1.5 text-[11px] text-agon-tx2">
          {status && <span className={status.c}>{status.t}</span>}
          {event.rpe != null && <span>RPE {event.rpe}</span>}
        </div>
      )}
    </div>
  );
}
