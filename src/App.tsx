import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute, { RoleRedirect } from "@/components/ProtectedRoute";
import { AnimatePresence, motion, type Variants } from "framer-motion";

// Pages publiques (chargées immédiatement — nécessaires au démarrage)
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import InviteAccept from "./pages/InviteAccept.tsx";
import NotFound from "./pages/NotFound.tsx";

// Layouts (lazy — chargés après auth)
const AthleteApp       = lazy(() => import("./pages/athlete/AthleteApp.tsx"));
const CoachShell       = lazy(() => import("./features/coach/CoachShell.tsx"));
const CoachAthleteArea = lazy(() => import("./pages/coach/CoachAthleteArea.tsx"));

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

const queryClient = new QueryClient();

// Fade transition for route changes (100ms ease-out)
const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

// Fallback minimal pendant le chargement des chunks
function PageLoader() {
  return (
    <div style={{ minHeight: "100vh", background: "#0E0C0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, border: "2.5px solid rgba(231,211,168,0.2)", borderTopColor: "#FFC933", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// AnimatePresence wrapper needs access to location
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
          key={location.pathname}
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.1, ease: "easeOut" }}
          style={{ display: "contents" }}
        >
        <Routes location={location}>
          {/* Pages publiques */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<InviteAccept />} />

          {/* Redirection selon le rôle */}
          <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

          {/* Vue athlète (layout + sous-routes) */}
          <Route path="/athlete" element={<ProtectedRoute><AthleteApp /></ProtectedRoute>}>
            <Route index element={<TodayPage />} />
            <Route path="program" element={<ProgramPage />} />
            <Route path="program/workout/:id" element={<WorkoutDetailPage />} />
            <Route path="profil" element={<ProfilPage />} />
            {/* Legacy routes kept for backward compat */}
            <Route path="log" element={<LogSeancePage />} />
            <Route path="alim" element={<AlimPage />} />
            <Route path="test" element={<AthleteTestPage />} />
            <Route path="hyrox" element={<AthleteHyroxPage />} />
            <Route path="specific/:assignmentId" element={<SpecificExecutionPage />} />
          </Route>

          {/* Vue coach — sidebar + toutes sous-routes */}
          <Route path="/coach" element={<ProtectedRoute><CoachShell /></ProtectedRoute>}>
            {/* Page d'accueil coach */}
            <Route index element={<CoachHomePage />} />

            {/* Pages globales */}
            <Route path="athletes" element={<AthletesListPage />} />
            <Route path="library"  element={<LibraryPage />} />
            <Route path="tests"    element={<CoachTestsBankPage />} />
            <Route path="coaches"  element={<CoachesListPage />} />
            <Route path="roadmap"  element={<RoadmapPage />} />
            <Route path="avis"     element={<AthleteFeedbackPage />} />
            <Route path="settings"     element={<SettingsPage />} />
{/* Banque séances énergie (sans contexte athlète) */}
            <Route path="energy-library"                  element={<EnergyLibraryPage />} />
            <Route path="energy-library/new"              element={<EnergySessionEditorPage />} />
            <Route path="energy-library/:sessionId/edit"  element={<EnergySessionEditorPage />} />

            {/* Vue par athlète (ContextBar + AthleteProvider) */}
            <Route path="athletes/:athleteId" element={<CoachAthleteArea />}>
              <Route index element={<Navigate to="planning" replace />} />
              <Route path="planning"       element={<PlanningPage />} />
              <Route path="programmation"  element={<ProgrammationPage />} />
              <Route path="profil-sportif" element={<ProfilAthletePage />} />
              <Route path="donnees"       element={<DonneesPage />} />
              <Route path="retours"       element={<RetoursPage />} />
              {/* Legacy : Tests vit maintenant dans Profil athlète → Suivi Testing */}
              <Route path="tests"         element={<Navigate to="../profil-sportif?view=testing" replace />} />
              <Route path="hyrox"         element={<CoachHyroxPage />} />
              <Route path="athlete-view"  element={<AthleteViewPage />} />
            </Route>

            {/* Éditeur séances énergie par athlète (hors ContextBar) */}
            <Route path="athletes/:athleteId/energy/new"              element={<EnergySessionEditorPage />} />
            <Route path="athletes/:athleteId/energy/:sessionId/edit"  element={<EnergySessionEditorPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
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
            <AnimatedRoutes />
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
