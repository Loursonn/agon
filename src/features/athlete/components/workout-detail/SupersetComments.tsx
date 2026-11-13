import { C } from "@/lib/theme";
import { SS_LETTERS, SS_ORANGE } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import type { SupersetMemberData } from "@/features/athlete/components/workout-detail/SupersetCard";
import { useState } from "react";

export function SupersetComments({ members, canEdit }: { members: SupersetMemberData[]; canEdit: boolean }) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <div style={{ padding: "6px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {members.map((m, mi) => {
        const shown = open.includes(m.id) || !!m.comment;
        if (!shown && !canEdit) return null;
        return shown ? (
          <div key={m.id}>
            <div style={{ fontSize: 9, fontWeight: 700, color: SS_ORANGE, marginBottom: 3 }}>
              {SS_LETTERS[mi]} · {m.name}
            </div>
            <textarea
              value={m.comment}
              onChange={(e) => m.onCommentChange(e.target.value)}
              readOnly={!canEdit}
              placeholder="Commentaire sur cet exercice…"
              rows={2}
              style={{
                width: "100%", background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 4,
                padding: "8px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit",
                outline: "none", resize: "none", boxSizing: "border-box",
              }}
            />
          </div>
        ) : (
          <button
            key={m.id}
            onClick={() => setOpen((o) => [...o, m.id])}
            style={{
              padding: "8px 0", minHeight: 36, borderRadius: 7, border: `1px dashed ${C.brdL}`,
              background: "transparent", color: C.tx3, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Commentaire {SS_LETTERS[mi]} · {m.name}
          </button>
        );
      })}
    </div>
  );
}
