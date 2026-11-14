/**
 * FichesPage — banque de fiches du coach (PDF / images).
 * Route : /coach/fiches
 */
import { useMemo, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, KICK, MONO, SectionHead } from "@/features/shared/components/ordi/OrdiUi";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL } from "@/features/shared/types/fiches";
import type { DocFamily, FicheCategory } from "@/features/shared/types/fiches";
import { useDocsBank } from "@/features/shared/hooks/fiches/useDocs";
import { CATEGORY_COLOR, btnPrimary } from "@/features/shared/components/fiches/ficheStyles";
import { Plus, Search } from "lucide-react";
import type { CSSProperties } from "react";

/** Filtre en pastille (planche CoachFiches) : point de couleur, teinte 10 % quand la catégorie est choisie. */
function filterChip(on: boolean, color?: string): CSSProperties {
  return {
    height: 32, boxSizing: "border-box", display: "inline-flex", alignItems: "center", gap: 7, padding: "0 12px",
    borderRadius: 999, fontSize: 12, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
    ...(on
      ? color ? { background: alpha(color, 0.1), color: C.tx, border: `1px solid ${alpha(color, 0.4)}` }
              : { background: C.ac, color: C.ink, border: `1px solid ${C.ac}`, fontWeight: 500 }
      : { background: "transparent", color: C.tx2, border: `1px solid ${C.brdL}` }),
  };
}
const Dot = ({ color }: { color: string }) => <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none" }} />;
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
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, padding: "36px 40px 28px", borderBottom: `1px solid ${C.brd}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ ...KICK, color: C.ac }}>Fiches</span>
          <h1 style={{ ...DISPLAY, fontSize: 32, fontWeight: 300, lineHeight: 1.1, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx, margin: 0 }}>Fiches</h1>
        </div>
        <button style={{ ...btnPrimary, height: 40, minHeight: 0, borderRadius: 10, padding: "0 18px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }} onClick={() => setImportOpen(true)}><Plus size={14} /> Importer</button>
      </div>
      <div style={{ padding: "20px 40px", borderBottom: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ height: 40, boxSizing: "border-box", width: 320, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", border: `1px solid ${C.brdL}`, borderRadius: 10, background: C.s1, color: C.tx3 }}>
            <Search size={14} />
            <input
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.tx, fontSize: 13, fontFamily: "inherit" }}
              placeholder="Rechercher (titre, tag…)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <span style={{ flex: 1 }} />
          <button style={filterChip(selfOnly, C.g)} onClick={() => setSelfOnly(v => !v)}><Dot color={C.g} />Libre-service</button>
          <button style={filterChip(showArchived, C.tx2)} onClick={() => setShowArchived(v => !v)}>Archivées</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button style={filterChip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
          {FICHE_CATEGORIES.map(c => (
            <button key={c} style={filterChip(cat === "all" || cat === c, CATEGORY_COLOR[c])} onClick={() => setCat(cat === c ? "all" : c)}>
              <Dot color={CATEGORY_COLOR[c]} />{FICHE_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px 40px 48px", display: "flex", flexDirection: "column", gap: 32 }}>
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
        ) : grouped.map((g, idx) => (
          <section key={g.cat} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionHead n={idx + 1} title={FICHE_CATEGORY_LABEL[g.cat]} right={`${g.items.length} fiche${g.items.length > 1 ? "s" : ""}`} color={CATEGORY_COLOR[g.cat]} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {g.items.map(f => { const cc = CATEGORY_COLOR[f.origin.category]; return (
                <button
                  key={f.origin.id}
                  onClick={() => setOpenId(f.origin.id)}
                  style={{
                    position: "relative", overflow: "hidden",
                    textAlign: "left", background: alpha(cc, 0.12), border: "1px solid " + alpha(cc, 0.4), borderRadius: 14,
                    padding: "20px 16px 16px", cursor: "pointer", fontFamily: "inherit", color: C.tx,
                    opacity: f.origin.archived_at ? 0.6 : 1, display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4, background: cc }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, height: 22, fontSize: 14, fontWeight: 500, color: C.tx }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.origin.title}</span>
                    {f.origin.is_self_service && (
                      <span style={{ ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", flex: "none", color: C.ink, background: C.g, borderRadius: 999, padding: "3px 8px" }}>Libre-service</span>
                    )}
                  </div>
                  {f.origin.description && (
                    <div style={{ fontSize: 12, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.origin.description}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 8, borderTop: `1px solid ${alpha(cc, 0.22)}`, ...MONO, fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>
                    <span>
                      {f.origin.kind === "pdf" ? "PDF" : "Image"} · {formatFileSize(f.origin.file_size)}
                      {f.variants.length > 0 && <> · <span style={{ color: cc }}>{f.variants.length + 1} versions</span></>}
                      {f.origin.archived_at && " · Archivée"}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.origin.tags.slice(0, 3).map(t => `#${t}`).join(" ")}</span>
                  </div>
                </button>
              ); })}
            </div>
          </section>
        ))}
      </div>

      {importOpen && <FicheImportDialog onClose={() => setImportOpen(false)} />}
      {opened && <FicheDetailPanel key={opened.origin.id} family={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
