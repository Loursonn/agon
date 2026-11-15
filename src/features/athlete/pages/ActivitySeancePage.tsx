import { useLocation, useParams } from "react-router-dom";
import { backFrom } from "@/features/shared/components/seance/backFrom";
import { useAuth } from "@/hooks/useAuth";
import { SeanceView } from "@/features/shared/components/seance/SeanceView";

/** Onglet « Séance » d'une activité de montre (athlète). */
export default function ActivitySeancePage() {
  const { activityId = "" } = useParams<{ activityId: string }>();
  const { user } = useAuth();
  const location = useLocation();
  return (
    <SeanceView
      athleteId={user?.id ?? ""}
      activityId={activityId}
      role="athlete"
      back={backFrom(location.state) ?? { to: "/athlete/program", label: "Programme" }}
      thresholdsLink="/athlete/zones"
    />
  );
}
