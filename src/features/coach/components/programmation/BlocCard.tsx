import { Fragment, useState } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { C } from "@/lib/theme"
import { Settings, X, Plus, GripVertical, Link2, BookmarkPlus } from "lucide-react"
import type { Bloc, Exercice } from "./types"
import { defaultExerciceParams } from "./types"
import { BlocForm } from "./BlocForm"
import { ExerciceRow } from "./ExerciceRow"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

const BLOC_PALETTE = [
  "#FFC933", "#F97316", "#22C55E", "#EF4444",
  "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6",
]

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface BlocCardProps {
  bloc: Bloc
  index: number
  athleteId: string | undefined
  activeWeek: number
  sessionMultiSemaine: boolean
  onChange: (updated: Bloc) => void
  onDelete: () => void
  dragHandleProps?: Record<string, unknown>
  /** Shows the "save to bloc bank" action when provided */
  onSaveToBank?: () => void
}

interface SortableExerciceProps {
  exercice: Exercice
  index: number
  total: number
  bloc: Bloc
  athleteId: string | undefined
  activeWeek: number
  sessionMultiSemaine: boolean
  accentColor: string
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onChange: (updated: Exercice) => void
}

function SortableExercice({ exercice, index, total, bloc, athleteId, activeWeek, sessionMultiSemaine, accentColor, onMoveUp, onMoveDown, onDelete, onChange }: SortableExerciceProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercice.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
    >
      <ExerciceRow
        exercice={exercice}
        index={index}
        total={total}
        athleteId={athleteId}
        sessionMultiSemaine={sessionMultiSemaine}
        activeWeek={activeWeek}
        blocSeriesMode={bloc.series_mode}
        blocSeriesCount={bloc.series_count}
        accentColor={accentColor}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
        onChange={onChange}
        dragHandleProps={listeners as Record<string, unknown>}
      />
    </div>
  )
}

function timingLabel(bloc: Bloc): string {
  if (bloc.timing_mode === 'libre') return 'Repos libre'
  if (bloc.timing_mode === 'depart') {
    const min = bloc.timing_depart_min ?? 0
    const sec = bloc.timing_depart_sec ?? 0
    if (min > 0 && sec > 0) return `Départ /${min}min ${sec}sec`
    if (sec > 0) return `Départ /${sec}sec`
    return `Départ /${min}min`
  }
  const min = bloc.timing_repos_min ?? 0
  const sec = bloc.timing_repos_sec ?? 0
  if (min > 0 && sec > 0) return `${min}min ${sec}sec`
  if (min > 0) return `${min}min`
  if (sec > 0) return `${sec}sec`
  return `—`
}

export function BlocCard({ bloc, index, athleteId, activeWeek, sessionMultiSemaine, onChange, onDelete, dragHandleProps, onSaveToBank }: BlocCardProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(bloc.name)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleExerciceDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const exos = [...bloc.exercices]
    const from = exos.findIndex(e => e.id === active.id)
    const to = exos.findIndex(e => e.id === over.id)
    if (from === -1 || to === -1) return
    exos.splice(to, 0, exos.splice(from, 1)[0])
    onChange({ ...bloc, exercices: exos.map((e, i) => ({ ...e, sort_order: i })) })
  }

  function moveExercice(idx: number, dir: -1 | 1) {
    const exos = [...bloc.exercices]
    const target = idx + dir
    if (target < 0 || target >= exos.length) return
    ;[exos[idx], exos[target]] = [exos[target], exos[idx]]
    onChange({ ...bloc, exercices: exos.map((e, i) => ({ ...e, sort_order: i })) })
  }

  function addExercice() {
    const newEx: Exercice = {
      id: crypto.randomUUID(),
      exercise_id: "",
      exercise_name: "",
      mode: 'classique',
      sort_order: bloc.exercices.length,
      params: sessionMultiSemaine
        ? { [String(activeWeek)]: defaultExerciceParams(bloc.series_count ?? 4) }
        : defaultExerciceParams(bloc.series_count ?? 4),
    }
    onChange({ ...bloc, exercices: [...bloc.exercices, newEx] })
  }

  function updateExercice(idx: number, updated: Exercice) {
    const exos = [...bloc.exercices]
    exos[idx] = updated
    onChange({ ...bloc, exercices: exos })
  }

  function deleteExercice(idx: number) {
    const exos = bloc.exercices.filter((_, i) => i !== idx)
    onChange({ ...bloc, exercices: exos.map((e, i) => ({ ...e, sort_order: i })) })
  }

  const exCount = bloc.exercices.length
  const timing = timingLabel(bloc)
  const bColor = bloc.color ?? BLOC_PALETTE[index % BLOC_PALETTE.length]

  return (
    <div style={{
      borderRadius: 6,
      border: "1px solid " + C.brdL,
      overflow: "hidden",
      marginBottom: 12,
      background: C.s1,
    }}>
      {/* Header */}
      {editing ? (
        <div style={{ padding: "14px 16px 14px 20px", borderBottom: "1px solid " + C.brdL }}>
          <BlocForm
            initial={bloc}
            onSubmit={data => { onChange({ ...bloc, ...data }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div style={{ padding: "8px 10px 8px 16px", borderBottom: "1px solid " + C.brdL + "80" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Drag */}
            <div
              {...(dragHandleProps ?? {})}
              style={{ cursor: "grab", color: C.tx3 + "80", display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <GripVertical size={12} />
            </div>

            {/* Bloc number badge */}
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: hexToRgba(bColor, 0.15), color: bColor,
              fontSize: 9, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {index + 1}
            </div>

            {/* Name — editable */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingName ? (
                <input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={() => { onChange({ ...bloc, name: nameValue.trim() || bloc.name }); setEditingName(false) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onChange({ ...bloc, name: nameValue.trim() || bloc.name }); setEditingName(false) }
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  style={{ width: "100%", padding: "2px 6px", borderRadius: 5, border: "1px solid " + VIOLET, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <div
                    onClick={() => { setEditingName(true); setNameValue(bloc.name) }}
                    style={{ fontSize: 13, fontWeight: 700, color: C.tx, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {bloc.name || <span style={{ color: C.tx3 }}>Bloc sans nom</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {exCount > 0 && <span style={{ fontSize: 9, color: C.tx3 }}>{exCount} ex.</span>}
                    <span style={{ fontSize: 9, color: C.tx3 + "80" }}>·</span>
                    <span style={{ fontSize: 9, color: C.tx3 }}>{timing}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              <button
                onClick={() => setEditing(true)}
                title="Modifier le bloc"
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              ><Settings size={11} /></button>

              {onSaveToBank && (
                <button
                  onClick={onSaveToBank}
                  title="Enregistrer dans la banque de blocs"
                  style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                ><BookmarkPlus size={11} /></button>
              )}

              {confirmDelete ? (
                <>
                  <button
                    onClick={onDelete}
                    style={{ padding: "0 8px", height: 24, borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}
                  >Supprimer</button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  ><X size={11} /></button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.r + "40", background: C.rS, color: C.r, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                ><X size={11} /></button>
              )}
            </div>
          </div>
          {bloc.instructions && (
            <div
              onClick={() => setEditing(true)}
              title="Modifier les consignes"
              style={{ marginTop: 6, marginLeft: 36, fontSize: 11, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap", cursor: "pointer" }}
            >
              {bloc.instructions}
            </div>
          )}
        </div>
      )}

      {/* Exercises */}
      <div style={{ padding: "8px 10px 10px 12px" }}>
        <div style={{
          background: hexToRgba(bColor, 0.05),
          border: "1px solid " + hexToRgba(bColor, 0.18),
          borderRadius: 4,
          padding: bloc.exercices.length > 0 ? "6px" : "0",
          marginBottom: bloc.exercices.length > 0 ? 6 : 0,
        }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExerciceDragEnd}>
            <SortableContext items={bloc.exercices.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {bloc.exercices.map((ex, i) => (
                  <Fragment key={ex.id}>
                    <SortableExercice
                      exercice={ex}
                      index={i}
                      total={bloc.exercices.length}
                      bloc={bloc}
                      athleteId={athleteId}
                      activeWeek={activeWeek}
                      sessionMultiSemaine={sessionMultiSemaine}
                      accentColor={bColor}
                      onMoveUp={() => moveExercice(i, -1)}
                      onMoveDown={() => moveExercice(i, 1)}
                      onDelete={() => deleteExercice(i)}
                      onChange={updated => updateExercice(i, updated)}
                    />
                    {/* Superset link toggle between consecutive exercises */}
                    {i < bloc.exercices.length - 1 && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "-2px 0" }}>
                        <button
                          onClick={() => updateExercice(i, { ...ex, superset_with_next: !ex.superset_with_next })}
                          title={ex.superset_with_next ? "Délier (retirer le superset)" : "Lier en superset avec l'exercice suivant"}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "1px 8px", borderRadius: 4,
                            border: "1px " + (ex.superset_with_next ? "solid " + VIOLET : "dashed " + C.brdL),
                            background: ex.superset_with_next ? VIOLET_S : "transparent",
                            color: ex.superset_with_next ? VIOLET : C.tx3,
                            fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                            opacity: ex.superset_with_next ? 1 : 0.55,
                            transition: "all 120ms",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = "1" }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = ex.superset_with_next ? "1" : "0.55" }}
                        >
                          <Link2 size={9} />
                          {ex.superset_with_next ? "Superset" : "Lier"}
                        </button>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Add exercise */}
        <button
          onClick={addExercice}
          style={{
            width: "100%", marginTop: bloc.exercices.length > 0 ? 6 : 0,
            padding: "7px 0", borderRadius: 4,
            border: "1px dashed " + C.brdL, background: "transparent",
            color: C.tx3, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            transition: "border-color 120ms, color 120ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = VIOLET; e.currentTarget.style.color = VIOLET }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.brdL; e.currentTarget.style.color = C.tx3 }}
        >
          <Plus size={13} />
          Ajouter un exercice
        </button>
      </div>
    </div>
  )
}
