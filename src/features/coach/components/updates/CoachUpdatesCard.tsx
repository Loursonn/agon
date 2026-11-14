/**
 * CoachUpdatesCard — bandeau « Nouveauté » de l'accueil coach (planche
 * `Coach.dc.html`) : la plus récente des nouveautés non vues sur une ligne,
 * « Voir le détail » déplie le contenu, la croix la marque comme vue (la
 * suivante prend sa place). Les nouveautés vues restent dans la page Nouveautés.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates, useMarkAppUpdateSeen } from "@/features/shared/hooks/useAppUpdates";
import { ReleaseNoteContent } from "./ReleaseNoteContent";

const LINK = {
  ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.ac,
  background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" as const,
};

export function CoachUpdatesCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unseen, isError } = useAppUpdates(user?.id);
  const mark = useMarkAppUpdateSeen();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!user || isError || unseen.length === 0) return null;
  const note = unseen[0];
  const open = expanded === note.id;

  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 14,
      border: `1px solid ${alpha(C.ac, 0.4)}`, background: alpha(C.ac, 0.12),
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.ac }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 20px 16px 23px" }}>
        <span style={{
          ...MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase",
          background: C.ac, color: C.ink, borderRadius: 999, padding: "3px 9px", flex: "none",
        }}>Nouveauté</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note.title}</div>
          <div style={{ fontSize: 12, color: C.tx2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note.summary}</div>
        </div>
        <button type="button" style={LINK} onClick={() => setExpanded(open ? null : note.id)}>
          {open ? "Masquer" : "Voir le détail"}
        </button>
        <button type="button" style={LINK} onClick={() => navigate("/coach/nouveautes")}>
          {unseen.length > 1 ? `Toutes les nouveautés (${unseen.length}) →` : "Toutes les nouveautés →"}
        </button>
        <button
          type="button"
          aria-label="Marquer comme vue"
          title="Marquer comme vue"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ userId: user.id, updateIds: [note.id] })}
          style={{
            width: 26, height: 26, flex: "none", borderRadius: 6, border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {open && <div style={{ padding: "0 20px 16px 23px" }}><ReleaseNoteContent note={note} /></div>}
    </div>
  );
}
