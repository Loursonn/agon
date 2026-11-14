import type { ReactNode } from "react";
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
    <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-agon-brd-l bg-agon-s1 py-3 pl-[17px] pr-3.5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-accent" />
      {retour && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-agon-tx">{coachName || "Ton coach"}</span>
            <span className="flex-1" />
            <span className="agon-mono text-[11px] uppercase tracking-[0.08em] text-agon-tx3">{weekLabel(retour.week_start)}</span>
            {seen && <span className="text-[13px]" title={"Ta réaction : " + seen.label}>{reactionEmoji(seen.key)}</span>}
          </div>
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-normal text-agon-tx2">{retour.comment}</p>
          {onReact && unread && (
            <div className="grid grid-cols-4 gap-1.5">
              {RETOUR_REACTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onReact(r.key)}
                  className="h-8 cursor-pointer whitespace-nowrap rounded-[8px] border border-agon-brd-l bg-transparent p-0 font-[inherit] text-[12px] text-agon-tx"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {retour && children && <div className="h-px bg-agon-brd" />}
      {children}
    </div>
  );
}
