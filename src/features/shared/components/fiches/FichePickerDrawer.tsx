/**
 * FichePickerDrawer — sélecteur de fiche réutilisable (programmation, énergie,
 * onglet athlète). Onglets : Banque · Fiches de l'athlète · Importer.
 * Après sélection : variante par défaut + « Varier selon la semaine ».
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, groupFamilies, resolveFicheForWeek, variantLabel,
} from "@/features/shared/types/fiches";
import type { Doc, DocFamily, FicheAttachment, FicheCategory } from "@/features/shared/types/fiches";
import { useAthleteDocs, useDocsBank, useDocsByIds } from "@/features/shared/hooks/fiches/useDocs";
import { FicheImportDialog } from "@/features/coach/components/fiches/FicheImportDialog";

/* Équivalents en classes de btnGhost, btnPrimary, input, label et chip (./ficheStyles). */
const BTN_GHOST = "min-h-10 cursor-pointer whitespace-nowrap rounded-[4px] border border-agon-brd-l bg-transparent px-3.5 py-2 font-[inherit] text-[12px] font-semibold text-agon-tx2";
const BTN_PRIMARY = "min-h-10 cursor-pointer whitespace-nowrap rounded-[4px] border-none bg-agon-accent px-4 py-2 font-[inherit] text-[13px] font-bold text-agon-ink";
const INPUT = "box-border min-h-10 w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-2 font-[inherit] text-[14px] text-agon-tx [outline:none]";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";
const CHIP = "min-h-8 cursor-pointer whitespace-nowrap rounded-2xl border px-3 py-1.5 font-[inherit] text-[12px] font-semibold";
const CHIP_OFF = "border-agon-brd-l bg-transparent text-agon-tx2";
const CHIP_ON_ACCENT = "border-agon-accent/[0.5] bg-agon-accent/[0.12] text-agon-accent";

/** Puce active et filet gauche par catégorie : mêmes couleurs que CATEGORY_COLOR (./ficheStyles). */
const CATEGORY_CHIP_ON: Record<FicheCategory, string> = {
  mobilite: "border-agon-patine/[0.5] bg-agon-patine/[0.12] text-agon-patine",
  pacing: "border-agon-info/[0.5] bg-agon-info/[0.12] text-agon-info",
  prevention: "border-agon-alerte/[0.5] bg-agon-alerte/[0.12] text-agon-alerte",
  recuperation: "border-agon-succes/[0.5] bg-agon-succes/[0.12] text-agon-succes",
  nutrition: "border-agon-amethyste/[0.5] bg-agon-amethyste/[0.12] text-agon-amethyste",
  education: CHIP_ON_ACCENT,
  questionnaire: "border-agon-tx2/[0.5] bg-agon-tx2/[0.12] text-agon-tx2",
  autre: "border-agon-tx3/[0.5] bg-agon-tx3/[0.12] text-agon-tx3",
};
const CATEGORY_BORDER_L: Record<FicheCategory, string> = {
  mobilite: "border-l-agon-patine",
  pacing: "border-l-agon-info",
  prevention: "border-l-agon-alerte",
  recuperation: "border-l-agon-succes",
  nutrition: "border-l-agon-amethyste",
  education: "border-l-agon-accent",
  questionnaire: "border-l-agon-tx2",
  autre: "border-l-agon-tx3",
};
const chip = (active: boolean, on: string = CHIP_ON_ACCENT) => cn(CHIP, active ? on : CHIP_OFF);

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
      <div onClick={onClose} className="fixed inset-0 z-[90] bg-agon-ink/[0.55]" />
      <aside className="fixed inset-y-0 right-0 z-[91] flex w-[min(520px,100vw)] flex-col border-l border-agon-brd bg-agon-bg">
        <div className="flex items-center gap-2.5 border-b border-agon-brd px-4 py-3">
          <div className="flex-1 text-[15px] font-extrabold text-agon-tx">{initial ? "Modifier la fiche" : "Ajouter une fiche"}</div>
          <button onClick={onClose} aria-label="Fermer" className={cn(BTN_GHOST, "min-w-10 p-0")}>×</button>
        </div>

        {!family ? (
          <>
            <div className="flex gap-0.5 px-4 pt-2.5">
              {tabs.map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} className={cn(
                  "min-h-10 flex-1 cursor-pointer border-0 border-b-2 border-solid bg-transparent font-[inherit] text-[12px] font-bold",
                  tab === t.k ? "border-b-agon-accent text-agon-accent" : "border-b-transparent text-agon-tx3",
                )}>{t.l}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Formulaire d'import toujours monté (masqué hors onglet) : la saisie
                  survit aux changements d'onglet et à la bascule banque / perso */}
              <div className={tab === "import" ? "block" : "hidden"}>
                {athleteId && (
                  <div className="mb-3 flex gap-1.5">
                    <button className={chip(!importPersonal)} onClick={() => setImportPersonal(false)}>Dans la banque</button>
                    <button className={chip(importPersonal)} onClick={() => setImportPersonal(true)}>Fiche perso de {athleteName ?? "l'athlète"}</button>
                  </div>
                )}
                <FicheImportDialog
                  inline
                  athleteId={importPersonal ? athleteId : undefined}
                  onClose={() => setTab("banque")}
                  onDone={docs => { if (docs[0]) pickFamily({ origin: docs[0], variants: [] }); }}
                />
              </div>
              {tab !== "import" && (
                <>
                  <input className={cn(INPUT, "mb-2")} placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <button className={chip(cat === "all")} onClick={() => setCat("all")}>Toutes</button>
                    {FICHE_CATEGORIES.map(c => (
                      <button key={c} className={chip(cat === c, CATEGORY_CHIP_ON[c])} onClick={() => setCat(cat === c ? "all" : c)}>{FICHE_CATEGORY_LABEL[c]}</button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <div className="py-5 text-center text-[13px] text-agon-tx3">
                      {tab === "athlete" ? `Aucune fiche personnelle pour ${athleteName ?? "cet athlète"}.` : "Aucune fiche. Utilise l'onglet Importer."}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {list.map(f => (
                        <button key={f.origin.id} onClick={() => pickFamily(f)} className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[4px] border border-l-[3px] border-agon-brd bg-agon-s1 px-3 py-2 text-left font-[inherit]",
                          CATEGORY_BORDER_L[f.origin.category],
                        )}>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-agon-tx">📄 {f.origin.title}</span>
                            <span className="text-[11px] text-agon-tx3">
                              {FICHE_CATEGORY_LABEL[f.origin.category]}
                              {f.variants.length > 0 && ` · ${f.variants.length + 1} versions`}
                              {f.origin.is_self_service && " · Libre-service"}
                            </span>
                          </span>
                          <span className="text-agon-tx3">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 text-[14px] font-bold text-agon-tx">📄 {family.origin.title}</div>
              <button className={BTN_GHOST} onClick={() => setFamilyId(null)}>Changer</button>
            </div>
            {family.origin.archived_at && (
              <div className="text-[11px] text-agon-alerte">Fiche archivée : reste lisible là où elle est déjà rattachée.</div>
            )}
            <div>
              <span className={LABEL}>{vary ? "Variante par défaut" : "Variante"}</span>
              <select className={INPUT} value={effectiveDefault} onChange={e => setDefaultId(e.target.value)} disabled={famDocs.length < 2}>
                {famDocs.map(d => <option key={d.id} value={d.id}>{variantLabel(d)}</option>)}
              </select>
            </div>
            {!docOnly && weeks.length > 1 && famDocs.length > 1 && (
              <div>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px] text-agon-tx2">
                  <input type="checkbox" checked={vary} onChange={e => {
                    setVary(e.target.checked);
                    if (e.target.checked && effectiveDefault) {
                      setWeekMap(m => Object.fromEntries(weeks.map(w => [w, m[w] ?? effectiveDefault])));
                    }
                  }} />
                  Varier selon la semaine
                </label>
                {vary && (
                  <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                    {weeks.map(w => (
                      <div key={w}>
                        <span className={LABEL}>S{w}</span>
                        <select className={INPUT} value={weekMap[w] ?? effectiveDefault} onChange={e => setWeekMap(m => ({ ...m, [w]: e.target.value }))}>
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
                <span className={LABEL}>Note pour l'athlète (optionnel)</span>
                <textarea className={cn(INPUT, "min-h-[60px]")} value={note} onChange={e => setNote(e.target.value)} />
              </div>
            )}
            <div className="mt-auto flex justify-end gap-2">
              <button className={BTN_GHOST} onClick={onClose}>Annuler</button>
              <button className={BTN_PRIMARY} onClick={save}>{confirmLabel ?? (initial ? "Enregistrer" : "Rattacher")}</button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
