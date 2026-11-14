/**
 * MethodCard — carte d'une méthode dans la banque.
 * Actions : Modifier, Dupliquer, Supprimer (si auteur ou admin).
 */
import { useState } from "react";
import { Pencil, Copy, Trash2, ChevronDown, ChevronUp, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { MethodPreview } from "./MethodPreview";
import { methodConfigToText } from "./methodConfigConvert";
import type { TrainingMethod, MethodScope, FullWeekConfig, MethodConfig } from "@/types/trainingMethods";

// ─── Labels / colors ──────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<MethodScope, string> = {
  classic:  "Classique",
  set:      "Sous-série",
  exercise: "Exercice",
};

/** Bandeau et pastille de portée (classes écrites en entier pour Tailwind). */
const SCOPE_TONE: Record<MethodScope | "none", { stripe: string; badge: string }> = {
  classic:  { stripe: "bg-agon-succes", badge: "bg-agon-succes/[0.125] text-agon-succes" },
  set:      { stripe: "bg-agon-accent", badge: "bg-agon-accent/[0.125] text-agon-accent" },
  exercise: { stripe: "bg-agon-coach",  badge: "bg-agon-coach/[0.125] text-agon-coach" },
  none:     { stripe: "bg-agon-tx3",    badge: "bg-agon-tx3/[0.125] text-agon-tx3" },
};

const BADGE = "rounded px-1.5 py-0.5 text-[9px] font-bold";
const OUTLINE_BTN = "cursor-pointer rounded border border-agon-brd-l bg-transparent text-[11px]";

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

  const scope = SCOPE_TONE[method.scope] ?? SCOPE_TONE.none;
  const weeklyConfigs = (method.config as unknown as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined;
  const weekCount = weeklyConfigs?.length ?? 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1 [transition:border-color_150ms]">
      {/* Color stripe */}
      <div className={cn("h-[3px]", scope.stripe)} />

      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {/* Header row */}
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 text-[14px] font-bold leading-[1.3] text-agon-tx">
              {method.name}
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {/* Scope badge */}
              <span className={cn(BADGE, "uppercase", scope.badge)}>
                {SCOPE_LABEL[method.scope]}
              </span>
              {/* Category badge */}
              {method.category && (
                <span className={cn(BADGE, "uppercase bg-agon-tx3/[0.082] text-agon-tx3")}>
                  {method.category}
                </span>
              )}
              {/* Multi-week badge */}
              {weekCount > 0 && (
                <span className={cn(BADGE, "bg-agon-accent/[0.15] text-agon-accent")}>
                  {weekCount} sem.
                </span>
              )}
              {/* Official badge */}
              {method.is_official && (
                <span className={cn(BADGE, "inline-flex items-center gap-[3px] bg-agon-or-clair-doux text-agon-or-clair")}>
                  <Star size={8} className="fill-agon-or-clair" /> Officiel
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {method.description && (
          <div className={cn(
            "text-[12px] leading-[1.5] text-agon-tx3 [display:-webkit-box] [-webkit-box-orient:vertical]",
            expanded ? "overflow-visible" : "overflow-hidden [-webkit-line-clamp:2]",
          )}>
            {method.description}
          </div>
        )}

        {/* Preview compact — masqué si weekly_configs existent (c'est eux qui font foi) */}
        {weekCount === 0 && <MethodPreview config={method.config} compact />}

        {/* Weekly protocol display */}
        {weekCount > 0 && weeklyConfigs && (
          <div className="mt-1 flex flex-col gap-[3px]">
            {weeklyConfigs.map((wc) => (
              <div key={wc.week} className="flex items-baseline gap-2">
                <span className="min-w-[20px] shrink-0 text-[9px] font-bold text-agon-accent">S{wc.week}</span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-agon-tx3 [font-family:monospace]">
                  {wc.config ? methodConfigToText(wc.config as MethodConfig) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {method.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {method.tags.map((tag) => (
              <span key={tag} className="rounded-[6px] border border-agon-brd-l bg-agon-s2 px-[7px] py-0.5 text-[10px] text-agon-tx3">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Author */}
        <div className="text-[10px] text-agon-tx3">
          {method.is_official ? "Méthode officielle" : creatorName ? `Par ${creatorName}` : "Coach"}
        </div>

        {/* Expand toggle */}
        {method.description && method.description.length > 80 && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="flex cursor-pointer items-center gap-1 bg-transparent p-0 text-[11px] text-agon-tx3"
          >
            {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Voir plus</>}
          </button>
        )}

        {/* Actions */}
        {canEdit && (
          <div className="flex gap-1.5 border-t border-agon-brd pt-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(method)}
                className={cn(OUTLINE_BTN, "flex flex-1 items-center justify-center gap-[5px] py-1.5 font-semibold text-agon-tx2")}
              >
                <Pencil size={11} /> Modifier
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(method)}
                className={cn(OUTLINE_BTN, "flex items-center justify-center px-2.5 py-1.5 text-agon-tx3")}
                title="Dupliquer"
              >
                <Copy size={12} />
              </button>
            )}
            {onDelete && !confirmDel && (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="flex cursor-pointer items-center justify-center rounded border border-agon-erreur/25 bg-agon-erreur-doux px-2.5 py-1.5 text-[11px] text-agon-erreur"
                title="Supprimer"
              >
                <Trash2 size={12} />
              </button>
            )}
            {onDelete && confirmDel && (
              <div className="flex flex-1 gap-[5px]">
                <button
                  type="button"
                  onClick={() => { onDelete(method); setConfirmDel(false); }}
                  className="flex-1 cursor-pointer rounded bg-agon-erreur py-1.5 text-[11px] font-bold text-agon-tx"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  className={cn(OUTLINE_BTN, "px-2.5 py-1.5 text-agon-tx3")}
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
