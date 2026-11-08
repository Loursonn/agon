import { Fragment, lazy, Suspense, type ReactNode } from "react";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute, { RoleRedirect } from "@/components/ProtectedRoute";
import { OfflineQueryProvider } from "@/features/shared/components/OfflineQueryProvider";
import UpdatePrompt from "@/features/shared/components/UpdatePrompt";
import { OFFLINE_CACHE_MAX_AGE_MS } from "@/lib/offline/offlineCache";
import { startOfflinePersistence } from "@/lib/offline/offlinePersistence";

// Pages publiques (chargées immédiatement — nécessaires au démarrage)
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import InviteAccept from "./pages/InviteAccept.tsx";
import StaffInviteAccept from "./features/staff/pages/StaffInviteAccept.tsx";
import ClaimAthlete from "./pages/ClaimAthlete.tsx";
import NotFound from "./pages/NotFound.tsx";

// Pages légales publiques (lazy — rarement ouvertes, mais doivent rester
// accessibles sans authentification : les programmes partenaires Garmin et
// COROS exigent une URL de politique de confidentialité consultable par leur
// équipe de validation, qui n'a pas de compte).
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy.tsx"));
const Terms         = lazy(() => import("./pages/legal/Terms.tsx"));
const LegalNotice   = lazy(() => import("./pages/legal/LegalNotice.tsx"));

// Layouts (lazy — chargés après auth)
const AthleteApp       = lazy(() => import("./pages/athlete/AthleteApp.tsx"));
const CoachShell       = lazy(() => import("./features/coach/CoachShell.tsx"));
const CoachAthleteArea = lazy(() => import("./pages/coach/CoachAthleteArea.tsx"));
const StaffApp         = lazy(() => import("./features/staff/StaffApp.tsx"));
const StaffHomePage    = lazy(() => import("./features/staff/pages/StaffHomePage.tsx"));
const StaffAthleteArea = lazy(() => import("./features/staff/pages/StaffAthleteArea.tsx"));

// Pages athlète (lazy)
const TodayPage          = lazy(() => import("./features/athlete/pages/TodayPage.tsx"));
const ProgramPage        = lazy(() => import("./features/athlete/pages/ProgramPage.tsx"));
const WorkoutDetailPage  = lazy(() => import("./features/athlete/pages/WorkoutDetailPage.tsx"));
const ProfilPage         = lazy(() => import("./features/athlete/pages/ProfilPage.tsx"));
// Legacy pages still accessible via direct navigation
const LogSeancePage   = lazy(() => import("./features/athlete/pages/LogSeancePage.tsx"));
const AlimPage        = lazy(() => import("./features/athlete/pages/AlimPage.tsx"));
const AthleteTestPage = lazy(() => import("./features/athlete/pages/AthleteTestPage.tsx"));
const AthleteHyroxPage = lazy(() => import("./features/athlete/pages/HyroxPage.tsx"));
const SpecificExecutionPage = lazy(() => import("./features/athlete/pages/SpecificExecutionPage.tsx"));

// Pages coach globales (lazy)
const CoachHomePage      = lazy(() => import("./features/coach/pages/CoachHomePage.tsx"));
const AthletesListPage   = lazy(() => import("./features/coach/pages/AthletesListPage.tsx"));
const LibraryPage        = lazy(() => import("./features/coach/pages/LibraryPage.tsx"));
const CoachTestsBankPage = lazy(() => import("./features/coach/pages/CoachTestsBankPage.tsx"));
const CoachesListPage    = lazy(() => import("./features/coach/pages/CoachesListPage.tsx"));
const SettingsPage       = lazy(() => import("./features/coach/pages/SettingsPage.tsx"));
const RoadmapPage        = lazy(() => import("./features/coach/pages/RoadmapPage.tsx"));
const AthleteFeedbackPage = lazy(() => import("./features/coach/pages/AthleteFeedbackPage.tsx"));

// Pages coach par athlète (lazy)
const PlanningPage      = lazy(() => import("./features/coach/pages/PlanningPage.tsx"));
const ProgrammationPage = lazy(() => import("./features/coach/pages/ProgrammationPage.tsx"));
const DonneesPage       = lazy(() => import("./features/coach/pages/DonneesPage.tsx"));
const RetoursPage       = lazy(() => import("./features/coach/pages/RetoursPage.tsx"));
const AthleteViewPage           = lazy(() => import("./features/coach/pages/AthleteViewPage.tsx"));
const EnergySessionEditorPage   = lazy(() => import("./features/coach/pages/EnergySessionEditorPage.tsx"));
const ProfilAthletePage         = lazy(() => import("./features/coach/pages/ProfilAthletePage.tsx"));
const EnergyLibraryPage         = lazy(() => import("./features/coach/pages/EnergyLibraryPage.tsx"));
const CoachHyroxPage            = lazy(() => import("./features/coach/pages/HyroxPage.tsx"));
const FichesPage                = lazy(() => import("./features/coach/pages/FichesPage.tsx"));
const CoachUpdatesPage          = lazy(() => import("./features/coach/pages/CoachUpdatesPage.tsx"));
const AthleteFichesPage         = lazy(() => import("./features/coach/pages/AthleteFichesPage.tsx"));
const CoachStaffPage            = lazy(() => import("./features/staff/pages/CoachStaffPage.tsx"));

// staleTime : une donnée lue il y a moins de 30 s n'est pas re-téléchargée à
// chaque ouverture de page (les mutations invalident explicitement leurs clés).
// Hors ligne (src/lib/offline) :
// - gcTime = durée du cache persisté (7 j) : une requête inactive doit rester
//   en mémoire pour être recopiée dans IndexedDB ;
// - networkMode "online" (valeur par défaut de React Query, écrite pour être
//   explicite) et non "offlineFirst" : hors ligne, la requête ne part pas du
//   tout et l'écran garde les données restaurées. Avec "offlineFirst" elle
//   partirait une fois ; or beaucoup de queryFn héritées avalent l'erreur
//   réseau et renvoient `[]` / `null` (audit §3) : le cache serait remplacé par
//   du vide. À reconsidérer quand toutes les lectures passeront par src/api/ ;
// - mutations : comportement par défaut ("online", mises en pause hors ligne,
//   reprises au retour du réseau tant que l'onglet vit). File d'attente
//   persistée = phase 2.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: OFFLINE_CACHE_MAX_AGE_MS, networkMode: "online" },
  },
});

// React Query v5 se croit en ligne au démarrage et n'écoute ensuite que les
// événements online/offline : une app ouverte sans réseau ne le saurait pas.
if (typeof navigator !== "undefined" && navigator.onLine === false) onlineManager.setOnline(false);

const offlinePersistence = startOfflinePersistence(queryClient);

// Fallback minimal pendant le chargement des chunks
function PageLoader() {
  return (
    <div style={{ minHeight: "100vh", background: "#0E0C0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, border: "2.5px solid rgba(231,211,168,0.2)", borderTopColor: "#FFC933", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Chargement d'une page à l'intérieur d'un layout : le layout (sidebar, barre
// d'onglets) reste affiché.
function InlineLoader() {
  return (
    <div style={{ minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 24, height: 24, border: "2.5px solid rgba(231,211,168,0.2)", borderTopColor: "#FFC933", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Page (feuille de route) : remontée à chaque changement d'URL, comme avant,
 * mais SANS remonter les layouts ni leurs providers (AthleteProvider…).
 * Auparavant toute l'app était remontée à chaque navigation, ce qui relançait
 * tout le chargement des données.
 */
function Page({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Suspense fallback={<InlineLoader />}>
      <Fragment key={pathname}>{children}</Fragment>
    </Suspense>
  );
}

/** Layout lié à un athlète : remonté seulement quand l'athlète change. */
function AthleteScoped({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const athleteId = pathname.match(/\/athletes\/([^/]+)/)?.[1] ?? "";
  return <Fragment key={athleteId}>{children}</Fragment>;
}

function AppRoutes() {
  return (
        <Routes>
          {/* Pages publiques */}
          <Route path="/login" element={<Page><Login /></Page>} />
          <Route path="/reset-password" element={<Page><ResetPassword /></Page>} />
          <Route path="/invite/:token" element={<Page><InviteAccept /></Page>} />
          <Route path="/staff-invite/:token" element={<Page><StaffInviteAccept /></Page>} />
          <Route path="/claim/:token" element={<Page><ClaimAthlete /></Page>} />

          {/* Documents légaux — publics par obligation */}
          <Route path="/confidentialite"  element={<Page><PrivacyPolicy /></Page>} />
          <Route path="/cgu"              element={<Page><Terms /></Page>} />
          <Route path="/mentions-legales" element={<Page><LegalNotice /></Page>} />
          {/* Alias anglais : les formulaires partenaires et les robots les attendent souvent */}
          <Route path="/privacy" element={<Navigate to="/confidentialite" replace />} />
          <Route path="/terms"   element={<Navigate to="/cgu" replace />} />

          {/* Redirection selon le rôle */}
          <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

          {/* Vue athlète (layout + sous-routes) */}
          <Route path="/athlete" element={<ProtectedRoute><AthleteApp /></ProtectedRoute>}>
            <Route index element={<Page><TodayPage /></Page>} />
            <Route path="program" element={<Page><ProgramPage /></Page>} />
            <Route path="program/workout/:id" element={<Page><WorkoutDetailPage /></Page>} />
            <Route path="profil" element={<Page><ProfilPage /></Page>} />
            {/* Legacy routes kept for backward compat */}
            <Route path="log" element={<Page><LogSeancePage /></Page>} />
            <Route path="alim" element={<Page><AlimPage /></Page>} />
            <Route path="test" element={<Page><AthleteTestPage /></Page>} />
            <Route path="hyrox" element={<Page><AthleteHyroxPage /></Page>} />
            <Route path="specific/:assignmentId" element={<Page><SpecificExecutionPage /></Page>} />
          </Route>

          {/* Espace professionnel (staff) — kiné, ostéo, coach adjoint… */}
          <Route path="/staff" element={<ProtectedRoute><StaffApp /></ProtectedRoute>}>
            <Route index element={<Page><StaffHomePage /></Page>} />
            <Route path="athletes/:athleteId" element={<Page><StaffAthleteArea /></Page>} />
          </Route>

          {/* Vue coach — sidebar + toutes sous-routes */}
          <Route path="/coach" element={<ProtectedRoute><CoachShell /></ProtectedRoute>}>
            {/* Page d'accueil coach */}
            <Route index element={<Page><CoachHomePage /></Page>} />

            {/* Pages globales */}
            <Route path="athletes" element={<Page><AthletesListPage /></Page>} />
            <Route path="library"  element={<Page><LibraryPage /></Page>} />
            <Route path="tests"    element={<Page><CoachTestsBankPage /></Page>} />
            <Route path="fiches"   element={<Page><FichesPage /></Page>} />
            <Route path="nouveautes" element={<Page><CoachUpdatesPage /></Page>} />
            <Route path="coaches"  element={<Page><CoachesListPage /></Page>} />
            <Route path="roadmap"  element={<Page><RoadmapPage /></Page>} />
            <Route path="avis"     element={<Page><AthleteFeedbackPage /></Page>} />
            <Route path="settings"     element={<Page><SettingsPage /></Page>} />
{/* Banque séances énergie (sans contexte athlète) */}
            <Route path="energy-library"                  element={<Page><EnergyLibraryPage /></Page>} />
            <Route path="energy-library/new"              element={<Page><EnergySessionEditorPage /></Page>} />
            <Route path="energy-library/:sessionId/edit"  element={<Page><EnergySessionEditorPage /></Page>} />

            {/* Vue par athlète (ContextBar + AthleteProvider) */}
            <Route path="athletes/:athleteId" element={<AthleteScoped><CoachAthleteArea /></AthleteScoped>}>
              <Route index element={<Navigate to="planning" replace />} />
              <Route path="planning"       element={<Page><PlanningPage /></Page>} />
              <Route path="programmation"  element={<Page><ProgrammationPage /></Page>} />
              <Route path="profil-sportif" element={<Page><ProfilAthletePage /></Page>} />
              <Route path="donnees"       element={<Page><DonneesPage /></Page>} />
              <Route path="retours"       element={<Page><RetoursPage /></Page>} />
              {/* Legacy : Tests vit maintenant dans Profil athlète → Suivi Testing */}
              <Route path="tests"         element={<Navigate to="../profil-sportif?view=testing" replace />} />
              <Route path="hyrox"         element={<Page><CoachHyroxPage /></Page>} />
              <Route path="fiches"        element={<Page><AthleteFichesPage /></Page>} />
              <Route path="staff"         element={<Page><CoachStaffPage /></Page>} />
              <Route path="athlete-view"  element={<Page><AthleteViewPage /></Page>} />
            </Route>

            {/* Éditeur séances énergie par athlète (hors ContextBar) */}
            <Route path="athletes/:athleteId/energy/new"              element={<Page><EnergySessionEditorPage /></Page>} />
            <Route path="athletes/:athleteId/energy/:sessionId/edit"  element={<Page><EnergySessionEditorPage /></Page>} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Routes>
  );
}

const App = () => (
  <OfflineQueryProvider client={queryClient} persistence={offlinePersistence}>
    <TooltipProvider>
      <Toaster />
      <UpdatePrompt />
      {/* Desktop coach: bottom-right / Mobile athlete: top-center via richColors */}
      <Sonner
        position="bottom-right"
        theme="dark"
        richColors
        toastOptions={{ duration: 3000 }}
      />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </OfflineQueryProvider>
);

export default App;
