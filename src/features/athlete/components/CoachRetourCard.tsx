import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { RETOUR_REACTIONS, reactionEmoji, type RetourReaction, type WeeklyRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00");
  return "Sem. du " + d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface CoachRetourCardProps {
  /** Retour de la semaine ; absent = carte avec seulement le retour de séance (`children`). */
  retour?: WeeklyRetour | null;
  coachName?: string | null;
  /** Absent = lecture seule (déjà vu, ou coach en mode athlète) */
  onReact?: (reaction: RetourReaction) => void;
  /** Retour sur une séance, sous le retour de la semaine. */
  children?: ReactNode;
}

/**
 * Retour du coach (maquette « Aujourd'hui ») : carte neutre à filet or,
 * nom du coach et semaine, texte, 4 réactions en mots, puis le retour sur la
 * dernière séance. Réagir = « vu » : la carte quitte l'accueil et reste dans
 * le panneau latéral.
 */
export function CoachRetourCard({ retour, coachName, onReact, children }: CoachRetourCardProps) {
  const seen = retour ? RETOUR_REACTIONS.find((x) => x.key === retour.athlete_reaction) : undefined;
  const unread = !!retour && !retour.athlete_reaction;

  return (
    <div
      style={{
        position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10,
        border: "1px solid rgba(231,211,168,0.18)", borderRadius: 14, background: C.s1, padding: "12px 14px 12px 17px",
      }}
    >
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.ac }} />
      {retour && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.tx, fontWeight: 500 }}>{coachName || "Ton coach"}</span>
            <span style={{ flex: 1 }} />
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx3 }}>{weekLabel(retour.week_start)}</span>
            {seen && <span style={{ fontSize: 13 }} title={"Ta réaction : " + seen.label}>{reactionEmoji(seen.key)}</span>}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{retour.comment}</p>
          {onReact && unread && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {RETOUR_REACTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onReact(r.key)}
                  style={{
                    height: 32, background: "none", border: "1px solid rgba(231,211,168,0.18)", borderRadius: 8, padding: 0,
                    color: C.tx, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {retour && children && <div style={{ height: 1, background: "rgba(231,211,168,0.10)" }} />}
      {children}
    </div>
  );
}
