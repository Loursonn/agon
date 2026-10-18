import { useState } from "react";
import { MapPin, Trophy } from "lucide-react";
import { C } from "@/lib/theme";
import { competitionDayLabel } from "@/types/planning";
import { useUpdateCompetitionComment } from "@/features/shared/hooks/retoursComments.mutations";

export interface CompetitionDayCardData {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string | null;
  priority: "A" | "B" | "C" | null;
  athlete_comment: string | null;
}

function localISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Jour de compétition côté athlète — affiché en tête du jour (semaine,
 * Programme, Aujourd'hui). Le bilan se remplit dès le jour J ; tant qu'il
 * est vide, la compétition reste « à commenter ».
 */
export function CompetitionDayCard({
  competition,
  viewOnly = false,
  showDate = false,
}: {
  competition: CompetitionDayCardData;
  viewOnly?: boolean;
  /** Afficher la date (rappel « à commenter » hors du jour concerné) */
  showDate?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(competition.athlete_comment ?? "");
  const update = useUpdateCompetitionComment();

  const today = localISO();
  const canReview = competition.date <= today;
  // Jour passé sans bilan : reste « à commenter » jusqu'à ce qu'il soit rempli
  const toComment = competition.date < today && !competition.athlete_comment;

  const save = () => {
    if (!text.trim()) return;
    update.mutate(
      { competitionId: competition.id, athleteComment: text.trim() },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div style={{
      background: C.rS, border: "1px solid " + C.r + "60", borderRadius: 6,
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: C.r,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Trophy size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.r, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {competitionDayLabel(competition.type)}
            {showDate && " · " + new Date(competition.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {competition.name}
          </div>
          {competition.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.tx3, marginTop: 1 }}>
              <MapPin size={10} /> {competition.location}
            </div>
          )}
        </div>
        {competition.priority && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: C.r + "20", color: C.r, flexShrink: 0,
          }}>
            {competition.priority}
          </span>
        )}
      </div>

      {/* Bilan : disponible dès le jour J */}
      {canReview && (
        editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Comment s'est passée ta compétition ? Résultat, sensations, ce qui a marché ou pas…"
              style={{
                width: "100%", background: C.s1, border: "1px solid " + C.brdL, borderRadius: 4,
                padding: "8px 10px", color: C.tx, fontSize: 13, fontFamily: "inherit",
                resize: "none", outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={save}
                disabled={update.isPending || !text.trim()}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 6, border: "none", background: C.r,
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  opacity: update.isPending || !text.trim() ? 0.6 : 1,
                }}
              >
                Enregistrer mon bilan
              </button>
              <button
                onClick={() => { setEditing(false); setText(competition.athlete_comment ?? ""); }}
                style={{
                  padding: "9px 14px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent",
                  color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : competition.athlete_comment ? (
          <div style={{ background: C.s1, borderRadius: 4, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Mon bilan</span>
              {!viewOnly && (
                <button
                  onClick={() => setEditing(true)}
                  style={{ background: "none", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  Modifier
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{competition.athlete_comment}</div>
          </div>
        ) : !viewOnly ? (
          <button
            onClick={() => setEditing(true)}
            style={{
              width: "100%", padding: "9px 0", borderRadius: 6, border: "none", background: C.r,
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {toComment ? "Compétition à commenter — remplir mon bilan" : "Remplir mon bilan"}
          </button>
        ) : (
          <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>Compétition à commenter</div>
        )
      )}
    </div>
  );
}
