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
import { cn } from "@/lib/utils";
import { genId } from "@/lib/energy/treeUtils";
import IntervalBuilder from "../energy/IntervalBuilder";
import SpecificItemFields from "./SpecificItemFields";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, ClassiqueItem, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";

type BlockTone = { borderL: string; badge: string; save: string; add: string };
/** Teinte par type de bloc : WOD (miel hérité → alerte) ou classique (succès). Classes écrites en entier. */
const TONE = {
  wod: {
    borderL: "border-l-agon-alerte/[0.502]", badge: "bg-agon-alerte/[0.125] text-agon-alerte",
    save: "border-agon-alerte/25 bg-agon-alerte/[0.071] text-agon-alerte",
    add: "border-agon-alerte/[0.314] bg-agon-alerte/[0.031] text-agon-alerte",
  },
  classique: {
    borderL: "border-l-agon-succes/[0.502]", badge: "bg-agon-succes/[0.125] text-agon-succes",
    save: "border-agon-succes/25 bg-agon-succes/[0.071] text-agon-succes",
    add: "border-agon-succes/[0.314] bg-agon-succes/[0.031] text-agon-succes",
  },
} satisfies Record<string, BlockTone>;

const GRIP = "flex cursor-grab bg-transparent p-0.5 text-agon-tx3";
const DELETE = "flex cursor-pointer bg-transparent p-0.5 text-agon-tx3 hover:text-agon-erreur";
const ADD_BTN = "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border py-3 text-[13px] font-semibold [transition:all_150ms]";

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
      className={cn("flex flex-wrap items-start gap-1.5", isDragging ? "opacity-50" : "opacity-100")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        {...attributes}
        {...listeners}
        className={GRIP}
      >
        <GripVertical size={13} />
      </button>
      <SpecificItemFields item={item} onChange={onChange} />
      <button
        onClick={onDelete}
        className={DELETE}
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
  const tone = wod ? TONE.wod : TONE.classique;

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
      className={cn(
        "rounded-[6px] border border-l-[3px] border-agon-brd bg-agon-s1 px-3.5 py-3",
        tone.borderL,
        isDragging ? "opacity-60" : "opacity-100",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Block header */}
      <div className="mb-2.5 flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className={GRIP}
        >
          <GripVertical size={15} />
        </button>
        <span className={cn("flex shrink-0 items-center gap-1 rounded px-[7px] py-0.5 text-[9px] font-extrabold", tone.badge)}>
          {wod ? <Zap size={9} /> : <ListChecks size={9} />}
          {wod ? "WOD" : "CLASSIQUE"}
        </span>
        <input
          value={block.title}
          onChange={(e) => onChange({ title: e.target.value } as Partial<SessionBlock>)}
          placeholder="Titre du bloc…"
          className="flex-1 border-b border-agon-brd-l bg-transparent py-0.5 text-[13px] font-bold text-agon-tx outline-none"
        />
        {onSaveToBank && (
          <button
            onClick={() => onSaveToBank(block)}
            title="Enregistrer ce bloc dans la banque"
            className={cn("flex cursor-pointer items-center gap-[5px] rounded-[6px] border px-[9px] py-1 text-[10px] font-semibold", tone.save)}
          >
            <Save size={11} /> Banque
          </button>
        )}
        <button
          onClick={onDelete}
          className={DELETE}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <textarea
        value={block.instructions ?? ""}
        onChange={(e) => onChange({ instructions: e.target.value || undefined } as Partial<SessionBlock>)}
        placeholder="Consignes du bloc (optionnel)…"
        rows={2}
        className="mb-2.5 box-border w-full resize-y rounded border border-agon-brd bg-agon-s2 px-2 py-1.5 text-[12px] leading-[1.4] text-agon-tx outline-none"
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
              <div className="flex flex-col gap-1.5">
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
            className="mt-2 flex cursor-pointer items-center gap-[5px] rounded-[6px] border border-dashed border-agon-brd-l bg-transparent px-2.5 py-[5px] text-[11px] font-semibold text-agon-tx3"
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

  

  return (
    <div className="flex flex-col gap-3">
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

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChange([...blocks, { id: genId(), title: "", items: [{ id: genId(), name: "" }] }])}
          className={cn(ADD_BTN, "border-dashed", TONE.classique.add)}
        >
          <ListChecks size={14} /> + Bloc classique
        </button>
        <button
          onClick={() => onChange([...blocks, { id: genId(), title: "", kind: "wod", steps: [] } as WodBlock])}
          className={cn(ADD_BTN, "border-dashed", TONE.wod.add)}
        >
          <Zap size={14} /> + Bloc WOD
        </button>
        <button
          onClick={onImportFromBank}
          className={cn(ADD_BTN, "min-w-[220px] border-agon-brd-l bg-transparent text-agon-tx2")}
        >
          Importer depuis la banque de blocs
        </button>
      </div>
    </div>
  );
}
