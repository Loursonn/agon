/**
 * ClassiqueBuilder — builder de séance spécifique par blocs.
 * Chaque bloc est de type Classique (exercices/consignes + prescription libre)
 * ou WOD (intervalles via le builder existant). Mix possible dans une séance.
 * Réorganisation dnd-kit, import depuis la banque de blocs, enregistrement en banque.
 */
import { useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Save, Plus, Zap, ListChecks } from "lucide-react";
import { C } from "@/lib/theme";
import { genId } from "@/lib/energy/treeUtils";
import IntervalBuilder from "../energy/IntervalBuilder";
import SpecificItemFields from "./SpecificItemFields";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, ClassiqueItem, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";

const ORANGE = "#F5A623";
const GREEN  = "#66F03C";

// ── Item row (sortable, bloc classique) ──────────────────────────────────────

function ItemRow({ blockId, item, onChange, onDelete }: {
  blockId: string;
  item: ClassiqueItem;
  onChange: (patch: Partial<ClassiqueItem>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${blockId}::${item.id}` });

  return (
    <div
      ref={setNodeRef}
      data-step-id={item.id}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.5 : 1,
        display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap",
      }}
    >
      <button
        {...attributes}
        {...listeners}
        style={{ background: "none", border: "none", color: C.tx3, cursor: "grab", padding: 2, display: "flex" }}
      >
        <GripVertical size={13} />
      </button>
      <SpecificItemFields item={item} onChange={onChange} />
      <button
        onClick={onDelete}
        style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.r)}
        onMouseLeave={(e) => (e.currentTarget.style.color = C.tx3)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Block card (sortable, classique OU wod) ──────────────────────────────────

function BlockCard({ block, onChange, onDelete, onSaveToBank }: {
  block: SessionBlock;
  onChange: (patch: Partial<SessionBlock>) => void;
  onDelete: () => void;
  onSaveToBank?: (block: SessionBlock) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const wod = isWodBlock(block);
  const accent = wod ? ORANGE : GREEN;

  function handleItemDragEnd(e: DragEndEvent) {
    if (wod) return;
    const cb = block as ClassiqueBlock;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = cb.items.map((i) => `${block.id}::${i.id}`);
    const from = ids.indexOf(String(active.id));
    const to   = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange({ items: arrayMove(cb.items, from, to) } as Partial<SessionBlock>);
  }

  function updateItem(itemId: string, patch: Partial<ClassiqueItem>) {
    const cb = block as ClassiqueBlock;
    onChange({ items: cb.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } as Partial<SessionBlock>);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.6 : 1,
        background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6,
        borderLeft: `3px solid ${accent}80`,
        padding: "12px 14px",
      }}
    >
      {/* Block header */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button
          {...attributes}
          {...listeners}
          style={{ background: "none", border: "none", color: C.tx3, cursor: "grab", padding: 2, display: "flex" }}
        >
          <GripVertical size={15} />
        </button>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
          background: accent + "20", color: accent, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {wod ? <Zap size={9} /> : <ListChecks size={9} />}
          {wod ? "WOD" : "CLASSIQUE"}
        </span>
        <input
          value={block.title}
          onChange={(e) => onChange({ title: e.target.value } as Partial<SessionBlock>)}
          placeholder="Titre du bloc…"
          style={{
            flex: 1, background: "transparent", border: "none",
            borderBottom: `1px solid ${C.brdL}`,
            color: C.tx, fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", outline: "none", padding: "2px 0",
          }}
        />
        {onSaveToBank && (
          <button
            onClick={() => onSaveToBank(block)}
            title="Enregistrer ce bloc dans la banque"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 9px", borderRadius: 6,
              border: `1px solid ${accent}40`, background: accent + "12",
              color: accent, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Save size={11} /> Banque
          </button>
        )}
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", padding: 2, display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.r)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.tx3)}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <textarea
        value={block.instructions ?? ""}
        onChange={(e) => onChange({ instructions: e.target.value || undefined } as Partial<SessionBlock>)}
        placeholder="Consignes du bloc (optionnel)…"
        rows={2}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4,
          color: C.tx, fontSize: 12, lineHeight: 1.4, padding: "6px 8px",
          fontFamily: "inherit", outline: "none", marginBottom: 10,
        }}
      />

      {/* Body */}
      {wod ? (
        <IntervalBuilder
          root={{
            type: "group", id: `__block_${block.id}__`, role: "open", repeat: 1,
            children: (block as WodBlock).steps,
          } as EnergyGroup}
          onChange={(r: EnergyGroup) => onChange({ steps: r.children as EnergyStep[] } as Partial<SessionBlock>)}
          sessionKind="specifique"
        />
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
            <SortableContext
              items={(block as ClassiqueBlock).items.map((i) => `${block.id}::${i.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(block as ClassiqueBlock).items.map((item) => (
                  <ItemRow
                    key={item.id}
                    blockId={block.id}
                    item={item}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onDelete={() => onChange({ items: (block as ClassiqueBlock).items.filter((i) => i.id !== item.id) } as Partial<SessionBlock>)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            onClick={() => onChange({ items: [...(block as ClassiqueBlock).items, { id: genId(), name: "" }] } as Partial<SessionBlock>)}
            style={{
              marginTop: 8, display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 6,
              border: `1px dashed ${C.brdL}`, background: "transparent",
              color: C.tx3, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={11} /> Exercice / consigne
          </button>
        </>
      )}
    </div>
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────

interface Props {
  blocks: SessionBlock[];
  onChange: (blocks: SessionBlock[]) => void;
  onImportFromBank: () => void;
  onSaveBlockToBank?: (block: SessionBlock) => void;
}

export default function ClassiqueBuilder({ blocks, onChange, onImportFromBank, onSaveBlockToBank }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [, setVersion] = useState(0);

  function handleBlockDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to   = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(blocks, from, to));
    setVersion((v) => v + 1);
  }

  function updateBlock(id: string, patch: Partial<SessionBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } as SessionBlock : b)));
  }

  const addBtnStyle = (color: string): React.CSSProperties => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "12px 0", borderRadius: 4,
    border: `1px dashed ${color}50`, background: color + "08",
    color, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", transition: "all 150ms",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onChange={(patch) => updateBlock(block.id, patch)}
              onDelete={() => onChange(blocks.filter((b) => b.id !== block.id))}
              onSaveToBank={onSaveBlockToBank}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onChange([...blocks, { id: genId(), title: "", items: [{ id: genId(), name: "" }] }])}
          style={addBtnStyle(GREEN)}
        >
          <ListChecks size={14} /> + Bloc classique
        </button>
        <button
          onClick={() => onChange([...blocks, { id: genId(), title: "", kind: "wod", steps: [] } as WodBlock])}
          style={addBtnStyle(ORANGE)}
        >
          <Zap size={14} /> + Bloc WOD
        </button>
        <button
          onClick={onImportFromBank}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "12px 0", borderRadius: 4,
            border: `1px solid ${C.brdL}`, background: "transparent",
            color: C.tx2, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", transition: "all 150ms",
            minWidth: 220,
          }}
        >
          Importer depuis la banque de blocs
        </button>
      </div>
    </div>
  );
}
