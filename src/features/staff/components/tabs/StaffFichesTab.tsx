import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { QK } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL } from "@/features/shared/types/fiches";
import type { Doc, FicheCategory } from "@/features/shared/types/fiches";
import { useAthleteDocs } from "@/features/shared/hooks/fiches/useDocs";
import { DocUploadError, uploadDoc, useDeleteOwnDoc } from "@/features/shared/hooks/fiches/useDocMutations";
import { FichePreview } from "@/features/shared/components/fiches/FichePreview";
import { FicheCommentThread } from "@/features/shared/components/fiches/FicheCommentThread";
import { CATEGORY_COLOR, btnGhost, btnPrimary, sectionTitle } from "@/features/shared/components/fiches/ficheStyles";
import type { MyStaffAthlete } from "../../hooks/useMyStaffLinks";
import { canRead, canWrite } from "../../lib/staffPermissions";

/**
 * Fiches de l'athlète, vues par un pro.
 * Écriture (fiches: write) : dépôt dans la banque du coach principal
 * (uploaded_by = le pro) + attribution à l'athlète ; suppression de ses
 * propres fiches, ou de celles du coach si l'option est cochée (la base
 * tranche, cf. staff_can_edit_doc).
 */
export function StaffFichesTab({ link }: { link: MyStaffAthlete }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useAthleteDocs(link.athleteId);
  const del = useDeleteOwnDoc();
  const [preview, setPreview] = useState<Doc | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const writable = canWrite(link.permissions, "fiches");
  const docs = [
    ...(data?.assigned ?? []).map((a) => a.doc),
    ...(data?.personal ?? []),
    ...(data?.uploads ?? []),
  ].filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);

  const isMine = (d: Doc) => d.uploaded_by === user?.id;
  const isCoachs = (d: Doc) => !d.uploaded_by || d.uploaded_by === d.coach_id;
  const canDelete = (d: Doc) => writable && (isMine(d) || (link.canEditCoachContent && isCoachs(d)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ ...sectionTitle, flex: 1, margin: 0 }}>Fiches · {docs.length}</h2>
        {writable && link.coachId && (
          <button style={btnPrimary} onClick={() => setAdding(true)}>Ajouter une fiche</button>
        )}
      </div>
      {writable && !link.coachId && (
        <div style={{ fontSize: 12, color: C.tx3 }}>Cet athlète n'a pas de coach principal : pas de banque où déposer une fiche.</div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: C.tx3 }}>Aucune fiche pour cet athlète.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map((d) => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 10, background: C.s1, border: "1px solid " + C.brd,
              borderLeft: "3px solid " + CATEGORY_COLOR[d.category], borderRadius: 6, padding: "8px 12px", flexWrap: "wrap",
            }}>
              <button onClick={() => setPreview(d)} style={{ flex: 1, minWidth: 180, minHeight: 40, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
                  📄 {d.title}
                  {isMine(d) && <span style={{ marginLeft: 8, fontSize: 10, color: C.ac }}>par moi</span>}
                </div>
                <div style={{ fontSize: 11, color: C.tx3 }}>{FICHE_CATEGORY_LABEL[d.category]} · {formatFileSize(d.file_size)}</div>
              </button>
              {canDelete(d) && (
                confirmDel === d.id ? (
                  <button style={{ ...btnGhost, minHeight: 32, color: C.r, borderColor: C.r + "60" }} onClick={() => { del.mutate(d); setConfirmDel(null); }}>Confirmer</button>
                ) : (
                  <button style={{ ...btnGhost, minHeight: 32, padding: "4px 10px" }} onClick={() => setConfirmDel(d.id)}>Supprimer</button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {adding && link.coachId && user && (
        <AddFicheDialog
          coachId={link.coachId}
          athleteId={link.athleteId}
          staffId={user.id}
          onClose={() => setAdding(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: QK.docs }); setAdding(false); }}
        />
      )}

      {preview && (
        <>
          <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} />
          <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: "min(560px, 100vw)", background: C.bg, borderLeft: "1px solid " + C.brd, overflowY: "auto" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.bg, borderBottom: "1px solid " + C.brd, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.title}</div>
              <button onClick={() => setPreview(null)} aria-label="Fermer" style={{ ...btnGhost, minWidth: 40, padding: 0 }}>×</button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ border: "1px solid " + C.brd, borderRadius: 6, padding: 8, background: C.s1 }}>
                <FichePreview doc={preview} maxHeight={520} />
              </div>
              {canRead(link.permissions, "commentaires") && (
                <FicheCommentThread
                  docId={preview.id}
                  athleteId={link.athleteId}
                  coachId={preview.coach_id}
                  athleteName={link.athleteName}
                  readOnly={!canWrite(link.permissions, "commentaires")}
                />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function AddFicheDialog({ coachId, athleteId, staffId, onClose, onDone }: {
  coachId: string; athleteId: string; staffId: string; onClose: () => void; onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<FicheCategory>("prevention");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      // Banque du coach principal (athlete_id null), puis attribution à l'athlète.
      const doc = await uploadDoc({ file, coachId, athleteId: null, uploadedBy: staffId, title: title || file.name.replace(/\.[^.]+$/, ""), category });
      const { error } = await supabase.from("doc_assignments").insert({
        doc_id: doc.id, athlete_id: athleteId, assigned_by: staffId, source: "manuel",
      });
      if (error) throw error;
      toast.success("Fiche ajoutée et attribuée");
      onDone();
    } catch (e) {
      toast.error(e instanceof DocUploadError ? e.message : "Erreur lors de l'ajout de la fiche");
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "9px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, background: C.s1, border: "1px solid " + C.brdL, borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Ajouter une fiche</div>
        <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
          Elle rejoint la banque de fiches du coach principal, à ton nom, et elle est attribuée à l'athlète.
        </div>
        <button type="button" style={btnGhost} onClick={() => fileRef.current?.click()}>
          {file ? `${file.name} · ${formatFileSize(file.size)}` : "Choisir un PDF ou une image"}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); e.target.value = ""; }} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" style={field} />
        <select value={category} onChange={(e) => setCategory(e.target.value as FicheCategory)} style={field}>
          {FICHE_CATEGORIES.map((c) => <option key={c} value={c}>{FICHE_CATEGORY_LABEL[c]}</option>)}
        </select>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnGhost} onClick={onClose}>Annuler</button>
          <button style={{ ...btnPrimary, opacity: !file || busy ? 0.5 : 1 }} disabled={!file || busy} onClick={submit}>
            {busy ? "Envoi…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
