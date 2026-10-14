/**
 * RoadmapJourneyView — vue visuelle de la progression de la roadmap.
 * Phases affichées comme des étapes d'un parcours vertical.
 * Chaque phase : barre de progression, items groupés par statut, votes.
 */
import { useState } from "react";
import { ThumbsUp, ChevronDown, ChevronUp, Plus, Pencil, CheckCircle2, Clock, Lightbulb, Circle } from "lucide-react";
import { C } from "@/lib/theme";
import type { RoadmapPhase, RoadmapItem, RoadmapItemStatus } from "@/features/coach/types/roadmap";
import {
  CATEGORY_LABEL, CATEGORY_COLOR, PRIORITY_COLOR,
  ITEM_STATUS_LABEL, ITEM_STATUS_COLOR,
  PHASE_STATUS_COLOR, PHASE_STATUS_LABEL,
} from "@/features/coach/types/roadmap";
import { useToggleVote, useUpdateItem } from "@/features/shared/hooks/useRoadmap";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function phaseProgress(items: RoadmapItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.status === "shipped").length;
  return Math.round((done / items.length) * 100);
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  shipped:     <CheckCircle2 size={14} />,
  in_progress: <Clock size={14} />,
  planned:     <Circle size={14} />,
  backlog:     <Circle size={14} />,
  idea:        <Lightbulb size={14} />,
};

const ITEM_STATUS_ORDER: RoadmapItemStatus[] = ["shipped", "in_progress", "planned", "backlog", "idea"];

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, voteCount, voted, isAdmin, userId, onEdit,
}: {
  item: RoadmapItem;
  voteCount: number;
  voted: boolean;
  isAdmin: boolean;
  userId: string | undefined;
  onEdit: (item: RoadmapItem) => void;
}) {
  const toggleVote = useToggleVote(userId);
  const updateItem = useUpdateItem();
  const catColor  = CATEGORY_COLOR[item.category] ?? C.tx3;
  const priColor  = PRIORITY_COLOR[item.priority] ?? C.tx3;
  const stColor   = ITEM_STATUS_COLOR[item.status] ?? C.tx3;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 14px", borderRadius: 4,
      background: item.status === "shipped" ? `${C.g}08` : C.s2,
      border: `1px solid ${item.status === "shipped" ? `${C.g}25` : C.brd}`,
      opacity: item.status === "shipped" ? 0.85 : 1,
    }}>
      {/* Status icon */}
      <div style={{ color: stColor, paddingTop: 1, flexShrink: 0 }}>
        {STATUS_ICON[item.status] ?? <Circle size={14} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: C.tx,
            textDecoration: item.status === "shipped" ? "line-through" : "none",
          }}>
            {item.title}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
            background: `${catColor}20`, color: catColor, textTransform: "uppercase",
          }}>
            {CATEGORY_LABEL[item.category]}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
            background: `${priColor}20`, color: priColor,
          }}>
            {item.priority}
          </span>
        </div>

        {item.description && (
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 3, lineHeight: 1.5 }}>
            {item.description}
          </div>
        )}
      </div>

      {/* Status pill (admin: clickable) */}
      {isAdmin ? (
        <select
          value={item.status}
          onChange={(e) => updateItem.mutate({ id: item.id, status: e.target.value as RoadmapItemStatus })}
          style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
            background: `${stColor}20`, color: stColor,
            border: `1px solid ${stColor}40`,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}
        >
          {ITEM_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>
          ))}
        </select>
      ) : (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
          background: `${stColor}20`, color: stColor, flexShrink: 0,
        }}>
          {ITEM_STATUS_LABEL[item.status]}
        </span>
      )}

      {/* Vote */}
      <button
        type="button"
        onClick={() => toggleVote.mutate({ itemId: item.id, voted })}
        disabled={toggleVote.isPending}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 6, flexShrink: 0,
          border: voted ? `1px solid ${C.ac}60` : `1px solid ${C.brdL}`,
          background: voted ? `${C.ac}15` : "transparent",
          color: voted ? C.ac : C.tx3,
          fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
        title={voted ? "Retirer mon vote" : "Voter"}
      >
        <ThumbsUp size={10} fill={voted ? C.ac : "none"} />
        {voteCount}
      </button>

      {/* Edit (admin) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onEdit(item)}
          style={{
            padding: "3px 6px", borderRadius: 6, flexShrink: 0,
            border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center",
          }}
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
}

// ─── PhaseCard ────────────────────────────────────────────────────────────────

function PhaseCard({
  phase, items, isFirst, isLast,
  voteCounts, myVotes, isAdmin, userId,
  onAddItem, onEditItem, onEditPhase,
}: {
  phase:       RoadmapPhase;
  items:       RoadmapItem[];
  isFirst:     boolean;
  isLast:      boolean;
  voteCounts:  Record<string, number>;
  myVotes:     string[];
  isAdmin:     boolean;
  userId:      string | undefined;
  onAddItem:   (phaseId: string) => void;
  onEditItem:  (item: RoadmapItem) => void;
  onEditPhase: (phase: RoadmapPhase) => void;
}) {
  const [expanded, setExpanded] = useState(phase.status !== "shipped");
  const pct = phaseProgress(items);
  const statusColor = PHASE_STATUS_COLOR[phase.status];
  const shipped = items.filter((i) => i.status === "shipped").length;

  const sorted = [...items].sort((a, b) =>
    ITEM_STATUS_ORDER.indexOf(a.status) - ITEM_STATUS_ORDER.indexOf(b.status)
  );

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Timeline column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40, flexShrink: 0 }}>
        {/* Top connector */}
        <div style={{
          width: 2, flex: isFirst ? "0 0 20px" : "0 0 28px",
          background: isFirst ? "transparent" : `${statusColor}40`,
        }} />
        {/* Node */}
        <div style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
          border: `3px solid ${statusColor}`,
          background: phase.status === "shipped" ? statusColor : C.bg,
          zIndex: 1,
        }} />
        {/* Bottom connector */}
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 24,
            background: `${statusColor}30`,
          }} />
        )}
      </div>

      {/* Card */}
      <div style={{
        flex: 1, marginLeft: 16, marginBottom: isLast ? 0 : 20,
        background: C.s1, border: `1px solid ${C.brd}`,
        borderRadius: 6, overflow: "hidden",
      }}>
        {/* Phase header */}
        <div
          style={{
            padding: "14px 16px", cursor: "pointer",
            borderBottom: expanded ? `1px solid ${C.brd}` : "none",
          }}
          onClick={() => setExpanded((p) => !p)}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {/* Left info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{phase.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                  background: `${statusColor}20`, color: statusColor,
                }}>
                  {PHASE_STATUS_LABEL[phase.status]}
                </span>
                <span style={{ fontSize: 11, color: C.tx3 }}>{phase.quarter}</span>
              </div>
              {phase.description && (
                <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>{phase.description}</div>
              )}
            </div>

            {/* Right: stats + actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditPhase(phase); }}
                  style={{
                    padding: "4px 6px", borderRadius: 6,
                    border: `1px solid ${C.brdL}`, background: "transparent",
                    color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center",
                  }}
                >
                  <Pencil size={12} />
                </button>
              )}
              <div style={{ fontSize: 12, color: C.tx3, textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: C.tx }}>{shipped}/{items.length}</div>
                <div style={{ fontSize: 10 }}>livrés</div>
              </div>
              {expanded ? <ChevronUp size={16} color={C.tx3} /> : <ChevronDown size={16} color={C.tx3} />}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 5, borderRadius: 4, background: C.brd, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${pct}%`,
              background: pct === 100 ? C.g : statusColor,
              transition: "width 500ms ease-out",
            }} />
          </div>
          <div style={{ fontSize: 10, color: C.tx3, marginTop: 4, textAlign: "right" }}>{pct}%</div>
        </div>

        {/* Items list */}
        {expanded && (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.length === 0 ? (
              <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", padding: "12px 0" }}>
                Aucun item dans cette phase
              </div>
            ) : (
              sorted.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  voteCount={voteCounts[item.id] ?? 0}
                  voted={myVotes.includes(item.id)}
                  isAdmin={isAdmin}
                  userId={userId}
                  onEdit={onEditItem}
                />
              ))
            )}

            {/* Add item */}
            <button
              type="button"
              onClick={() => onAddItem(phase.id)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 4,
                border: `1px dashed ${C.brdL}`, background: "transparent",
                color: C.tx3, fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              <Plus size={13} />
              {isAdmin ? "Ajouter un item" : "Suggérer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RoadmapJourneyView ───────────────────────────────────────────────────────

interface Props {
  phases:      RoadmapPhase[];
  items:       RoadmapItem[];
  voteCounts:  Record<string, number>;
  myVotes:     string[];
  isAdmin:     boolean;
  userId:      string | undefined;
  onAddItem:   (phaseId: string | null) => void;
  onEditItem:  (item: RoadmapItem) => void;
  onEditPhase: (phase: RoadmapPhase) => void;
}

export function RoadmapJourneyView({
  phases, items, voteCounts, myVotes, isAdmin, userId,
  onAddItem, onEditItem, onEditPhase,
}: Props) {
  const totalItems   = items.length;
  const shippedItems = items.filter((i) => i.status === "shipped").length;
  const globalPct    = totalItems ? Math.round((shippedItems / totalItems) * 100) : 0;

  // Unassigned items
  const unassigned = items.filter((i) => !i.phase_id);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Global progress */}
      <div style={{
        padding: "16px 20px", borderRadius: 6, marginBottom: 28,
        background: C.s1, border: `1px solid ${C.brd}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Progression globale</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ac }}>{globalPct}%</div>
        </div>
        <div style={{ height: 8, borderRadius: 6, background: C.brd, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 6,
            width: `${globalPct}%`,
            background: `linear-gradient(90deg, ${C.ac}, ${C.g})`,
            transition: "width 600ms ease-out",
          }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "Total",      value: totalItems,                                            color: C.tx3 },
            { label: "Livrés",     value: shippedItems,                                          color: C.g   },
            { label: "En cours",   value: items.filter((i) => i.status === "in_progress").length, color: "#f97316" },
            { label: "Planifiés",  value: items.filter((i) => i.status === "planned").length,     color: "#facc15" },
            { label: "Idées",      value: items.filter((i) => i.status === "idea").length,        color: C.tx3 },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ color: C.tx3 }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: C.tx }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phases timeline */}
      {phases.map((phase, idx) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          items={items.filter((i) => i.phase_id === phase.id)}
          isFirst={idx === 0}
          isLast={idx === phases.length - 1 && unassigned.length === 0}
          voteCounts={voteCounts}
          myVotes={myVotes}
          isAdmin={isAdmin}
          userId={userId}
          onAddItem={(pid) => onAddItem(pid)}
          onEditItem={onEditItem}
          onEditPhase={onEditPhase}
        />
      ))}

      {/* Unassigned items */}
      {unassigned.length > 0 && (
        <div style={{
          marginTop: phases.length > 0 ? 24 : 0,
          background: C.s1, border: `1px solid ${C.brd}`,
          borderRadius: 6, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.brd}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Non assignés</span>
            <span style={{ fontSize: 11, color: C.tx3, marginLeft: 8 }}>{unassigned.length} items</span>
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {unassigned.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                voteCount={voteCounts[item.id] ?? 0}
                voted={myVotes.includes(item.id)}
                isAdmin={isAdmin}
                userId={userId}
                onEdit={onEditItem}
              />
            ))}
            <button
              type="button"
              onClick={() => onAddItem(null)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 4,
                border: `1px dashed ${C.brdL}`, background: "transparent",
                color: C.tx3, fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              <Plus size={13} /> {isAdmin ? "Ajouter" : "Suggérer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
