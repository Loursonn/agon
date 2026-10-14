/**
 * FichesPage — banque de fiches du coach (PDF / images).
 * Route : /coach/fiches
 */
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL } from "@/features/shared/types/fiches";
import type { DocFamily, FicheCategory } from "@/features/shared/types/fiches";
import { useDocsBank } from "@/features/shared/hooks/fiches/useDocs";
import { CATEGORY_COLOR, btnPrimary, chip, input } from "@/features/shared/components/fiches/ficheStyles";
import { FicheImportDialog } from "../components/fiches/FicheImportDialog";
import { FicheDetailPanel } from "../components/fiches/FicheDetailPanel";

function matches(f: DocFamily, q: string) {
  if (!q) return true;
  const hay = [f.origin.title, f.origin.description ?? "", ...f.origin.tags, ...f.variants.map(v => v.variant_label ?? "")]
    .join(" ").toLowerCase();
  return hay.includes(q);
}

export default function FichesPage() {
  const { user } = useAuth();
  const { data: families = [], isLoading } = useDocsBank(user?.id);

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<FicheCategory | "all">("all");
  const [selfOnly, setSelfOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return families.filter(f =>
      (showArchived ? !!f.origin.archived_at : !f.origin.archived_at)
      && (cat === "all" || f.origin.category === cat)
      && (!selfOnly || f.origin.is_self_service)
      && matches(f, q),
    );
  }, [families, search, cat, selfOnly, showArchived]);

  const grouped = useMemo(() => {
    const map = new Map<FicheCategory, DocFamily[]>();
    for (const f of filtered) map.set(f.origin.category, [...(map.get(f.origin.category) ?? []), f]);
    return [...FICHE_CATEGORIES, "questionnaire" as const].filter(c => map.has(c)).map(c => ({ cat: c, items: map.get(c)! }));
  }, [filtered]);

  const opened = families.find(f => f.origin.id === openId) ?? null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.s1, borderBottom: `1px solid ${C.brd}` }}>
        <div style={{ padding: "14px 20px 10px", display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.tx, margin: 0, flex: 1 }}>Fiches</h1>
          <button style={btnPrimary} onClick={() => setImportOpen(true)}>+ Importer</button>
        </div>
        <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            style={{ ...input, maxWidth: 260, minHeight: 34 }}
            placeholder="Rechercher (titre, tag…)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button style={chip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
          {FICHE_CATEGORIES.map(c => (
            <button key={c} style={chip(cat === c, CATEGORY_COLOR[c])} onClick={() => setCat(cat === c ? "all" : c)}>
              {FICHE_CATEGORY_LABEL[c]}
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: C.brd }} />
          <button style={chip(selfOnly, C.g)} onClick={() => setSelfOnly(v => !v)}>Libre-service</button>
          <button style={chip(showArchived, C.tx2)} onClick={() => setShowArchived(v => !v)}>Archivées</button>
        </div>
      </div>

      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 22 }}>
        {isLoading ? (
          <div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.tx3 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>
              {families.length === 0 ? "Aucune fiche" : "Aucune fiche pour ces filtres"}
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              Importe tes PDF (mobilité, pacing, nutrition…) pour les rattacher aux séances.
            </div>
            {families.length === 0 && <button style={btnPrimary} onClick={() => setImportOpen(true)}>+ Importer des fiches</button>}
          </div>
        ) : grouped.map(g => (
          <section key={g.cat}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: CATEGORY_COLOR[g.cat], textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
              {FICHE_CATEGORY_LABEL[g.cat]} · {g.items.length}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {g.items.map(f => (
                <button
                  key={f.origin.id}
                  onClick={() => setOpenId(f.origin.id)}
                  style={{
                    textAlign: "left", background: C.s1, border: "1px solid " + C.brd, borderRadius: 6,
                    borderTop: "3px solid " + CATEGORY_COLOR[f.origin.category],
                    padding: "12px 14px", cursor: "pointer", fontFamily: "inherit",
                    opacity: f.origin.archived_at ? 0.6 : 1, minHeight: 88,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>📄 {f.origin.title}</div>
                  {f.origin.description && (
                    <div style={{ fontSize: 12, color: C.tx3, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.origin.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 10, color: C.tx3 }}>
                    <span>{f.origin.kind === "pdf" ? "PDF" : "Image"} · {formatFileSize(f.origin.file_size)}</span>
                    {f.variants.length > 0 && <span style={{ color: C.tx2 }}>· {f.variants.length + 1} versions</span>}
                    {f.origin.is_self_service && <span style={{ color: C.g, fontWeight: 700 }}>· Libre-service</span>}
                    {f.origin.archived_at && <span>· Archivée</span>}
                    {f.origin.tags.slice(0, 3).map(t => <span key={t}>#{t}</span>)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {importOpen && <FicheImportDialog onClose={() => setImportOpen(false)} />}
      {opened && <FicheDetailPanel key={opened.origin.id} family={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
