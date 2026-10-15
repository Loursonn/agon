/**
 * CoachUpdatesCard — accueil coach : nouveautés non vues, bouton « J'ai vu ».
 * Une fois vues, elles restent consultables dans la page Nouveautés (sidebar).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates, useMarkAppUpdateSeen } from "@/features/shared/hooks/useAppUpdates";
import { ReleaseNoteContent } from "./ReleaseNoteContent";
import { ReleaseNoteKindBadge } from "./ReleaseNoteKindBadge";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export function CoachUpdatesCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unseen, isError } = useAppUpdates(user?.id);
  const mark = useMarkAppUpdateSeen();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!user || isError || unseen.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {unseen.map((note, i) => {
        const open = expanded === note.id || (expanded === null && i === 0);
        return (
          <div key={note.id} style={{
            background: "linear-gradient(135deg, " + C.acS + " 0%, " + C.s1 + " 70%)",
            border: "1px solid " + C.ac + "40", borderRadius: 6, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <ReleaseNoteKindBadge kind={note.kind} />
              <span style={{ fontSize: 11, color: C.tx3 }}>{fmtDate(note.date)}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 4 }}>{note.title}</div>
            <div style={{ fontSize: 13, color: C.tx2, marginBottom: open ? 12 : 10 }}>{note.summary}</div>
            {open && <div style={{ marginBottom: 12 }}><ReleaseNoteContent note={note} /></div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => mark.mutate({ userId: user.id, updateIds: [note.id] })}
                disabled={mark.isPending}
                style={{
                  minHeight: 40, padding: "8px 16px", borderRadius: 4, border: "none",
                  background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                J'ai vu
              </button>
              {!open && (
                <button onClick={() => setExpanded(note.id)} style={{
                  minHeight: 40, padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL,
                  background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Voir le détail</button>
              )}
              <button onClick={() => navigate("/coach/nouveautes")} style={{
                minHeight: 40, padding: "8px 14px", borderRadius: 4, border: "none",
                background: "transparent", color: C.tx3, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>Toutes les nouveautés →</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
