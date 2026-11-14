/**
 * CoachUpdatesCard — bandeau « Nouveauté » de l'accueil coach (planche
 * `Coach.dc.html`) : la plus récente des nouveautés non vues sur une ligne,
 * « Voir le détail » déplie le contenu, la croix la marque comme vue (la
 * suivante prend sa place). Les nouveautés vues restent dans la page Nouveautés.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppUpdates, useMarkAppUpdateSeen } from "@/features/shared/hooks/useAppUpdates";
import { ReleaseNoteContent } from "./ReleaseNoteContent";

/** Lien texte or en capitales mono (« Voir le détail », « Toutes les nouveautés »). */
const LINK = "agon-mono cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-[11px] uppercase tracking-[0.12em] text-agon-accent";
const ELLIPSIS = "overflow-hidden text-ellipsis whitespace-nowrap";

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
    <div className="relative overflow-hidden rounded-[14px] border border-agon-accent/40 bg-agon-accent/[0.12]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-accent" />
      {/* Sous xl (barre latérale comprise), les liens passent à la ligne au lieu de déborder du bandeau. */}
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 py-4 pl-[23px] pr-5 xl:flex-nowrap">
        <span className="agon-mono flex-none rounded-full bg-agon-accent px-[9px] py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-agon-ink">
          Nouveauté
        </span>
        <div className="min-w-0 flex-1 basis-[220px] xl:basis-0">
          <div className={`${ELLIPSIS} text-[14px] font-medium text-agon-tx`}>{note.title}</div>
          <div className={`${ELLIPSIS} mt-0.5 text-[12px] text-agon-tx2`}>{note.summary}</div>
        </div>
        <button type="button" className={LINK} onClick={() => setExpanded(open ? null : note.id)}>
          {open ? "Masquer" : "Voir le détail"}
        </button>
        <button type="button" className={LINK} onClick={() => navigate("/coach/nouveautes")}>
          {unseen.length > 1 ? `Toutes les nouveautés (${unseen.length}) →` : "Toutes les nouveautés →"}
        </button>
        <button
          type="button"
          aria-label="Marquer comme vue"
          title="Marquer comme vue"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ userId: user.id, updateIds: [note.id] })}
          className="flex size-[26px] flex-none cursor-pointer items-center justify-center rounded-[6px] border border-agon-brd-l bg-transparent text-agon-tx2"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {open && <div className="pb-4 pl-[23px] pr-5"><ReleaseNoteContent note={note} /></div>}
    </div>
  );
}
