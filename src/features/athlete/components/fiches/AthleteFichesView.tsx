/**
 * AthleteFichesView — onglet Programme → Fiches (?vue=fiches).
 * Mes fiches (attribuées + personnelles) · Banque (libre-service du coach) · Mes ajouts.
 */
import { useMemo, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteDocs, useSelfServiceDocs } from "@/features/shared/hooks/fiches/useDocs";
import { useDeleteOwnDoc, useUploadDoc } from "@/features/shared/hooks/fiches/useDocMutations";
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import {
  FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, titleFromFileName, variantLabel,
} from "@/features/shared/types/fiches";
import type { Doc, FicheCategory } from "@/features/shared/types/fiches";
import { CATEGORY_COLOR, btnGhost, chip, input, sectionTitle } from "@/features/shared/components/fiches/ficheStyles";

function FicheRow({ doc, isNew, meta, onOpen, onDelete }: {
  doc: Doc; isNew?: boolean; meta?: string; onOpen: () => void; onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const variant = doc.origin_id || doc.variant_label ? variantLabel(doc) : null;
  return (
    <div style={{
      display: "flex", alignItems: "stretch", background: C.s1, border: "1px solid " + (isNew ? C.ac + "50" : C.brd),
      borderLeft: "3px solid " + CATEGORY_COLOR[doc.category], borderRadius: 6, overflow: "hidden",
    }}>
      <button onClick={onOpen} style={{
        flex: 1, minWidth: 0, minHeight: 56, padding: "10px 12px", background: "transparent", border: "none",
        textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }} aria-hidden>{doc.kind === "image" ? "🖼️" : "📄"}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.title}{variant && <span style={{ color: C.tx3, fontWeight: 500 }}> · {variant}</span>}
          </span>
          <span style={{ fontSize: 11, color: C.tx3 }}>{meta ?? FICHE_CATEGORY_LABEL[doc.category]}</span>
        </span>
        {isNew && (
          <span style={{ fontSize: 9, fontWeight: 800, color: "#0E0C0A", background: C.ac, borderRadius: 3, padding: "2px 6px", flexShrink: 0 }}>NOUVEAU</span>
        )}
      </button>
      {onDelete && (
        confirm ? (
          <button onClick={onDelete} style={{ minWidth: 72, border: "none", borderLeft: "1px solid " + C.brd, background: C.rS, color: C.r, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Supprimer ?
          </button>
        ) : (
          <button onClick={() => setConfirm(true)} aria-label="Supprimer" style={{ minWidth: 44, border: "none", borderLeft: "1px solid " + C.brd, background: "transparent", color: C.tx3, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
            ×
          </button>
        )
      )}
    </div>
  );
}

export function AthleteFichesView() {
  const { user } = useAuth();
  const { athleteId, athleteProfile, viewOnly } = useAthleteContext();
  // coach_athlete sans coach : il est son propre coach
  const coachId = athleteProfile?.coach_id
    ?? (athleteProfile && athleteProfile.role !== "athlete" ? athleteProfile.id : null);
  const { data: mine, isLoading } = useAthleteDocs(athleteId);
  const { data: bank = [] } = useSelfServiceDocs(coachId);
  const upload = useUploadDoc();
  const del = useDeleteOwnDoc();
  const viewer = useFicheViewer();

  const [cat, setCat] = useState<FicheCategory | "all">("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Mes fiches groupées par catégorie
  const grouped = useMemo(() => {
    const list = mine?.assigned ?? [];
    const map = new Map<FicheCategory, typeof list>();
    for (const a of list) map.set(a.doc.category, [...(map.get(a.doc.category) ?? []), a]);
    return [...FICHE_CATEGORIES, "questionnaire" as const].filter(c => map.has(c)).map(c => ({ cat: c, items: map.get(c)! }));
  }, [mine?.assigned]);

  const bankFiltered = bank.filter(f => {
    const q = search.trim().toLowerCase();
    return (cat === "all" || f.origin.category === cat)
      && (!q || [f.origin.title, f.origin.description ?? "", ...f.origin.tags].join(" ").toLowerCase().includes(q));
  });
  const bankCats = FICHE_CATEGORIES.filter(c => bank.some(f => f.origin.category === c));

  const canUpload = !viewOnly && !!user && user.id === athleteId;
  const onFiles = (files: FileList | null) => {
    if (!files || !user || !athleteId) return;
    for (const file of Array.from(files)) {
      upload.mutate({
        file,
        coachId: coachId ?? user.id,
        athleteId,
        uploadedBy: user.id,
        title: titleFromFileName(file.name),
        category: "autre",
      });
    }
  };

  const unseen = (mine?.assigned ?? []).filter(a => !a.seenAt).length;

  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Mes fiches ── */}
      <section>
        <h2 style={sectionTitle}>Mes fiches{unseen > 0 && <span style={{ color: C.ac }}> · {unseen} nouvelle{unseen > 1 ? "s" : ""}</span>}</h2>
        {isLoading ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
        ) : grouped.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3, background: C.s1, borderRadius: 6, padding: 16, textAlign: "center" }}>
            Aucune fiche pour l'instant. Ton coach peut t'en attribuer ou les rattacher à tes séances.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {grouped.map(g => (
              <div key={g.cat}>
                <div style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLOR[g.cat], marginBottom: 6 }}>{FICHE_CATEGORY_LABEL[g.cat]}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.items.map(a => (
                    <FicheRow
                      key={a.doc.id}
                      doc={a.doc}
                      isNew={!a.seenAt}
                      meta={a.sources.includes("manuel") && a.doc.athlete_id ? "Fiche personnelle" : a.sources.includes("manuel") ? "Attribuée par ton coach" : "Liée à tes séances"}
                      onOpen={() => viewer.open(a.doc.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Banque libre-service ── */}
      <section>
        <h2 style={sectionTitle}>Banque</h2>
        {bank.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3, background: C.s1, borderRadius: 6, padding: 16, textAlign: "center" }}>
            Ton coach n'a pas encore partagé de fiche en libre-service.
          </div>
        ) : (
          <>
            <input style={{ ...input, marginBottom: 8 }} placeholder="Rechercher une fiche…" value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 8, scrollbarWidth: "none" }}>
              <button style={chip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
              {bankCats.map(c => (
                <button key={c} style={chip(cat === c, CATEGORY_COLOR[c])} onClick={() => setCat(cat === c ? "all" : c)}>{FICHE_CATEGORY_LABEL[c]}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bankFiltered.map(f => (
                <FicheRow
                  key={f.origin.id}
                  doc={f.origin}
                  meta={FICHE_CATEGORY_LABEL[f.origin.category] + (f.variants.length ? ` · ${f.variants.length + 1} versions` : "")}
                  onOpen={() => viewer.open(f.origin.id)}
                />
              ))}
              {bankFiltered.length === 0 && <div style={{ fontSize: 12, color: C.tx3 }}>Aucune fiche pour ce filtre.</div>}
            </div>
          </>
        )}
      </section>

      {/* ── Mes ajouts ── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ ...sectionTitle, margin: 0, flex: 1 }}>Mes ajouts</h2>
          {canUpload && (
            <>
              <button style={btnGhost} onClick={() => photoRef.current?.click()} disabled={upload.isPending}>📷 Photo</button>
              <button style={{ ...btnGhost, color: C.ac, borderColor: C.ac + "50" }} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? "Envoi…" : "+ Ajouter"}
              </button>
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
              <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginBottom: 8 }}>
          Captures d'écran, photos ou PDF à partager avec ton coach. Les images sont compressées automatiquement.
        </div>
        {(mine?.uploads ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3, background: C.s1, borderRadius: 6, padding: 16, textAlign: "center" }}>Aucun ajout.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mine!.uploads.map(d => (
              <FicheRow
                key={d.id}
                doc={d}
                meta={`${new Date(d.created_at).toLocaleDateString("fr-FR")} · ${formatFileSize(d.file_size)}`}
                onOpen={() => viewer.open(d.id)}
                onDelete={canUpload ? () => del.mutate(d) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
