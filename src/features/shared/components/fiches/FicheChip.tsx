/**
 * FicheChip — « 📄 Titre · variante », état « Nouveau », × optionnel.
 * Utilisé dans les séances (athlète) et dans l'éditeur de programmation (coach).
 */
import { cn } from "@/lib/utils";
import { variantLabel } from "@/features/shared/types/fiches";
import type { Doc } from "@/features/shared/types/fiches";

interface Props {
  doc?: Doc | null;
  /** Texte de repli si la fiche n'est pas (encore) chargée */
  fallback?: string;
  /** Affiche la variante après le titre (« · V2 ») */
  showVariant?: boolean;
  /** Indication supplémentaire (ex. « varie selon la semaine ») */
  hint?: string;
  isNew?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

export function FicheChip({ doc, fallback = "Fiche", showVariant = true, hint, isNew, compact, onClick, onRemove }: Props) {
  const archived = !!doc?.archived_at;
  const title = doc?.title ?? fallback;
  const variant = doc && showVariant && (doc.origin_id || doc.variant_label) ? variantLabel(doc) : null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center overflow-hidden rounded-[4px] border",
        isNew ? "border-agon-accent/[0.38] bg-agon-accent-doux" : "border-agon-brd-l bg-agon-s2",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        title={title + (variant ? " · " + variant : "")}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 border-none bg-transparent text-left font-[inherit] font-semibold",
          compact ? "min-h-8 px-2 py-1 text-[11px]" : "min-h-10 px-2.5 py-1.5 text-[12px]",
          archived ? "text-agon-tx3" : "text-agon-tx",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span aria-hidden>📄</span>
        <span className="truncate">
          {title}
          {variant && <span className="font-medium text-agon-tx3"> · {variant}</span>}
          {hint && <span className="font-medium text-agon-tx3"> · {hint}</span>}
        </span>
        {isNew && (
          <span className="shrink-0 rounded-[3px] bg-agon-accent px-[5px] py-px text-[9px] font-extrabold text-agon-ink">
            NOUVEAU
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Retirer la fiche"
          className="min-w-8 cursor-pointer self-stretch border-0 border-l border-solid border-agon-brd bg-transparent font-[inherit] text-[15px] text-agon-tx3"
        >×</button>
      )}
    </span>
  );
}
