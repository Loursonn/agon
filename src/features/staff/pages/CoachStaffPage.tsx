/**
 * Onglet « Coachs & staff » de la fiche athlète (planche CoachOrdiBStaff) :
 * 01 coachs (référent + co-coach), 02 staff (kiné, ostéo…), 03 invitations.
 * Route : /coach/athletes/:athleteId/staff
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { CoCoachPanel } from "@/features/shared/components/CoCoachPanel";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { PageHead, PlusIcon } from "@/features/shared/components/ordi/OrdiUi";
import { btnStyle } from "@/features/shared/components/ordi/ordiStyles";
import { AthleteStaffPanel } from "../components/AthleteStaffPanel";
import { useAthleteStaff, useStaffInvitations } from "../hooks/useAthleteStaff";

export default function CoachStaffPage() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { athleteProfile } = useAthleteContext();
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: coaches } = useAthleteCoaches(athleteId);
  const { data: links = [] } = useAthleteStaff(athleteId);
  const { data: invitations = [] } = useStaffInvitations(athleteId);

  const athleteName = athleteProfile
    ? [athleteProfile.first_name, athleteProfile.last_name].filter(Boolean).join(" ") || athleteProfile.full_name || "l'athlète"
    : "l'athlète";
  const firstName = athleteProfile?.first_name || athleteName.split(" ")[0];

  const nCoaches = (coaches?.referent ? 1 : 0) + (coaches?.coCoach ? 1 : 0);
  const nPros = links.filter((l) => l.status === "active").length;
  const kicker = [
    `${nCoaches} coach${nCoaches > 1 ? "s" : ""}`,
    `${nPros} pro${nPros > 1 ? "s" : ""}`,
    invitations.length ? `${invitations.length} invitation${invitations.length > 1 ? "s" : ""} en attente` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ padding: "24px 40px 48px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1360 }}>
      <PageHead
        title="Coachs & staff"
        kicker={kicker}
        actions={
          <button style={btnStyle("ghost")} onClick={() => setInviteOpen(true)}>
            <PlusIcon />Ajouter un professionnel
          </button>
        }
      />
      <CoCoachPanel athleteId={athleteId} athleteName={athleteName} athleteFirstName={firstName} mode="coach" sectionNumber={1} />
      <AthleteStaffPanel
        athleteId={athleteId}
        athleteName={athleteName}
        athleteFirstName={firstName}
        mode="coach"
        sectionStart={2}
        inviteOpen={inviteOpen}
        onInviteOpenChange={setInviteOpen}
      />
    </div>
  );
}
