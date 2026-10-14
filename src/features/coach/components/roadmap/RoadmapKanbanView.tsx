/**
 * RoadmapKanbanView — vue kanban par phase.
 * Colonnes = phases (triées par sort_order).
 * Items votables via clic sur le compteur.
 * Admin peut changer statut d'item inline.
 */
import { useState } from "react";
import { ThumbsUp, Plus, Pencil, Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import type { RoadmapPhase, RoadmapItem, RoadmapItemStatus } from "@/features/coach/types/roadmap";
import {
  CATEGORY_LABEL, CATEGORY_COLOR, PRIORITY_COLOR,
  ITEM_STATUS_LABEL, ITEM_STATUS_COLOR, PHASE_STATUS_COLOR, PHASE_STATUS_LABEL,
} from "@/features/coach/types/roadmap";
import { useToggleVote, useDeleteItem, useUpdateItem, useDeletePhase } from "@/features/shared/hooks/useRoadmap";

// ─── ItemCard ─────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item:       RoadmapItem;
  voteCount:  number;
  voted:      boolean;
  isAdmin:    boolean;
  userId:     string | undefined;
  onEdit:     (item: RoadmapItem) => void;
}

const ITEM_STATUSES: RoadmapItemStatus[] = ["idea", "backlog", "planned", "in_progress", "shipped"];

function ItemCard({ item, voteCount, voted, isAdmin, userId, onEdit }: ItemCardProps) {
  const toggleVote = useToggleVote(userId);
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();
  const [confirmDel, setConfirmDel] = useState(false);

  const catColor = CATEGORY_COLOR[item.category] ?? C.tx3;
  const priColor = PRIORITY_COLOR[item.priority] ?? C.tx3;

  return (
    <div style={{
      background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4,
      padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* Top row: category + priority */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          background: `${catColor}20`, color: catColor, textTransform: "uppercase",
        }}>
          {CATEGORY_LABEL[item.category]}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          background: `${priColor}20`, color: priColor,
        }}>
          {item.priority}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, lineHeight: 1.4 }}>
        {item.title}
      </div>

      {/* Description */}
      {item.description && (
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
          {item.description}
        </div>
      )}

      {/* Status badge (admin: inline select) */}
      {isAdmin ? (
        <select
          value={item.status}
          onChange={(e) => updateItem.mutate({ id: item.id, status: e.target.value as RoadmapItemStatus })}
          style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: `${ITEM_STATUS_COLOR[item.status]}20`,
            color: ITEM_STATUS_COLOR[item.status],
            border: `1px solid ${ITEM_STATUS_COLOR[item.status]}40`,
            cursor: "pointer", fontFamily: "inherit",
            alignSelf: "flex-start",
          }}
        >
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>
          ))}
        </select>
      ) : (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
          background: `${ITEM_STATUS_COLOR[item.status]}20`,
          color: ITEM_STATUS_COLOR[item.status],
          alignSelf: "flex-start",
        }}>
          {ITEM_STATUS_LABEL[item.status]}
        </span>
      )}

      {/* Bottom: votes + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4, borderTop: `1px solid ${C.brd}` }}>
        {/* Vote button */}
        <button
          type="button"
          onClick={() => toggleVote.mutate({ itemId: item.id, voted })}
          disabled={toggleVote.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 8px", borderRadius: 6,
            border: voted ? `1px solid ${C.ac}60` : `1px solid ${C.brdL}`,
            background: voted ? `${C.ac}15` : "transparent",
            color: voted ? C.ac : C.tx3,
            fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            transition: "all 150ms",
          }}
          title={voted ? "Retirer mon vote" : "Voter"}
        >
          <ThumbsUp size={11} fill={voted ? C.ac : "none"} />
          {voteCount}
        </button>

        {/* Admin actions */}
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={{
                padding: "4px 6px", borderRadius: 6,
                border: `1px solid ${C.brdL}`, background: "transparent",
                color: C.tx3, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center",
              }}
              title="Modifier"
            >
              <Pencil size={11} />
            </button>

            {!confirmDel ? (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                style={{
                  padding: "4px 6px", borderRadius: 6,
                  border: `1px solid ${C.r}40`, background: C.rS,
                  color: C.r, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center",
                }}
                title="Supprimer"
              >
                <Trash2 size={11} />
              </button>
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => { deleteItem.mutate(item.id); setConfirmDel(false); }}
                  style={{
                    padding: "4px 8px", borderRadius: 6, border: "none",
                    background: C.rV, color: "#0E0C0A", fontSize: 10, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  style={{
                    padding: "4px 8px", borderRadius: 6,
                    border: `1px solid ${C.brdL}`, background: "transparent",
                    color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Non
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RoadmapKanbanView ────────────────────────────────────────────────────────

interface Props {
  phases:     RoadmapPhase[];
  items:      RoadmapItem[];
  voteCounts: Record<string, number>;
  myVotes:    string[];
  isAdmin:    boolean;
  userId:     string | undefined;
  onAddItem:  (phaseId: string | null) => void;
  onEditItem: (item: RoadmapItem) => void;
  onEditPhase: (phase: RoadmapPhase) => void;
}

export function RoadmapKanbanView({
  phases, items, voteCounts, myVotes, isAdmin, userId,
  onAddItem, onEditItem, onEditPhase,
}: Props) {
  const deletePhase = useDeletePhase();
  const [confirmDelPhase, setConfirmDelPhase] = useState<string | null>(null);

  // Items without a phase
  const unassigned = items.filter((i) => !i.phase_id);

  return (
    <div style={{
      display: "flex", gap: 16, overflowX: "auto",
      padding: "0 0 16px", alignItems: "flex-start",
    }}>
      {/* Phase columns */}
      {phases.map((phase) => {
        const phaseItems = items.filter((i) => i.phase_id === phase.id);
        const statusColor = PHASE_STATUS_COLOR[phase.status];

        return (
          <div
            key={phase.id}
            style={{
              minWidth: 280, width: 280, flexShrink: 0,
              background: C.s1, border: `1px solid ${C.brd}`,
              borderRadius: 6, overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.brd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.tx }}>{phase.name}</div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => onEditPhase(phase)}
                      style={{
                        padding: "3px 5px", borderRadius: 5, border: `1px solid ${C.brdL}`,
                        background: "transparent", color: C.tx3, cursor: "pointer",
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <Pencil size={10} />
                    </button>
                    {confirmDelPhase !== phase.id ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelPhase(phase.id)}
                        style={{
                          padding: "3px 5px", borderRadius: 5,
                          border: `1px solid ${C.r}40`, background: C.rS,
                          color: C.r, cursor: "pointer", display: "flex", alignItems: "center",
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button
                          type="button"
                          onClick={() => { deletePhase.mutate(phase.id); setConfirmDelPhase(null); }}
                          style={{ padding: "3px 6px", borderRadius: 5, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelPhase(null)}
                          style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, fontSize: 9, cursor: "pointer" }}
                        >
                          Non
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                  background: `${statusColor}20`, color: statusColor,
                }}>
                  {PHASE_STATUS_LABEL[phase.status]}
                </span>
                <span style={{ fontSize: 10, color: C.tx3 }}>{phase.quarter}</span>
                <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>{phaseItems.length} items</span>
              </div>
              {phase.description && (
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 6, lineHeight: 1.4 }}>
                  {phase.description}
                </div>
              )}
            </div>

            {/* Items */}
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {phaseItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  voteCount={voteCounts[item.id] ?? 0}
                  voted={myVotes.includes(item.id)}
                  isAdmin={isAdmin}
                  userId={userId}
                  onEdit={onEditItem}
                />
              ))}

              {/* Add item button */}
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
                {isAdmin ? "Ajouter" : "Suggérer"}
              </button>
            </div>
          </div>
        );
      })}

      {/* Unassigned column */}
      {(isAdmin || unassigned.length > 0) && (
        <div style={{
          minWidth: 280, width: 280, flexShrink: 0,
          background: C.s1, border: `1px solid ${C.brd}`,
          borderRadius: 6, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Non assigné</div>
            <div style={{ fontSize: 10, color: C.tx3 }}>{unassigned.length} items</div>
          </div>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {unassigned.map((item) => (
              <ItemCard
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
              <Plus size={13} />
              {isAdmin ? "Ajouter" : "Suggérer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
