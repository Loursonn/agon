import React from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { NewBlockModal } from "@/components/coach/CoachComponents";
import { AIChatBar } from "@/components/athlete/StatsViews";
import BlockHistoryViewer from "./components/BlockHistoryViewer";

const ip = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };

const COACH_TABS = [
  { k: "prog",    l: "Prog",    icon: <svg {...ip}><path d="M12 4L20 8L12 12L4 8Z"/><path d="M4 12L12 16L20 12M4 16L12 20L20 16"/></svg> },
  { k: "banque",  l: "Banque",  icon: <svg {...ip}><path d="M3 12H21M6 7V17M9 9V15M15 9V15M18 7V17"/></svg> },
  { k: "stats",   l: "Stats",   icon: <svg {...ip}><path d="M3 20H21M6 20V13M12 20V5M18 20V9"/></svg> },
  { k: "donnees", l: "Données", icon: <svg {...ip}><circle cx="9" cy="8" r="3"/><path d="M3 20V19A6 6 0 0 1 15 19V20"/><path d="M15 5.3A3 3 0 0 1 15 10.7M18 14A5 5 0 0 1 21 18.5V20"/></svg> },
  { k: "test",    l: "Test",    icon: <svg {...ip}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg> },
  { k: "retours", l: "Retours", icon: <svg {...ip}><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg> },
];

interface CoachLayoutProps {
  onSwitchMode?: () => void;
  children?: React.ReactNode;
}

export default function CoachLayout({ onSwitchMode, children }: CoachLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    athleteProfile, blockConfig, setBlockConfig, currentWeek, tw, dw, saveStatus,
    showNewBlock, setShowNewBlock, showBlockHistory, setShowBlockHistory,
    blockHistory, setBlockHistory,
    archiveAndNewBlock, sessions, chatHistory, setChatHistory,
    applyAIEdit, aiChatOpen, setAiChatOpen, exos,
  } = useAthleteContext();

  // Derive active tab from URL
  const pathParts = location.pathname.split("/");
  const activeTab = pathParts[pathParts.length - 1] || "prog";

  const content = children ?? <Outlet />;

  return (
    <>
      <style>{`
        .coach-layout { display: flex; flex: 1; min-height: 0; }
        .coach-sidebar { width: clamp(180px, 16vw, 240px); position: sticky; top: 48px; height: calc(100vh - 48px); overflow-y: auto; overflow-x: hidden; flex-shrink: 0; align-self: flex-start; display: flex; flex-direction: column; }
        .coach-sidebar-athlete { display: flex; flex-direction: column; }
        .coach-sidebar-label { display: inline; }
        .coach-sidebar-footer { display: block; }
        .coach-sidebar-nav button { display: flex; align-items: center; gap: 10px; width: 100%; border: none; cursor: pointer; font-family: inherit; text-align: left; padding: 10px 14px; transition: background 0.12s, color 0.12s; }
        .coach-content { flex: 1; min-width: 0; padding: clamp(16px, 2.5vw, 32px) clamp(16px, 3vw, 44px); }
        @media (max-width: 1100px) { .coach-sidebar { width: clamp(56px, 14vw, 180px); } }
        @media (max-width: 900px) { .coach-sidebar { width: 56px; } .coach-sidebar-label { display: none; } .coach-sidebar-athlete { display: none; } .coach-sidebar-footer { display: none; } .coach-sidebar-nav button { justify-content: center; padding: 12px 0; gap: 0; } .coach-content { padding: 16px 14px; } }
        @media (max-width: 640px) { .coach-layout { flex-direction: column; } .coach-sidebar { width: 100%; height: auto; position: static; flex-direction: row; overflow-x: auto; top: 0; } .coach-sidebar-nav { display: flex; flex-direction: row; padding: 0; flex: 1; } .coach-sidebar-nav button { flex: 1; flex-direction: column; padding: 8px 4px; gap: 3px; justify-content: center; font-size: 9px; } .coach-sidebar-nav button span:first-child { font-size: 18px; } .coach-sidebar-label { display: inline; font-size: 9px; } .coach-content { padding: 12px; } }
      `}</style>

      <div className="coach-layout">
        {/* ── Sidebar ── */}
        <div className="coach-sidebar" style={{ borderRight: "1px solid " + C.brd, background: C.s1 }}>
          {athleteProfile && (
            <div className="coach-sidebar-athlete" style={{ padding: "14px 12px", borderBottom: "1px solid " + C.brd }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: blockConfig?.blockName ? 10 : 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.coach + "25", border: "2px solid " + C.coach + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.coach, flexShrink: 0 }}>
                  {([athleteProfile.first_name, athleteProfile.last_name].filter(Boolean).join(" ") || athleteProfile.full_name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div className="coach-sidebar-label" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[athleteProfile.first_name, athleteProfile.last_name].filter(Boolean).join(" ") || athleteProfile.full_name}
                  </div>
                  <div style={{ fontSize: 10, color: C.coach, fontWeight: 600 }}>Mode coach</div>
                </div>
              </div>
              {blockConfig?.blockName && (
                <div style={{ padding: "7px 10px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brd }}>
                  <div className="coach-sidebar-label" style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{blockConfig.blockName}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: C.b, fontWeight: 600 }}>S{currentWeek}/{tw}</span>
                    {dw > 0 && <span className="coach-sidebar-label" style={{ fontSize: 9, color: C.b + "90" }}>DL S{dw}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
          <nav className="coach-sidebar-nav" style={{ flex: 1, paddingTop: 6 }}>
            {COACH_TABS.map(t => {
              const active = activeTab === t.k || (activeTab === "" && t.k === "prog");
              return (
                <button key={t.k} onClick={() => navigate(t.k)} style={{ borderLeft: "3px solid " + (active ? C.coach : "transparent"), background: active ? C.coach + "14" : "transparent", color: active ? C.coach : C.tx2, fontSize: 12, fontWeight: active ? 700 : 500 }}>
                  <span style={{ display: "flex", alignItems: "center", flexShrink: 0, opacity: active ? 1 : 0.6 }}>{t.icon}</span>
                  <span className="coach-sidebar-label">{t.l}</span>
                </button>
              );
            })}
            {onSwitchMode && (
              <button onClick={onSwitchMode} style={{ borderLeft: "3px solid transparent", background: "transparent", color: C.tx3, fontSize: 12, fontWeight: 500, marginTop: "auto" }}>
                <span style={{ fontSize: 15, flexShrink: 0, opacity: 0.6 }}></span>
                <span className="coach-sidebar-label">Vue athlète</span>
              </button>
            )}
          </nav>
          {saveStatus && (
            <div className="coach-sidebar-footer" style={{ padding: "10px 14px", borderTop: "1px solid " + C.brd }}>
              <div style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, display: "inline-block", background: saveStatus === "saved" ? C.gS : C.rS, color: saveStatus === "saved" ? C.g : C.r }}>
                {saveStatus === "saved" ? "✓ Sauvegardé" : "✕ Erreur"}
              </div>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="coach-content" style={{ paddingBottom: aiChatOpen ? "calc(60vh + 36px)" : "60px" }}>
          {content}
        </div>
      </div>

      {/* ── Global modals ── */}
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
      {showBlockHistory && (
        <BlockHistoryViewer
          blockHistory={blockHistory}
          onClose={() => setShowBlockHistory(false)}
          onDelete={idx => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}
      {activeTab === "prog" && sessions.length > 0 && (
        <AIChatBar exos={exos} sessions={sessions} chatHistory={chatHistory} setChatHistory={setChatHistory} onApply={applyAIEdit} onOpenChange={setAiChatOpen} C={C} />
      )}
    </>
  );
}
