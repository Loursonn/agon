/**
 * CoachFichePreviewDrawer — coach : aperçu d'une fiche dans le contexte d'un
 * athlète (statut vu, note, fil de commentaires de cet athlète).
 */
import { C } from "@/lib/theme";
import { FICHE_CATEGORY_LABEL, variantLabel } from "@/features/shared/types/fiches";
import type { Doc } from "@/features/shared/types/fiches";
import { FichePreview } from "@/features/shared/components/fiches/FichePreview";
import { FicheCommentThread } from "@/features/shared/components/fiches/FicheCommentThread";
import { btnGhost } from "@/features/shared/components/fiches/ficheStyles";

interface Props {
  doc: Doc;
  athleteId: string;
  athleteName: string;
  seenAt?: string | null;
  coachNote?: string | null;
  onClose: () => void;
}

export function CoachFichePreviewDrawer({ doc, athleteId, athleteName, seenAt, coachNote, onClose }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: "min(560px, 100vw)",
        background: C.bg, borderLeft: "1px solid " + C.brd, overflowY: "auto",
      }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.bg, borderBottom: "1px solid " + C.brd, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.title}{(doc.origin_id || doc.variant_label) && <span style={{ color: C.tx3, fontWeight: 500 }}> · {variantLabel(doc)}</span>}
            </div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {FICHE_CATEGORY_LABEL[doc.category]}
              {seenAt !== undefined && (
                <span style={{ color: seenAt ? C.g : C.tx3 }}>
                  {" · "}{seenAt ? `Vue le ${new Date(seenAt).toLocaleDateString("fr-FR")}` : "Non vue"}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ ...btnGhost, minWidth: 40, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {coachNote && (
            <div style={{ background: C.coachS, border: "1px solid " + C.coach + "40", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: C.tx }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.coach, marginBottom: 4 }}>Ta note</div>
              {coachNote}
            </div>
          )}
          <div style={{ border: "1px solid " + C.brd, borderRadius: 6, padding: 8, background: C.s1 }}>
            <FichePreview doc={doc} maxHeight={520} />
          </div>
          <FicheCommentThread docId={doc.id} athleteId={athleteId} coachId={doc.coach_id} athleteName={athleteName} />
        </div>
      </aside>
    </>
  );
}
