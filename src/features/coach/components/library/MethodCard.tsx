/**
 * MethodCard — carte d'une méthode dans la banque.
 * Actions : Modifier, Dupliquer, Supprimer (si auteur ou admin).
 */
import { useState } from "react";
import { Pencil, Copy, Trash2, ChevronDown, ChevronUp, Star } from "lucide-react";
import { C } from "@/lib/theme";
import { MethodPreview, methodConfigToText } from "./MethodPreview";
import type { TrainingMethod, MethodScope, FullWeekConfig, MethodConfig } from "@/types/trainingMethods";

// ─── Labels / colors ──────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<MethodScope, string> = {
  classic:  "Classique",
  set:      "Sous-série",
  exercise: "Exercice",
};

const SCOPE_COLOR: Record<MethodScope, string> = {
  classic:  C.g,
  set:      C.ac,
  exercise: C.coach,
};


// ─── Component ───────────────────────────────────────────────────────────────

interface MethodCardProps {
  method:        TrainingMethod;
  canEdit:       boolean;
  currentUserId: string | undefined;
  creatorName?:  string;
  onEdit?:       (method: TrainingMethod) => void;
  onDuplicate?:  (method: TrainingMethod) => void;
  onDelete?:     (method: TrainingMethod) => void;
}

export function MethodCard({
  method, canEdit, creatorName, onEdit, onDuplicate, onDelete,
}: MethodCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const scopeColor = SCOPE_COLOR[method.scope] ?? C.tx3;
  const weeklyConfigs = (method.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined;
  const weekCount = weeklyConfigs?.length ?? 0;

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6,
      overflow: "hidden", display: "flex", flexDirection: "column",
      transition: "border-color 150ms",
    }}>
      {/* Color stripe */}
      <div style={{ height: 3, background: scopeColor }} />

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6, lineHeight: 1.3 }}>
              {method.name}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {/* Scope badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: `${scopeColor}20`, color: scopeColor, textTransform: "uppercase",
              }}>
                {SCOPE_LABEL[method.scope]}
              </span>
              {/* Category badge */}
              {method.category && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: `${C.tx3}15`, color: C.tx3, textTransform: "uppercase",
                }}>
                  {method.category}
                </span>
              )}
              {/* Multi-week badge */}
              {weekCount > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: "rgba(123,111,255,0.15)", color: "#FFC933",
                }}>
                  {weekCount} sem.
                </span>
              )}
              {/* Official badge */}
              {method.is_official && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: C.yS, color: C.y,
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}>
                  <Star size={8} fill={C.y} /> Officiel
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {method.description && (
          <div style={{
            fontSize: 12, color: C.tx3, lineHeight: 1.5,
            display: "-webkit-box", WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: "vertical", overflow: expanded ? "visible" : "hidden",
          }}>
            {method.description}
          </div>
        )}

        {/* Preview compact — masqué si weekly_configs existent (c'est eux qui font foi) */}
        {weekCount === 0 && <MethodPreview config={method.config} compact />}

        {/* Weekly protocol display */}
        {weekCount > 0 && weeklyConfigs && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
            {weeklyConfigs.map((wc) => (
              <div key={wc.week} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#FFC933", flexShrink: 0, minWidth: 20 }}>S{wc.week}</span>
                <span style={{ fontSize: 10, color: C.tx3, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {wc.config ? methodConfigToText(wc.config as MethodConfig) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {method.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {method.tags.map((tag) => (
              <span key={tag} style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 6,
                background: C.s2, color: C.tx3, border: `1px solid ${C.brdL}`,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Author */}
        <div style={{ fontSize: 10, color: C.tx3 }}>
          {method.is_official ? "Méthode officielle" : creatorName ? `Par ${creatorName}` : "Coach"}
        </div>

        {/* Expand toggle */}
        {method.description && method.description.length > 80 && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            style={{
              background: "none", border: "none", cursor: "pointer", color: C.tx3,
              fontSize: 11, display: "flex", alignItems: "center", gap: 4, padding: 0,
              fontFamily: "inherit",
            }}
          >
            {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Voir plus</>}
          </button>
        )}

        {/* Actions */}
        {canEdit && (
          <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: `1px solid ${C.brd}` }}>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(method)}
                style={{
                  flex: 1, padding: "6px 0", borderRadius: 4,
                  border: `1px solid ${C.brdL}`, background: "transparent",
                  color: C.tx2, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                <Pencil size={11} /> Modifier
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(method)}
                style={{
                  padding: "6px 10px", borderRadius: 4,
                  border: `1px solid ${C.brdL}`, background: "transparent",
                  color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Dupliquer"
              >
                <Copy size={12} />
              </button>
            )}
            {onDelete && !confirmDel && (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                style={{
                  padding: "6px 10px", borderRadius: 4,
                  border: `1px solid ${C.r}40`, background: C.rS,
                  color: C.r, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Supprimer"
              >
                <Trash2 size={12} />
              </button>
            )}
            {onDelete && confirmDel && (
              <div style={{ display: "flex", gap: 5, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => { onDelete(method); setConfirmDel(false); }}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 4,
                    border: "none", background: C.r,
                    color: "#fff", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    border: `1px solid ${C.brdL}`, background: "transparent",
                    color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
