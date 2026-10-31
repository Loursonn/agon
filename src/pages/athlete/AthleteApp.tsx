import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AthleteProvider } from "@/features/shared/context/AthleteContext";
import AthleteLayout from "@/features/athlete/AthleteLayout";

/**
 * Wrapper that provides AthleteProvider for the logged-in athlete
 * and renders AthleteLayout (which uses <Outlet /> for nested pages).
 */
export default function AthleteApp() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  // Compte professionnel uniquement : pas d'espace athlète.
  if (profile?.role === "staff") return <Navigate to="/staff" replace />;

  const canSwitchToCoach = profile?.role === "coach_athlete" || profile?.role === "coach";

  return (
    <AthleteProvider
      athleteId={user.id}
      viewOnly={false}
      athleteProfile={profile}
      userName={profile?.full_name}
    >
      <AthleteLayout onSwitchMode={canSwitchToCoach ? () => navigate("/coach") : undefined} />
    </AthleteProvider>
  );
}
