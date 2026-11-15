import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitionFormModal } from "@/features/coach/components/planning/CompetitionFormModal";

// Views
import { CalendarMonthView } from "@/features/coach/components/planning/CalendarMonthView";
// Vues secondaires (frise, synthèse, compétitions) : chargées à l'ouverture.
// La frise et la synthèse tirent Recharts (~100 kB compressés), inutiles pour
// la vue semaine / mois affichée par défaut.
const TimelineView = lazy(() => import("@/features/coach/components/planning/TimelineView").then((m) => ({ default: m.TimelineView })));
const SummaryView = lazy(() => import("@/features/coach/components/planning/SummaryView").then((m) => ({ default: m.SummaryView })));
const CompetitionsView = lazy(() => import("@/features/coach/components/planning/CompetitionsView").then((m) => ({ default: m.CompetitionsView })));
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
        <Suspense fallback={<Skeleton className="h-[300px] rounded-[6px] bg-agon-s1" />}>
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
        </Suspense>
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
