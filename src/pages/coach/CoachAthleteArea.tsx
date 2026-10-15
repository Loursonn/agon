import { useState } from "react";
import { useParams, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AthleteProvider } from "@/features/shared/context/AthleteContext";
import { SelectedAthleteProvider } from "@/features/coach/context/SelectedAthleteContext";
import ContextBar from "@/features/coach/components/ContextBar";
import AthleteProfileForm from "@/components/coach/AthleteProfileForm";

/**
 * Wrapper monté sur /coach/athletes/:athleteId/*.
 * Fournit SelectedAthleteContext + AthleteProvider (données complètes),
 * puis affiche la ContextBar sticky + le contenu de la sous-route via <Outlet />.
 */
export default function CoachAthleteArea() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { user, profile, athletes, canCoachSelf } = useAuth();
  const [editProfileTab, setEditProfileTab] = useState<"profil" | "nutrition" | null>(null);

  if (!athleteId || !user) return null;

  const isOwnView = athleteId === user.id;
  if (isOwnView && profile && !canCoachSelf) return <Navigate to="/coach" replace />;
  const selectedAthlete = isOwnView
    ? profile
    : (athletes.find((a) => a.id === athleteId) ?? null);

  return (
    <SelectedAthleteProvider>
      <AthleteProvider
        athleteId={athleteId}
        viewOnly={!isOwnView}
        athleteProfile={selectedAthlete}
        userName={profile?.full_name}
        onEditProfile={(tab) => setEditProfileTab(tab ?? "profil")}
      >
        <ContextBar />
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
      </AthleteProvider>
      {editProfileTab && selectedAthlete && (
        <AthleteProfileForm
          athlete={selectedAthlete}
          initialTab={editProfileTab}
          lockTab
          onClose={() => setEditProfileTab(null)}
        />
      )}
    </SelectedAthleteProvider>
  );
}
