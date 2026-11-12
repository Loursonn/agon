import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { AgonIcon } from "@/components/ui/AgonIcon";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import ProfileDrawer from "./components/ProfileDrawer";
import { useAthleteStaff } from "@/features/staff/hooks/useAthleteStaff";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";
import AppFbForm from "./components/AppFbForm";
import { WellnessFlow } from "@/components/athlete/WellnessFlow";
import { NewBlockModal } from "@/components/coach/CoachComponents";
import { CombinedStatsChart } from "@/components/athlete/StatsCharts";
import BlockHistoryViewer from "@/features/coach/components/BlockHistoryViewer";
import { getBig3 } from "@/lib/calculations";
import OfflineBanner from "@/features/shared/components/OfflineBanner";

const ip = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };

const BASE_TABS = [
  { k: "",        l: "Aujourd'hui", icon: <svg {...ip}><path d="M3 10L12 4L21 10"/><path d="M4 10V20H20V10"/><path d="M8 20V10M12 20V10M16 20V10"/></svg> },
  { k: "program", l: "Programme",   icon: <svg {...ip}><rect x="3" y="5" width="18" height="16"/><path d="M3 10H21"/><path d="M8 3V7M16 3V7"/><path d="M7 14H9M11 14H13M15 14H17M7 17.5H9M11 17.5H13"/></svg> },
  { k: "test",    l: "Tests",       icon: <svg {...ip}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg> },
];
const HYROX_TAB = { k: "hyrox", l: "HYROX", icon: <svg {...ip}><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26Z" fill="none"/></svg> };
const TAIL_TABS = [
  { k: "alim",    l: "Nutrition",   icon: <svg {...ip}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M5 4V10M5 7H6.5"/><path d="M19 4V10M19 4H18V7H19"/></svg> },
  { k: "profil",  l: "Profil",      icon: <svg {...ip}><circle cx="12" cy="7" r="3.5"/><path d="M5 21V19A7 7 0 0 1 19 19V21"/></svg> },
];

// ── Mise en page PC (≥ 1024 px, préfixe Tailwind `lg:`) ─────────────────────
// Mobile : barre d'onglets fixe en bas, pleine largeur.
// PC : cadre centré (1100 px, 1280 px dès `xl:`) = navigation latérale de 220 px +
// zone de contenu bordée ; chaque page organise cette largeur (colonnes) au lieu
// d'une colonne de téléphone.
// Les éléments flottants (minuteur, bandeaux) se centrent sur cette zone :
// son milieu est à 50 % + 110 px (moitié de la navigation) du viewport.

/** "3 août" — libellé court pour le bandeau de rappel. */
function formatPendingDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

interface AthleteLayoutProps {
  onSwitchMode?: () => void;
  userName?: string;
}

export default function AthleteLayout({ onSwitchMode, userName }: AthleteLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [dismissedUnfinished, setDismissedUnfinished] = useState<string[]>([]);

  // Hauteur du bandeau du haut (variable : bandeau hors ligne) → la navigation
  // latérale PC reste collée juste en dessous.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(46);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const {
    athleteId, athleteProfile,
    viewOnly, saveStatus,
    showWellness, setShowWellness, showAppFeedback, setShowAppFeedback,
    showBilan, setShowBilan, showNewBlock, setShowNewBlock,
    weekJustCompleted, tw, milestoneNotif,
    timerActive, timerFinished, timerLeft, timerDur, timerStop,
    showBlockHistory, setShowBlockHistory, blockHistory, setBlockHistory,
    exos, sessions, prs, combinedData, totalDone,
    saveWellness, goals, wellness, weightLog, archiveAndNewBlock,
    freeSessions,
  } = useAthleteContext();

  // Badge « blessure » : `medical_entries` est la seule source, pour qu'il dise
  // la même chose que la fiche blessure du profil.
  const { injuries: activeInjuries } = useActiveInjuries(athleteId ?? undefined);

  // Séance passée avec des saisies mais jamais clôturée → bandeau de rappel
  const { data: unfinishedWorkouts = [] } = useUnfinishedWorkouts(viewOnly ? null : athleteId);
  const pendingFinish = unfinishedWorkouts.find((w) => !dismissedUnfinished.includes(w.id)) ?? null;

  // Build tab list based on HYROX flag
  const ATH_TABS = [...BASE_TABS, ...(athleteProfile?.is_hyrox_athlete ? [HYROX_TAB] : []), ...TAIL_TABS];
  // Information de l'athlète (spec staff §6) : pro ajouté ou droits modifiés, pas encore vu.
  const { data: staffLinks = [] } = useAthleteStaff(athleteId);
  const staffUnseen = staffLinks.filter((l) => l.status === "active" && !l.athlete_notified_at).length;

  // Derive active tab from pathname
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";
  // Sous-page d'un onglet (/athlete/program/activity/:id) : l'onglet parent reste actif.
  const tabSegment = ATH_TABS.some(t => t.k === lastSegment) ? lastSegment : pathSegments[1] ?? "";
  const activeTab = ATH_TABS.some(t => t.k === tabSegment) ? tabSegment : "";

  // Active free session for "reprendre" button
  const activeFreeSess = sessions.find(s => {
    const k = `freeSession_${s.id}`;
    return (freeSessions as unknown as Array<{ sessionKey: string; active: boolean }>).some(fs => fs.sessionKey === k && fs.active);
  });

  // Active musculation workout session (persisted in localStorage)
  const [activeWorkout, setActiveWorkout] = useState<{ id: string; name: string; startedAt: number } | null>(null);
  const isOnWorkoutPage = location.pathname.includes("/workout/");

  // Check localStorage on mount + route change
  useEffect(() => {
    const check = () => {
      const stored = localStorage.getItem("activeWorkoutSession");
      if (stored) {
        try { setActiveWorkout(JSON.parse(stored)); } catch { setActiveWorkout(null); }
      } else {
        setActiveWorkout(null);
      }
    };
    check();
    // Re-check when navigating back
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [location.pathname]);

  const timerUrgent = timerActive && timerLeft <= 10;
  const timerTone = timerFinished ? "succes" : timerUrgent ? "erreur" : "accent";
  const BADGE = "rounded-md px-agon-sm py-agon-2xs text-agon-xs font-semibold";
  const NAV_DOT = "absolute -right-1 -top-0.5 h-[7px] w-[7px] rounded-full bg-agon-accent";

  return (
    // overflow-wrap hérité : les longues chaînes sans espace (grilles, allures…) reviennent à la ligne
    <div className="flex min-h-screen flex-col font-ui [overflow-wrap:anywhere]">
      {/* ── En-tête collant ── */}
      <div ref={headerRef} className="sticky top-0 z-20 border-b border-agon-brd bg-agon-bg">
        <div className="flex w-full items-center justify-between px-agon-lg py-agon-sm lg:mx-auto lg:max-w-[1100px] xl:max-w-[1280px]">
          <div className="flex min-w-0 items-center gap-agon-sm">
            <img src="/brand/agon-logo-horizontal-marbre.svg" alt="Agon" className="h-5" />
            {saveStatus && (
              <div className={cn(BADGE, saveStatus === "saved" ? "bg-agon-succes-doux text-agon-succes" : "bg-agon-erreur-doux text-agon-erreur")}>
                {saveStatus === "saved" ? "OK" : "Err"}
              </div>
            )}
            {activeInjuries.length > 0 && (
              <div className={cn(BADGE, "bg-agon-erreur-doux text-agon-erreur")}>{activeInjuries.length} bless.</div>
            )}
            {viewOnly && (
              <div className={cn(BADGE, "border border-agon-coach/40 bg-agon-coach-doux text-agon-coach")}>Observation</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-agon-sm">
            {onSwitchMode && (
              <button
                type="button"
                onClick={onSwitchMode}
                className="whitespace-nowrap rounded-md border border-agon-accent/40 bg-agon-accent-doux px-agon-md py-agon-xs text-agon-xs font-bold text-agon-accent"
              >
                Mode Coach
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              title="Mon profil"
              aria-label="Mon profil"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-agon-brd-l text-agon-tx3"
            >
              <AgonIcon name="menu" size={16} />
            </button>
            {userName && (
              <div className="hidden max-w-[100px] truncate text-agon-xs font-medium text-agon-tx3 min-[420px]:block">{userName}</div>
            )}
          </div>
        </div>
        <OfflineBanner />
      </div>

      <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[1100px] lg:flex-row xl:max-w-[1280px]">
        {/* ── Navigation latérale (PC uniquement) ── */}
        <nav
          aria-label="Navigation principale"
          className="hidden lg:flex lg:w-[220px] lg:shrink-0 lg:flex-col lg:gap-agon-2xs lg:self-start lg:py-agon-lg sticky"
          style={{ top: headerH }}
        >
          {ATH_TABS.map(t => {
            const isActive = activeTab === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => navigate(t.k || ".")}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-agon-md border-l-2 px-agon-lg py-agon-md text-left text-agon-base transition-colors",
                  isActive ? "border-agon-accent bg-agon-accent-doux font-semibold text-agon-accent" : "border-transparent text-agon-tx2",
                )}
              >
                <span className="relative flex shrink-0 items-center">
                  {t.icon}
                  {t.k === "profil" && staffUnseen > 0 && <span aria-label="Nouveau dans ton staff" className={NAV_DOT} />}
                </span>
                <span>{t.l}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Contenu (marge basse pour la barre d'onglets fixe et le minuteur) ── */}
        {/* PC : zone bordée, sans barre du bas ; chaque page y organise sa largeur. */}
        <div className={"min-w-0 flex-1 border-agon-brd lg:border-x " + ((timerActive || timerFinished) ? "pb-[120px] lg:pb-20" : "pb-16 lg:pb-8")}>
          <Outlet />
        </div>
      </div>

      {/* ── Barre d'onglets du bas (mobile / tablette) ── */}
      <div
        // display dans la classe pour que `lg:hidden` s'applique
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-agon-brd bg-agon-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {ATH_TABS.map(t => {
          const isActive = activeTab === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => navigate(t.k || ".")}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] text-[10px] transition-colors",
                isActive ? "font-semibold text-agon-accent" : "font-normal text-agon-tx3",
              )}
            >
              <span className="relative flex items-center">
                {t.icon}
                {t.k === "profil" && staffUnseen > 0 && <span aria-label="Nouveau dans ton staff" className={NAV_DOT} />}
              </span>
              <span className="whitespace-nowrap">{t.l}</span>
            </button>
          );
        })}
      </div>

      {/* ── Minuteur (au-dessus de la barre du bas) ── */}
      {(timerActive || timerFinished) && (
        <div
          className={cn(
            "fixed bottom-16 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-agon-md rounded-full border px-[18px] py-[9px] lg:bottom-6 lg:left-[calc(50%+110px)]",
            timerFinished ? "border-agon-succes/70 bg-agon-succes/15" : cn("bg-agon-s1", timerUrgent ? "border-agon-erreur/70" : "border-agon-accent/70"),
          )}
        >
          {timerFinished ? (
            <span className="text-agon-lg">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </span>
          ) : (
            <div className="relative h-6 w-6">
              <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
                <circle cx="12" cy="12" r="9" fill="none" className="stroke-agon-s2" strokeWidth="2.5" />
                <circle
                  cx="12" cy="12" r="9" fill="none"
                  className={timerUrgent ? "stroke-agon-erreur" : "stroke-agon-accent"}
                  strokeWidth="2.5"
                  strokeDasharray={String(2 * Math.PI * 9)}
                  strokeDashoffset={String(2 * Math.PI * 9 * (1 - Math.min((timerDur - timerLeft) / timerDur, 1)))}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
          <span className={cn("min-w-[42px] font-data text-agon-base font-bold", timerFinished ? "text-agon-succes" : timerUrgent ? "text-agon-erreur" : "text-agon-tx")}>
            {timerFinished ? "Repos OK !" : Math.floor(timerLeft / 60) + ":" + String(timerLeft % 60).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={timerStop}
            aria-label="Arrêter le minuteur"
            className={cn(
              "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-agon-lg",
              timerFinished ? "bg-agon-succes/25 text-agon-succes" : "bg-agon-erreur/25 text-agon-erreur",
            )}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Bouton flottant « Reprendre » (séance libre) ── */}
      {activeFreeSess && (
        <div className="fixed bottom-16 right-4 z-[140] lg:bottom-6 lg:right-[max(16px,calc(50%-534px))] xl:right-[max(16px,calc(50%-624px))]">
          <button
            type="button"
            onClick={() => navigate("log", { state: { initialSess: activeFreeSess } })}
            className="flex items-center gap-agon-sm rounded-full bg-agon-or-vif px-agon-lg py-agon-md text-agon-sm font-bold text-agon-ink"
          >
            <span className="text-agon-lg">▶</span><span>Reprendre — {activeFreeSess.name}</span>
          </button>
        </div>
      )}

      {/* ── Rappel « séance non terminée » ── */}
      {/* Les saisies sont bien enregistrées, mais sans clôture la séance
          n'entre ni dans l'historique ni dans les stats. */}
      {!viewOnly && !isOnWorkoutPage && pendingFinish && (
        <div
          className={cn(
            "fixed inset-x-4 z-[141] lg:inset-x-auto lg:left-[calc(50%+110px)] lg:w-[448px] lg:-translate-x-1/2",
            activeWorkout ? "bottom-[132px] lg:bottom-[84px]" : "bottom-[72px] lg:bottom-6",
          )}
        >
          <div className="flex items-center gap-agon-md rounded-lg border border-agon-alerte/70 bg-agon-s1 px-agon-md py-agon-md">
            <span className="text-agon-xl leading-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-agon-sm font-bold text-agon-tx">Séance non terminée</div>
              <div className="mt-agon-2xs text-agon-xs text-agon-tx3">
                {pendingFinish.sessionName} — {formatPendingDate(pendingFinish.scheduledDate)} ·{" "}
                {pendingFinish.loggedSets} série{pendingFinish.loggedSets > 1 ? "s" : ""} saisie
                {pendingFinish.loggedSets > 1 ? "s" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`program/workout/${pendingFinish.id}?finish=1`)}
              className="min-h-10 shrink-0 rounded-md bg-agon-succes-vif px-agon-md text-agon-xs font-bold text-agon-ink"
            >
              Clôturer
            </button>
            <button
              type="button"
              onClick={() => setDismissedUnfinished((prev) => [...prev, pendingFinish.id])}
              aria-label="Ignorer"
              className="flex min-h-10 shrink-0 items-center px-agon-sm text-agon-base text-agon-tx3"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Bouton flottant « Revenir à la séance » (musculation) ── */}
      {activeWorkout && !isOnWorkoutPage && (
        <div className="fixed inset-x-4 bottom-[72px] z-[140] lg:inset-x-auto lg:bottom-6 lg:left-[calc(50%+110px)] lg:w-[448px] lg:-translate-x-1/2">
          <button
            type="button"
            onClick={() => navigate(`program/workout/${activeWorkout.id}`)}
            className="flex w-full items-center gap-agon-md rounded-lg bg-gradient-to-br from-agon-or-vif to-agon-ocre-vif px-agon-lg py-agon-md text-agon-base font-bold text-agon-ink"
          >
            <span className="text-agon-xl leading-none">▶</span>
            <div className="flex-1 text-left">
              <div>Revenir à la séance</div>
              <div className="mt-agon-2xs text-agon-xs font-medium opacity-80">
                {activeWorkout.name} — {Math.floor((Date.now() - activeWorkout.startedAt) / 60000)} min
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Palier validé ── */}
      {milestoneNotif && (
        <div className="fixed left-1/2 top-[60px] z-[250] flex -translate-x-1/2 items-center gap-agon-md rounded-lg border border-agon-succes/50 bg-agon-s1 px-5 py-agon-md">
          <div>
            <div className="text-agon-base font-bold text-agon-succes">Nouveau palier validé !</div>
            <div className="text-agon-xs text-agon-tx2">Poids mis à jour : {milestoneNotif} kg</div>
          </div>
        </div>
      )}

      {/* ── Semaine validée ── */}
      {weekJustCompleted && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-agon-lg bg-black/90">
          <div className="font-display text-agon-3xl font-extrabold text-agon-succes">Semaine {weekJustCompleted} validée !</div>
          <div className="text-agon-base text-agon-tx2">{weekJustCompleted < tw ? "En route pour S" + (weekJustCompleted + 1) : "Bloc terminé !"}</div>
          <div className="mt-agon-sm flex gap-1.5">
            {[...Array(tw)].map((_, i) => (
              <div key={i} className={cn("h-2.5 w-2.5 rounded-full", i < weekJustCompleted ? "bg-agon-succes" : "bg-agon-s2")} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bilan de bloc ── */}
      {showBilan && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-agon-bg">
          <div className="flex w-full flex-col items-center gap-5 px-agon-xl py-10 lg:mx-auto lg:max-w-[600px]">
            <div className="text-center font-display text-agon-3xl font-extrabold">Bloc terminé !</div>
            <div className="text-agon-base text-agon-tx2">{totalDone} séances réalisées</div>
            <div className="flex w-full gap-agon-md">
              {getBig3(exos).map(({ name, label, c }: { name: string; label: string; c: string }) => {
                const pr = (prs as Record<string, { est?: string }>)[name];
                return (
                  <div key={label} className="flex-1 rounded-lg border bg-agon-s1 px-agon-sm py-[14px] text-center" style={{ borderColor: alpha(c, 0.19) }}>
                    <div className="mb-agon-xs text-agon-xs text-agon-tx3">{label}</div>
                    <div className="font-data text-agon-2xl font-extrabold" style={{ color: c }}>{pr?.est || "--"}</div>
                    <div className="text-agon-xs text-agon-tx3">kg est.</div>
                  </div>
                );
              })}
            </div>
            <div className="w-full rounded-lg border border-agon-brd bg-agon-s1 p-agon-lg">
              <CombinedStatsChart data={combinedData as unknown[]} />
            </div>
            <button
              type="button"
              onClick={() => { setShowBilan(false); setShowNewBlock(true); }}
              className="min-h-12 w-full rounded-lg bg-agon-or-vif text-agon-base font-bold text-agon-ink"
            >
              Nouveau bloc
            </button>
            <button type="button" onClick={() => setShowBilan(false)} className="min-h-10 text-agon-sm text-agon-tx3">Fermer</button>
          </div>
        </div>
      )}

      {/* ── Nouveau bloc ── */}
      {showNewBlock && (
        <NewBlockModal
          onStart={archiveAndNewBlock}
          onClose={() => setShowNewBlock(false)}
          onResume={() => setShowNewBlock(false)}
          hasCurrentData={sessions.length > 0 && Object.values(exos).flat().length > 0}
          blockHistory={blockHistory}
          onDelete={idx => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}

      {/* ── Historique des blocs ── */}
      {showBlockHistory && (
        <BlockHistoryViewer
          blockHistory={blockHistory}
          onClose={() => setShowBlockHistory(false)}
          onDelete={idx => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}

      {/* ── Wellness ── */}
      {showWellness && (
        <div className="fixed inset-0 z-[300] overflow-y-auto bg-agon-bg">
          {/* PC : panneau centré de 600 px au lieu de toute la largeur */}
          <div className="border-agon-brd lg:mx-auto lg:min-h-full lg:max-w-[600px] lg:border-x">
            <div className="flex items-center justify-between border-b border-agon-brd px-agon-lg py-agon-md">
              <div className="text-agon-base font-bold">Wellness du jour</div>
              <button type="button" onClick={() => setShowWellness(false)} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center text-agon-2xl text-agon-tx3">×</button>
            </div>
            <WellnessFlow
              existing={wellness}
              onSave={(data) => { saveWellness(data); setShowWellness(false); }}
              sleepTarget={goals.sleepTarget}
              weightLog={weightLog}
            />
          </div>
        </div>
      )}

      {/* ── Avis sur l'app ── */}
      {showAppFeedback && (
        <div className="fixed inset-0 z-[300] flex flex-col overflow-y-auto bg-agon-bg">
          {/* PC : panneau centré de 600 px au lieu de toute la largeur */}
          <div className="flex w-full flex-1 flex-col border-agon-brd lg:mx-auto lg:max-w-[600px] lg:border-x">
            <div className="flex shrink-0 items-center justify-between border-b border-agon-brd px-agon-lg py-agon-md">
              <div className="text-agon-base font-bold">Avis sur l'app</div>
              <button type="button" onClick={() => setShowAppFeedback(false)} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center text-agon-2xl text-agon-tx3">×</button>
            </div>
            <AppFbForm onClose={() => setShowAppFeedback(false)} />
          </div>
        </div>
      )}

      {drawerOpen && <ProfileDrawer onClose={() => setDrawerOpen(false)} />}

      <FicheViewerHost athleteId={athleteId} viewOnly={viewOnly} />

      {/* ── Confirmation de déconnexion ── */}
      <Dialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title="Se déconnecter ?"
        description="Êtes-vous sûr de vouloir vous déconnecter ?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>Annuler</Button>
            <Button
              className="bg-agon-erreur-vif text-agon-ink"
              onClick={async () => {
                const { confirmLogout, logoutDevice } = await import("@/lib/offline/logoutDevice");
                if (!confirmLogout()) return;
                await logoutDevice().catch(() => {});
                window.location.href = "/login";
              }}
            >
              Déconnecter
            </Button>
          </>
        }
      />
    </div>
  );
}
