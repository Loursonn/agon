/**
 * SpecificBlockBankView — gestion de la banque de blocs spécifiques
 * (sous-onglet Blocs de Banque → Spécifique). Création, édition, suppression.
 * Un bloc est de type Classique (exercices/consignes) ou WOD (intervalles).
 */
import { useMemo, useState } from "react";
import { X, Trash2, Zap, ListChecks, Plus } from "lucide-react";
import { C } from "@/lib/theme";
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

const ORANGE = "#F5A623";
const GREEN  = "#66F03C";

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

  const inputStyle: React.CSSProperties = {
    background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 6,
    color: C.tx, fontSize: 12, padding: "6px 8px",
    fontFamily: "inherit", outline: "none", minWidth: 0,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 91,
        transform: "translate(-50%, -50%)",
        background: C.bg, borderRadius: 6,
        width: "min(96vw, 760px)", maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        border: `1px solid ${C.brdL}`,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.tx }}>
            {initial ? "Modifier le bloc" : "Nouveau bloc"}
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {/* Meta row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du bloc…"
              style={{ ...inputStyle, flex: 1, minWidth: 180, fontSize: 13, fontWeight: 700, padding: "8px 10px" }}
            />
            <TaxonomySelect
              placeholder="Sport"
              options={sports}
              value={sportId}
              onChange={setSportId}
              onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
              width={140}
              accent={ORANGE}
            />
            <TaxonomySelect
              placeholder="Qualité"
              options={qualities}
              value={qualityId}
              onChange={setQualityId}
              onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
              width={150}
              accent="#FFC933"
            />
            {/* Kind toggle */}
            <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 2 }}>
              {(["classique", "wod"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "none",
                    display: "flex", alignItems: "center", gap: 5,
                    background: kind === k ? (k === "wod" ? ORANGE : GREEN) : "transparent",
                    color: kind === k ? "#1a1204" : C.tx3,
                    fontSize: 11, fontWeight: kind === k ? 700 : 400,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
                  }}
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
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.4, marginBottom: 16 }}
          />

          {/* Content */}
          {kind === "wod" ? (
            <IntervalBuilder
              root={{ type: "group", id: "__bank_block__", role: "open", repeat: 1, children: steps } as EnergyGroup}
              onChange={(r: EnergyGroup) => setSteps(r.children as EnergyStep[])}
              sessionKind="specifique"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <SpecificItemFields item={item} onChange={(patch) => updateItem(item.id, patch)} />
                  <button
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.r)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.tx3)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setItems((prev) => [...prev, { id: genId(), name: "" }])}
                style={{
                  marginTop: 4, display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 10px", borderRadius: 6,
                  border: `1px dashed ${C.brdL}`, background: "transparent",
                  color: C.tx3, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start",
                }}
              >
                <Plus size={11} /> Exercice / consigne
              </button>
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
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none",
              background: ORANGE, color: "#1a1204", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: isSaving ? 0.7 : 1,
            }}
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
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        padding: "14px 0 16px", borderBottom: `1px solid ${C.brd}`, marginBottom: 20,
      }}>
        <TaxonomySelect
          placeholder="Tous les sports"
          options={sports}
          value={sportFilter === "all" ? null : sportFilter}
          onChange={(id) => setSportFilter(id ?? "all")}
          onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
          width={160}
          accent={ORANGE}
        />
        <TaxonomySelect
          placeholder="Toutes les qualités"
          options={qualities}
          value={qualityFilter === "all" ? null : qualityFilter}
          onChange={(id) => setQualityFilter(id ?? "all")}
          onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
          width={170}
          accent="#FFC933"
        />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{
            flex: 1, minWidth: 140, maxWidth: 260,
            background: C.s2, border: `1px solid ${C.brd}`,
            borderRadius: 6, color: C.tx, fontSize: 12,
            padding: "5px 10px", fontFamily: "inherit", outline: "none",
          }}
        />

        {!isLoading && (
          <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>
            {filtered.length} bloc{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={openCreate}
          style={{
            marginLeft: "auto", padding: "7px 14px", borderRadius: 4, border: "none",
            background: ORANGE, color: "#1a1204", fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          + Nouveau bloc
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.tx3 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}></div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.tx2, marginBottom: 6 }}>
            {blocks.length === 0 ? "Aucun bloc dans la banque" : "Aucun bloc pour ces filtres"}
          </div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>
            {blocks.length === 0
              ? "Crée un bloc réutilisable (Classique ou WOD), ou enregistre-en un depuis le builder de séance."
              : "Ajuste les filtres Sport / Qualité."}
          </div>
          <button
            onClick={openCreate}
            style={{
              padding: "9px 20px", borderRadius: 4, border: "none",
              background: ORANGE, color: "#1a1204", fontSize: 13,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + Nouveau bloc
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
          {filtered.map((b) => {
            const isWod   = b.content.kind === "wod";
            const sport   = b.sport_id ? sportById.get(b.sport_id) : undefined;
            const quality = b.quality_id ? qualityById.get(b.quality_id) : undefined;
            const accent  = isWod ? ORANGE : GREEN;
            const items   = b.content.items ?? [];
            const nSteps  = (b.content.steps ?? []).length;
            return (
              <div
                key={b.id}
                onClick={() => openEdit(b)}
                style={{
                  background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6,
                  overflow: "hidden", cursor: "pointer",
                  transition: "border-color 150ms",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = accent + "60")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.brd)}
              >
                <div style={{ height: 3, background: accent, opacity: 0.7 }} />
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                        {b.name}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                          background: accent + "20", color: accent,
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}>
                          {isWod ? <Zap size={8} /> : <ListChecks size={8} />}
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
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(b); }}
                      title="Supprimer"
                      style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.r)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.tx3)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ fontSize: 10, color: C.tx3 }}>
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
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.s1, borderRadius: 6, padding: 24, width: 340, border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Supprimer le bloc ?</div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 18 }}>
              « {confirmDelete.name} » sera retiré de la banque. Les séances qui l'ont déjà importé ne sont pas affectées.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Annuler
              </button>
              <button
                onClick={() => { deleteBlock.mutate(confirmDelete.id); setConfirmDelete(null); }}
                style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
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
