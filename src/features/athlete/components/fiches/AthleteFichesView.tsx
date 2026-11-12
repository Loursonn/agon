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
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import type { AssignedDoc } from "@/api/docs";
import { useIsWide } from "@/hooks/useIsWide";
import { FicheViewer } from "@/features/shared/components/fiches/FicheViewer";

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function FicheRow({ doc, isNew, meta, date, onOpen, onDelete }: {
  doc: Doc; isNew?: boolean; meta?: string; date?: string; onOpen: () => void; onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const variant = doc.origin_id || doc.variant_label ? variantLabel(doc) : null;
  const col = CATEGORY_COLOR[doc.category];
  return (
    <div style={{
      display: "flex", alignItems: "stretch", background: col + "12", border: "1px solid " + (isNew ? C.ac + "73" : col + "40"),
      borderRadius: 12, overflow: "hidden", position: "relative",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col }} />
      <button onClick={onOpen} style={{
        flex: 1, minWidth: 0, minHeight: 58, padding: "10px 12px 10px 15px", background: "transparent", border: "none",
        textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.title}{variant && <span style={{ color: C.tx3 }}> · {variant}</span>}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 11.5, color: C.tx3 }}>
            <span style={{ color: col, flex: "none" }}>{FICHE_CATEGORY_LABEL[doc.category]}</span>
            {(meta ?? doc.description) && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {meta ?? doc.description}</span>}
          </span>
        </span>
        {isNew ? (
          <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: C.ac, borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>Nouvelle</span>
        ) : date ? (
          <span style={{ ...MONO, fontSize: 11, color: C.tx3, flexShrink: 0 }}>{fmtShort(date)}</span>
        ) : null}
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

/** Date d'envoi la plus récente d'une fiche attribuée. */
const sentAt = (a: AssignedDoc) => a.assignments.map(x => x.created_at).sort().pop() ?? a.doc.created_at;

/** Fiche nouvelle mise en avant (maquette « Fiches athlète ») : mot du coach et « Lire la fiche ». */
function NewFicheHero({ a, onOpen }: { a: AssignedDoc; onOpen: () => void }) {
  const col = CATEGORY_COLOR[a.doc.category];
  const sent = sentAt(a);
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${col}73`, background: `linear-gradient(160deg, ${col}2E, ${col}0F), ${C.s1}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: C.ac, borderRadius: 999, padding: "2px 8px" }}>Nouvelle</span>
        <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 999, padding: "1px 8px" }}>{FICHE_CATEGORY_LABEL[a.doc.category]}</span>
        {sent && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{fmtShort(sent)}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...DISPLAY, fontSize: 19, color: C.tx }}>{a.doc.title}</span>
        {a.doc.description && <span style={{ fontSize: 13, color: C.tx2 }}>{a.doc.description}</span>}
      </div>
      {a.coachNote && <span style={{ fontSize: 13, color: C.tx2, fontStyle: "italic", lineHeight: 1.5 }}>« {a.coachNote} »</span>}
      <button type="button" onClick={onOpen} style={{ alignSelf: "stretch", height: 46, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        Lire la fiche
      </button>
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
  const wide = useIsWide();

  const [cat, setCat] = useState<FicheCategory | "all">("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const q = search.trim().toLowerCase();
  const matches = (d: Doc) =>
    (cat === "all" || d.category === cat)
    && (!q || [d.title, d.description ?? "", ...(d.tags ?? [])].join(" ").toLowerCase().includes(q));

  // Mes fiches : la plus récente d'abord ; une fiche nouvelle mise en avant
  const assigned = useMemo(
    () => [...(mine?.assigned ?? [])].sort((a, b) => sentAt(b).localeCompare(sentAt(a))),
    [mine?.assigned],
  );
  const hero = assigned.find(a => !a.seenAt) ?? null;
  const myList = assigned.filter(a => a !== hero && matches(a.doc));
  const allCats = FICHE_CATEGORIES.filter(c => assigned.some(a => a.doc.category === c) || bank.some(f => f.origin.category === c));

  const bankFiltered = bank.filter(f => matches(f.origin));

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

  const list = (
    <div style={{ padding: wide ? "16px 0 32px" : "16px 16px 32px", display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
      {/* ── Mes fiches ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Mes fiches{unseen > 0 && <span style={{ color: C.ac }}> · {unseen} nouvelle{unseen > 1 ? "s" : ""}</span>}</h2>
          <span style={{ fontSize: 12, color: C.tx3 }}>Envoyées par ton coach</span>
        </div>
        {hero && <NewFicheHero a={hero} onOpen={() => viewer.open(hero.doc.id)} />}
        {(assigned.length > 0 || bank.length > 0) && (
          <>
            <input style={input} placeholder="Rechercher une fiche…" value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
              <button style={chip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
              {allCats.map(c => (
                <button key={c} style={chip(cat === c, CATEGORY_COLOR[c])} onClick={() => setCat(cat === c ? "all" : c)}>{FICHE_CATEGORY_LABEL[c]}</button>
              ))}
            </div>
          </>
        )}
        {isLoading ? (
          <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>
        ) : assigned.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3, background: C.s1, borderRadius: 12, padding: 16, textAlign: "center" }}>
            Aucune fiche pour l'instant. Ton coach peut t'en attribuer ou les rattacher à tes séances.
          </div>
        ) : myList.length === 0 ? (
          hero ? null : <div style={{ fontSize: 12, color: C.tx3 }}>Aucune fiche pour ce filtre.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myList.map(a => (
              <FicheRow
                key={a.doc.id}
                doc={a.doc}
                isNew={!a.seenAt}
                date={sentAt(a)}
                meta={a.doc.description ?? (a.sources.includes("manuel") && a.doc.athlete_id ? "Fiche personnelle" : a.sources.includes("manuel") ? "Attribuée par ton coach" : "Liée à tes séances")}
                onOpen={() => viewer.open(a.doc.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Banque libre-service ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Bibliothèque du coach</h2>
          {bank.length > 0 && <span style={{ fontSize: 12, color: C.tx3 }}>{bank.length} fiche{bank.length > 1 ? "s" : ""} en libre accès</span>}
        </div>
        {bank.length === 0 ? (
          <div style={{ fontSize: 13, color: C.tx3, background: C.s1, borderRadius: 12, padding: 16, textAlign: "center" }}>
            Ton coach n'a pas encore partagé de fiche en libre-service.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bankFiltered.map(f => (
              <FicheRow
                key={f.origin.id}
                doc={f.origin}
                meta={(f.origin.description ?? "") + (f.variants.length ? `${f.origin.description ? " · " : ""}${f.variants.length + 1} versions` : "") || undefined}
                onOpen={() => viewer.open(f.origin.id)}
              />
            ))}
            {bankFiltered.length === 0 && <div style={{ fontSize: 12, color: C.tx3 }}>Aucune fiche pour ce filtre.</div>}
          </div>
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
                meta={formatFileSize(d.file_size)}
                date={d.created_at}
                onOpen={() => viewer.open(d.id)}
                onDelete={canUpload ? () => del.mutate(d) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );

  if (!wide) return list;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 24, padding: "0 24px", alignItems: "start" }}>
      {list}
      <div style={{ paddingTop: 16 }}>
        {viewer.openDocId && athleteId ? (
          <FicheViewer
            key={viewer.openDocId}
            inline
            docId={viewer.openDocId}
            athleteId={athleteId}
            viewOnly={viewOnly}
            onClose={viewer.close}
            onSwapVariant={viewer.swap}
          />
        ) : (
          <div style={{ borderRadius: 14, border: "1px dashed " + C.brdL, padding: "48px 24px", textAlign: "center", fontSize: 13, color: C.tx3 }}>
            Choisis une fiche à gauche pour la lire ici.
          </div>
        )}
      </div>
    </div>
  );
}
