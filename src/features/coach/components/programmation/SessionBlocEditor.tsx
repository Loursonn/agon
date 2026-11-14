import { useState, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Plus, Library, BookmarkPlus } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import type { Bloc, ProgSession } from "./types"
import { BLOC_CATEGORIES } from "./types"
import { BlocCard } from "./BlocCard"
import { BlocForm } from "./BlocForm"
import { SemaineNav } from "./SemaineNav"
import { useBlocBank } from "./hooks/useBlocBank"
import { ficheWeeksFor, prepareBloc } from "./bankUtils"
import { FicheAttachmentsEditor } from "@/features/shared/components/fiches/FicheAttachmentsEditor"
import { SaveToBankDialog, type SaveToBankTarget } from "./SaveToBankDialog"
import { maxDefinedWeek, resolveExerciceParams } from "@/lib/sessionOccurrence"

const KICK = "text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3"
/** Bouton pointillé « Nouveau bloc » / « Depuis la banque » : or au survol. */
const DASHED_BTN = "flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-[4px] border border-dashed py-2.5 text-[12px] font-semibold [transition:border-color_120ms,color_120ms] hover:border-agon-accent hover:text-agon-accent"

interface SessionBlocEditorProps {
  session: ProgSession
  cycleId: string | undefined
  athleteId: string | undefined
  onChange: (updated: ProgSession) => void
  /** Semaine affichée à l'ouverture (colonne S+1 du drawer). Défaut : 1. */
  initialWeek?: number
  /** Boutons "Enregistrer dans la banque" (séance + blocs). Défaut : true. */
  bankActions?: boolean
  /** Rattachement de fiches au niveau séance. Défaut : true. */
  sessionFiches?: boolean
  /** Masque la navigation semaine (l'occurrence est pilotée par le parent). */
  hideWeekNav?: boolean
}

interface SortableBlocProps {
  bloc: Bloc
  index: number
  athleteId: string | undefined
  activeWeek: number
  sessionMultiSemaine: boolean
  onChange: (updated: Bloc) => void
  onDelete: () => void
  onSaveToBank?: () => void
  ficheWeeks: number[]
}

function SortableBloc({ bloc, index, athleteId, activeWeek, sessionMultiSemaine, onChange, onDelete, onSaveToBank, ficheWeeks }: SortableBlocProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bloc.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
    >
      <BlocCard
        bloc={bloc}
        index={index}
        athleteId={athleteId}
        activeWeek={activeWeek}
        sessionMultiSemaine={sessionMultiSemaine}
        onChange={onChange}
        onDelete={onDelete}
        onSaveToBank={onSaveToBank}
        ficheWeeks={ficheWeeks}
        dragHandleProps={listeners as Record<string, unknown>}
      />
    </div>
  )
}

export function SessionBlocEditor({ session, cycleId, athleteId, onChange, initialWeek = 1, bankActions = true, sessionFiches = true, hideWeekNav = false }: SessionBlocEditorProps) {
  const [isAddingBloc, setIsAddingBloc] = useState(false)
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [saveTarget, setSaveTarget] = useState<SaveToBankTarget | null>(null)
  // La colonne "S+1" du drawer passe la semaine à afficher. Sans cette prop
  // (ignorée jusqu'ici), elle affichait et éditait toujours la semaine 1.
  const [activeWeek, setActiveWeek] = useState(initialWeek)
  useEffect(() => { setActiveWeek(initialWeek) }, [initialWeek])
  const { user } = useAuth()
  const { data: bankBlocs = [] } = useBlocBank(user?.id)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const ficheWeeks = ficheWeeksFor(session)

  function handleDuplicateWeek() {
    // Duplicate activeWeek params to activeWeek+1 across all exercises in all blocs
    const weekKey = String(activeWeek)
    const nextWeek = String(activeWeek + 1)
    const updatedBlocs = session.blocs.map(bloc => ({
      ...bloc,
      exercices: bloc.exercices.map(ex => {
        const effectiveMulti = session.multi_semaine || (ex.multi_semaine ?? false)
        if (!effectiveMulti) return ex
        if (typeof ex.params === 'object' && !('nb_series' in ex.params)) {
          const rec = ex.params as Record<string, import("./types").ExerciceParams>
          const thisWeekParams = rec[weekKey] ?? resolveExerciceParams(rec, activeWeek)
          if (thisWeekParams) {
            return { ...ex, params: { ...rec, [nextWeek]: structuredClone(thisWeekParams) } }
          }
        }
        return ex
      })
    }))
    onChange({ ...session, blocs: updatedBlocs })
    setActiveWeek(activeWeek + 1)
  }

  function updateBloc(id: string, updated: Bloc) {
    const blocs = session.blocs.map(b => b.id === id ? updated : b)
    onChange({ ...session, blocs })
  }

  function deleteBloc(id: string) {
    const blocs = session.blocs
      .filter(b => b.id !== id)
      .map((b, i) => ({ ...b, sort_order: i }))
    onChange({ ...session, blocs })
  }

  function addBloc(data: Omit<Bloc, 'id' | 'exercices' | 'sort_order'>) {
    const newBloc: Bloc = {
      ...data,
      id: crypto.randomUUID(),
      exercices: [],
      sort_order: session.blocs.length,
    }
    onChange({ ...session, blocs: [...session.blocs, newBloc] })
    setIsAddingBloc(false)
  }

  function addBlocFromBank(bank: Bloc) {
    // Deep copy + fresh ids: the inserted bloc is independent from the bank version
    const newBloc: Bloc = { ...prepareBloc(bank), sort_order: session.blocs.length }
    onChange({ ...session, blocs: [...session.blocs, newBloc] })
    setShowBankPicker(false)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const list = [...session.blocs]
    const from = list.findIndex(b => b.id === active.id)
    const to = list.findIndex(b => b.id === over.id)
    if (from === -1 || to === -1) return
    list.splice(to, 0, list.splice(from, 1)[0])
    onChange({ ...session, blocs: list.map((b, i) => ({ ...b, sort_order: i })) })
  }

  return (
    <div className="py-3">
      {/* SemaineNav — only if session has multi_semaine */}
      {session.multi_semaine && !hideWeekNav && (
        <div className="mb-3">
          <SemaineNav
            cycleId={cycleId}
            activeWeek={activeWeek}
            onWeekChange={setActiveWeek}
            onDuplicateWeek={handleDuplicateWeek}
            weekCount={Math.max(session.nb_semaines ?? 1, maxDefinedWeek(session.blocs))}
          />
        </div>
      )}

      {/* Fiches rattachées à la séance */}
      {sessionFiches && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className={KICK}>
            Fiches de la séance
          </span>
          <FicheAttachmentsEditor
            compact
            value={session.fiches}
            onChange={fiches => onChange({ ...session, fiches })}
            athleteId={athleteId}
            weeks={ficheWeeks}
          />
        </div>
      )}

      {/* Save whole session to the bank */}
      {bankActions && session.blocs.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setSaveTarget({ kind: 'session', session })}
            className="flex cursor-pointer items-center gap-[5px] rounded-[4px] border border-agon-brd-l bg-transparent px-2.5 py-[5px] text-[11px] font-semibold text-agon-tx3"
          >
            <BookmarkPlus size={12} />
            Enregistrer la séance dans la banque
          </button>
        </div>
      )}

      {/* Blocs list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={session.blocs.map(b => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {session.blocs.map((bloc, i) => (
            <SortableBloc
              key={bloc.id}
              bloc={bloc}
              index={i}
              athleteId={athleteId}
              activeWeek={activeWeek}
              sessionMultiSemaine={session.multi_semaine}
              onChange={updated => updateBloc(bloc.id, updated)}
              onDelete={() => deleteBloc(bloc.id)}
              onSaveToBank={bankActions ? () => setSaveTarget({ kind: 'bloc', bloc }) : undefined}
              ficheWeeks={ficheWeeks}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Empty blocs state */}
      {!isAddingBloc && session.blocs.length === 0 && (
        <div className="px-5 py-[30px] text-center text-[12px] text-agon-tx3">
          Aucun bloc — ajoutes-en un pour commencer.
        </div>
      )}

      {/* Add bloc inline form — below existing blocs */}
      {isAddingBloc && (
        <BlocForm
          onSubmit={addBloc}
          onCancel={() => setIsAddingBloc(false)}
        />
      )}

      {/* Bank picker */}
      {showBankPicker && (
        <div className="mt-2 rounded-[4px] border border-agon-accent/25 bg-agon-accent/[0.031] p-2.5">
          <div className={cn(KICK, "mb-2")}>
            Blocs de la banque
          </div>
          {bankBlocs.length === 0 ? (
            <div className="pb-2 pt-1 text-[12px] text-agon-tx3">
              Aucun bloc préconstruit — crée-les dans Banque → Musculation → Blocs.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {BLOC_CATEGORIES.map(cat => {
                const catBlocs = bankBlocs.filter(b => (b.category ?? 'Mixte') === cat)
                if (catBlocs.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="mb-[5px] text-[9px] font-extrabold uppercase tracking-[0.5px] text-agon-tx3">
                      {cat}
                    </div>
                    <div className="flex flex-col gap-[5px]">
                      {catBlocs.map(b => (
                        <button
                          key={b.id}
                          onClick={() => addBlocFromBank(b)}
                          className="flex cursor-pointer items-center gap-2 rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[9px] text-left text-[12px] font-semibold text-agon-tx"
                        >
                          <span className="size-2 shrink-0 rounded-[3px]" style={{ background: b.color ?? C.ac }} />
                          <span className="min-w-0 flex-1 truncate">
                            {b.name || "Bloc sans nom"}
                          </span>
                          <span className="shrink-0 text-[10px] text-agon-tx3">
                            {b.exercices.length} ex.
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button
            onClick={() => setShowBankPicker(false)}
            className="mt-1.5 w-full cursor-pointer rounded-[7px] border border-agon-brd-l bg-transparent py-1.5 text-[11px] text-agon-tx3"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Add bloc buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => { setIsAddingBloc(true); setShowBankPicker(false) }}
          className={cn(DASHED_BTN, "border-agon-brd-l bg-transparent text-agon-tx3")}
        >
          <Plus size={13} />
          Nouveau bloc
        </button>
        <button
          onClick={() => { setShowBankPicker(p => !p); setIsAddingBloc(false) }}
          className={cn(DASHED_BTN, showBankPicker ? "border-agon-accent bg-agon-accent/[0.059] text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx3")}
        >
          <Library size={13} />
          Depuis la banque
        </button>
      </div>
      {saveTarget && (
        <SaveToBankDialog target={saveTarget} activeWeek={activeWeek} onClose={() => setSaveTarget(null)} />
      )}
    </div>
  )
}
