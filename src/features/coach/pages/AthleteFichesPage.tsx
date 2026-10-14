/**
 * AthleteFichesPage — onglet Fiches de l'espace athlète (coach).
 * Route : /coach/athletes/:athleteId/fiches
 * Attributions (programmation / énergie / manuel) + vu / non vu, fiches
 * personnelles, ajouts de l'athlète, commentaires.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { FICHE_CATEGORY_LABEL, variantLabel } from "@/features/shared/types/fiches";
import type { Doc, DocAssignmentSource } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDocsByIds } from "@/features/shared/hooks/fiches/useDocs";
import { useAssignDoc, useDeleteOwnDoc, useUnassignDoc } from "@/features/shared/hooks/fiches/useDocMutations";
import { useAthleteDocComments } from "@/features/shared/hooks/fiches/useDocComments";
import { FichePickerDrawer } from "@/features/shared/components/fiches/FichePickerDrawer";
import { CATEGORY_COLOR, btnGhost, btnPrimary, sectionTitle } from "@/features/shared/components/fiches/ficheStyles";
import { FicheImportDialog } from "../components/fiches/FicheImportDialog";
import { CoachFichePreviewDrawer } from "../components/fiches/CoachFichePreviewDrawer";

const SOURCE_LABEL: Record<DocAssignmentSource, string> = {
  programme: "Programmation",
  energie: "Séance énergie",
  manuel: "Manuel",
};

/** Dernière visite de l'onglet (badge « nouveau » sur les ajouts de l'athlète). */
function lastVisitKey(athleteId: string) { return `fiches:last-visit:${athleteId}`; }
function readLastVisit(athleteId: string): string | null {
  try { return localStorage.getItem(lastVisitKey(athleteId)); } catch { return null; }
}

interface Preview { doc: Doc; seenAt?: string | null; coachNote?: string | null }

function Row({ doc, right, onOpen, isNew }: { doc: Doc; right?: ReactNode; onOpen: () => void; isNew?: boolean }) {
  const variant = doc.origin_id || doc.variant_label ? variantLabel(doc) : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, background: C.s1, border: "1px solid " + C.brd,
      borderLeft: "3px solid " + CATEGORY_COLOR[doc.category], borderRadius: 6, padding: "8px 12px", flexWrap: "wrap",
    }}>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 180, minHeight: 40, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
          📄 {doc.title}{variant && <span style={{ color: C.tx3, fontWeight: 500 }}> · {variant}</span>}
          {isNew && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: "#0E0C0A", background: C.ac, borderRadius: 3, padding: "1px 5px" }}>NOUVEAU</span>}
          {doc.archived_at && <span style={{ marginLeft: 8, fontSize: 10, color: C.tx3 }}>(archivée)</span>}
        </div>
        <div style={{ fontSize: 11, color: C.tx3 }}>{FICHE_CATEGORY_LABEL[doc.category]} · {formatFileSize(doc.file_size)}</div>
      </button>
      {right}
    </div>
  );
}

export default function AthleteFichesPage() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const { user } = useAuth();
  const { athleteProfile } = useAthleteContext();
  const athleteName = athleteProfile
    ? [athleteProfile.first_name, athleteProfile.last_name].filter(Boolean).join(" ") || athleteProfile.full_name || "l'athlète"
    : "l'athlète";

  const { data, isLoading } = useAthleteDocs(athleteId);
  const { data: comments = [] } = useAthleteDocComments(athleteId);
  const commentDocIds = useMemo(() => [...new Set(comments.map(c => c.doc_id))], [comments]);
  const { data: commentDocs = {} } = useDocsByIds(commentDocIds);
  const assign = useAssignDoc();
  const unassign = useUnassignDoc();
  const del = useDeleteOwnDoc();

  const [picker, setPicker] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Badge « nouveau » sur les ajouts depuis la dernière visite
  const [lastVisit] = useState(() => readLastVisit(athleteId));
  useEffect(() => {
    try { localStorage.setItem(lastVisitKey(athleteId), new Date().toISOString()); } catch { /* stockage indisponible */ }
  }, [athleteId]);

  const personalIds = new Set((data?.personal ?? []).map(d => d.id));
  // Attribuées hors fiches perso (affichées dans leur propre section)
  const assigned = (data?.assigned ?? []).filter(a => !personalIds.has(a.doc.id));
  const seenOf = (docId: string) => data?.assigned.find(a => a.doc.id === docId)?.seenAt ?? null;
  const uploads = data?.uploads ?? [];
  const newUploads = uploads.filter(d => !lastVisit || d.created_at > lastVisit).length;

  const seenBadge = (seenAt: string | null) => (
    <span style={{ fontSize: 11, color: seenAt ? C.g : C.tx3, whiteSpace: "nowrap" }}>
      {seenAt ? `Vue le ${new Date(seenAt).toLocaleDateString("fr-FR")}` : "Non vue"}
    </span>
  );

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: 0, flex: 1 }}>Fiches de {athleteName}</h1>
        <button style={btnGhost} onClick={() => setImportOpen(true)}>Importer une fiche pour cet athlète</button>
        <button style={btnPrimary} onClick={() => setPicker(true)}>Attribuer depuis la banque</button>
      </div>

      {isLoading && <div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>}

      {/* Attribuées */}
      <section>
        <h2 style={sectionTitle}>Fiches attribuées · {assigned.length}</h2>
        {assigned.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucune fiche attribuée. Rattache une fiche à une séance ou attribue-la manuellement.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {assigned.map(a => (
              <Row
                key={a.doc.id}
                doc={a.doc}
                onOpen={() => setPreview({ doc: a.doc, seenAt: a.seenAt, coachNote: a.coachNote })}
                right={
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {a.sources.map(s => (
                      <span key={s} style={{ fontSize: 10, fontWeight: 700, color: C.tx2, border: "1px solid " + C.brdL, borderRadius: 3, padding: "2px 6px" }}>{SOURCE_LABEL[s]}</span>
                    ))}
                    {seenBadge(a.seenAt)}
                    {a.sources.includes("manuel") && (
                      <button style={{ ...btnGhost, minHeight: 32, padding: "4px 10px" }}
                        onClick={() => unassign.mutate({ docId: a.doc.id, athleteId })}>
                        Retirer
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 6 }}>
          Les attributions « Programmation » et « Séance énergie » suivent automatiquement les rattachements.
        </div>
      </section>

      {/* Personnelles */}
      <section>
        <h2 style={sectionTitle}>Fiches personnelles · {data?.personal.length ?? 0}</h2>
        {(data?.personal ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucune fiche personnelle (ex. pacing individualisé).</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data!.personal.map(d => (
              <Row
                key={d.id}
                doc={d}
                onOpen={() => setPreview({ doc: d, seenAt: seenOf(d.id) })}
                right={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {seenBadge(seenOf(d.id))}
                    {confirmDel === d.id ? (
                      <button style={{ ...btnGhost, minHeight: 32, color: C.r, borderColor: C.r + "60" }} onClick={() => { del.mutate(d); setConfirmDel(null); }}>Confirmer</button>
                    ) : (
                      <button style={{ ...btnGhost, minHeight: 32, padding: "4px 10px" }} onClick={() => setConfirmDel(d.id)}>Supprimer</button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Ajouts de l'athlète */}
      <section>
        <h2 style={sectionTitle}>
          Ajouts de l'athlète · {uploads.length}
          {newUploads > 0 && <span style={{ color: C.ac }}> · {newUploads} nouveau{newUploads > 1 ? "x" : ""}</span>}
        </h2>
        {uploads.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucun fichier ajouté par l'athlète.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {uploads.map(d => (
              <Row
                key={d.id}
                doc={d}
                isNew={!lastVisit || d.created_at > lastVisit}
                onOpen={() => setPreview({ doc: d })}
                right={<span style={{ fontSize: 11, color: C.tx3 }}>{new Date(d.created_at).toLocaleDateString("fr-FR")}</span>}
              />
            ))}
          </div>
        )}
      </section>

      {/* Commentaires récents */}
      <section>
        <h2 style={sectionTitle}>Commentaires récents</h2>
        {comments.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Aucun commentaire.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {comments.slice(0, 15).map(c => {
              const doc = commentDocs[c.doc_id];
              return (
                <button key={c.id} disabled={!doc} onClick={() => doc && setPreview({ doc, seenAt: seenOf(doc.id) })} style={{
                  textAlign: "left", background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "8px 12px",
                  cursor: doc ? "pointer" : "default", fontFamily: "inherit", minHeight: 44,
                }}>
                  <div style={{ fontSize: 11, color: C.tx3, marginBottom: 2 }}>
                    <span style={{ color: c.author_id === user?.id ? C.ac : C.tx2, fontWeight: 700 }}>
                      {c.author_id === user?.id ? "Moi" : athleteName}
                    </span>
                    {" · "}{doc?.title ?? "Fiche"}{" · "}{new Date(c.created_at).toLocaleDateString("fr-FR")}
                    {c.image_path && " · 🖼️"}
                  </div>
                  <div style={{ fontSize: 13, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body || "(image)"}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {picker && user && (
        <FichePickerDrawer
          docOnly
          withNote
          confirmLabel="Attribuer"
          athleteId={athleteId}
          athleteName={athleteName}
          onClose={() => setPicker(false)}
          onSave={(att, note) => {
            assign.mutate({ docId: att.doc_id, athleteId, assignedBy: user.id, coachNote: note });
            setPicker(false);
          }}
        />
      )}
      {importOpen && <FicheImportDialog athleteId={athleteId} athleteName={athleteName} onClose={() => setImportOpen(false)} />}
      {preview && (
        <CoachFichePreviewDrawer
          doc={preview.doc}
          athleteId={athleteId}
          athleteName={athleteName}
          seenAt={preview.seenAt}
          coachNote={preview.coachNote}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
