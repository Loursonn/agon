import { Watch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlanningCardModel } from "@/lib/planningCard";
import { FREE_COLOR } from "./calendarConstants";

/** Activité de montre sans séance prévue, dans une case du mois : ouvre l'onglet Séance. */
export function WatchFreeChip({ card, athleteId }: { card: PlanningCardModel; athleteId: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      title={`${card.title} · ${card.summary} · ${card.attribution ?? ""}`}
      onClick={(e) => { e.stopPropagation(); if (card.activityId) navigate(`/coach/athletes/${athleteId}/seance/${card.activityId}`); }}
      style={{
        display: "flex", alignItems: "center", gap: 3, width: "100%", minWidth: 0, padding: "1px 5px",
        border: "none", borderLeft: `2px dashed ${FREE_COLOR}`, borderRadius: "0 4px 4px 0",
        background: FREE_COLOR + "14", color: FREE_COLOR, fontSize: 9, fontWeight: 500, fontFamily: "inherit",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <Watch size={9} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
    </button>
  );
}
