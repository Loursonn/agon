import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { isIsoDay, localIsoDay } from "@shared/domain/dates";
import { useAuth } from "@/hooks/useAuth";
import { useWeeklyCoachRetour, useUpsertWeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useWeeklyReview } from "@/features/shared/hooks/useWeeklyReview";
import { ReviewReadOnly, ReviewWeekPicker } from "@/features/shared/components/weekly-review/ReviewHistory";
import { REVIEW_CARD } from "@/features/shared/components/weekly-review/reviewStyle";
import { lastReviewWeek } from "@/lib/weekly-review";

/**
 * Review d'un athlète, vue coach (P23) : la review envoyée en lecture et la
 * réponse du lundi, qui reste le retour hebdo (`weekly_retours.comment`),
 * affiché à l'athlète sur son accueil comme avant.
 */
export default function CoachAthleteReviewPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const asked = params.get("week");
  const week = asked && isIsoDay(asked) ? asked : lastReviewWeek(localIsoDay());
  const { data: review } = useWeeklyReview(athleteId, week);
  const { data: retour } = useWeeklyCoachRetour(athleteId, week);
  const upsert = useUpsertWeeklyRetour();
  const [text, setText] = useState("");

  useEffect(() => { setText(retour?.comment ?? ""); }, [retour?.comment, week]);

  if (!athleteId) return null;
  const send = () => {
    if (!user) return;
    upsert.mutate(
      { athleteId, coachId: user.id, weekStart: week, comment: text.trim() },
      { onSuccess: () => toast.success("Réponse envoyée"), onError: (e) => toast.error((e as Error).message) },
    );
  };

  return (
    <div style={{ padding: "20px 28px 40px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)", gap: 24, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <ReviewWeekPicker athleteId={athleteId} week={week} onPick={(w) => setParams({ week: w }, { replace: true })} />
        <ReviewReadOnly athleteId={athleteId} week={week} />
      </div>
      <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Ta réponse de la semaine</div>
        <div style={{ fontSize: 12.5, color: C.tx3 }}>
          C'est le retour hebdo : l'athlète le lit sur son accueil.
          {review?.status !== "submitted" && " Tu peux répondre même sans review."}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
          style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s2, color: C.tx, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
        <button type="button" onClick={send} disabled={upsert.isPending || text.trim() === (retour?.comment ?? "").trim()}
          style={{ height: 40, borderRadius: 10, border: "none", background: C.ac, color: C.bg, fontWeight: 600, cursor: "pointer", opacity: upsert.isPending ? 0.6 : 1 }}>
          {upsert.isPending ? "Envoi…" : retour?.comment ? "Mettre à jour" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
