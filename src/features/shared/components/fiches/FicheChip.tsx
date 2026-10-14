/**
 * FicheChip — « 📄 Titre · variante », état « Nouveau », × optionnel.
 * Utilisé dans les séances (athlète) et dans l'éditeur de programmation (coach).
 */
import { C } from "@/lib/theme";
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
      style={{
        display: "inline-flex", alignItems: "center", maxWidth: "100%",
        borderRadius: 4, border: "1px solid " + (isNew ? C.ac + "60" : C.brdL),
        background: isNew ? C.acS : C.s2, overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        title={title + (variant ? " · " + variant : "")}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0,
          minHeight: compact ? 32 : 40, padding: compact ? "4px 8px" : "6px 10px",
          background: "transparent", border: "none", color: archived ? C.tx3 : C.tx,
          fontSize: compact ? 11 : 12, fontWeight: 600, fontFamily: "inherit",
          cursor: onClick ? "pointer" : "default", textAlign: "left",
        }}
      >
        <span aria-hidden>📄</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
          {variant && <span style={{ color: C.tx3, fontWeight: 500 }}> · {variant}</span>}
          {hint && <span style={{ color: C.tx3, fontWeight: 500 }}> · {hint}</span>}
        </span>
        {isNew && (
          <span style={{ fontSize: 9, fontWeight: 800, color: "#0E0C0A", background: C.ac, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
            NOUVEAU
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Retirer la fiche"
          style={{
            alignSelf: "stretch", minWidth: 32, border: "none", borderLeft: "1px solid " + C.brd,
            background: "transparent", color: C.tx3, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
          }}
        >×</button>
      )}
    </span>
  );
}
