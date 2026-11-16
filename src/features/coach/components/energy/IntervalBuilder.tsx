/**
 * IntervalBuilder — liste drag-and-droppable des intervalles/groupes.
 *
 * - Drag & drop au sein du même parent (@dnd-kit/sortable)
 * - Chaque groupe a son propre SortableContext
 * - DndContext unique au niveau du builder
 */
import { useState, useCallback } from "react";
import { Settings } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EnergyGroup, EnergyInterval, ExerciseInterval, EnergyStep, SessionKind } from "@/types/energy";
import {
  makeInterval, makeGroup, makeExerciseInterval, updateStep, deleteStep, duplicateStep,
  reorderChildren, findParent, addStepToGroup,
} from "@/lib/energy/treeUtils";
import { formatTarget } from "@/lib/energy/formatTarget";
import { formatS, formatExerciseStep } from "@/lib/energy/formatTarget";
import { estimateIntervalDuration, targetToIntensityPct, intensityToColor } from "@/lib/energy";
import IntervalEditor from "./IntervalEditor";
import ExerciseStepEditor from "./ExerciseStepEditor";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";

// ── Role colors ───────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  warmup:   C.o,
  work:     C.ac,
  recovery: C.g,
  rest:     C.b,
  cooldown: C.b,
  open:     C.tx3,
};

type RoleTone = { row: string; borderL: string; badge: string; repeat: string };
/** Teinte des en-têtes de groupe par rôle (mêmes couleurs que ROLE_COLOR, classes écrites en entier). */
const TONES = {
  alerte: { row: "bg-agon-alerte/[0.071]", borderL: "border-l-agon-alerte", badge: "bg-agon-alerte/[0.133] text-agon-alerte", repeat: "border-agon-alerte/25 bg-agon-alerte/[0.125] text-agon-alerte" },
  accent: { row: "bg-agon-accent/[0.071]", borderL: "border-l-agon-accent", badge: "bg-agon-accent/[0.133] text-agon-accent", repeat: "border-agon-accent/25 bg-agon-accent/[0.125] text-agon-accent" },
  succes: { row: "bg-agon-succes/[0.071]", borderL: "border-l-agon-succes", badge: "bg-agon-succes/[0.133] text-agon-succes", repeat: "border-agon-succes/25 bg-agon-succes/[0.125] text-agon-succes" },
  info:   { row: "bg-agon-info/[0.071]",   borderL: "border-l-agon-info",   badge: "bg-agon-info/[0.133] text-agon-info",     repeat: "border-agon-info/25 bg-agon-info/[0.125] text-agon-info" },
  tx3:    { row: "bg-agon-tx3/[0.071]",    borderL: "border-l-agon-tx3",    badge: "bg-agon-tx3/[0.133] text-agon-tx3",       repeat: "border-agon-tx3/25 bg-agon-tx3/[0.125] text-agon-tx3" },
} satisfies Record<string, RoleTone>;
const ROLE_TONE: Record<string, RoleTone> = {
  warmup: TONES.alerte, work: TONES.accent, recovery: TONES.succes, rest: TONES.info, cooldown: TONES.info, open: TONES.tx3,
};

const ROW = "mb-0.5 flex items-center gap-2 rounded border-l-[3px] pr-2";
const HANDLE = "shrink-0 cursor-grab text-[14px] text-agon-tx3";
const BADGE = "shrink-0 rounded px-[5px] py-0.5 text-[9px]";
const SMALL_INPUT = "rounded border border-agon-brd bg-agon-s2 px-1.5 py-0.5 text-agon-tx";
const ACCENT_BTN = "cursor-pointer rounded border border-agon-accent/[0.314] bg-agon-accent/[0.071] px-3.5 py-[7px] text-[12px] font-semibold text-agon-accent";

const ROLE_LABEL: Record<string, string> = {
  warmup: "Écha.", work: "Effort", recovery: "Récup.", rest: "Repos", cooldown: "Retour", open: "Libre",
};

const EQUIPMENT_LABEL: Record<string, string> = {
  rameur: "Rameur", skierg: "SkiErg", bikeerg: "BikeErg", velo: "Vélo",
  course: "Course", elliptique: "Elliptique", corde: "Corde", autre: "Autre",
};

// ── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableItem({ id, children }: { id: string; children: (listeners: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-step-id={id}
      className={isDragging ? "z-[999] opacity-40" : "opacity-100"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      {children(listeners as Record<string, unknown>)}
    </div>
  );
}

// ── Interval row ──────────────────────────────────────────────────────────────

function IntervalRow({
  interval, depth, listeners,
  onEdit, onDuplicate, onDelete,
}: {
  interval: EnergyInterval;
  depth: number;
  listeners: Record<string, unknown>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const pct = targetToIntensityPct(interval.target);
  const color = pct !== null ? intensityToColor(pct) : ROLE_COLOR[interval.role] ?? C.tx3;
  const dur = estimateIntervalDuration(interval);
  const targetStr = formatTarget(interval.target);

  return (
    <div
      className={cn(ROW, "py-1.5", depth > 0 ? "bg-white/[0.02]" : "bg-transparent")}
      // Retrait (profondeur) et teinte d'intensité : valeurs calculées.
      style={{ paddingLeft: 12 + depth * 20, borderLeftColor: color }}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        className={cn(HANDLE, "pr-0.5")}
      >
        ⋮⋮
      </div>

      {/* Role badge */}
      <span className={cn(BADGE, "font-bold")} style={{ background: color + "22", color }}>
        {ROLE_LABEL[interval.role] ?? interval.role}
      </span>

      {/* Equipment badge */}
      {interval.equipment && (
        <span className={cn(BADGE, "bg-agon-info/[0.133] font-semibold text-agon-info")}>
          {EQUIPMENT_LABEL[interval.equipment] ?? interval.equipment}
        </span>
      )}

      {/* Summary */}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-[1.4] text-agon-tx [overflow-wrap:anywhere]">
          {interval.duration.kind === "distance"
            ? `${interval.duration.value ?? 0}m`
            : interval.duration.kind === "calories"
            ? `${interval.duration.value ?? 0} kcal`
            : interval.duration.kind === "lap_button"
            ? "Lap"
            : dur > 0 ? formatS(dur) : "?"
          }{targetStr && targetStr !== "Libre" ? ` @ ${targetStr}` : ""}
        </div>
        {interval.notes && (
          <div className="whitespace-pre-wrap text-[10px] leading-[1.4] text-agon-tx3 [overflow-wrap:anywhere]">
            {interval.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        <ActionBtn onClick={onEdit} title="Modifier les paramètres"><Settings size={12} className="block" /></ActionBtn>
        <ActionBtn onClick={onDuplicate} title="Dupliquer">⧉</ActionBtn>
        <ActionBtn onClick={onDelete} title="Supprimer" danger>✕</ActionBtn>
      </div>
    </div>
  );
}

// ── Exercise row ─────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise, depth, listeners,
  onEdit, onDuplicate, onDelete,
}: {
  exercise: ExerciseInterval;
  depth: number;
  listeners: Record<string, unknown>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const summary = formatExerciseStep(exercise);

  return (
    <div
      className={cn(ROW, "border-l-agon-accent py-1.5", depth > 0 ? "bg-white/[0.02]" : "bg-transparent")}
      // Retrait selon la profondeur (valeur calculée).
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <div {...listeners} className={cn(HANDLE, "pr-0.5")}>⋮⋮</div>

      <span className={cn(BADGE, "bg-agon-accent/[0.133] font-bold text-agon-accent")}>
        EXERCICE
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold leading-[1.4] text-agon-tx [overflow-wrap:anywhere]">
          {exercise.exercise_name}
        </div>
        {summary && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-agon-tx3">
            {summary}
          </div>
        )}
        {exercise.notes && (
          <div className="whitespace-pre-wrap text-[10px] leading-[1.4] text-agon-tx3 [overflow-wrap:anywhere]">
            {exercise.notes}
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        <ActionBtn onClick={onEdit} title="Modifier les paramètres"><Settings size={12} className="block" /></ActionBtn>
        <ActionBtn onClick={onDuplicate} title="Dupliquer">⧉</ActionBtn>
        <ActionBtn onClick={onDelete} title="Supprimer" danger>✕</ActionBtn>
      </div>
    </div>
  );
}

// ── Group row header ──────────────────────────────────────────────────────────

function toMMSS(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function parseMMSS(raw: string): number {
  const parts = raw.split(":");
  if (parts.length === 3) return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseInt(parts[2], 10) || 0);
  if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  return parseInt(raw, 10) || 0;
}

function GroupRowHeader({
  group, depth, listeners,
  onEditRepeat, onDuplicate, onDelete, onAddInterval, onAddGroup,
  isSpecifique, onAddExercise, onEditDeparture, onEditInstructions,
}: {
  group: EnergyGroup;
  depth: number;
  listeners: Record<string, unknown>;
  onEditRepeat: (repeat: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddInterval: () => void;
  onAddGroup: () => void;
  isSpecifique?: boolean;
  onAddExercise?: () => void;
  onEditDeparture?: (seconds: number | undefined) => void;
  onEditInstructions?: (text: string | undefined) => void;
}) {
  const [editingRepeat, setEditingRepeat] = useState(false);
  const [showInstructions, setShowInstructions] = useState(!!group.instructions);
  const [instructionsVal, setInstructionsVal] = useState(group.instructions ?? "");
  const [repeatVal, setRepeatVal] = useState(group.repeat);
  const [editingDeparture, setEditingDeparture] = useState(false);
  const [departureVal, setDepartureVal] = useState(group.departure_every_s ? toMMSS(group.departure_every_s) : "1:00");
  const tone = ROLE_TONE[group.role] ?? TONES.tx3;

  return (
    <>
    <div
      className={cn(ROW, "py-[5px]", tone.row, tone.borderL)}
      // Retrait selon la profondeur (valeur calculée).
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <div {...listeners} className={HANDLE}>⋮⋮</div>

      <span className={cn(BADGE, "font-bold", tone.badge)}>
        GROUPE
      </span>

      {/* Repeat editor inline */}
      {editingRepeat ? (
        <input
          autoFocus
          type="number"
          min={1} max={99}
          value={repeatVal}
          onChange={(e) => setRepeatVal(Number(e.target.value))}
          // Champ vidé ou hors bornes : on garde le nombre de répétitions d'avant (jamais 0).
          onBlur={() => { onEditRepeat(validRepeat(repeatVal, group.repeat)); setEditingRepeat(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={cn(SMALL_INPUT, "w-[50px] text-[12px]")}
        />
      ) : (
        <button
          onClick={() => { setRepeatVal(group.repeat); setEditingRepeat(true); }}
          className={cn("cursor-pointer rounded-[6px] border px-2 py-0.5 text-[11px] font-bold", tone.repeat)}
        >
          × {group.repeat}
        </button>
      )}

      {/* Departure interval (départ fixe type EMOM) */}
      {onEditDeparture && (
        group.departure_every_s ? (
          editingDeparture ? (
            <input
              autoFocus
              type="text"
              value={departureVal}
              onChange={(e) => setDepartureVal(e.target.value)}
              onBlur={() => { onEditDeparture(parseMMSS(departureVal) || undefined); setEditingDeparture(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { onEditDeparture(parseMMSS(departureVal) || undefined); setEditingDeparture(false); }
                if (e.key === "Escape") { onEditDeparture(undefined); setEditingDeparture(false); }
              }}
              placeholder="mm:ss"
              className={cn(SMALL_INPUT, "w-[55px] text-[11px]")}
            />
          ) : (
            <button
              onClick={() => { setDepartureVal(toMMSS(group.departure_every_s!)); setEditingDeparture(true); }}
              className="cursor-pointer rounded-[6px] border border-agon-alerte/25 bg-agon-alerte/[0.125] px-2 py-0.5 text-[10px] font-semibold text-agon-alerte"
              title="Départ fixe — cliquer pour modifier, Échap pour supprimer"
            >
              /{toMMSS(group.departure_every_s)}
            </button>
          )
        ) : (
          <button
            onClick={() => { setDepartureVal("1:00"); onEditDeparture(60); setEditingDeparture(true); }}
            className="cursor-pointer rounded-[6px] border border-dashed border-agon-brd bg-transparent px-2 py-0.5 text-[10px] text-agon-tx3"
            title="Ajouter départ fixe (toutes les X min)"
          >
            + Départ fixe
          </button>
        )
      )}

      <div className="flex-1" />

      {/* Add children */}
      <ActionBtn onClick={onAddInterval} title="+ Intervalle">＋I</ActionBtn>
      {isSpecifique && onAddExercise && <ActionBtn onClick={onAddExercise} title="+ Exercice">＋E</ActionBtn>}
      <ActionBtn onClick={onAddGroup} title="+ Sous-groupe">＋G</ActionBtn>
      {onEditInstructions && (
        <ActionBtn onClick={() => setShowInstructions((v) => !v)} title="Consignes du groupe">✎</ActionBtn>
      )}
      <ActionBtn onClick={onDuplicate} title="Dupliquer">⧉</ActionBtn>
      <ActionBtn onClick={onDelete} title="Supprimer" danger>✕</ActionBtn>
    </div>
    {onEditInstructions && showInstructions && (
      <div className="mb-1 pr-2" style={{ paddingLeft: 15 + depth * 20 }}>
        <textarea
          autoFocus={!group.instructions}
          value={instructionsVal}
          onChange={(e) => setInstructionsVal(e.target.value)}
          onBlur={() => onEditInstructions(instructionsVal.trim() || undefined)}
          placeholder="Consignes du groupe (ex. allure régulière, récup active…)"
          rows={2}
          className="box-border w-full resize-y rounded border border-agon-brd bg-agon-s2 px-2 py-1.5 text-[12px] leading-[1.4] text-agon-tx outline-none"
        />
      </div>
    )}
    </>
  );
}

// ── ActionBtn helper ──────────────────────────────────────────────────────────

function ActionBtn({ onClick, title, children, danger }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "cursor-pointer rounded border bg-transparent px-[5px] py-0.5 text-[11px] [transition:background_120ms]",
        danger ? "border-agon-erreur/25 text-agon-erreur hover:bg-agon-erreur/[0.082]" : "border-agon-brd text-agon-tx3 hover:bg-white/[0.05]",
      )}
    >
      {children}
    </button>
  );
}

// ── Recursive group renderer ──────────────────────────────────────────────────

function GroupRenderer({
  group, depth, root, onChange, onRequestEditInterval, onRequestEditExercise, isSpecifique,
}: {
  group: EnergyGroup;
  depth: number;
  root: EnergyGroup;
  onChange: (r: EnergyGroup) => void;
  onRequestEditInterval: (interval: EnergyInterval) => void;
  onRequestEditExercise: (exercise: ExerciseInterval) => void;
  isSpecifique: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = group.children.findIndex((c) => c.id === active.id);
    const toIdx   = group.children.findIndex((c) => c.id === over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    onChange(reorderChildren(root, group.id, fromIdx, toIdx));
  }

  const itemIds = group.children.map((c) => c.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {group.children.map((child) => (
          <SortableItem key={child.id} id={child.id}>
            {(listeners) =>
              child.type === "interval" ? (
                <IntervalRow
                  interval={child}
                  depth={depth}
                  listeners={listeners}
                  onEdit={() => onRequestEditInterval(child)}
                  onDuplicate={() => onChange(duplicateStep(root, child.id))}
                  onDelete={() => onChange(deleteStep(root, child.id))}
                />
              ) : child.type === "exercise" ? (
                <ExerciseRow
                  exercise={child}
                  depth={depth}
                  listeners={listeners}
                  onEdit={() => onRequestEditExercise(child)}
                  onDuplicate={() => onChange(duplicateStep(root, child.id))}
                  onDelete={() => onChange(deleteStep(root, child.id))}
                />
              ) : (
                <div>
                  <GroupRowHeader
                    group={child}
                    depth={depth}
                    listeners={listeners}
                    onEditRepeat={(r) => onChange(updateStep(root, { ...child, repeat: r }))}
                    onDuplicate={() => onChange(duplicateStep(root, child.id))}
                    onDelete={() => onChange(deleteStep(root, child.id))}
                    onAddInterval={() => onChange(addStepToGroup(root, child.id, makeInterval()))}
                    onAddGroup={() => onChange(addStepToGroup(root, child.id, makeGroup()))}
                    isSpecifique={isSpecifique}
                    onAddExercise={() => onChange(addStepToGroup(root, child.id, makeExerciseInterval({ id: "", name: "Exercice" })))}
                    onEditDeparture={(s) => onChange(updateStep(root, { ...child, departure_every_s: s }))}
                    onEditInstructions={(t) => onChange(updateStep(root, { ...child, instructions: t }))}
                  />
                  <GroupRenderer
                    group={child}
                    depth={depth + 1}
                    root={root}
                    onChange={onChange}
                    onRequestEditInterval={onRequestEditInterval}
                    onRequestEditExercise={onRequestEditExercise}
                    isSpecifique={isSpecifique}
                  />
                </div>
              )
            }
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  root: EnergyGroup;
  onChange: (root: EnergyGroup) => void;
  athleteId?: string;
  sessionKind?: SessionKind;
}

export default function IntervalBuilder({ root, onChange, athleteId, sessionKind }: Props) {
  const [editingInterval, setEditingInterval] = useState<EnergyInterval | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseInterval | null>(null);
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false);

  const isSpecifique = sessionKind === "specifique";

  const handleRequestEdit = useCallback((interval: EnergyInterval) => {
    setEditingInterval(interval);
    setEditorOpen(true);
  }, []);

  const handleRequestEditExercise = useCallback((exercise: ExerciseInterval) => {
    setEditingExercise(exercise);
    setExerciseEditorOpen(true);
  }, []);

  function handleSaveInterval(updated: EnergyInterval) {
    const found = findParent(root, updated.id);
    if (found) {
      onChange(updateStep(root, updated));
    }
  }

  function handleSaveExercise(updated: ExerciseInterval) {
    const found = findParent(root, updated.id);
    if (found) {
      onChange(updateStep(root, updated));
    } else {
      // New exercise step — add to root
      onChange(addStepToGroup(root, root.id, updated));
    }
    setExerciseEditorOpen(false);
  }

  function handleAddExercise() {
    setEditingExercise(null);
    setExerciseEditorOpen(true);
  }

  const empty = root.children.length === 0;

  return (
    <div>
      {/* Interval list */}
      {empty ? (
        <div className="rounded border border-dashed border-agon-brd px-4 py-8 text-center text-[13px] text-agon-tx3">
          Aucun intervalle.{" "}
          <button
            onClick={() => onChange(addStepToGroup(root, root.id, makeInterval()))}
            className="cursor-pointer bg-transparent text-[13px] text-agon-accent"
          >
            Ajouter un premier intervalle
          </button>
        </div>
      ) : (
        <GroupRenderer
          group={root}
          depth={0}
          root={root}
          onChange={onChange}
          onRequestEditInterval={handleRequestEdit}
          onRequestEditExercise={handleRequestEditExercise}
          isSpecifique={isSpecifique}
        />
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onChange(addStepToGroup(root, root.id, makeInterval()))}
          className={ACCENT_BTN}
        >
          + Intervalle
        </button>
        {isSpecifique && (
          <button
            onClick={handleAddExercise}
            className={ACCENT_BTN}
          >
            + Exercice
          </button>
        )}
        <button
          onClick={() => onChange(addStepToGroup(root, root.id, makeGroup()))}
          className="cursor-pointer rounded border border-agon-brd bg-transparent px-3.5 py-[7px] text-[12px] text-agon-tx2"
        >
          + Groupe répété
        </button>
      </div>

      {/* Interval editor sheet */}
      <IntervalEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        interval={editingInterval}
        onSave={handleSaveInterval}
        athleteId={athleteId}
      />

      {/* Exercise step editor */}
      <ExerciseStepEditor
        open={exerciseEditorOpen}
        onOpenChange={setExerciseEditorOpen}
        exercise={editingExercise}
        onSave={handleSaveExercise}
      />
    </div>
  );
}

/** Nombre de répétitions saisi, ou celui d'avant s'il est vide ou hors de 1-99. */
function validRepeat(typed: number, previous: number): number {
  const r = Math.round(typed);
  return Number.isFinite(r) && r >= 1 && r <= 99 ? r : previous;
}
