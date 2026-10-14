import { useState, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { C } from "@/lib/theme"
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

const VIOLET = "#FFC933"

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

export function SessionBlocEditor({ session, cycleId, athleteId, onChange, initialWeek = 1, bankActions = true, sessionFiches = true }: SessionBlocEditorProps) {
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
        if (typeof ex.params === 'object' && !('mode' in ex.params)) {
          const rec = ex.params as Record<string, import("./types").ExerciceParams>
          const thisWeekParams = rec[weekKey]
          if (thisWeekParams) {
            return { ...ex, params: { ...rec, [nextWeek]: { ...thisWeekParams } } }
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
    <div style={{ padding: "12px 0" }}>
      {/* SemaineNav — only if session has multi_semaine */}
      {session.multi_semaine && (
        <div style={{ marginBottom: 12 }}>
          <SemaineNav
            cycleId={cycleId}
            activeWeek={activeWeek}
            onWeekChange={setActiveWeek}
            onDuplicateWeek={handleDuplicateWeek}
            weekCount={session.nb_semaines}
          />
        </div>
      )}

      {/* Fiches rattachées à la séance */}
      {sessionFiches && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            onClick={() => setSaveTarget({ kind: 'session', session })}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
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
        <div style={{ textAlign: "center", padding: "30px 20px", color: C.tx3, fontSize: 12 }}>
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
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 4,
          border: "1px solid " + VIOLET + "40", background: VIOLET + "08",
        }}>
          <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Blocs de la banque
          </div>
          {bankBlocs.length === 0 ? (
            <div style={{ fontSize: 12, color: C.tx3, padding: "4px 0 8px" }}>
              Aucun bloc préconstruit — crée-les dans Banque → Musculation → Blocs.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BLOC_CATEGORIES.map(cat => {
                const catBlocs = bankBlocs.filter(b => (b.category ?? 'Mixte') === cat)
                if (catBlocs.length === 0) return null
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
                      {cat}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {catBlocs.map(b => (
                        <button
                          key={b.id}
                          onClick={() => addBlocFromBank(b)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                            padding: "9px 10px", borderRadius: 4,
                            border: "1px solid " + C.brdL, background: C.s1, color: C.tx,
                            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: 3, background: b.color ?? VIOLET, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {b.name || "Bloc sans nom"}
                          </span>
                          <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>
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
            style={{ width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Add bloc buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => { setIsAddingBloc(true); setShowBankPicker(false) }}
          style={{
            flex: 1,
            padding: "10px 0", borderRadius: 4,
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
          Nouveau bloc
        </button>
        <button
          onClick={() => { setShowBankPicker(p => !p); setIsAddingBloc(false) }}
          style={{
            flex: 1,
            padding: "10px 0", borderRadius: 4,
            border: "1px dashed " + (showBankPicker ? VIOLET : C.brdL),
            background: showBankPicker ? VIOLET + "0F" : "transparent",
            color: showBankPicker ? VIOLET : C.tx3, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            transition: "border-color 120ms, color 120ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = VIOLET; e.currentTarget.style.color = VIOLET }}
          onMouseLeave={e => {
            if (!showBankPicker) { e.currentTarget.style.borderColor = C.brdL; e.currentTarget.style.color = C.tx3 }
          }}
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
