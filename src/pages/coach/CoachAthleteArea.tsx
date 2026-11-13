import { useState } from "react";
import { useParams, Outlet, Navigate } from "react-router-dom";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { AthleteProvider, useAthleteContext } from "@/features/shared/context/AthleteContext";
import { SelectedAthleteProvider } from "@/features/coach/context/SelectedAthleteContext";
import ContextBar from "@/features/coach/components/ContextBar";
import AthleteProfileForm from "@/components/coach/AthleteProfileForm";
import { useIsPhone } from "@/hooks/useIsPhone";
import CoachPhoneAthleteHeader from "@/features/coach/phone/CoachPhoneAthleteHeader";

/**
 * Wrapper monté sur /coach/athletes/:athleteId/*.
 * Fournit SelectedAthleteContext + AthleteProvider (données complètes),
 * puis affiche la ContextBar sticky + le contenu de la sous-route via <Outlet />.
 */
export default function CoachAthleteArea() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { user, profile, athletes, hiddenAthletes, canCoachSelf } = useAuth();
  const [editProfileTab, setEditProfileTab] = useState<"profil" | "nutrition" | null>(null);
  const isPhone = useIsPhone();

  if (!athleteId || !user) return null;

  const isOwnView = athleteId === user.id;
  if (isOwnView && profile && !canCoachSelf) return <Navigate to="/coach" replace />;
  const selectedAthlete = isOwnView
    ? profile
    : ([...athletes, ...hiddenAthletes].find((a) => a.id === athleteId) ?? null);

  return (
    <SelectedAthleteProvider>
      <AthleteProvider
        athleteId={athleteId}
        viewOnly={!isOwnView}
        athleteProfile={selectedAthlete}
        userName={profile?.full_name}
        onEditProfile={(tab) => setEditProfileTab(tab ?? "profil")}
      >
        {/* Téléphone : en-tête et onglets des planches « Coach tél. » */}
        {isPhone ? <CoachPhoneAthleteHeader /> : <ContextBar />}
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
        {editProfileTab && selectedAthlete && (
          <ProfileFormInContext
            athlete={selectedAthlete}
            initialTab={editProfileTab}
            onClose={() => setEditProfileTab(null)}
          />
        )}
      </AthleteProvider>
    </SelectedAthleteProvider>
  );
}

/**
 * Formulaire monté DANS l'AthleteProvider : le plan nutritionnel enregistré
 * remplace tout de suite celui du contexte (accueil, profil, Alimentation),
 * au lieu d'attendre un rechargement.
 */
function ProfileFormInContext({ athlete, initialTab, onClose }: {
  athlete: Profile;
  initialTab: "profil" | "nutrition";
  onClose: () => void;
}) {
  const { setNutritionStrategy } = useAthleteContext();
  return (
    <AthleteProfileForm
      athlete={athlete}
      initialTab={initialTab}
      lockTab
      onClose={onClose}
      onNutritionSaved={setNutritionStrategy}
    />
  );
}
