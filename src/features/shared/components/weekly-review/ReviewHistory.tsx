import { C } from "@/lib/theme";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { useWeeklyReview, useWeeklyReviews } from "@/features/shared/hooks/useWeeklyReview";
import { lastReviewWeek, reviewState, REVIEW_STATE_LABEL } from "@/lib/weekly-review";
import { ReviewAnswersView, ReviewSection, ReviewSummaryCard } from "./ReviewParts";
import { LIGHT_COLOR, REVIEW_CARD } from "./reviewStyle";

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Les 12 dernières semaines, la review envoyée en couleur (coach et staff : les brouillons ne sont pas lus). */
export function ReviewWeekPicker({ athleteId, week, onPick }: { athleteId: string; week: string; onPick: (w: string) => void }) {
  const today = localIsoDay();
  const { data: list = [] } = useWeeklyReviews(athleteId);
  const byWeek = new Map(list.map((r) => [r.weekStart, r]));
  const last = lastReviewWeek(today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(last, -7 * i));
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {weeks.map((w) => {
        const st = reviewState(w, today, byWeek.get(w) ?? null);
        const color = st === "received" ? LIGHT_COLOR.green : st === "missed" ? C.tx3 : LIGHT_COLOR.orange;
        return (
          <button key={w} type="button" onClick={() => onPick(w)} title={REVIEW_STATE_LABEL[st]} aria-pressed={w === week}
            style={{
              height: 30, padding: "0 10px", borderRadius: 15, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              border: `1px solid ${w === week ? C.ac : C.brd}`, background: w === week ? C.acS : "transparent", color: C.tx2,
            }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, opacity: st === "missed" ? 0.5 : 1 }} />
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
  if (isLoading) return <div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>;
  if (error) return <div style={{ color: C.r, fontSize: 13 }}>Review indisponible : {(error as Error).message}</div>;
  if (!review || review.status !== "submitted") {
    return <div style={{ ...REVIEW_CARD, color: C.tx2, fontSize: 13.5 }}>{REVIEW_STATE_LABEL[reviewState(week, today, null)]} : pas de review envoyée pour cette semaine.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ReviewSection n="01" title="Bilan de la semaine (figé à l'envoi)">
        <ReviewSummaryCard summary={review.auto} />
      </ReviewSection>
      <ReviewAnswersView answers={review.answers} light={review.light} />
    </div>
  );
}
