/**
 * SpecificBlockBankView — gestion de la banque de blocs spécifiques
 * (sous-onglet Blocs de Banque → Spécifique). Création, édition, suppression.
 * Un bloc est de type Classique (exercices/consignes) ou WOD (intervalles).
 */
import { useMemo, useState } from "react";
import { X, Trash2, Zap, ListChecks, Plus } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/energy/treeUtils";
import { useAuth } from "@/hooks/useAuth";
import IntervalBuilder from "../energy/IntervalBuilder";
import TaxonomySelect from "./TaxonomySelect";
import SpecificItemFields from "./SpecificItemFields";
import {
  useSpecificBlocks, useCreateSpecificBlock, useUpdateSpecificBlock, useDeleteSpecificBlock,
} from "@/features/shared/hooks/useSpecificBlocks";
import {
  useSpecificSports, usePhysicalQualities, useCreateSport, useCreateQuality,
} from "@/features/shared/hooks/useSpecificTaxonomy";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import type { ClassiqueItem, SpecificBlockRow, BlockKind } from "@/types/specific";

/** Teinte d'un sport sans couleur, passée à TaxonomySelect (valeur de couleur). */
const SPORT_ACCENT = C.o;

const FIELD = "min-w-0 rounded-[6px] border border-agon-brd bg-agon-s2 text-agon-tx outline-none";
const PRIMARY = "cursor-pointer rounded bg-agon-alerte font-semibold text-agon-ink";
const GHOST_ICON = "flex cursor-pointer bg-transparent p-0.5 text-agon-tx3 hover:text-agon-erreur";
const BADGE = "rounded px-1.5 py-0.5 text-[9px] font-bold";
const OVERLAY = "fixed inset-0 bg-black/65";

/** Carte de bloc : bandeau, pastille et bordure au survol (WOD = alerte, Classique = succès). */
const KIND_TONE = {
  wod:       { stripe: "bg-agon-alerte", badge: "bg-agon-alerte/[0.125] text-agon-alerte", hover: "hover:border-agon-alerte/[0.376]" },
  classique: { stripe: "bg-agon-succes", badge: "bg-agon-succes/[0.125] text-agon-succes", hover: "hover:border-agon-succes/[0.376]" },
} as const;

// ── Editor modal ─────────────────────────────────────────────────────────────

function BlockEditorModal({ initial, onClose }: {
  initial: SpecificBlockRow | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const createBlock = useCreateSpecificBlock();
  const updateBlock = useUpdateSpecificBlock();

  const { data: sports = [] }    = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();
  const createSport   = useCreateSport();
  const createQuality = useCreateQuality();

  const [name, setName]           = useState(initial?.name ?? "");
  const [sportId, setSportId]     = useState<string | null>(initial?.sport_id ?? null);
  const [qualityId, setQualityId] = useState<string | null>(initial?.quality_id ?? null);
  const [kind, setKind]           = useState<BlockKind>(initial?.content.kind === "wod" ? "wod" : "classique");
  const [items, setItems]         = useState<ClassiqueItem[]>(
    initial?.content.items?.length ? initial.content.items : [{ id: genId(), name: "" }]
  );
  const [steps, setSteps]         = useState<EnergyStep[]>(initial?.content.steps ?? []);
  const [instructions, setInstructions] = useState(initial?.content.instructions ?? "");

  const isSaving = createBlock.isPending || updateBlock.isPending;

  async function handleSave() {
    if (!user?.id) return;
    const instr = instructions.trim() || undefined;
    const content = kind === "wod"
      ? { title: name, instructions: instr, kind: "wod" as const, steps }
      : { title: name, instructions: instr, items: items.filter((i) => i.name.trim()) };
    if (initial) {
      await updateBlock.mutateAsync({
        id: initial.id, name: name.trim() || "Bloc sans titre",
        sport_id: sportId, quality_id: qualityId, content,
      });
    } else {
      await createBlock.mutateAsync({
        coach_id: user.id, name: name.trim() || "Bloc sans titre",
        sport_id: sportId, quality_id: qualityId, content,
      });
    }
    onClose();
  }

  function updateItem(id: string, patch: Partial<ClassiqueItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return (
    <>
      <div onClick={onClose} className={cn(OVERLAY, "z-[90]")} />
      <div className="fixed left-1/2 top-1/2 z-[91] flex max-h-[90vh] w-[min(96vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[6px] border border-agon-brd-l bg-agon-bg">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-agon-brd px-5 pb-3.5 pt-4">
          <div className="flex-1 text-[15px] font-extrabold text-agon-tx">
            {initial ? "Modifier le bloc" : "Nouveau bloc"}
          </div>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded border border-agon-brd-l bg-transparent text-agon-tx3"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-[18px]">
          {/* Meta row */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du bloc…"
              className={cn(FIELD, "min-w-[180px] flex-1 px-2.5 py-2 text-[13px] font-bold")}
            />
            <TaxonomySelect
              placeholder="Sport"
              options={sports}
              value={sportId}
              onChange={setSportId}
              onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
              width={140}
              accent={SPORT_ACCENT}
            />
            <TaxonomySelect
              placeholder="Qualité"
              options={qualities}
              value={qualityId}
              onChange={setQualityId}
              onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
              width={150}
              accent={C.ac}
            />
            {/* Kind toggle */}
            <div className="flex gap-0.5 rounded bg-agon-s2 p-0.5">
              {(["classique", "wod"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex cursor-pointer items-center gap-[5px] rounded-[6px] px-3 py-[5px] text-[11px] [transition:all_120ms]",
                    kind === k ? cn(KIND_TONE[k].stripe, "font-bold text-agon-ink") : "bg-transparent font-normal text-agon-tx3",
                  )}
                >
                  {k === "wod" ? <Zap size={11} /> : <ListChecks size={11} />}
                  {k === "wod" ? "WOD" : "Classique"}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Consignes du bloc (optionnel)…"
            rows={2}
            className={cn(FIELD, "mb-4 box-border w-full resize-y px-2 py-1.5 text-[12px] leading-[1.4]")}
          />

          {/* Content */}
          {kind === "wod" ? (
            <IntervalBuilder
              root={{ type: "group", id: "__bank_block__", role: "open", repeat: 1, children: steps } as EnergyGroup}
              onChange={(r: EnergyGroup) => setSteps(r.children as EnergyStep[])}
              sessionKind="specifique"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start gap-1.5">
                  <SpecificItemFields item={item} onChange={(patch) => updateItem(item.id, patch)} />
                  <button
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    className={GHOST_ICON}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setItems((prev) => [...prev, { id: genId(), name: "" }])}
                className="mt-1 flex cursor-pointer items-center gap-[5px] self-start rounded-[6px] border border-dashed border-agon-brd-l bg-transparent px-2.5 py-1.5 text-[11px] font-semibold text-agon-tx3"
              >
                <Plus size={11} /> Exercice / consigne
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-agon-brd px-5 py-3">
          <button
            onClick={onClose}
            className="cursor-pointer rounded border border-agon-brd-l bg-transparent px-3.5 py-2 text-[12px] text-agon-tx2"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(PRIMARY, "px-4 py-2 text-[12px] font-bold", isSaving ? "opacity-70" : "opacity-100")}
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Vue banque ───────────────────────────────────────────────────────────────

export default function SpecificBlockBankView() {
  const { user } = useAuth();
  const { data: blocks = [], isLoading } = useSpecificBlocks();
  const { data: sports = [] }    = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();
  const deleteBlock = useDeleteSpecificBlock();
  const createSport   = useCreateSport();
  const createQuality = useCreateQuality();

  const [sportFilter, setSportFilter]     = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [search, setSearch]               = useState("");
  const [editorOpen, setEditorOpen]       = useState(false);
  const [editing, setEditing]             = useState<SpecificBlockRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SpecificBlockRow | null>(null);

  const sportById   = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports]);
  const qualityById = useMemo(() => new Map(qualities.map((q) => [q.id, q])), [qualities]);

  const filtered = useMemo(() => {
    let list = blocks;
    if (sportFilter !== "all")   list = list.filter((b) => b.sport_id === sportFilter);
    if (qualityFilter !== "all") list = list.filter((b) => b.quality_id === qualityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [blocks, sportFilter, qualityFilter, search]);

  function openCreate() { setEditing(null); setEditorOpen(true); }
  function openEdit(b: SpecificBlockRow) { setEditing(b); setEditorOpen(true); }

  return (
    <div>
      {/* Filters row */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5 border-b border-agon-brd pb-4 pt-3.5">
        <TaxonomySelect
          placeholder="Tous les sports"
          options={sports}
          value={sportFilter === "all" ? null : sportFilter}
          onChange={(id) => setSportFilter(id ?? "all")}
          onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
          width={160}
          accent={SPORT_ACCENT}
        />
        <TaxonomySelect
          placeholder="Toutes les qualités"
          options={qualities}
          value={qualityFilter === "all" ? null : qualityFilter}
          onChange={(id) => setQualityFilter(id ?? "all")}
          onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
          width={170}
          accent={C.ac}
        />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className={cn(FIELD, "min-w-[140px] max-w-[260px] flex-1 px-2.5 py-[5px] text-[12px]")}
        />

        {!isLoading && (
          <span className="whitespace-nowrap text-[11px] text-agon-tx3">
            {filtered.length} bloc{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={openCreate}
          className={cn(PRIMARY, "ml-auto whitespace-nowrap px-3.5 py-[7px] text-[12px]")}
        >
          + Nouveau bloc
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-10 text-center text-[12px] text-agon-tx3">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-[60px] text-center text-agon-tx3">
          <div className="mb-3 text-[36px]"></div>
          <div className="mb-1.5 text-[15px] font-semibold text-agon-tx2">
            {blocks.length === 0 ? "Aucun bloc dans la banque" : "Aucun bloc pour ces filtres"}
          </div>
          <div className="mb-5 text-[13px]">
            {blocks.length === 0
              ? "Crée un bloc réutilisable (Classique ou WOD), ou enregistre-en un depuis le builder de séance."
              : "Ajuste les filtres Sport / Qualité."}
          </div>
          <button
            onClick={openCreate}
            className={cn(PRIMARY, "px-5 py-[9px] text-[13px]")}
          >
            + Nouveau bloc
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-4">
          {filtered.map((b) => {
            const isWod   = b.content.kind === "wod";
            const sport   = b.sport_id ? sportById.get(b.sport_id) : undefined;
            const quality = b.quality_id ? qualityById.get(b.quality_id) : undefined;
            const tone    = KIND_TONE[isWod ? "wod" : "classique"];
            const items   = b.content.items ?? [];
            const nSteps  = (b.content.steps ?? []).length;
            return (
              <div
                key={b.id}
                onClick={() => openEdit(b)}
                className={cn("cursor-pointer overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1 [transition:border-color_150ms]", tone.hover)}
              >
                <div className={cn("h-[3px] opacity-70", tone.stripe)} />
                <div className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-agon-tx">
                        {b.name}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className={cn(BADGE, "inline-flex items-center gap-[3px] font-extrabold", tone.badge)}>
                          {isWod ? <Zap size={8} /> : <ListChecks size={8} />}
                          {isWod ? "WOD" : "CLASSIQUE"}
                        </span>
                        {sport && (
                          // Couleur du sport = donnée : reste en style.
                          <span className={BADGE} style={{ background: (sport.color || SPORT_ACCENT) + "20", color: sport.color || SPORT_ACCENT }}>
                            {sport.name}
                          </span>
                        )}
                        {quality && (
                          <span className={cn(BADGE, "bg-agon-accent/[0.125] text-agon-accent")}>
                            {quality.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(b); }}
                      title="Supprimer"
                      className={cn(GHOST_ICON, "shrink-0")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="text-[10px] text-agon-tx3">
                    {isWod
                      ? `${nSteps} étape${nSteps > 1 ? "s" : ""}`
                      : `${items.length} exo${items.length > 1 ? "s" : ""}${items.length > 0 ? ` — ${items.slice(0, 3).map((i) => i.name).filter(Boolean).join(", ")}${items.length > 3 ? "…" : ""}` : ""}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <BlockEditorModal
          key={editing?.id ?? "new"}
          initial={editing}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[340px] rounded-[6px] border border-agon-brd bg-agon-s1 p-6">
            <div className="mb-2 text-[15px] font-bold text-agon-tx">Supprimer le bloc ?</div>
            <div className="mb-[18px] text-[12px] text-agon-tx3">
              « {confirmDelete.name} » sera retiré de la banque. Les séances qui l'ont déjà importé ne sont pas affectées.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="cursor-pointer rounded border border-agon-brd bg-transparent px-3.5 py-[7px] text-[13px] text-agon-tx2"
              >
                Annuler
              </button>
              <button
                onClick={() => { deleteBlock.mutate(confirmDelete.id); setConfirmDelete(null); }}
                className="cursor-pointer rounded bg-agon-erreur-vif px-3.5 py-[7px] text-[13px] font-semibold text-agon-ink"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
