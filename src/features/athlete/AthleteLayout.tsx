import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { C } from "@/lib/theme";
import { AgonIcon } from "@/components/ui/AgonIcon";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import ProfileDrawer from "./components/ProfileDrawer";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";
import AppFbForm from "./components/AppFbForm";
import { WellnessFlow } from "@/components/athlete/WellnessFlow";
import { NewBlockModal } from "@/components/coach/CoachComponents";
import { CombinedStatsChart } from "@/components/athlete/StatsCharts";
import BlockHistoryViewer from "@/features/coach/components/BlockHistoryViewer";
import { getBig3 } from "@/lib/calculations";

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

  const {
    athleteId, athleteProfile,
    viewOnly, saveStatus, activeInjuries,
    showWellness, setShowWellness, showAppFeedback, setShowAppFeedback,
    showBilan, setShowBilan, showNewBlock, setShowNewBlock,
    weekJustCompleted, tw, milestoneNotif,
    timerActive, timerFinished, timerLeft, timerDur, timerStop,
    showBlockHistory, setShowBlockHistory, blockHistory, setBlockHistory,
    exos, sessions, prs, combinedData, totalDone,
    saveWellness, addInjury, goals, wellness, weightLog, archiveAndNewBlock,
    freeSessions,
  } = useAthleteContext();

  // Séance passée avec des saisies mais jamais clôturée → bandeau de rappel
  const { data: unfinishedWorkouts = [] } = useUnfinishedWorkouts(viewOnly ? null : athleteId);
  const pendingFinish = unfinishedWorkouts.find((w) => !dismissedUnfinished.includes(w.id)) ?? null;

  // Build tab list based on HYROX flag
  const ATH_TABS = [...BASE_TABS, ...(athleteProfile?.is_hyrox_athlete ? [HYROX_TAB] : []), ...TAIL_TABS];

  // Derive active tab from pathname
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";
  const activeTab = ATH_TABS.some(t => t.k === lastSegment) ? lastSegment : "";

  // Active free session for "reprendre" button
  const activeFreeSess = sessions.find(s => {
    const k = `freeSession_${s.id}`;
    return (freeSessions as Array<{ sessionKey: string; active: boolean }>).some(fs => fs.sessionKey === k && fs.active);
  });

  // Active musculation workout session (persisted in localStorage)
  const [activeWorkout, setActiveWorkout] = useState<{ id: string; name: string; startedAt: number } | null>(null);
  const isOnWorkoutPage = location.pathname.includes("/workout/");

  // Check localStorage on mount + route change
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    // overflowWrap hérité : les longues chaînes sans espace (grilles, allures…) reviennent à la ligne
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", overflowWrap: "anywhere" }}>
      {/* ── Sticky header ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.bg, borderBottom: "1px solid " + C.brd }}>
        <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/brand/agon-logo-horizontal-marbre.svg" alt="Agon" style={{ height: 20 }} />
            {saveStatus && (
              <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: saveStatus === "saved" ? C.gS : C.rS, color: saveStatus === "saved" ? C.g : C.r }}>
                {saveStatus === "saved" ? "OK" : "Err"}
              </div>
            )}
            {activeInjuries.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.rS, color: C.r }}>{activeInjuries.length} bless.</div>
            )}
            {viewOnly && (
              <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.coachS, color: C.coach, border: "1px solid " + C.coach + "40" }}>Observation</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onSwitchMode && (
              <button
                onClick={onSwitchMode}
                style={{
                  padding: "5px 12px", borderRadius: 6,
                  border: "1px solid " + C.ac + "40",
                  background: C.acS, color: C.ac,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >
                Mode Coach
              </button>
            )}
            <button onClick={() => setDrawerOpen(true)} title="Mon profil" style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><AgonIcon name="menu" size={16} /></button>
            {userName && (
              <div style={{ fontSize: 11, color: C.tx3, fontWeight: 500, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Page content (bottom-pad for fixed tabs + optional timer) ── */}
      <div style={{ flex: 1, paddingBottom: (timerActive || timerFinished) ? 120 : 64 }}>
        <Outlet />
      </div>

      {/* ── Bottom tabs ── */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
          background: C.bg, borderTop: "1px solid " + C.brd,
          display: "flex", height: 64,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {ATH_TABS.map(t => {
          const isActive = activeTab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => navigate(t.k || ".")}
              style={{
                flex: 1, border: "none", background: "transparent",
                color: isActive ? C.ac : C.tx3,
                fontSize: 9, fontWeight: isActive ? 700 : 400,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 3, minHeight: 44,
                transition: "color 150ms",
              }}
            >
              <span style={{ display: "flex", alignItems: "center" }}>{t.icon}</span>
              <span style={{ letterSpacing: "0.2px" }}>{t.l}</span>
            </button>
          );
        })}
      </div>

      {/* ── Timer overlay (above bottom tabs) ── */}
      {(timerActive || timerFinished) && (
        <div style={{ position: "fixed", bottom: 64, left: "50%", transform: "translateX(-50%)", zIndex: 150, background: timerFinished ? "rgba(34,201,147,0.15)" : C.s1, border: "1px solid " + (timerFinished ? C.g : timerActive && timerLeft <= 10 ? C.r : C.ac) + "70", borderRadius: 50, padding: "9px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          {timerFinished ? <span style={{ fontSize: 16 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span> : (
            <div style={{ width: 24, height: 24, position: "relative" }}>
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, transform: "rotate(-90deg)" }}>
                <circle cx="12" cy="12" r="9" fill="none" stroke={C.s2} strokeWidth="2.5" />
                <circle cx="12" cy="12" r="9" fill="none" stroke={timerLeft <= 10 ? C.r : C.ac} strokeWidth="2.5"
                  strokeDasharray={String(2 * Math.PI * 9)}
                  strokeDashoffset={String(2 * Math.PI * 9 * (1 - Math.min((timerDur - timerLeft) / timerDur, 1)))}
                  strokeLinecap="round" />
              </svg>
            </div>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: timerFinished ? C.g : timerLeft <= 10 ? C.r : C.tx, fontFamily: "monospace", minWidth: 42 }}>
            {timerFinished ? "Repos OK !" : Math.floor(timerLeft / 60) + ":" + String(timerLeft % 60).padStart(2, "0")}
          </span>
          <button onClick={timerStop} style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: (timerFinished ? C.g : C.r) + "25", color: timerFinished ? C.g : C.r, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* ── "Reprendre" floating button (free session) ── */}
      {activeFreeSess && (
        <div style={{ position: "fixed", bottom: 64, right: 16, zIndex: 140 }}>
          <button
            onClick={() => navigate("log", { state: { initialSess: activeFreeSess } })}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 50, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 16 }}>▶</span><span>Reprendre — {activeFreeSess.name}</span>
          </button>
        </div>
      )}

      {/* ── Rappel "séance non terminée" ── */}
      {/* Les saisies sont bien enregistrées, mais sans clôture la séance
          n'entre ni dans l'historique ni dans les stats. */}
      {!viewOnly && !isOnWorkoutPage && pendingFinish && (
        <div style={{ position: "fixed", bottom: activeWorkout ? 132 : 72, left: 16, right: 16, zIndex: 141 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px", borderRadius: 6,
              background: C.s1, border: "1px solid " + C.o + "70",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>
                Séance non terminée
              </div>
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                {pendingFinish.sessionName} — {formatPendingDate(pendingFinish.scheduledDate)} ·{" "}
                {pendingFinish.loggedSets} série{pendingFinish.loggedSets > 1 ? "s" : ""} saisie
                {pendingFinish.loggedSets > 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={() => navigate(`program/workout/${pendingFinish.id}?finish=1`)}
              style={{
                padding: "8px 12px", borderRadius: 4, border: "none",
                background: C.gV, color: "#0E0C0A", fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}
            >
              Clôturer
            </button>
            <button
              onClick={() => setDismissedUnfinished((prev) => [...prev, pendingFinish.id])}
              aria-label="Ignorer"
              style={{
                padding: "8px 6px", borderRadius: 4, border: "none",
                background: "transparent", color: C.tx3, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── "Revenir à la séance" floating button (musculation workout) ── */}
      {activeWorkout && !isOnWorkoutPage && (
        <div style={{ position: "fixed", bottom: 72, left: 16, right: 16, zIndex: 140 }}>
          <button
            onClick={() => navigate(`program/workout/${activeWorkout.id}`)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderRadius: 6,
              border: "none", background: "linear-gradient(135deg, #FFC933 0%, #FF9500 100%)",
              color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>▶</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div>Revenir à la séance</div>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>
                {activeWorkout.name} — {Math.floor((Date.now() - activeWorkout.startedAt) / 60000)} min
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Milestone notif ── */}
      {milestoneNotif && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 250, background: C.s1, border: "1px solid " + C.g + "50", borderRadius: 6, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.g }}>Nouveau palier validé !</div>
            <div style={{ fontSize: 11, color: C.tx2 }}>Poids mis à jour : {milestoneNotif} kg</div>
          </div>
        </div>
      )}


      {/* ── Week completed overlay ── */}
      {weekJustCompleted && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.g }}>Semaine {weekJustCompleted} validée !</div>
          <div style={{ fontSize: 14, color: C.tx2 }}>{weekJustCompleted < tw ? "En route pour S" + (weekJustCompleted + 1) : "Bloc terminé !"}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {[...Array(tw)].map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < weekJustCompleted ? C.g : C.s2 }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bilan overlay ── */}
      {showBilan && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, overflowY: "auto" }}>
          <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 800, textAlign: "center" }}>Bloc terminé !</div>
            <div style={{ fontSize: 14, color: C.tx2 }}>{totalDone} séances réalisées</div>
            <div style={{ display: "flex", gap: 12, width: "100%" }}>
              {getBig3(exos).map(({ name, label, c }: { name: string; label: string; c: string }) => {
                const pr = (prs as Record<string, { est?: string }>)[name];
                return (
                  <div key={label} style={{ flex: 1, background: C.s1, borderRadius: 6, padding: "14px 10px", textAlign: "center", border: "1px solid " + c + "30" }}>
                    <div style={{ fontSize: 11, color: C.tx3, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{pr?.est || "--"}</div>
                    <div style={{ fontSize: 9, color: C.tx3 }}>kg est.</div>
                  </div>
                );
              })}
            </div>
            <div style={{ width: "100%", background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd }}>
              <CombinedStatsChart data={combinedData as unknown[]} />
            </div>
            <button onClick={() => { setShowBilan(false); setShowNewBlock(true); }} style={{ width: "100%", padding: "14px 0", borderRadius: 6, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Nouveau bloc</button>
            <button onClick={() => setShowBilan(false)} style={{ background: "none", border: "none", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
          </div>
        </div>
      )}

      {/* ── New block modal ── */}
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

      {/* ── Block history ── */}
      {showBlockHistory && (
        <BlockHistoryViewer
          blockHistory={blockHistory}
          onClose={() => setShowBlockHistory(false)}
          onDelete={idx => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}

      {/* ── Wellness modal ── */}
      {showWellness && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid " + C.brd }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Wellness du jour</div>
            <button onClick={() => setShowWellness(false)} style={{ background: "none", border: "none", color: C.tx3, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>×</button>
          </div>
          <WellnessFlow
            existing={wellness}
            onSave={(data) => { saveWellness(data); setShowWellness(false); }}
            sleepTarget={goals.sleepTarget}
            onAddInjury={addInjury}
            weightLog={weightLog}
          />
        </div>
      )}

      {/* ── App feedback modal ── */}
      {showAppFeedback && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Avis sur l'app</div>
            <button onClick={() => setShowAppFeedback(false)} style={{ background: "none", border: "none", color: C.tx3, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>×</button>
          </div>
          <AppFbForm onClose={() => setShowAppFeedback(false)} />
        </div>
      )}

      {/* ── Profile drawer ── */}
      {drawerOpen && <ProfileDrawer onClose={() => setDrawerOpen(false)} />}

      {/* ── Viewer de fiche ── */}
      <FicheViewerHost athleteId={athleteId} viewOnly={viewOnly} />

      {/* ── Logout confirm ── */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowLogoutConfirm(false)}>
          <div style={{ background: C.s1, borderRadius: 6, padding: 24, maxWidth: 320, width: "100%", border: "1px solid " + C.brd }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Se déconnecter ?</div>
            <div style={{ fontSize: 13, color: C.tx3, marginBottom: 20 }}>Êtes-vous sûr de vouloir vous déconnecter ?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={async () => { const { supabase } = await import("@/integrations/supabase/client"); await supabase.auth.signOut(); window.location.href = "/login"; }} style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Déconnecter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
