import { C } from "@/lib/theme";
import { useState } from "react";

/** Commentaire d'un exercice « libre » (sous la case à cocher, hors zone cliquable). */
export function LibreComment({ comment, canEdit, onChange }: { comment: string; canEdit: boolean; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !comment) return null;
  if (!open && !comment) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", marginTop: 6, padding: "8px 0", minHeight: 36, borderRadius: 7,
          border: `1px dashed ${C.brdL}`, background: "transparent", color: C.tx3,
          fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Commentaire
      </button>
    );
  }
  return (
    <textarea
      value={comment}
      onChange={(e) => onChange(e.target.value)}
      readOnly={!canEdit}
      placeholder="Commentaire sur cet exercice…"
      rows={2}
      style={{
        width: "100%", marginTop: 6, background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 4,
        padding: "8px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit",
        outline: "none", resize: "none", boxSizing: "border-box",
      }}
    />
  );
}
