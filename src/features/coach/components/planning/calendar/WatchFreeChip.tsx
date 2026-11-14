import { Watch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlanningCardModel } from "@/lib/planningCard";

/** Activité de montre sans séance prévue, dans une case du mois : ouvre l'onglet Séance. */
export function WatchFreeChip({ card, athleteId }: { card: PlanningCardModel; athleteId: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      title={`${card.title} · ${card.summary} · ${card.attribution ?? ""}`}
      onClick={(e) => { e.stopPropagation(); if (card.activityId) navigate(`/coach/athletes/${athleteId}/seance/${card.activityId}`); }}
      className="flex w-full min-w-0 cursor-pointer items-center gap-[3px] rounded-r-[4px] border-0 border-l-2 border-dashed border-agon-type-libre bg-agon-type-libre/[0.078] px-[5px] py-px text-left text-[9px] font-medium text-agon-type-libre"
    >
      <Watch size={9} strokeWidth={2} className="flex-shrink-0" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{card.title}</span>
    </button>
  );
}
