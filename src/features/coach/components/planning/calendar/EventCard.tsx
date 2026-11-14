import { Check, Watch } from "lucide-react";
import { C, alpha, H } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { athleteMoveTitle } from "@/lib/athleteChoices";
import type { PlanningCardState } from "@/lib/planningCard";
import { BIO_COLOR, TYPE_COLOR, WATCH_MARK, CARD_KIND_LABEL, CARD_MONO } from "./calendarConstants";
import { isBiometric } from "./calendarUtils";

/**
 * Carte de séance de la vue Semaine (planche CoachPlanningLarge3) : type en
 * capitales, titre sur deux lignes, statut. Même code couleur que les pastilles du mois.
 */
export function EventCard({ event, watch }: { event: CalEvent; watch?: PlanningCardState }) {
  const isProjected = event.raw?.source === "block_plan";
  const st = event.status;
  const bio = isBiometric(event);
  const spec = event.type === "energy" && event.sessionKind === "specifique";
  const color = spec ? H.miel : event.type === "energy" ? C.b : bio ? BIO_COLOR : TYPE_COLOR[event.type];
  const label = spec ? "Spécifique" : bio ? "Biométrie" : CARD_KIND_LABEL[event.type];
  const blockLogs = event.type === "energy" && event.partial
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined)
    : null;
  const bl = blockLogs ? Object.values(blockLogs) : [];
  const status = st === "completed" ? null : st === "missed" ? { t: "Manquée", c: C.r }
    : bl.length ? { t: `${bl.filter((b) => b.done).length}/${bl.length} blocs`, c: C.b }
    : isProjected ? { t: "Prévue · programme", c: C.tx3 } : null;
  return (
    <div
      style={{
        position: "relative", overflow: "hidden", borderRadius: 10,
        background: alpha(color, st === "completed" ? 0.14 : 0.08),
        border: `1px ${isProjected && st !== "completed" ? "dashed" : "solid"} ${alpha(color, st === "missed" ? 0.25 : 0.4)}`,
        padding: "8px 9px 8px 12px", display: "flex", flexDirection: "column", gap: 4,
        opacity: st === "missed" ? 0.7 : 1, minWidth: 0,
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: CARD_MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color }}>{label}</span>
        <span style={{ flex: 1 }} />
        {st === "completed" && (
          <span title="Réalisée" aria-label="Réalisée" style={{ display: "inline-flex", color: C.g, flexShrink: 0 }}>
            <Check size={12} strokeWidth={2.5} />
          </span>
        )}
        {event.type === "workout" && event.rescheduledByAthlete && (
          <span title={athleteMoveTitle(event.date, event.originalScheduledDate)} style={{ fontSize: 10, fontWeight: 800, color: H.ambre }}>↷</span>
        )}
        {watch && WATCH_MARK[watch] && (
          <span title={WATCH_MARK[watch]!.title} aria-label={WATCH_MARK[watch]!.title} style={{ display: "inline-flex", color: WATCH_MARK[watch]!.color }}>
            <Watch size={11} strokeWidth={2} />
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.tx, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontStyle: isProjected && st !== "completed" ? "italic" : "normal" }}>
        {event.type === "free_activity" && event.sportEmoji ? event.sportEmoji + " " : ""}{event.title}
      </div>
      {(status || event.rpe != null) && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: CARD_MONO, fontSize: 10, color: C.tx3 }}>
          {status && <span style={{ color: status.c }}>{status.t}</span>}
          {event.rpe != null && <span>RPE {event.rpe}</span>}
        </div>
      )}
    </div>
  );
}
