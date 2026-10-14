/**
 * BlockBankDrawer — banque de blocs spécifiques (privée coach).
 * Navigation Sport → Qualité, recherche, sélection multiple, insertion dans le
 * builder Classique. Gestion : renommer / supprimer un bloc.
 */
import { useMemo, useState } from "react";
import { X, Trash2, Pencil, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { genId } from "@/lib/energy/treeUtils";
import { useAuth } from "@/hooks/useAuth";
import { useSpecificBlocks, useUpdateSpecificBlock, useDeleteSpecificBlock } from "@/features/shared/hooks/useSpecificBlocks";
import { useSpecificSports, usePhysicalQualities, useCreateSport, useCreateQuality } from "@/features/shared/hooks/useSpecificTaxonomy";
import TaxonomySelect from "./TaxonomySelect";
import type { EnergyStep } from "@/types/energy";
import type { SessionBlock, SpecificBlockRow } from "@/types/specific";

const ORANGE = "#F5A623";
const GREEN  = "#66F03C";

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
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 81,
        width: "min(480px, 96vw)",
        background: C.bg, borderLeft: `1px solid ${C.brdL}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Banque de blocs spécifiques</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>Sélectionne un ou plusieurs blocs à insérer</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.brd}`, display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <TaxonomySelect
            placeholder="Tous les sports"
            options={sports}
            value={sportFilter === "all" ? null : sportFilter}
            onChange={(id) => setSportFilter(id ?? "all")}
            onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
            width={150}
            accent={ORANGE}
          />
          <TaxonomySelect
            placeholder="Toutes les qualités"
            options={qualities}
            value={qualityFilter === "all" ? null : qualityFilter}
            onChange={(id) => setQualityFilter(id ?? "all")}
            onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
            width={160}
            accent="#FFC933"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              flex: 1, minWidth: 120, background: C.s2, border: `1px solid ${C.brd}`,
              borderRadius: 4, color: C.tx, fontSize: 12, padding: "5px 10px",
              fontFamily: "inherit", outline: "none", height: 30, boxSizing: "border-box",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 12px", color: C.tx3 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.tx2, marginBottom: 4 }}>
                {blocks.length === 0 ? "Banque vide" : "Aucun bloc pour ces filtres"}
              </div>
              <div style={{ fontSize: 12 }}>
                {blocks.length === 0
                  ? "Depuis le builder Classique, clique « Banque » sur un bloc pour l'enregistrer ici."
                  : "Ajuste les filtres Sport / Qualité."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                    style={{
                      border: `1px solid ${isSel ? ORANGE : C.brdL}`,
                      background: isSel ? ORANGE + "0D" : C.s1,
                      borderRadius: 4, padding: "10px 12px",
                      cursor: "pointer", transition: "all 150ms",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                        border: `1.5px solid ${isSel ? ORANGE : C.brdL}`,
                        background: isSel ? ORANGE : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isSel && <Check size={11} color="#1a1204" strokeWidth={3} />}
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
                          style={{
                            flex: 1, background: C.s2, border: `1px solid ${ORANGE}60`,
                            borderRadius: 6, color: C.tx, fontSize: 12, fontWeight: 700,
                            padding: "3px 8px", fontFamily: "inherit", outline: "none",
                          }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.name}
                        </span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(b); }}
                        title="Renommer"
                        style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex" }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBlock.mutate(b.id); }}
                        title="Supprimer de la banque"
                        style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = C.r)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = C.tx3)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6, marginLeft: 24 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                        background: (isWod ? ORANGE : GREEN) + "20", color: isWod ? ORANGE : GREEN,
                      }}>
                        {isWod ? "WOD" : "CLASSIQUE"}
                      </span>
                      {sport && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: (sport.color || ORANGE) + "20", color: sport.color || ORANGE }}>
                          {sport.name}
                        </span>
                      )}
                      {quality && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FFC93320", color: "#FFC933" }}>
                          {quality.name}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: C.tx3, padding: "2px 0" }}>
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
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.brd}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={handleInsert}
            disabled={selected.size === 0}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none",
              background: selected.size > 0 ? ORANGE : C.s2,
              color: selected.size > 0 ? "#1a1204" : C.tx3,
              fontSize: 12, fontWeight: 700, cursor: selected.size > 0 ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            Insérer {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </>
  );
}
