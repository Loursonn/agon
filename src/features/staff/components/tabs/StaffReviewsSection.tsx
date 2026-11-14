import { useState } from "react";
import { localIsoDay } from "@shared/domain/dates";
import { lastReviewWeek } from "@/lib/weekly-review";
import { ReviewReadOnly, ReviewWeekPicker } from "@/features/shared/components/weekly-review/ReviewHistory";
import { tabTitle } from "./staffTabStyles";

/** Weekly reviews envoyées, en lecture (droit « bien-être », P23). */
export function StaffReviewsSection({ athleteId }: { athleteId: string }) {
  const [week, setWeek] = useState(() => lastReviewWeek(localIsoDay()));
  return (
    <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={tabTitle}>Weekly reviews</h2>
      <ReviewWeekPicker athleteId={athleteId} week={week} onPick={setWeek} />
      <ReviewReadOnly athleteId={athleteId} week={week} />
    </div>
  );
}
