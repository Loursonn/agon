import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitionFormModal } from "@/features/coach/components/planning/CompetitionFormModal";

// Views
import { TimelineView } from "@/features/coach/components/planning/TimelineView";
import { CalendarMonthView } from "@/features/coach/components/planning/CalendarMonthView";
import { SummaryView } from "@/features/coach/components/planning/SummaryView";
import { CompetitionsView } from "@/features/coach/components/planning/CompetitionsView";
import { WeekLoadPanel } from "@/features/coach/components/load/WeekLoadPanel";
import { mondayOf } from "@/lib/trainingLoadWeek";
import { useIsDesktop } from "@/hooks/useIsDesktop";

// ── View types ────────────────────────────────────────────────────────────────

type PlanView = "timeline" | "month" | "week" | "summary" | "competitions";

// ── PlanningPage ──────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const [searchParams] = useSearchParams();
  const isDesktop = useIsDesktop();
  // Ordinateur : semaine pleine largeur par défaut (P24) ; téléphone : le mois.
  const view = (searchParams.get("view") as PlanView) ?? (isDesktop ? "week" : "month");

  const { user } = useAuth();
  const { athleteId, loaded, sessions, blockConfig, setBlockConfig, exos, sets, completedSessions, currentWeek, wellnessHistory, nutritionLog } = useAthleteContext();
  const [showCompForm, setShowCompForm] = useState(false);

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="px-4 py-4 md:px-6">
        <Skeleton className="h-[300px] rounded-[6px] bg-agon-s1" />
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pb-[60px] pt-4 md:px-6">
        {view === "timeline" && (
          <TimelineView athleteId={athleteId} />
        )}

        {(view === "month" || view === "week") && (
          <CalendarMonthView
            key={view}
            layout={view}
            athleteId={athleteId}
            coachId={user?.id ?? ""}
            sessions={sessions}
            blockConfig={blockConfig}
            setBlockConfig={setBlockConfig}
            exos={exos as Record<string, unknown[]>}
            sets={sets as Record<string, unknown[]>}
            completedSessions={completedSessions}
            currentWeek={currentWeek}
            wellnessHistory={wellnessHistory}
            nutritionLog={nutritionLog}
          />
        )}
        {view === "month" && athleteId && (
          <div className="mt-5">
            <WeekLoadPanel athleteId={athleteId} weekStart={mondayOf()} />
          </div>
        )}

        {view === "summary" && (
          <SummaryView athleteId={athleteId} />
        )}

        {view === "competitions" && (
          <CompetitionsView athleteId={athleteId} coachId={user?.id ?? ""} />
        )}
      </div>

      {showCompForm && (
        <CompetitionFormModal
          athleteId={athleteId}
          coachId={user?.id ?? ""}
          onClose={() => setShowCompForm(false)}
        />
      )}
    </>
  );
}
