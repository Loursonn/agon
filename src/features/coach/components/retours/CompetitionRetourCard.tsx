import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Trophy, MapPin, MessageSquare } from "lucide-react";
import { C } from "@/lib/theme";
import { useUpdateCompetitionComment } from "@/features/shared/hooks/retoursComments.mutations";

interface CompetitionRetourCardProps {
  competition: {
    id: string;
    name: string;
    type: string;
    date: string;
    location: string | null;
    athlete_comment: string | null;
    priority: "A" | "B" | "C" | null;
  };
  athleteId: string;
}

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
  B: { bg: "rgba(245,166,35,0.15)",  color: "#F5A623" },
  C: { bg: "rgba(234,179,8,0.15)",   color: "#EAB308" },
};

export function CompetitionRetourCard({ competition }: CompetitionRetourCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [commentText, setCommentText] = useState(competition.athlete_comment ?? "");

  const updateComment = useUpdateCompetitionComment();

  const handleSave = () => {
    updateComment.mutate(
      { competitionId: competition.id, athleteComment: commentText },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const pStyle = competition.priority ? PRIORITY_STYLE[competition.priority] : null;

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={13} color="#F5A623" />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{competition.name}</span>
          {pStyle && competition.priority && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: pStyle.bg, color: pStyle.color }}>
              {competition.priority}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: C.tx3 }}>
          {format(new Date(competition.date), "EEE d MMM", { locale: fr })}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: C.tx2 }}>
          Type : <span style={{ fontWeight: 600, color: C.tx }}>{competition.type}</span>
        </div>
        {competition.location && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.tx2 }}>
            <MapPin size={10} color={C.tx3} />
            {competition.location}
          </div>
        )}
      </div>

      {/* Retour athlète */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Retour athlète</span>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}
            >
              <MessageSquare size={10} />
              {competition.athlete_comment ? "Modifier" : "Ajouter"}
            </button>
          )}
        </div>

        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              autoFocus
              placeholder="Comment s'est passée cette compétition ?"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
              style={{ width: "100%", background: C.s2, border: "1px solid " + C.brdL, borderRadius: 4, padding: "7px 10px", color: C.tx, fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={handleSave} disabled={updateComment.isPending}
                style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Enregistrer
              </button>
              <button onClick={() => { setIsEditing(false); setCommentText(competition.athlete_comment ?? ""); }}
                style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        ) : competition.athlete_comment ? (
          <div style={{ background: C.acS, borderRadius: 4, padding: "7px 10px" }}>
            <div style={{ fontSize: 12, color: C.tx2 }}>{competition.athlete_comment}</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>Aucun commentaire</div>
        )}
      </div>
    </div>
  );
}
