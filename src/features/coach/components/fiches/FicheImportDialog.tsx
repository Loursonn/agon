/**
 * FicheImportDialog — import multi-fichiers (glisser-déposer).
 * Titre pré-rempli depuis le nom de fichier ; catégorie, tags, description,
 * libre-service (banque uniquement). `athleteId` = fiche personnelle.
 */
import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, titleFromFileName } from "@/features/shared/types/fiches";
import type { Doc, FicheCategory } from "@/features/shared/types/fiches";
import { useUploadDoc } from "@/features/shared/hooks/fiches/useDocMutations";
import { FicheUploadDropzone } from "@/features/shared/components/fiches/FicheUploadDropzone";
import { btnGhost, btnPrimary, input, label } from "@/features/shared/components/fiches/ficheStyles";

interface Row {
  key: string;
  file: File;
  title: string;
  category: FicheCategory;
  tags: string;
  description: string;
  selfService: boolean;
  status: "idle" | "uploading" | "done" | "error";
}

interface Props {
  /** Fiche personnelle pour cet athlète ; absent = banque */
  athleteId?: string;
  athleteName?: string;
  defaultCategory?: FicheCategory;
  onClose: () => void;
  /** Appelé avec les fiches créées (ex. sélection directe dans le picker) */
  onDone?: (docs: Doc[]) => void;
  /** Rendu sans overlay (intégré dans un autre panneau) */
  inline?: boolean;
}

export function FicheImportDialog({ athleteId, athleteName, defaultCategory = "autre", onClose, onDone, inline }: Props) {
  const { user } = useAuth();
  const upload = useUploadDoc();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const addFiles = (files: File[]) =>
    setRows(r => [
      ...r,
      ...files.map(f => ({
        key: crypto.randomUUID(), file: f, title: titleFromFileName(f.name), category: defaultCategory,
        tags: "", description: "", selfService: false, status: "idle" as const,
      })),
    ]);

  const patch = (key: string, p: Partial<Row>) => setRows(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));

  const run = async () => {
    if (!user) return;
    setBusy(true);
    const created: Doc[] = [];
    for (const row of rows) {
      if (row.status === "done") continue;
      patch(row.key, { status: "uploading" });
      try {
        const doc = await upload.mutateAsync({
          file: row.file,
          coachId: user.id,
          athleteId: athleteId ?? null,
          uploadedBy: user.id,
          title: row.title,
          category: row.category,
          tags: row.tags.split(",").map(t => t.trim()).filter(Boolean),
          description: row.description.trim() || null,
          isSelfService: !athleteId && row.selfService,
        });
        created.push(doc);
        patch(row.key, { status: "done" });
      } catch {
        patch(row.key, { status: "error" });
      }
    }
    setBusy(false);
    if (created.length) {
      toast.success(`${created.length} fiche(s) importée(s)`);
      onDone?.(created);
    }
    if (created.length === rows.filter(r => r.status !== "done").length) onClose();
  };

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FicheUploadDropzone onFiles={addFiles} />
      {rows.map(row => (
        <div key={row.key} style={{ border: "1px solid " + C.brd, borderRadius: 6, padding: 12, background: C.s1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.tx3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.file.name} · {formatFileSize(row.file.size)}
            </span>
            {row.status === "uploading" && <span style={{ fontSize: 11, color: C.ac }}>Envoi…</span>}
            {row.status === "done" && <span style={{ fontSize: 11, color: C.g }}>Importée</span>}
            {row.status === "error" && <span style={{ fontSize: 11, color: C.r }}>Échec</span>}
            {row.status !== "uploading" && row.status !== "done" && (
              <button onClick={() => setRows(r => r.filter(x => x.key !== row.key))} aria-label="Retirer"
                style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", fontSize: 16, minWidth: 32, minHeight: 32, fontFamily: "inherit" }}>×</button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <div>
              <span style={label}>Titre</span>
              <input style={input} value={row.title} onChange={e => patch(row.key, { title: e.target.value })} />
            </div>
            <div>
              <span style={label}>Catégorie</span>
              <select style={input} value={row.category} onChange={e => patch(row.key, { category: e.target.value as FicheCategory })}>
                {FICHE_CATEGORIES.map(c => <option key={c} value={c}>{FICHE_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Tags (séparés par des virgules)</span>
              <input style={input} value={row.tags} placeholder="hanches, hyrox" onChange={e => patch(row.key, { tags: e.target.value })} />
            </div>
            <div>
              <span style={label}>Description courte</span>
              <input style={input} value={row.description} onChange={e => patch(row.key, { description: e.target.value })} />
            </div>
          </div>
          {!athleteId && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.tx2, cursor: "pointer", minHeight: 32 }}>
              <input type="checkbox" checked={row.selfService} onChange={e => patch(row.key, { selfService: e.target.checked })} />
              Libre-service (visible par tous mes athlètes)
            </label>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost} disabled={busy}>Annuler</button>
        <button onClick={run} disabled={busy || rows.length === 0} style={{ ...btnPrimary, opacity: busy || rows.length === 0 ? 0.5 : 1 }}>
          {busy ? "Import…" : `Importer${rows.length > 1 ? ` (${rows.length})` : ""}`}
        </button>
      </div>
    </div>
  );

  if (inline) return body;

  return (
    <>
      <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 81,
        width: 720, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto",
        background: C.bg, border: "1px solid " + C.brd, borderRadius: 6, padding: 20,
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 4 }}>
          {athleteId ? `Importer une fiche pour ${athleteName ?? "cet athlète"}` : "Importer des fiches"}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginBottom: 14 }}>
          {athleteId ? "Fiche personnelle : visible uniquement par cet athlète." : "Fiches de banque, réutilisables pour tous tes athlètes."}
        </div>
        {body}
      </div>
    </>
  );
}
