/**
 * Écran d'arrivée : quels morceaux de code (pages lazy de `App.tsx`) précharger
 * dès le démarrage, en parallèle de la lecture de session et du profil.
 *
 * Sans ça, l'ouverture enchaîne en série : bundle → profil (réseau) → layout
 * (AthleteApp / CoachShell) → page (TodayPage…) → données ; chaque étape coûte
 * un aller-retour (≈ 0,6 s en 3G). Le préchargement ne change pas ce qui est
 * affiché : `lazy()` retrouve simplement le module déjà téléchargé.
 */
export type ArrivalChunk =
  | "AthleteApp" | "TodayPage"
  | "CoachShell" | "CoachHomePage" | "CoachPhoneHome"
  | "AthletesListPage" | "CoachPhoneAthletes"
  | "CoachAthleteArea" | "PlanningPage" | "CoachPhonePlanning";

/**
 * @param pathname URL d'ouverture
 * @param role rôle de la dernière fiche profil gardée sur l'appareil (null si inconnue)
 * @param isPhone écran < 768 px (même règle que `PhoneOr`)
 */
export function arrivalChunks(pathname: string, role: string | null | undefined, isPhone: boolean): ArrivalChunk[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  const coachHome: ArrivalChunk[] = ["CoachShell", isPhone ? "CoachPhoneHome" : "CoachHomePage"];
  if (path === "/") {
    // RoleRedirect : coach → /coach, athlète → /athlete (staff : rien).
    if (role === "coach" || role === "coach_athlete") return coachHome;
    if (role === "athlete") return ["AthleteApp", "TodayPage"];
    return [];
  }
  if (path === "/athlete") return ["AthleteApp", "TodayPage"];
  if (path.startsWith("/athlete/")) return ["AthleteApp"];
  if (path === "/coach") return coachHome;
  if (path === "/coach/athletes") return ["CoachShell", isPhone ? "CoachPhoneAthletes" : "AthletesListPage"];
  const m = path.match(/^\/coach\/athletes\/[^/]+(\/[^/]+)?/);
  if (m && !/^\/coach\/athletes\/[^/]+\/energy\//.test(path)) {
    const sub = m[1] ?? "";
    if (sub === "" || sub === "/planning") return ["CoachShell", "CoachAthleteArea", isPhone ? "CoachPhonePlanning" : "PlanningPage"];
    return ["CoachShell", "CoachAthleteArea"];
  }
  if (path.startsWith("/coach/")) return ["CoachShell"];
  return [];
}
