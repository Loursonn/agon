import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { C } from "@/lib/theme";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { openReviewWeek } from "@/lib/weekly-review";
import { useWeeklyReview } from "@/features/shared/hooks/useWeeklyReview";

/**
 * Relance de la weekly review sur l'accueil : le dimanche et le lundi, tant
 * qu'elle n'est pas envoyée. Rien les autres jours.
 */
export function WeeklyReviewBanner({ athleteId }: { athleteId: string | null | undefined }) {
  const navigate = useNavigate();
  const today = localIsoDay();
  const week = openReviewWeek(today);
  const { data: review, isLoading } = useWeeklyReview(athleteId, week);
  if (!week || isLoading || review?.status === "submitted") return null;
  const monday = today === addDays(week, 7);
  return (
    <button type="button" onClick={() => navigate("/athlete/review")}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
        borderRadius: 14, border: `1px solid ${C.o}`, background: C.oS, padding: "14px 16px", color: C.tx,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {review ? "Termine ta weekly review" : "Ta weekly review t'attend"}
        </div>
        <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 2 }}>
          {monday ? "Dernier jour : elle se ferme ce soir." : "Ton bilan de la semaine, en 5 minutes."}
        </div>
      </div>
      <ChevronRight size={18} color={C.tx2} />
    </button>
  );
}
