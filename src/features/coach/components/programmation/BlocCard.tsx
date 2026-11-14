import { Fragment, useState } from "react"
import { blocColor } from "@/lib/peps";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils";
import { Settings, X, Plus, GripVertical, Link2, BookmarkPlus } from "lucide-react"
import type { Bloc, Exercice } from "./types"
import { defaultExerciceParams } from "./types"
import { BlocForm } from "./BlocForm"
import { ExerciceRow } from "./ExerciceRow"
import { FicheAttachmentsEditor } from "@/features/shared/components/fiches/FicheAttachmentsEditor"

/** Bouton carré 24 px de l'en-tête du bloc. */
const SQ_BTN = "flex size-6 cursor-pointer items-center justify-center rounded-[6px] border"
const SQ_IDLE = "border-agon-brd-l bg-transparent text-agon-tx3"
const META = "text-[9px] text-agon-tx3"


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
  /** Semaines pour « Varier selon la semaine » des fiches du bloc */
  ficheWeeks?: number[]
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

export function BlocCard({ bloc, index, athleteId, activeWeek, sessionMultiSemaine, onChange, onDelete, dragHandleProps, onSaveToBank, ficheWeeks = [] }: BlocCardProps) {
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
  const bColor = blocColor(bloc.color, index)

  return (
    <div className="mb-3 overflow-hidden rounded-[6px] border border-agon-brd-l bg-agon-s1">
      {/* Header */}
      {editing ? (
        <div className="border-b border-agon-brd-l py-3.5 pl-5 pr-4">
          <BlocForm
            initial={bloc}
            onSubmit={data => { onChange({ ...bloc, ...data }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="border-b border-agon-brd-l/50 py-2 pl-4 pr-2.5">
          <div className="flex items-center gap-1.5">
            {/* Drag */}
            <div
              {...(dragHandleProps ?? {})}
              className="flex shrink-0 cursor-grab items-center text-agon-tx3/50"
            >
              <GripVertical size={12} />
            </div>

            {/* Bloc number badge */}
            <div className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-black" style={{ background: hexToRgba(bColor, 0.15), color: bColor }}>
              {index + 1}
            </div>

            {/* Name — editable */}
            <div className="min-w-0 flex-1">
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
                  className="w-full rounded-[5px] border border-agon-accent bg-agon-s2 px-1.5 py-0.5 text-[13px] font-bold text-agon-tx outline-none"
                />
              ) : (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <div
                    onClick={() => { setEditingName(true); setNameValue(bloc.name) }}
                    className="cursor-text truncate text-[13px] font-bold text-agon-tx"
                  >
                    {bloc.name || <span className="text-agon-tx3">Bloc sans nom</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {exCount > 0 && <span className={META}>{exCount} ex.</span>}
                    <span className="text-[9px] text-agon-tx3/50">·</span>
                    <span className={META}>{timing}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 gap-[3px]">
              <button
                onClick={() => setEditing(true)}
                title="Modifier le bloc"
                className={cn(SQ_BTN, SQ_IDLE)}
              ><Settings size={11} /></button>

              {onSaveToBank && (
                <button
                  onClick={onSaveToBank}
                  title="Enregistrer dans la banque de blocs"
                  className={cn(SQ_BTN, SQ_IDLE)}
                ><BookmarkPlus size={11} /></button>
              )}

              {confirmDelete ? (
                <>
                  <button
                    onClick={onDelete}
                    className="h-6 cursor-pointer rounded-[6px] border-0 bg-agon-erreur-vif px-2 text-[10px] font-bold text-agon-ink"
                  >Supprimer</button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className={cn(SQ_BTN, SQ_IDLE)}
                  ><X size={11} /></button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className={cn(SQ_BTN, "border-agon-erreur/25 bg-agon-erreur-doux text-agon-erreur")}
                ><X size={11} /></button>
              )}
            </div>
          </div>
          {bloc.instructions && (
            <div
              onClick={() => setEditing(true)}
              title="Modifier les consignes"
              className="ml-9 mt-1.5 cursor-pointer whitespace-pre-wrap text-[11px] leading-[1.4] text-agon-tx2"
            >
              {bloc.instructions}
            </div>
          )}
          <div className="ml-9 mt-1.5">
            <FicheAttachmentsEditor
              compact
              value={bloc.fiches}
              onChange={fiches => onChange({ ...bloc, fiches })}
              athleteId={athleteId}
              weeks={ficheWeeks}
            />
          </div>
        </div>
      )}

      {/* Exercises */}
      <div className="pb-2.5 pl-3 pr-2.5 pt-2">
        <div
          className={cn("rounded-[4px] border", bloc.exercices.length > 0 && "mb-1.5 p-1.5")}
          style={{ background: hexToRgba(bColor, 0.05), borderColor: hexToRgba(bColor, 0.18) }}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExerciceDragEnd}>
            <SortableContext items={bloc.exercices.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
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
                      <div className="-my-0.5 flex justify-center">
                        <button
                          onClick={() => updateExercice(i, { ...ex, superset_with_next: !ex.superset_with_next })}
                          title={ex.superset_with_next ? "Délier (retirer le superset)" : "Lier en superset avec l'exercice suivant"}
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-[4px] border px-2 py-px text-[9px] font-bold [transition:all_120ms]",
                            ex.superset_with_next
                              ? "border-solid border-agon-accent bg-agon-accent/[0.12] text-agon-accent"
                              : "border-dashed border-agon-brd-l bg-transparent text-agon-tx3 opacity-[0.55] hover:opacity-100",
                          )}
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
          className={cn(
            "flex w-full cursor-pointer items-center justify-center gap-[5px] rounded-[4px] border border-dashed border-agon-brd-l bg-transparent py-[7px] text-[12px] font-semibold text-agon-tx3 [transition:border-color_120ms,color_120ms] hover:border-agon-accent hover:text-agon-accent",
            bloc.exercices.length > 0 && "mt-1.5",
          )}
        >
          <Plus size={13} />
          Ajouter un exercice
        </button>
      </div>
    </div>
  )
}
