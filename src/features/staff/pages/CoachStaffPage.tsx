/**
 * Onglet « Coachs & staff » de la fiche athlète : co-coach (double coach) puis
 * staff (kiné, ostéo…).
 * Route : /coach/athletes/:athleteId/staff
 */
import { useParams } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { AthleteStaffPanel } from "../components/AthleteStaffPanel";
import { CoCoachPanel } from "@/features/shared/components/CoCoachPanel";

export default function CoachStaffPage() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { athleteProfile } = useAthleteContext();
  const athleteName = athleteProfile
    ? [athleteProfile.first_name, athleteProfile.last_name].filter(Boolean).join(" ") || athleteProfile.full_name || "l'athlète"
    : "l'athlète";

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: "0 0 12px" }}>Coachs de {athleteName}</h1>
      <CoCoachPanel athleteId={athleteId} athleteName={athleteName} mode="coach" />
      <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: "32px 0 12px" }}>Staff de {athleteName}</h1>
      <AthleteStaffPanel athleteId={athleteId} athleteName={athleteName} mode="coach" />
    </div>
  );
}
