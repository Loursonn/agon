/**
 * BlockBankDrawer — banque de blocs spécifiques (privée coach).
 * Navigation Sport → Qualité, recherche, sélection multiple, insertion dans le
 * builder Classique. Gestion : renommer / supprimer un bloc.
 */
import { useMemo, useState } from "react";
import { X, Trash2, Pencil, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/energy/treeUtils";
import { useAuth } from "@/hooks/useAuth";
import { useSpecificBlocks, useUpdateSpecificBlock, useDeleteSpecificBlock } from "@/features/shared/hooks/useSpecificBlocks";
import { useSpecificSports, usePhysicalQualities, useCreateSport, useCreateQuality } from "@/features/shared/hooks/useSpecificTaxonomy";
import TaxonomySelect from "./TaxonomySelect";
import type { EnergyStep } from "@/types/energy";
import type { SessionBlock, SpecificBlockRow } from "@/types/specific";

const BADGE = "rounded px-1.5 py-0.5 text-[9px]";
const ICON_BTN = "flex cursor-pointer bg-transparent p-0.5 text-agon-tx3";

/** Clone récursif d'EnergyStep[] avec nouveaux ids. */
function cloneSteps(steps: EnergyStep[]): EnergyStep[] {
  return steps.map((s): EnergyStep => {
    if (s.type === "group") {
      return {
        ...s,
        id: genId(),
        children: cloneSteps(s.children),
        rest_between: s.rest_between ? { ...s.rest_between, id: genId() } : undefined,
      };
    }
    return { ...s, id: genId() };
  });
}

interface Props {
  onInsert: (blocks: SessionBlock[]) => void;
  onClose: () => void;
}

export default function BlockBankDrawer({ onInsert, onClose }: Props) {
  const { user } = useAuth();
  const { data: blocks = [], isLoading } = useSpecificBlocks();
  const { data: sports = [] }    = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();
  const updateBlock = useUpdateSpecificBlock();
  const deleteBlock = useDeleteSpecificBlock();
  const createSport   = useCreateSport();
  const createQuality = useCreateQuality();

  const [sportFilter, setSportFilter]     = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [search, setSearch]               = useState("");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editName, setEditName]           = useState("");

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleInsert() {
    const chosen = blocks.filter((b) => selected.has(b.id));
    const asBlocks: SessionBlock[] = chosen.map((b) => {
      if (b.content.kind === "wod") {
        return {
          id: genId(),
          title: b.content.title || b.name,
          instructions: b.content.instructions,
          kind: "wod" as const,
          sourceBlockId: b.id,
          steps: cloneSteps(b.content.steps ?? []),
        };
      }
      return {
        id: genId(),
        title: b.content.title || b.name,
        instructions: b.content.instructions,
        sourceBlockId: b.id,
        items: (b.content.items ?? []).map((i) => ({ ...i, id: genId() })),
      };
    });
    onInsert(asBlocks);
    onClose();
  }

  function startEdit(b: SpecificBlockRow) {
    setEditingId(b.id);
    setEditName(b.name);
  }

  function commitEdit() {
    if (editingId && editName.trim()) {
      updateBlock.mutate({ id: editingId, name: editName.trim() });
    }
    setEditingId(null);
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-black/60" />
      <div className="fixed inset-y-0 right-0 z-[81] flex w-[min(480px,96vw)] flex-col border-l border-agon-brd-l bg-agon-bg">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-agon-brd px-5 pb-3 pt-4">
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-agon-tx">Banque de blocs spécifiques</div>
            <div className="mt-0.5 text-[11px] text-agon-tx3">Sélectionne un ou plusieurs blocs à insérer</div>
          </div>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded border border-agon-brd-l bg-transparent text-agon-tx3"
          >
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-agon-brd px-5 py-2.5">
          <TaxonomySelect
            placeholder="Tous les sports"
            options={sports}
            value={sportFilter === "all" ? null : sportFilter}
            onChange={(id) => setSportFilter(id ?? "all")}
            onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
            width={150}
            accent={C.o}
          />
          <TaxonomySelect
            placeholder="Toutes les qualités"
            options={qualities}
            value={qualityFilter === "all" ? null : qualityFilter}
            onChange={(id) => setQualityFilter(id ?? "all")}
            onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
            width={160}
            accent={C.ac}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="box-border h-[30px] min-w-[120px] flex-1 rounded border border-agon-brd bg-agon-s2 px-2.5 py-[5px] text-[12px] text-agon-tx outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="py-[30px] text-center text-[12px] text-agon-tx3">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-agon-tx3">
              <div className="mb-2.5 text-[28px]"></div>
              <div className="mb-1 text-[13px] font-semibold text-agon-tx2">
                {blocks.length === 0 ? "Banque vide" : "Aucun bloc pour ces filtres"}
              </div>
              <div className="text-[12px]">
                {blocks.length === 0
                  ? "Depuis le builder Classique, clique « Banque » sur un bloc pour l'enregistrer ici."
                  : "Ajuste les filtres Sport / Qualité."}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((b) => {
                const isSel   = selected.has(b.id);
                const sport   = b.sport_id ? sportById.get(b.sport_id) : undefined;
                const quality = b.quality_id ? qualityById.get(b.quality_id) : undefined;
                const isWod   = b.content.kind === "wod";
                const items   = b.content.items ?? [];
                const nSteps  = (b.content.steps ?? []).length;
                return (
                  <div
                    key={b.id}
                    onClick={() => toggle(b.id)}
                    className={cn(
                      "cursor-pointer rounded border px-3 py-2.5 [transition:all_150ms]",
                      isSel ? "border-agon-alerte bg-agon-alerte/[0.051]" : "border-agon-brd-l bg-agon-s1",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
                        isSel ? "border-agon-alerte bg-agon-alerte" : "border-agon-brd-l bg-transparent",
                      )}>
                        {isSel && <Check size={11} strokeWidth={3} className="text-agon-ink" />}
                      </span>

                      {editingId === b.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={commitEdit}
                          className="flex-1 rounded-[6px] border border-agon-alerte/[0.376] bg-agon-s2 px-2 py-[3px] text-[12px] font-bold text-agon-tx outline-none"
                        />
                      ) : (
                        <span className="flex-1 truncate text-[12px] font-bold text-agon-tx">
                          {b.name}
                        </span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(b); }}
                        title="Renommer"
                        className={ICON_BTN}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBlock.mutate(b.id); }}
                        title="Supprimer de la banque"
                        className={cn(ICON_BTN, "hover:text-agon-erreur")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
                      <span className={cn(BADGE, "font-extrabold", isWod ? "bg-agon-alerte/[0.125] text-agon-alerte" : "bg-agon-succes/[0.125] text-agon-succes")}>
                        {isWod ? "WOD" : "CLASSIQUE"}
                      </span>
                      {sport && (
                        <span
                          className={cn(BADGE, "font-bold")}
                          // Couleur du sport : donnée, reste en ligne.
                          style={{ background: (sport.color || C.o) + "20", color: sport.color || C.o }}
                        >
                          {sport.name}
                        </span>
                      )}
                      {quality && (
                        <span className={cn(BADGE, "bg-agon-accent/[0.125] font-bold text-agon-accent")}>
                          {quality.name}
                        </span>
                      )}
                      <span className="py-0.5 text-[9px] text-agon-tx3">
                        {isWod
                          ? `${nSteps} étape${nSteps > 1 ? "s" : ""}`
                          : `${items.length} exo${items.length > 1 ? "s" : ""}${items.length > 0 ? ` — ${items.slice(0, 3).map((i) => i.name).filter(Boolean).join(", ")}${items.length > 3 ? "…" : ""}` : ""}`}
                      </span>
                    </div>
                  </div>
                );
              })}
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
            onClick={handleInsert}
            disabled={selected.size === 0}
            className={cn(
              "rounded px-4 py-2 text-[12px] font-bold",
              selected.size > 0 ? "cursor-pointer bg-agon-alerte text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
            )}
          >
            Insérer {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </>
  );
}
