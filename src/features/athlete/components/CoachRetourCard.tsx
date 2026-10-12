import { MessageSquare } from "lucide-react";
import { C } from "@/lib/theme";
import { RETOUR_REACTIONS, reactionEmoji, type RetourReaction, type WeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00");
  return "Semaine du " + d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface CoachRetourCardProps {
  retour: WeeklyRetour;
  /** Absent = lecture seule (déjà vu, ou coach en mode athlète) */
  onReact?: (reaction: RetourReaction) => void;
}

/** Retour hebdo du coach. Réagir = « vu » : la carte quitte l'accueil et reste dans le panneau latéral. */
export function CoachRetourCard({ retour, onReact }: CoachRetourCardProps) {
  const seenEmoji = reactionEmoji(retour.athlete_reaction);
  const unread = !retour.athlete_reaction;

  return (
    <div style={{
      background: unread ? C.acS : C.s1, borderRadius: 6,
      border: "1px solid " + (unread ? C.ac + "30" : C.brd), padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <MessageSquare size={12} color={C.ac} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.ac }}>Retour de ton coach</span>
        <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>{weekLabel(retour.week_start)}</span>
        {seenEmoji && <span style={{ fontSize: 13 }} title="Ta réaction">{seenEmoji}</span>}
      </div>
      <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {retour.comment}
      </div>
      {onReact && unread && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {RETOUR_REACTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => onReact(r.key)}
              title={r.label}
              aria-label={r.label}
              style={{
                flex: 1, minHeight: 40, borderRadius: 6,
                border: "1px solid " + C.brdL, background: C.s1,
                fontSize: 18, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
