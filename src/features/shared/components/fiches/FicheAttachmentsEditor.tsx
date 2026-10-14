/**
 * FicheAttachmentsEditor — chips « 📄 Titre · variante » + « + Fiche ».
 * Clic = modifier (variante / semaines), × = retirer.
 * Réutilisé pour séance, bloc, override d'occurrence et séance énergie.
 */
import { useState } from "react";
import { C } from "@/lib/theme";
import { attachmentDocIds } from "@/features/shared/types/fiches";
import type { FicheAttachment } from "@/features/shared/types/fiches";
import { useDocsByIds } from "@/features/shared/hooks/fiches/useDocs";
import { FicheChip } from "./FicheChip";
import { FichePickerDrawer } from "./FichePickerDrawer";

interface Props {
  value: FicheAttachment[] | undefined;
  onChange: (next: FicheAttachment[]) => void;
  athleteId?: string;
  athleteName?: string;
  /** Semaines pour « Varier selon la semaine » (S1…Sn) */
  weeks?: number[];
  compact?: boolean;
  disabled?: boolean;
}

export function FicheAttachmentsEditor({ value, onChange, athleteId, athleteName, weeks = [], compact, disabled }: Props) {
  const list = value ?? [];
  const { data: docs = {} } = useDocsByIds(list.flatMap(attachmentDocIds));
  const [editing, setEditing] = useState<FicheAttachment | "new" | null>(null);

  const save = (att: FicheAttachment) => {
    const exists = list.some(a => a.id === att.id);
    onChange(exists ? list.map(a => (a.id === att.id ? att : a)) : [...list, att]);
    setEditing(null);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {list.map(att => {
        const varies = !!att.weeks && Object.keys(att.weeks).length > 0;
        return (
          <FicheChip
            key={att.id}
            compact={compact}
            doc={docs[att.doc_id]}
            fallback="Fiche indisponible"
            hint={varies ? "varie selon la semaine" : undefined}
            onClick={disabled ? undefined : () => setEditing(att)}
            onRemove={disabled ? undefined : () => onChange(list.filter(a => a.id !== att.id))}
          />
        );
      })}
      {!disabled && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          style={{
            minHeight: compact ? 32 : 40, padding: compact ? "4px 10px" : "6px 12px", borderRadius: 4,
            border: "1px dashed " + C.brdL, background: "transparent", color: C.tx3,
            fontSize: compact ? 11 : 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + Fiche
        </button>
      )}
      {editing && (
        <FichePickerDrawer
          athleteId={athleteId}
          athleteName={athleteName}
          weeks={weeks}
          initial={editing === "new" ? null : editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
