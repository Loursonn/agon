import { useLocation, useParams } from "react-router-dom";
import { backFrom } from "@/features/shared/components/seance/backFrom";
import { useSelectedAthlete } from "@/features/coach/context/SelectedAthleteContext";
import { SeanceView } from "@/features/shared/components/seance/SeanceView";

/** Onglet « Séance » d'une activité de montre, dans la fiche de l'athlète (coach). */
export default function SeancePage() {
  const { athleteId = "", activityId = "" } = useParams<{ athleteId: string; activityId: string }>();
  const { selectedAthlete } = useSelectedAthlete();
  const location = useLocation();
  const first = selectedAthlete?.full_name?.trim().split(/\s+/)[0] ?? null;
  return (
    <SeanceView
      athleteId={athleteId}
      activityId={activityId}
      role="coach"
      athleteFirstName={first}
      back={backFrom(location.state) ?? { to: `/coach/athletes/${athleteId}/planning`, label: "Planning" }}
      thresholdsLink={`/coach/athletes/${athleteId}/profil-sportif?view=testing`}
    />
  );
}
