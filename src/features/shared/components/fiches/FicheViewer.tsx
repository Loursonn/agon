/**
 * FicheViewer — viewer plein écran (athlète) : aperçu PDF / image, titre,
 * catégorie, note du coach, variantes, fil de commentaires, bouton retour.
 * L'ouverture marque la fiche comme vue (seen_at), sauf en mode observation.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { FICHE_CATEGORY_LABEL, variantLabel } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDoc, useDocVariants } from "@/features/shared/hooks/fiches/useDocs";
import { useMarkDocSeen } from "@/features/shared/hooks/fiches/useDocMutations";
import { FichePreview } from "./FichePreview";
import { FicheCommentThread } from "./FicheCommentThread";
import { CATEGORY_TEXT, INPUT, LABEL } from "./ficheStyles";

interface Props {
  docId: string;
  athleteId: string;
  /** Mode observation coach : pas de marquage « vue » */
  viewOnly?: boolean;
  onClose: () => void;
  onSwapVariant: (docId: string) => void;
  /** Ordinateur : la fiche s'affiche dans la page, à côté de la liste. */
  inline?: boolean;
}

export function FicheViewer({ docId, athleteId, viewOnly, onClose, onSwapVariant, inline = false }: Props) {
  const { user, profile } = useAuth();
  const { data: doc, isLoading } = useDoc(docId);
  const { data: family = [] } = useDocVariants(doc ? doc.origin_id ?? doc.id : null);
  const { data: athleteDocs } = useAthleteDocs(athleteId);
  const markSeen = useMarkDocSeen();

  const assigned = athleteDocs?.assigned.find(a => a.doc.id === docId);
  const coachNote = assigned?.coachNote ?? null;

  // Marque comme vue une seule fois par ouverture
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (viewOnly || !doc || marked.current === doc.id) return;
    if (user?.id !== athleteId) return;
    marked.current = doc.id;
    if (assigned && !assigned.seenAt) markSeen.mutate(doc.id);
  }, [doc, viewOnly, user?.id, athleteId, assigned, markSeen]);

  // Bloque le scroll de la page sous le viewer
  useEffect(() => {
    if (inline) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [inline]);

  // Coach propriétaire du dossier Storage (coach_athlete : son propre dossier)
  const coachId = doc?.coach_id ?? profile?.coach_id ?? user?.id ?? "";

  return (
    <div role={inline ? "region" : "dialog"} aria-modal={inline ? undefined : true} aria-label={doc?.title ?? "Fiche"} className={cn(
      "flex flex-col",
      inline
        ? "sticky top-4 max-h-[calc(100vh-140px)] overflow-hidden rounded-[14px] border border-agon-brd bg-agon-s1"
        : "fixed inset-0 z-[250] bg-agon-bg",
    )}>
      <div className="flex shrink-0 items-center gap-2 border-b border-agon-brd px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label={inline ? "Fermer la fiche" : "Retour"} className="min-h-11 min-w-11 cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent font-[inherit] text-[18px] text-agon-tx">{inline ? "×" : "←"}</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-agon-tx">
            {doc?.title ?? (isLoading ? "Chargement…" : "Fiche indisponible")}
          </div>
          {doc && (
            <div className={cn("text-[11px]", CATEGORY_TEXT[doc.category])}>
              {FICHE_CATEGORY_LABEL[doc.category]}
              {(doc.origin_id || doc.variant_label) && <span className="text-agon-tx3"> · {variantLabel(doc)}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8 pt-3 [-webkit-overflow-scrolling:touch]">
        {!doc && !isLoading && (
          <div className="px-4 py-10 text-center text-[13px] text-agon-tx3">
            Cette fiche n'est plus accessible.
          </div>
        )}
        {doc && (
          <div className="mx-auto flex max-w-[820px] flex-col gap-3.5">
            {family.length > 1 && (
              <div>
                <span className={LABEL}>Version</span>
                <select className={INPUT} value={doc.id} onChange={e => onSwapVariant(e.target.value)}>
                  {family.map(d => <option key={d.id} value={d.id}>{variantLabel(d)}</option>)}
                </select>
              </div>
            )}
            {coachNote && (
              <div className="rounded-[6px] border border-agon-coach/[0.25] bg-agon-coach-doux px-3 py-2.5">
                <div className="mb-1 text-[11px] font-bold text-agon-coach">Note du coach</div>
                <div className="whitespace-pre-wrap text-[13px] text-agon-tx">{coachNote}</div>
              </div>
            )}
            {doc.description && <div className="text-[13px] text-agon-tx2">{doc.description}</div>}
            <FichePreview doc={doc} />
            <div className="border-t border-agon-brd pt-3.5">
              <FicheCommentThread docId={doc.id} athleteId={athleteId} coachId={coachId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
