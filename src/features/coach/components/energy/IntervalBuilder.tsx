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
import { formatS } from "@/lib/energy/formatTarget";
import { estimateIntervalDuration, targetToIntensityPct, intensityToColor } from "@/lib/energy";
import IntervalEditor from "./IntervalEditor";
import ExerciseStepEditor from "./ExerciseStepEditor";
import { C } from "@/lib/theme";

const EXO_COLOR = "#FFC933";

// ── Role colors ───────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  warmup:   C.o,
  work:     C.ac,
  recovery: C.g,
  rest:     C.b,
  cooldown: C.b,
  open:     C.tx3,
};

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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : undefined,
      }}
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
      style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: 12 + depth * 20,
        paddingRight: 8, paddingTop: 6, paddingBottom: 6,
        borderLeft: `3px solid ${color}`,
        background: depth > 0 ? "rgba(255,255,255,0.02)" : "transparent",
        borderRadius: 4,
        marginBottom: 2,
      }}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        style={{ cursor: "grab", color: C.tx3, fontSize: 14, flexShrink: 0, paddingRight: 2 }}
      >
        ⋮⋮
      </div>

      {/* Role badge */}
      <span style={{
        fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
        background: color + "22", color, flexShrink: 0,
      }}>
        {ROLE_LABEL[interval.role] ?? interval.role}
      </span>

      {/* Equipment badge */}
      {interval.equipment && (
        <span style={{
          fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4,
          background: C.b + "22", color: C.b, flexShrink: 0,
        }}>
          {EQUIPMENT_LABEL[interval.equipment] ?? interval.equipment}
        </span>
      )}

      {/* Summary */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.tx, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          <div style={{ fontSize: 10, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {interval.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <ActionBtn onClick={onEdit} title="Modifier les paramètres"><Settings size={12} style={{ display: "block" }} /></ActionBtn>
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
  const summary = [
    exercise.reps_min ? (exercise.reps_max && exercise.reps_max !== exercise.reps_min ? `${exercise.reps_min}-${exercise.reps_max} reps` : `${exercise.reps_min} reps`) : null,
    exercise.weight_kg ? `${exercise.weight_kg} ${exercise.weight_unit === 'bw' ? 'BW' : exercise.weight_unit === 'pct_rm' ? '%RM' : 'kg'}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: 12 + depth * 20,
        paddingRight: 8, paddingTop: 6, paddingBottom: 6,
        borderLeft: `3px solid ${EXO_COLOR}`,
        background: depth > 0 ? "rgba(255,255,255,0.02)" : "transparent",
        borderRadius: 4, marginBottom: 2,
      }}
    >
      <div {...listeners} style={{ cursor: "grab", color: C.tx3, fontSize: 14, flexShrink: 0, paddingRight: 2 }}>⋮⋮</div>

      <span style={{
        fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
        background: EXO_COLOR + "22", color: EXO_COLOR, flexShrink: 0,
      }}>
        EXERCICE
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.tx, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {exercise.exercise_name}
        </div>
        {summary && (
          <div style={{ fontSize: 10, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <ActionBtn onClick={onEdit} title="Modifier les paramètres"><Settings size={12} style={{ display: "block" }} /></ActionBtn>
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
  const color = ROLE_COLOR[group.role] ?? C.tx3;

  return (
    <>
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: 12 + depth * 20, paddingRight: 8,
        paddingTop: 5, paddingBottom: 5,
        background: color + "12",
        borderLeft: `3px solid ${color}`,
        borderRadius: 4, marginBottom: 2,
      }}
    >
      <div {...listeners} style={{ cursor: "grab", color: C.tx3, fontSize: 14, flexShrink: 0 }}>⋮⋮</div>

      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: color + "22", color, flexShrink: 0 }}>
        GROUPE
      </span>

      {/* Repeat editor inline */}
      {editingRepeat ? (
        <input
          autoFocus
          type="number"
          min={1} max={50}
          value={repeatVal}
          onChange={(e) => setRepeatVal(Number(e.target.value))}
          onBlur={() => { onEditRepeat(repeatVal); setEditingRepeat(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onEditRepeat(repeatVal); setEditingRepeat(false); } }}
          style={{ width: 50, background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, color: C.tx, fontSize: 12, padding: "2px 6px", fontFamily: "inherit" }}
        />
      ) : (
        <button
          onClick={() => { setRepeatVal(group.repeat); setEditingRepeat(true); }}
          style={{ background: color + "20", border: `1px solid ${color}40`, borderRadius: 6, color, fontSize: 11, fontWeight: 700, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
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
              style={{ width: 55, background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, color: C.tx, fontSize: 11, padding: "2px 6px", fontFamily: "inherit" }}
            />
          ) : (
            <button
              onClick={() => { setDepartureVal(toMMSS(group.departure_every_s!)); setEditingDeparture(true); }}
              style={{ background: "#F5A623" + "20", border: `1px solid #F5A62340`, borderRadius: 6, color: "#F5A623", fontSize: 10, fontWeight: 600, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
              title="Départ fixe — cliquer pour modifier, Échap pour supprimer"
            >
              /{toMMSS(group.departure_every_s)}
            </button>
          )
        ) : (
          <button
            onClick={() => { setDepartureVal("1:00"); onEditDeparture(60); setEditingDeparture(true); }}
            style={{ background: "transparent", border: `1px dashed ${C.brd}`, borderRadius: 6, color: C.tx3, fontSize: 10, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
            title="Ajouter départ fixe (toutes les X min)"
          >
            + Départ fixe
          </button>
        )
      )}

      <div style={{ flex: 1 }} />

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
      <div style={{ paddingLeft: 15 + depth * 20, paddingRight: 8, marginBottom: 4 }}>
        <textarea
          autoFocus={!group.instructions}
          value={instructionsVal}
          onChange={(e) => setInstructionsVal(e.target.value)}
          onBlur={() => onEditInstructions(instructionsVal.trim() || undefined)}
          placeholder="Consignes du groupe (ex. allure régulière, récup active…)"
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4,
            color: C.tx, fontSize: 12, lineHeight: 1.4, padding: "6px 8px",
            fontFamily: "inherit", outline: "none",
          }}
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
      style={{
        background: "transparent",
        border: `1px solid ${danger ? C.r + "40" : C.brd}`,
        borderRadius: 4,
        color: danger ? C.r : C.tx3,
        fontSize: 11, padding: "2px 5px",
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? C.r + "15" : "rgba(255,255,255,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
        <div style={{
          textAlign: "center", padding: "32px 16px",
          color: C.tx3, fontSize: 13,
          border: `1px dashed ${C.brd}`, borderRadius: 4,
        }}>
          Aucun intervalle.{" "}
          <button
            onClick={() => onChange(addStepToGroup(root, root.id, makeInterval()))}
            style={{ color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
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
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => onChange(addStepToGroup(root, root.id, makeInterval()))}
          style={{
            padding: "7px 14px", borderRadius: 4,
            border: `1px solid ${C.ac}50`, background: C.ac + "12",
            color: C.ac, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + Intervalle
        </button>
        {isSpecifique && (
          <button
            onClick={handleAddExercise}
            style={{
              padding: "7px 14px", borderRadius: 4,
              border: `1px solid ${EXO_COLOR}50`, background: EXO_COLOR + "12",
              color: EXO_COLOR, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + Exercice
          </button>
        )}
        <button
          onClick={() => onChange(addStepToGroup(root, root.id, makeGroup()))}
          style={{
            padding: "7px 14px", borderRadius: 4,
            border: `1px solid ${C.brd}`, background: "transparent",
            color: C.tx2, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
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
