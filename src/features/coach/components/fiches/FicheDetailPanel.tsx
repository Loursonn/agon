/**
 * FicheDetailPanel — détail d'une fiche de banque (coach).
 * Aperçu, variantes (+ ajout), athlètes concernés / qui l'a vue, métadonnées,
 * archivage, remplacement du fichier (« Remplacer partout » ou « Nouvelle variante »).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import {
  FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, variantLabel,
} from "@/features/shared/types/fiches";
import type { DocFamily, FicheCategory } from "@/features/shared/types/fiches";
import { useDocFamilyAssignments } from "@/features/shared/hooks/fiches/useDocs";
import {
  useArchiveDoc, useDeleteOwnDoc, useReplaceDocFile, useUpdateDoc, useUploadDoc,
} from "@/features/shared/hooks/fiches/useDocMutations";
import { FichePreview } from "@/features/shared/components/fiches/FichePreview";
import { btnGhost, btnPrimary, chip, input, label, sectionTitle } from "@/features/shared/components/fiches/ficheStyles";

interface Props {
  family: DocFamily;
  onClose: () => void;
}

function athleteLabel(a: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | undefined) {
  if (!a) return "Athlète";
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || a.full_name || "Athlète";
}

export function FicheDetailPanel({ family, onClose }: Props) {
  const { user, athletes } = useAuth();
  const { origin } = family;
  const docs = useMemo(() => [origin, ...family.variants], [origin, family.variants]);
  const [selectedId, setSelectedId] = useState(origin.id);
  const selected = docs.find(d => d.id === selectedId) ?? origin;

  const { data: assignments = [] } = useDocFamilyAssignments(origin.id);
  const update = useUpdateDoc();
  const archive = useArchiveDoc();
  const replace = useReplaceDocFile();
  const upload = useUploadDoc();
  const del = useDeleteOwnDoc();

  // ── Métadonnées (origine) ───────────────────────────────────────────────
  const [title, setTitle] = useState(origin.title);
  const [category, setCategory] = useState<FicheCategory>(origin.category);
  const [tags, setTags] = useState(origin.tags.join(", "));
  const [description, setDescription] = useState(origin.description ?? "");
  useEffect(() => {
    setTitle(origin.title); setCategory(origin.category);
    setTags(origin.tags.join(", ")); setDescription(origin.description ?? "");
  }, [origin]);
  const dirty = title !== origin.title || category !== origin.category
    || tags !== origin.tags.join(", ") || description !== (origin.description ?? "");

  const saveMeta = () => {
    const patch = {
      title: title.trim() || origin.title,
      category,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      description: description.trim() || null,
    };
    // titre / catégorie / tags partagés par toute la famille
    for (const d of docs) update.mutate({ id: d.id, patch: d.id === origin.id ? patch : { title: patch.title, category, tags: patch.tags } });
  };

  // ── Variantes ───────────────────────────────────────────────────────────
  const variantFileRef = useRef<HTMLInputElement>(null);
  const [newVariantLabel, setNewVariantLabel] = useState("");
  const addVariant = (file: File, labelText?: string) => {
    if (!user) return;
    upload.mutate(
      {
        file, coachId: user.id, athleteId: null, uploadedBy: user.id,
        title: origin.title, category: origin.category, tags: origin.tags, description: origin.description,
        originId: origin.id,
        variantLabel: (labelText ?? newVariantLabel).trim() || `V${docs.length + 1}`,
        variantOrder: docs.length,
      },
      { onSuccess: d => { setSelectedId(d.id); setNewVariantLabel(""); } },
    );
  };

  // ── Remplacement ────────────────────────────────────────────────────────
  const replaceRef = useRef<HTMLInputElement>(null);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);
  const selectedAssigned = assignments.some(a => a.doc_id === selected.id);
  const onReplacePicked = (file: File) => {
    if (selectedAssigned) setPendingReplace(file);
    else replace.mutate({ doc: selected, file });
  };

  // ── Stats ───────────────────────────────────────────────────────────────
  const athleteIds = [...new Set(assignments.map(a => a.athlete_id))];
  const seenRows = assignments
    .filter(a => a.seen_at)
    .sort((a, b) => (b.seen_at ?? "").localeCompare(a.seen_at ?? ""));
  const nameOf = (id: string) => athleteLabel(athletes.find(a => a.id === id));

  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = !!origin.archived_at;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: "min(560px, 100vw)",
        background: C.bg, borderLeft: "1px solid " + C.brd, overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.bg, borderBottom: "1px solid " + C.brd, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{origin.title}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              {FICHE_CATEGORY_LABEL[origin.category]} · {docs.length} version{docs.length > 1 ? "s" : ""}
              {origin.is_self_service && " · Libre-service"}{archived && " · Archivée"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ ...btnGhost, minWidth: 40, padding: 0 }}>×</button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Variantes */}
          <section>
            <h3 style={sectionTitle}>Versions</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {docs.map(d => (
                <button key={d.id} onClick={() => setSelectedId(d.id)} style={chip(d.id === selected.id)}>
                  {variantLabel(d)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...input, flex: 1, minWidth: 140 }}
                placeholder={`Libellé (ex. V${docs.length + 1}, Prog S5)`}
                value={newVariantLabel}
                onChange={e => setNewVariantLabel(e.target.value)}
              />
              <button style={btnGhost} disabled={upload.isPending} onClick={() => variantFileRef.current?.click()}>
                {upload.isPending ? "Envoi…" : "+ Ajouter une variante"}
              </button>
              <input ref={variantFileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) addVariant(f); e.target.value = ""; }} />
            </div>
          </section>

          {/* Aperçu */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ ...sectionTitle, margin: 0, flex: 1 }}>Aperçu · {variantLabel(selected)}</h3>
              <span style={{ fontSize: 11, color: C.tx3 }}>{formatFileSize(selected.file_size)}</span>
              <button style={btnGhost} disabled={replace.isPending} onClick={() => replaceRef.current?.click()}>
                {replace.isPending ? "Remplacement…" : "Remplacer le fichier"}
              </button>
              <input ref={replaceRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) onReplacePicked(f); e.target.value = ""; }} />
            </div>
            {pendingReplace && (
              <div style={{ border: "1px solid " + C.o + "50", background: C.oS, borderRadius: 6, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: C.tx, marginBottom: 8 }}>
                  Cette version est déjà attribuée. Remplacer le fichier pour tout le monde, ou en faire une nouvelle variante ?
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btnPrimary} onClick={() => { replace.mutate({ doc: selected, file: pendingReplace }); setPendingReplace(null); }}>
                    Remplacer partout
                  </button>
                  <button style={btnGhost} onClick={() => { addVariant(pendingReplace, newVariantLabel || `V${docs.length + 1}`); setPendingReplace(null); }}>
                    Nouvelle variante
                  </button>
                  <button style={btnGhost} onClick={() => setPendingReplace(null)}>Annuler</button>
                </div>
              </div>
            )}
            {selected.origin_id && (
              <div style={{ marginBottom: 8 }}>
                <span style={label}>Libellé de la variante</span>
                <input
                  key={selected.id}
                  style={input}
                  defaultValue={selected.variant_label ?? ""}
                  onBlur={e => {
                    const v = e.target.value.trim();
                    if (v && v !== selected.variant_label) update.mutate({ id: selected.id, patch: { variant_label: v } });
                  }}
                />
              </div>
            )}
            <div style={{ border: "1px solid " + C.brd, borderRadius: 6, padding: 8, background: C.s1 }}>
              <FichePreview doc={selected} maxHeight={520} />
            </div>
          </section>

          {/* Suivi */}
          <section>
            <h3 style={sectionTitle}>Suivi</h3>
            <div style={{ fontSize: 13, color: C.tx2, marginBottom: 8 }}>
              {athleteIds.length} athlète{athleteIds.length > 1 ? "s" : ""} concerné{athleteIds.length > 1 ? "s" : ""}
              {" · "}{new Set(seenRows.map(r => r.athlete_id)).size} l'ont vue
            </div>
            {athleteIds.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {athleteIds.map(id => {
                  const rows = assignments.filter(a => a.athlete_id === id);
                  const seen = rows.map(r => r.seen_at).filter(Boolean).sort().pop();
                  const versions = [...new Set(rows.map(r => r.variant_label || (r.doc_id === origin.id ? "Originale" : "Variante")))];
                  const sources = [...new Set(rows.map(r => r.source))];
                  return (
                    <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "6px 8px", background: C.s1, borderRadius: 4 }}>
                      <span style={{ flex: 1, color: C.tx, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(id)}</span>
                      <span style={{ color: C.tx3 }}>{versions.join(", ")} · {sources.join(", ")}</span>
                      <span style={{ color: seen ? C.g : C.tx3, whiteSpace: "nowrap" }}>
                        {seen ? "Vue le " + new Date(seen).toLocaleDateString("fr-FR") : "Non vue"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Métadonnées */}
          <section>
            <h3 style={sectionTitle}>Informations</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div><span style={label}>Titre</span><input style={input} value={title} onChange={e => setTitle(e.target.value)} /></div>
              <div>
                <span style={label}>Catégorie</span>
                <select style={input} value={category} onChange={e => setCategory(e.target.value as FicheCategory)}>
                  {FICHE_CATEGORIES.map(c => <option key={c} value={c}>{FICHE_CATEGORY_LABEL[c]}</option>)}
                </select>
              </div>
              <div><span style={label}>Tags</span><input style={input} value={tags} onChange={e => setTags(e.target.value)} /></div>
              <div><span style={label}>Description</span><textarea style={{ ...input, minHeight: 60 }} value={description} onChange={e => setDescription(e.target.value)} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.tx2, cursor: "pointer", minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={origin.is_self_service}
                  onChange={e => update.mutate({ id: origin.id, patch: { is_self_service: e.target.checked } })}
                />
                Libre-service (visible par tous mes athlètes, variantes comprises)
              </label>
              {dirty && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnPrimary} onClick={saveMeta} disabled={update.isPending}>Enregistrer</button>
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          <section style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid " + C.brd, paddingTop: 16 }}>
            <button style={btnGhost} onClick={() => archive.mutate({ originId: origin.id, archived: !archived })}>
              {archived ? "Désarchiver" : "Archiver"}
            </button>
            {assignments.length === 0 && (
              confirmDelete ? (
                <>
                  <button style={{ ...btnGhost, color: C.r, borderColor: C.r + "60" }}
                    onClick={async () => {
                      for (const d of [...family.variants, origin]) await del.mutateAsync(d);
                      onClose();
                    }}>
                    Confirmer la suppression
                  </button>
                  <button style={btnGhost} onClick={() => setConfirmDelete(false)}>Annuler</button>
                </>
              ) : (
                <button style={{ ...btnGhost, color: C.r }} onClick={() => setConfirmDelete(true)}>Supprimer</button>
              )
            )}
            <div style={{ fontSize: 11, color: C.tx3, flexBasis: "100%" }}>
              {assignments.length > 0
                ? "Fiche attribuée : archive-la plutôt que de la supprimer (elle reste lisible là où elle est rattachée)."
                : "Une fiche archivée disparaît de la banque et des sélecteurs."}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
