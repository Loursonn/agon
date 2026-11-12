import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SeanceView } from "@/features/shared/components/seance/SeanceView";

/** Onglet « Séance » d'une activité de montre (athlète). */
export default function ActivitySeancePage() {
  const { activityId = "" } = useParams<{ activityId: string }>();
  const { user } = useAuth();
  return (
    <SeanceView
      athleteId={user?.id ?? ""}
      activityId={activityId}
      role="athlete"
      back={{ to: "/athlete/program", label: "Programme" }}
      thresholdsLink="/athlete/zones"
    />
  );
}
