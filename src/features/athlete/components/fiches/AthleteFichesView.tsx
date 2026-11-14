/**
 * AthleteFichesView — onglet Programme → Fiches (?vue=fiches).
 * Mes fiches (attribuées + personnelles) · Banque (libre-service du coach) · Mes ajouts.
 */
import { useMemo, useRef, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { ChevronRight, FileText, MessageSquare, Search } from "lucide-react";
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
import { CATEGORY_COLOR, btnGhost } from "@/features/shared/components/fiches/ficheStyles";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { AssignedDoc } from "@/api/docs";
import { useIsWide } from "@/hooks/useIsWide";
import { FicheViewer } from "@/features/shared/components/fiches/FicheViewer";

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Pastille de fiche (planche « Fiches athlète ») : document dans un carré teinté. */
function DocTile({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: "none", borderRadius: 10, boxSizing: "border-box",
      background: alpha(color, 0.14), border: `1px solid ${alpha(color, 0.4)}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}><FileText size={18} color={color} strokeWidth={1.6} /></span>
  );
}

/** Titre de section « 01 — Mes fiches » + compteur à droite. */
function Kicker({ num, title, right }: { num: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: `1px solid ${C.brd}` }}>
      <h2 style={{ ...MONO, margin: 0, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{num} —</span> {title}
      </h2>
      {right != null && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{right}</span>}
    </div>
  );
}

/** Filtre : « Toutes » plein sable quand actif, catégories avec leur point de couleur. */
function FilterChip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{
      height: 32, boxSizing: "border-box", display: "inline-flex", alignItems: "center", gap: 7, padding: "0 12px",
      borderRadius: 999, flex: "none", whiteSpace: "nowrap", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
      background: active ? C.sable : "transparent", color: active ? C.ink : C.tx,
      border: active ? "1px solid transparent" : `1px solid ${C.brdL}`, fontWeight: active ? 500 : 400,
    }}>
      {color && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none" }} />}
      {children}
    </button>
  );
}

function FicheRow({ doc, isNew, meta, date, onOpen, onDelete }: {
  doc: Doc; isNew?: boolean; meta?: string; date?: string; onOpen: () => void; onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const variant = doc.origin_id || doc.variant_label ? variantLabel(doc) : null;
  const col = CATEGORY_COLOR[doc.category];
  return (
    <div style={{
      display: "flex", alignItems: "stretch", background: C.s1, border: `1px solid ${C.brd}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      <button onClick={onOpen} style={{
        flex: 1, minWidth: 0, minHeight: 60, padding: 12, background: "transparent", border: "none", color: C.tx,
        textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12,
      }}>
        <DocTile color={col} />
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.title}{variant && <span style={{ color: C.tx3, fontWeight: 400 }}> · {variant}</span>}
            </span>
            {isNew && <span aria-label="Nouvelle" style={{ width: 8, height: 8, borderRadius: "50%", background: C.ac, flex: "none" }} />}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 12, color: C.tx3, whiteSpace: "nowrap" }}>
            <span style={{ color: col, flex: "none" }}>{FICHE_CATEGORY_LABEL[doc.category]}</span>
            {(meta ?? doc.description) && <><span>·</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta ?? doc.description}</span></>}
          </span>
        </span>
        {date && <span style={{ ...MONO, fontSize: 11, color: isNew ? C.ac : C.tx3, flexShrink: 0 }}>{fmtShort(date)}</span>}
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
  const pill = { ...MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: C.ink, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" as const, flex: "none" as const };
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, background: alpha(col, 0.13), border: `1px solid ${alpha(col, 0.45)}`, overflow: "hidden" }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...pill, background: C.ac }}>Nouvelle</span>
        <span style={{ ...pill, background: col }}>{FICHE_CATEGORY_LABEL[a.doc.category]}</span>
        <span style={{ flex: 1 }} />
        {sent && <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{fmtShort(sent)}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <DocTile color={col} size={40} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: C.tx }}>{a.doc.title}</span>
          {a.doc.description && <span style={{ fontSize: 12.5, color: C.tx2 }}>{a.doc.description}</span>}
        </div>
      </div>
      {a.coachNote && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: alpha(C.bg, 0.45) }}>
          <span aria-hidden style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", border: `1px solid ${C.ac}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MessageSquare size={12} color={C.ac} />
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: C.tx }}>« {a.coachNote} »</span>
        </div>
      )}
      <button type="button" onClick={onOpen} style={{ height: 52, width: "100%", borderRadius: 12, border: "none", background: C.ac, color: C.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        Lire la fiche<ChevronRight size={15} />
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
    <div style={{ padding: wide ? "16px 0 32px" : "16px 16px 32px", display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
      {/* ── Mes fiches ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {hero && <NewFicheHero a={hero} onOpen={() => viewer.open(hero.doc.id)} />}
        {(assigned.length > 0 || bank.length > 0) && (
          <>
            <label style={{ height: 42, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", border: `1px solid ${C.brdL}`, borderRadius: 12, background: C.s2 }}>
              <Search size={15} color={C.tx3} aria-hidden />
              <input aria-label="Rechercher une fiche" placeholder="Rechercher une fiche" value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: C.tx, fontSize: 13.5, fontFamily: "inherit" }} />
            </label>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
              <FilterChip active={cat === "all"} onClick={() => setCat("all")}>Toutes</FilterChip>
              {allCats.map(c => (
                <FilterChip key={c} active={cat === c} color={CATEGORY_COLOR[c]} onClick={() => setCat(cat === c ? "all" : c)}>{FICHE_CATEGORY_LABEL[c]}</FilterChip>
              ))}
            </div>
          </>
        )}
        <Kicker num="01" title="Mes fiches" right={unseen > 0 ? <span style={{ color: C.ac }}>{unseen} nouvelle{unseen > 1 ? "s" : ""}</span> : assigned.length || undefined} />
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
        <Kicker num="02" title="Bibliothèque du coach" right={bank.length > 0 ? `${bank.length} en libre accès` : undefined} />
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
          <div style={{ flex: 1, minWidth: 0 }}><Kicker num="03" title="Mes ajouts" /></div>
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
