/**
 * RoadmapPage — module roadmap produit.
 * Accessible : is_certified_coach OU is_admin.
 * Deux vues : Journey (visuelle) + Kanban (colonnes par phase).
 */
import { useState } from "react";
import { Plus, Map, Columns3, Route } from "lucide-react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useRoadmapPhases,
  useRoadmapItems,
  useMyRoadmapVotes,
  useVoteCounts,
} from "@/features/shared/hooks/useRoadmap";
import { RoadmapKanbanView }  from "@/features/coach/components/roadmap/RoadmapKanbanView";
import { RoadmapJourneyView } from "@/features/coach/components/roadmap/RoadmapJourneyView";
import { RoadmapPhaseDrawer } from "@/features/coach/components/roadmap/RoadmapPhaseDrawer";
import { RoadmapItemDrawer }  from "@/features/coach/components/roadmap/RoadmapItemDrawer";
import type { RoadmapPhase, RoadmapItem } from "@/features/coach/types/roadmap";

type ViewMode = "journey" | "kanban";

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin ?? false;

  const { data: phases = [],     isLoading: loadingPhases } = useRoadmapPhases();
  const { data: items  = [],     isLoading: loadingItems  } = useRoadmapItems();
  const { data: voteCounts = {} }                           = useVoteCounts();
  const { data: myVotes = [] }                              = useMyRoadmapVotes(profile?.id);

  const [view, setView] = useState<ViewMode>("journey");

  // ── Drawer state ────────────────────────────────────────────────────────────
  const [phaseDrawer, setPhaseDrawer] = useState<{ open: boolean; phase: RoadmapPhase | null }>({ open: false, phase: null });
  const [itemDrawer,  setItemDrawer]  = useState<{ open: boolean; item: RoadmapItem | null; phaseId: string | null }>({ open: false, item: null, phaseId: null });

  function openNewPhase()                { setPhaseDrawer({ open: true, phase: null }); }
  function openEditPhase(p: RoadmapPhase) { setPhaseDrawer({ open: true, phase: p }); }
  function closePhaseDrawer()            { setPhaseDrawer({ open: false, phase: null }); }

  function openNewItem(phaseId: string | null) { setItemDrawer({ open: true, item: null, phaseId }); }
  function openEditItem(item: RoadmapItem)     { setItemDrawer({ open: true, item, phaseId: item.phase_id ?? null }); }
  function closeItemDrawer()                   { setItemDrawer({ open: false, item: null, phaseId: null }); }

  const isLoading = loadingPhases || loadingItems;

  const viewBtnStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px", borderRadius: 4, cursor: "pointer",
    border: `1px solid ${active ? C.ac : C.brdL}`,
    background: active ? `${C.ac}18` : "transparent",
    color: active ? C.ac : C.tx3,
    fontSize: 12, fontWeight: active ? 700 : 400,
    fontFamily: "inherit", transition: "all 120ms",
  });

  return (
    <div style={{ padding: "24px 24px 60px", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 4, flexShrink: 0,
          background: `${C.ac}20`, border: `1px solid ${C.ac}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Map size={18} style={{ color: C.ac }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.tx, letterSpacing: "-0.5px" }}>Roadmap</div>
          <div style={{ fontSize: 13, color: C.tx3, marginTop: 3 }}>
            {isAdmin
              ? "Gérez les phases et items de la roadmap produit."
              : "Consultez et votez pour les fonctionnalités à venir."}
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 6 }}>
          <button style={viewBtnStyle(view === "journey")} onClick={() => setView("journey")}>
            <Route size={13} /> Parcours
          </button>
          <button style={viewBtnStyle(view === "kanban")} onClick={() => setView("kanban")}>
            <Columns3 size={13} /> Kanban
          </button>
        </div>

        {/* Admin: new phase */}
        {isAdmin && (
          <button
            type="button"
            onClick={openNewPhase}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 4,
              border: `1px solid ${C.ac}50`, background: `${C.ac}15`,
              color: C.ac, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} /> Nouvelle phase
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ textAlign: "center", color: C.tx3, padding: 60 }}>Chargement…</div>
      ) : phases.length === 0 && items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60,
          background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx3, marginBottom: 12 }}>ROADMAP</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Roadmap vide</div>
          <div style={{ fontSize: 13, color: C.tx3 }}>
            {isAdmin ? "Créez votre première phase pour démarrer." : "La roadmap est en cours de préparation."}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openNewPhase}
              style={{
                marginTop: 20, padding: "9px 20px", borderRadius: 4,
                border: "none", background: C.acV, color: "#0E0C0A",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Créer une phase
            </button>
          )}
        </div>
      ) : view === "journey" ? (
        <RoadmapJourneyView
          phases={phases}
          items={items}
          voteCounts={voteCounts}
          myVotes={myVotes}
          isAdmin={isAdmin}
          userId={profile?.id}
          onAddItem={openNewItem}
          onEditItem={openEditItem}
          onEditPhase={openEditPhase}
        />
      ) : (
        <RoadmapKanbanView
          phases={phases}
          items={items}
          voteCounts={voteCounts}
          myVotes={myVotes}
          isAdmin={isAdmin}
          userId={profile?.id}
          onAddItem={openNewItem}
          onEditItem={openEditItem}
          onEditPhase={openEditPhase}
        />
      )}

      {/* Drawers */}
      {phaseDrawer.open && (
        <RoadmapPhaseDrawer
          phase={phaseDrawer.phase}
          onClose={closePhaseDrawer}
        />
      )}

      {itemDrawer.open && (
        <RoadmapItemDrawer
          item={itemDrawer.item}
          phases={phases}
          isAdmin={isAdmin}
          onClose={closeItemDrawer}
          defaultPhaseId={itemDrawer.phaseId}
        />
      )}
    </div>
  );
}
