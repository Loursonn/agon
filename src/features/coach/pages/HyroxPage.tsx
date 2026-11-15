import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import { C } from "@/lib/theme";
import RacesView from "../components/hyrox/RacesView";
import StationsView from "../components/hyrox/StationsView";
import RunsView from "../components/hyrox/RunsView";
import HyroxRadarView from "../components/hyrox/HyroxRadarView";
import RacePlanView from "../components/hyrox/RacePlanView";
import TestsView from "../components/hyrox/tests/TestsView";

export default function HyroxPage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") ?? "courses";
  const { athleteId } = useAthleteContext();
  const { enabled } = useHyroxFlag(athleteId);
  const { pathname } = useLocation();

  // « Bilan » est devenu la page Évolution de l'onglet Courses (anciens liens).
  if (view === "bilan") return <Navigate to={`${pathname}?view=courses&evolution=1`} replace />;

  if (!enabled) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
          Le suivi HYROX n'est pas activé pour cet athlète
        </div>
        <div style={{ fontSize: 13, color: C.tx3 }}>
          Activez-le depuis Profil Général pour accéder aux courses, stations, radar et tests.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 40px" }}>
      {view === "courses"  && <RacesView />}
      {view === "stations" && <StationsView />}
      {view === "runs"     && <RunsView />}
      {view === "radar"    && <HyroxRadarView />}
      {view === "tests"    && <TestsView />}
      {view === "plan"     && <RacePlanView />}
    </div>
  );
}
