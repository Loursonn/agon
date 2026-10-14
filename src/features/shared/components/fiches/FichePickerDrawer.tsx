/**
 * FichePickerDrawer — sélecteur de fiche réutilisable (programmation, énergie,
 * onglet athlète). Onglets : Banque · Fiches de l'athlète · Importer.
 * Après sélection : variante par défaut + « Varier selon la semaine ».
 */
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, groupFamilies, resolveFicheForWeek, variantLabel,
} from "@/features/shared/types/fiches";
import type { Doc, DocFamily, FicheAttachment, FicheCategory } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDocsBank, useDocsByIds } from "@/features/shared/hooks/fiches/useDocs";
import { FicheImportDialog } from "@/features/coach/components/fiches/FicheImportDialog";
import { CATEGORY_COLOR, btnGhost, btnPrimary, chip, input, label } from "./ficheStyles";

type Tab = "banque" | "athlete" | "import";

interface Props {
  /** Athlète concerné (onglet « Fiches de l'athlète ») ; absent = banque seule */
  athleteId?: string;
  athleteName?: string;
  /** Semaines proposées pour « Varier selon la semaine » (vide / 1 = option masquée) */
  weeks?: number[];
  /** Rattachement à modifier */
  initial?: FicheAttachment | null;
  /** Mode simple : renvoie seulement une fiche (attribution manuelle) */
  docOnly?: boolean;
  confirmLabel?: string;
  /** Champ note coach (attribution manuelle) */
  withNote?: boolean;
  onSave: (att: FicheAttachment, note?: string) => void;
  onClose: () => void;
}

function familyOf(families: DocFamily[], docId: string | undefined) {
  if (!docId) return null;
  return families.find(f => f.origin.id === docId || f.variants.some(v => v.id === docId)) ?? null;
}

export function FichePickerDrawer({
  athleteId, athleteName, weeks = [], initial, docOnly, confirmLabel, withNote, onSave, onClose,
}: Props) {
  const { user } = useAuth();
  const { data: bank = [] } = useDocsBank(user?.id);
  const { data: athleteDocs } = useAthleteDocs(athleteId);
  const personal = useMemo(() => groupFamilies(athleteDocs?.personal ?? []), [athleteDocs?.personal]);
  const activeBank = useMemo(() => bank.filter(f => !f.origin.archived_at), [bank]);

  // Rattachement existant vers une fiche archivée : on la garde sélectionnable
  const initialIds = initial ? [initial.doc_id, ...Object.values(initial.weeks ?? {})] : [];
  const { data: initialDocs = {} } = useDocsByIds(initialIds);

  const [tab, setTab] = useState<Tab>("banque");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<FicheCategory | "all">("all");
  const [note, setNote] = useState("");
  const [importPersonal, setImportPersonal] = useState(false);

  const allFamilies = useMemo(() => {
    const fams = [...bank, ...personal];
    // fiche initiale hors banque (perso d'un autre contexte, archivée…)
    const extra = Object.values(initialDocs).filter(d => !familyOf(fams, d.id));
    return [...fams, ...groupFamilies(extra)];
  }, [bank, personal, initialDocs]);

  const [familyId, setFamilyId] = useState<string | null>(() => null);
  const family = familyId
    ? allFamilies.find(f => f.origin.id === familyId) ?? null
    : familyOf(allFamilies, initial?.doc_id);
  const famDocs: Doc[] = family ? [family.origin, ...family.variants] : [];

  const [defaultId, setDefaultId] = useState<string | null>(initial?.doc_id ?? null);
  const [vary, setVary] = useState(!!initial?.weeks && Object.keys(initial.weeks).length > 0);
  const [weekMap, setWeekMap] = useState<Record<number, string>>(() => {
    if (!initial) return {};
    return Object.fromEntries(weeks.map(w => [w, resolveFicheForWeek(initial, w)]));
  });

  const pickFamily = (f: DocFamily) => {
    setFamilyId(f.origin.id);
    setDefaultId(f.origin.id);
    setWeekMap(Object.fromEntries(weeks.map(w => [w, f.origin.id])));
  };

  const effectiveDefault = defaultId && famDocs.some(d => d.id === defaultId) ? defaultId : famDocs[0]?.id;

  const save = () => {
    if (!effectiveDefault) return;
    let att: FicheAttachment = { id: initial?.id ?? crypto.randomUUID(), doc_id: effectiveDefault };
    if (vary && !docOnly && weeks.length > 1) {
      const w: Record<number, string> = {};
      for (const wk of weeks) {
        const id = weekMap[wk];
        if (id && id !== effectiveDefault) w[wk] = id;
      }
      if (Object.keys(w).length) att = { ...att, weeks: w };
    }
    onSave(att, withNote ? note : undefined);
  };

  const list = (tab === "athlete" ? personal : activeBank).filter(f => {
    const q = search.trim().toLowerCase();
    return (cat === "all" || f.origin.category === cat)
      && (!q || [f.origin.title, ...f.origin.tags].join(" ").toLowerCase().includes(q));
  });

  const tabs: { k: Tab; l: string }[] = [
    { k: "banque", l: "Banque" },
    ...(athleteId ? [{ k: "athlete" as Tab, l: "Fiches de l'athlète" }] : []),
    { k: "import", l: "Importer" },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)" }} />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 91, width: "min(520px, 100vw)",
        background: C.bg, borderLeft: "1px solid " + C.brd, display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.tx }}>{initial ? "Modifier la fiche" : "Ajouter une fiche"}</div>
          <button onClick={onClose} aria-label="Fermer" style={{ ...btnGhost, minWidth: 40, padding: 0 }}>×</button>
        </div>

        {!family ? (
          <>
            <div style={{ display: "flex", gap: 2, padding: "10px 16px 0" }}>
              {tabs.map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{
                  flex: 1, minHeight: 40, border: "none", borderBottom: "2px solid " + (tab === t.k ? C.ac : "transparent"),
                  background: "transparent", color: tab === t.k ? C.ac : C.tx3, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{t.l}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {tab === "import" ? (
                <>
                {athleteId && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    <button style={chip(!importPersonal)} onClick={() => setImportPersonal(false)}>Dans la banque</button>
                    <button style={chip(importPersonal)} onClick={() => setImportPersonal(true)}>Fiche perso de {athleteName ?? "l'athlète"}</button>
                  </div>
                )}
                <FicheImportDialog
                  key={importPersonal ? "perso" : "banque"}
                  inline
                  athleteId={importPersonal ? athleteId : undefined}
                  onClose={() => setTab("banque")}
                  onDone={docs => { if (docs[0]) pickFamily({ origin: docs[0], variants: [] }); }}
                />
                </>
              ) : (
                <>
                  <input style={{ ...input, marginBottom: 8 }} placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    <button style={chip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
                    {FICHE_CATEGORIES.map(c => (
                      <button key={c} style={chip(cat === c, CATEGORY_COLOR[c])} onClick={() => setCat(cat === c ? "all" : c)}>{FICHE_CATEGORY_LABEL[c]}</button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.tx3, padding: "20px 0", textAlign: "center" }}>
                      {tab === "athlete" ? `Aucune fiche personnelle pour ${athleteName ?? "cet athlète"}.` : "Aucune fiche. Utilise l'onglet Importer."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {list.map(f => (
                        <button key={f.origin.id} onClick={() => pickFamily(f)} style={{
                          display: "flex", alignItems: "center", gap: 10, textAlign: "left", minHeight: 48,
                          padding: "8px 12px", background: C.s1, border: "1px solid " + C.brd,
                          borderLeft: "3px solid " + CATEGORY_COLOR[f.origin.category], borderRadius: 4,
                          cursor: "pointer", fontFamily: "inherit",
                        }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.tx }}>📄 {f.origin.title}</span>
                            <span style={{ fontSize: 11, color: C.tx3 }}>
                              {FICHE_CATEGORY_LABEL[f.origin.category]}
                              {f.variants.length > 0 && ` · ${f.variants.length + 1} versions`}
                              {f.origin.is_self_service && " · Libre-service"}
                            </span>
                          </span>
                          <span style={{ color: C.tx3 }}>›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.tx }}>📄 {family.origin.title}</div>
              <button style={btnGhost} onClick={() => setFamilyId(null)}>Changer</button>
            </div>
            {family.origin.archived_at && (
              <div style={{ fontSize: 11, color: C.o }}>Fiche archivée : reste lisible là où elle est déjà rattachée.</div>
            )}
            <div>
              <span style={label}>{vary ? "Variante par défaut" : "Variante"}</span>
              <select style={input} value={effectiveDefault} onChange={e => setDefaultId(e.target.value)} disabled={famDocs.length < 2}>
                {famDocs.map(d => <option key={d.id} value={d.id}>{variantLabel(d)}</option>)}
              </select>
            </div>
            {!docOnly && weeks.length > 1 && famDocs.length > 1 && (
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.tx2, cursor: "pointer", minHeight: 40 }}>
                  <input type="checkbox" checked={vary} onChange={e => {
                    setVary(e.target.checked);
                    if (e.target.checked && effectiveDefault) {
                      setWeekMap(m => Object.fromEntries(weeks.map(w => [w, m[w] ?? effectiveDefault])));
                    }
                  }} />
                  Varier selon la semaine
                </label>
                {vary && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 6 }}>
                    {weeks.map(w => (
                      <div key={w}>
                        <span style={label}>S{w}</span>
                        <select style={input} value={weekMap[w] ?? effectiveDefault} onChange={e => setWeekMap(m => ({ ...m, [w]: e.target.value }))}>
                          {famDocs.map(d => <option key={d.id} value={d.id}>{variantLabel(d)}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {withNote && (
              <div>
                <span style={label}>Note pour l'athlète (optionnel)</span>
                <textarea style={{ ...input, minHeight: 60 }} value={note} onChange={e => setNote(e.target.value)} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "auto" }}>
              <button style={btnGhost} onClick={onClose}>Annuler</button>
              <button style={btnPrimary} onClick={save}>{confirmLabel ?? (initial ? "Enregistrer" : "Rattacher")}</button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
