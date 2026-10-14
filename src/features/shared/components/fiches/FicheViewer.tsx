/**
 * FicheViewer — viewer plein écran (athlète) : aperçu PDF / image, titre,
 * catégorie, note du coach, variantes, fil de commentaires, bouton retour.
 * L'ouverture marque la fiche comme vue (seen_at), sauf en mode observation.
 */
import { useEffect, useRef } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { FICHE_CATEGORY_LABEL, variantLabel } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDoc, useDocVariants } from "@/features/shared/hooks/fiches/useDocs";
import { useMarkDocSeen } from "@/features/shared/hooks/fiches/useDocMutations";
import { FichePreview } from "./FichePreview";
import { FicheCommentThread } from "./FicheCommentThread";
import { CATEGORY_COLOR, input, label } from "./ficheStyles";

interface Props {
  docId: string;
  athleteId: string;
  /** Mode observation coach : pas de marquage « vue » */
  viewOnly?: boolean;
  onClose: () => void;
  onSwapVariant: (docId: string) => void;
}

export function FicheViewer({ docId, athleteId, viewOnly, onClose, onSwapVariant }: Props) {
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Coach propriétaire du dossier Storage (coach_athlete : son propre dossier)
  const coachId = doc?.coach_id ?? profile?.coach_id ?? user?.id ?? "";

  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 250, background: C.bg,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        paddingTop: "max(8px, env(safe-area-inset-top))",
        borderBottom: "1px solid " + C.brd, flexShrink: 0,
      }}>
        <button onClick={onClose} aria-label="Retour" style={{
          minWidth: 44, minHeight: 44, borderRadius: 4, border: "1px solid " + C.brdL,
          background: "transparent", color: C.tx, fontSize: 18, cursor: "pointer", fontFamily: "inherit",
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc?.title ?? (isLoading ? "Chargement…" : "Fiche indisponible")}
          </div>
          {doc && (
            <div style={{ fontSize: 11, color: CATEGORY_COLOR[doc.category] }}>
              {FICHE_CATEGORY_LABEL[doc.category]}
              {(doc.origin_id || doc.variant_label) && <span style={{ color: C.tx3 }}> · {variantLabel(doc)}</span>}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "12px 12px 32px" }}>
        {!doc && !isLoading && (
          <div style={{ textAlign: "center", color: C.tx3, fontSize: 13, padding: "40px 16px" }}>
            Cette fiche n'est plus accessible.
          </div>
        )}
        {doc && (
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {family.length > 1 && (
              <div>
                <span style={label}>Version</span>
                <select style={input} value={doc.id} onChange={e => onSwapVariant(e.target.value)}>
                  {family.map(d => <option key={d.id} value={d.id}>{variantLabel(d)}</option>)}
                </select>
              </div>
            )}
            {coachNote && (
              <div style={{ background: C.coachS, border: "1px solid " + C.coach + "40", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.coach, marginBottom: 4 }}>Note du coach</div>
                <div style={{ fontSize: 13, color: C.tx, whiteSpace: "pre-wrap" }}>{coachNote}</div>
              </div>
            )}
            {doc.description && <div style={{ fontSize: 13, color: C.tx2 }}>{doc.description}</div>}
            <FichePreview doc={doc} />
            <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14 }}>
              <FicheCommentThread docId={doc.id} athleteId={athleteId} coachId={coachId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
