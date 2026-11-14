import { cn } from "@/lib/utils";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { useWeeklyReview, useWeeklyReviews } from "@/features/shared/hooks/useWeeklyReview";
import { lastReviewWeek, reviewState, REVIEW_STATE_LABEL } from "@/lib/weekly-review";
import { ReviewAnswersView, ReviewSection, ReviewSummaryCard } from "./ReviewParts";
import { REVIEW_CARD_CLASS } from "./reviewStyle";

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Les 12 dernières semaines, la review envoyée en couleur (coach et staff : les brouillons ne sont pas lus). */
export function ReviewWeekPicker({ athleteId, week, onPick }: { athleteId: string; week: string; onPick: (w: string) => void }) {
  const today = localIsoDay();
  const { data: list = [] } = useWeeklyReviews(athleteId);
  const byWeek = new Map(list.map((r) => [r.weekStart, r]));
  const last = lastReviewWeek(today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(last, -7 * i));
  return (
    <div className="flex flex-wrap gap-1.5">
      {weeks.map((w) => {
        const st = reviewState(w, today, byWeek.get(w) ?? null);
        // Feux de marque (LIGHT_COLOR) : envoyée = vert, à venir / en retard = orange, manquée = gris.
        const dot = st === "received" ? "bg-agon-succes" : st === "missed" ? "bg-agon-tx3 opacity-50" : "bg-agon-alerte";
        return (
          <button key={w} type="button" onClick={() => onPick(w)} title={REVIEW_STATE_LABEL[st]} aria-pressed={w === week}
            className={cn(
              "inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[15px] border px-2.5 text-[12px] text-agon-tx2",
              w === week ? "border-agon-accent bg-agon-accent-doux" : "border-agon-brd bg-transparent",
            )}>
            <span className={cn("size-[7px] rounded-full", dot)} />
            {fmtDay(w)}
          </button>
        );
      })}
    </div>
  );
}

/** Une review envoyée en lecture (coach, staff). */
export function ReviewReadOnly({ athleteId, week }: { athleteId: string; week: string }) {
  const today = localIsoDay();
  const { data: review, isLoading, error } = useWeeklyReview(athleteId, week);
  if (isLoading) return <div className="text-[13px] text-agon-tx3">Chargement…</div>;
  if (error) return <div className="text-[13px] text-agon-erreur">Review indisponible : {(error as Error).message}</div>;
  if (!review || review.status !== "submitted") {
    return <div className={cn(REVIEW_CARD_CLASS, "text-[13.5px] text-agon-tx2")}>{REVIEW_STATE_LABEL[reviewState(week, today, null)]} : pas de review envoyée pour cette semaine.</div>;
  }
  return (
    <div className="flex flex-col gap-3.5">
      <ReviewSection n="01" title="Bilan de la semaine (figé à l'envoi)">
        <ReviewSummaryCard summary={review.auto} />
      </ReviewSection>
      <ReviewAnswersView answers={review.answers} light={review.light} />
    </div>
  );
}
