import { useState, useRef, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { C } from "@/lib/theme"
import { Plus, Pencil, X, ChevronDown, ChevronUp, BarChart2, Copy, Library } from "lucide-react"
import { toast } from "sonner"
import { useProgrammation } from "./hooks/useProgrammation"
import { useUpdateProgrammation } from "./hooks/useUpdateProgrammation"
import { useDuplicateProgSession } from "./hooks/useDuplicateProgSession"
import { useSessionBank } from "./hooks/useSessionBank"
import { prepareSession } from "./bankUtils"
import { usePlaceSession } from "@/features/shared/hooks/usePlaceSession"
import { useAuth } from "@/hooks/useAuth"
import type { ProgSession } from "./types"
import { SessionForm } from "./SessionForm"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { CardSkeleton } from "@/features/shared/components/skeletons"
import { ProgSessionWeekDrawer } from "./ProgSessionWeekDrawer"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

interface ProgrammationViewProps {
  athleteId: string | undefined
  cycleId: string | undefined
}

function totalExercices(session: ProgSession): number {
  return session.blocs.reduce((sum, b) => sum + b.exercices.length, 0)
}

interface SessionCardProps {
  session: ProgSession
  isOpen: boolean
  cycleId: string | undefined
  athleteId: string | undefined
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onChange: (updated: ProgSession) => void
  onOpenWeekDrawer: () => void
  dragHandleProps?: Record<string, unknown>
}

function SessionCard({ session, isOpen, cycleId, athleteId, onToggle, onEdit, onDelete, onChange, onOpenWeekDrawer, dragHandleProps }: SessionCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPlace, setShowPlace] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [placeDate, setPlaceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { user, profile, athletes } = useAuth()
  const placeSession = usePlaceSession()
  const duplicateSession = useDuplicateProgSession()

  // Own profile included first (coach / coach_athlete can duplicate for themselves), same pattern as ContextBar
  const targetAthletes = [
    ...(profile && (profile.role === "coach" || profile.role === "coach_athlete") ? [profile] : []),
    ...athletes.filter(a => a.id !== profile?.id),
  ].filter(a => a.id !== athleteId)

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: "1px solid " + (isOpen ? VIOLET + "60" : C.brdL),
      overflow: "hidden", marginBottom: 8,
      transition: "border-color 150ms",
    }}>
      {/* Card header */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
        onClick={onToggle}
      >
        {/* Drag handle */}
        <div
          {...(dragHandleProps ?? {})}
          onClick={e => e.stopPropagation()}
          style={{ cursor: "grab", color: C.tx3, display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
            <circle cx="4" cy="2.5" r="1.2" fill="currentColor" />
            <circle cx="8" cy="2.5" r="1.2" fill="currentColor" />
            <circle cx="4" cy="7" r="1.2" fill="currentColor" />
            <circle cx="8" cy="7" r="1.2" fill="currentColor" />
            <circle cx="4" cy="11.5" r="1.2" fill="currentColor" />
            <circle cx="8" cy="11.5" r="1.2" fill="currentColor" />
          </svg>
        </div>

        {/* Day badge */}
        {session.day_of_week !== undefined ? (
          <div style={{
            padding: "3px 8px", borderRadius: 6,
            background: VIOLET_S, color: VIOLET,
            fontSize: 10, fontWeight: 800, flexShrink: 0,
          }}>
            {DOW[session.day_of_week]}
          </div>
        ) : session.recurrence === 'once' ? (
          <div style={{
            padding: "3px 8px", borderRadius: 6,
            background: C.s2, color: C.tx3,
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>
            Ponct.
          </div>
        ) : null}

        {/* Short badge — hidden when no code defined */}
        {session.short && session.short !== "?" && (
          <div style={{
            padding: "3px 8px", borderRadius: 6,
            background: C.s2, color: C.tx2,
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            border: "1px solid " + C.brdL,
          }}>
            {session.short}
          </div>
        )}

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.name || "Séance sans nom"}
          </div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 1 }}>
            {session.blocs.length} bloc{session.blocs.length !== 1 ? "s" : ""} · {totalExercices(session)} exercice{totalExercices(session) !== 1 ? "s" : ""}
            {session.multi_semaine && session.nb_semaines ? ` · ${session.nb_semaines} sem.` : ""}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><Pencil size={12} /></button>

          <button
            onClick={onOpenWeekDrawer}
            title="Prévu / Réalisé / S+1"
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + VIOLET + "50", background: VIOLET_S, color: VIOLET, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><BarChart2 size={12} /></button>

          <button
            onClick={() => { setShowPlace(p => !p); setShowDuplicate(false) }}
            title="Placer dans le planning"
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: showPlace ? VIOLET_S : "transparent", color: showPlace ? VIOLET : C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
          ></button>

          <button
            onClick={() => { setShowDuplicate(p => !p); setShowPlace(false) }}
            title="Dupliquer chez un autre athlète"
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: showDuplicate ? VIOLET_S : "transparent", color: showDuplicate ? VIOLET : C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><Copy size={12} /></button>

          {confirmDelete ? (
            <>
              <button
                onClick={onDelete}
                style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: C.rV, color: "#0E0C0A", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}
              >Supprimer</button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              ><X size={12} /></button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.r + "40", background: C.rS, color: C.r, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><X size={12} /></button>
          )}
        </div>

        {/* Expand chevron */}
        <div style={{ color: C.tx3, flexShrink: 0 }}>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Place panel */}
      {showPlace && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid " + C.brdL, background: C.s2 }}>
          <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Placer dans le planning
          </div>
          {session.recurrence === 'weekly' && session.day_of_week !== undefined && cycleId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: C.tx3 }}>
                Récurrence hebdomadaire — génère une séance par semaine du cycle
              </div>
              <button
                onClick={async () => {
                  if (!athleteId || !user?.id) return
                  await placeSession.mutateAsync({
                    session,
                    athleteId,
                    coachId: user.id,
                    date: placeDate,
                    cycleId,
                  })
                  setShowPlace(false)
                }}
                disabled={placeSession.isPending}
                style={{ padding: "10px 0", borderRadius: 4, border: "none", background: VIOLET, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                {placeSession.isPending ? "En cours…" : "Générer tout le cycle ▶"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={placeDate}
                onChange={e => setPlaceDate(e.target.value)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }}
              />
              <button
                onClick={async () => {
                  if (!athleteId || !user?.id || !placeDate) return
                  await placeSession.mutateAsync({
                    session,
                    athleteId,
                    coachId: user.id,
                    date: placeDate,
                    cycleId,
                  })
                  setShowPlace(false)
                }}
                disabled={placeSession.isPending}
                style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: VIOLET, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                {placeSession.isPending ? "…" : "Placer"}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowPlace(false)}
            style={{ width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Duplicate panel */}
      {showDuplicate && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid " + C.brdL, background: C.s2 }}>
          <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Dupliquer chez un athlète
          </div>
          {targetAthletes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.tx3, padding: "6px 0" }}>Aucun autre athlète disponible</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {targetAthletes.map(a => (
                <button
                  key={a.id}
                  disabled={duplicateSession.isPending}
                  onClick={async () => {
                    await duplicateSession.mutateAsync({ session, targetAthleteId: a.id })
                    setShowDuplicate(false)
                    toast.success(`"${session.name || session.short}" dupliquée chez ${a.full_name} — place-la dans un cycle depuis sa programmation`)
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                    padding: "8px 10px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s1, color: C.tx,
                    fontSize: 12, fontWeight: 600, cursor: duplicateSession.isPending ? "not-allowed" : "pointer",
                    fontFamily: "inherit", opacity: duplicateSession.isPending ? 0.6 : 1,
                  }}
                >
                  <Copy size={11} style={{ color: VIOLET, flexShrink: 0 }} />
                  {a.id === profile?.id ? `Moi — ${a.full_name}` : a.full_name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowDuplicate(false)}
            style={{ width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Expanded: SessionBlocEditor */}
      {isOpen && (
        <div style={{ borderTop: "1px solid " + C.brdL, padding: "0 14px 14px" }}>
          <SessionBlocEditor
            session={session}
            cycleId={cycleId}
            athleteId={athleteId}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  )
}

interface SortableSessionCardProps extends SessionCardProps {
  // inherits all from SessionCardProps
}

function SortableSessionCard(props: SortableSessionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.session.id })
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
      <SessionCard
        {...props}
        dragHandleProps={listeners as Record<string, unknown>}
      />
    </div>
  )
}

export function ProgrammationView({ athleteId, cycleId }: ProgrammationViewProps) {
  const { data: serverSessions = [], isLoading } = useProgrammation(athleteId)
  const updateMutation = useUpdateProgrammation(athleteId)
  const [sessions, setSessions] = useState<ProgSession[]>([])
  const [isAddingSession, setIsAddingSession] = useState(false)
  const [showSessionBank, setShowSessionBank] = useState(false)
  // Modèle choisi dans la banque : SessionForm pré-rempli, blocs copiés à la validation
  const [bankTemplate, setBankTemplate] = useState<ProgSession | null>(null)
  const { user } = useAuth()
  const { data: bankSessions = [] } = useSessionBank(user?.id)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [weekDrawerSession, setWeekDrawerSession] = useState<ProgSession | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const hasPendingSave = useRef(false)

  // Sync from server only when no local pending changes
  useEffect(() => {
    if (!hasPendingSave.current) {
      setSessions(prev => {
        if (JSON.stringify(prev) === JSON.stringify(serverSessions)) return prev;
        return serverSessions;
      });
    }
  }, [serverSessions])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function debouncedSave(updated: ProgSession[]) {
    hasPendingSave.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate(updated)
      hasPendingSave.current = false
    }, 800)
  }

  function addSession(data: Omit<ProgSession, 'id' | 'blocs'>) {
    const newSession: ProgSession = {
      ...data,
      id: crypto.randomUUID(),
      blocs: bankTemplate ? prepareSession(bankTemplate).blocs : [],
    }
    setBankTemplate(null)
    const next = [...sessions, newSession]
    setSessions(next)
    updateMutation.mutate(next)
    setIsAddingSession(false)
    setOpenSessionId(newSession.id)
  }

  function updateSessionMeta(id: string, data: Omit<ProgSession, 'id' | 'blocs'>) {
    const next = sessions.map(s => s.id === id ? { ...s, ...data } : s)
    setSessions(next)
    updateMutation.mutate(next)
    setEditingSessionId(null)
  }

  function updateSessionContent(id: string, updated: ProgSession) {
    const next = sessions.map(s => s.id === id ? updated : s)
    setSessions(next)    // immediate local update → immediate re-render
    debouncedSave(next)  // async debounced save (800ms)
  }

  function deleteSession(id: string) {
    const next = sessions.filter(s => s.id !== id)
    setSessions(next)
    updateMutation.mutate(next)
    if (openSessionId === id) setOpenSessionId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const list = [...sessions]
    const from = list.findIndex(s => s.id === active.id)
    const to = list.findIndex(s => s.id === over.id)
    if (from === -1 || to === -1) return
    list.splice(to, 0, list.splice(from, 1)[0])
    const reordered = list
    setSessions(reordered)
    updateMutation.mutate(reordered)
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => { setShowSessionBank(p => !p); setIsAddingSession(false); setBankTemplate(null) }}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 16px", borderRadius: 4,
            border: "1px solid " + (showSessionBank ? VIOLET : C.brdL),
            background: showSessionBank ? VIOLET + "0F" : "transparent",
            color: showSessionBank ? VIOLET : C.tx3,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Library size={13} />
          Depuis la banque
        </button>
        <button
          onClick={() => { setIsAddingSession(true); setEditingSessionId(null); setShowSessionBank(false); setBankTemplate(null) }}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 16px", borderRadius: 4,
            border: "none", background: VIOLET, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Plus size={13} />
          Créer une séance
        </button>
      </div>

      {/* Session bank picker */}
      {showSessionBank && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 4, border: "1px solid " + VIOLET + "40", background: VIOLET + "08" }}>
          <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Séances de la banque
          </div>
          {bankSessions.length === 0 ? (
            <div style={{ fontSize: 12, color: C.tx3, padding: "4px 0 8px" }}>
              Aucune séance enregistrée — utilise « Enregistrer la séance dans la banque » dans une séance, ou Bibliothèque → Musculaire → Séances.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {bankSessions.map(t => {
                const nbEx = totalExercices(t)
                return (
                  <button
                    key={t.id}
                    onClick={() => { setBankTemplate(t); setShowSessionBank(false); setIsAddingSession(true); setEditingSessionId(null) }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                      padding: "9px 10px", borderRadius: 4,
                      border: "1px solid " + C.brdL, background: C.s1, color: C.tx,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.name || "Séance sans nom"}
                    </span>
                    <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>
                      {t.blocs.length} bloc{t.blocs.length !== 1 ? "s" : ""} · {nbEx} ex.
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={() => setShowSessionBank(false)}
            style={{ width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Add session inline form (blank, or pre-filled from a bank template) */}
      {isAddingSession && (
        <SessionForm
          key={bankTemplate?.id ?? "blank"}
          initial={bankTemplate ?? undefined}
          onSubmit={addSession}
          onCancel={() => { setIsAddingSession(false); setBankTemplate(null) }}
        />
      )}

      {/* Empty state */}
      {!isAddingSession && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Aucune séance</div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 20 }}>
            Crée ta première séance pour commencer à programmer.
          </div>
          <button
            onClick={() => setIsAddingSession(true)}
            style={{
              padding: "10px 22px", borderRadius: 4,
              border: "none", background: VIOLET, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Plus size={14} />
            Créer une séance
          </button>
        </div>
      )}

      {/* Sessions list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sessions.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sessions.map(session => {
            // If this session is being edited (meta), show inline form instead of card
            if (editingSessionId === session.id) {
              return (
                <div key={session.id} style={{ marginBottom: 8 }}>
                  <SessionForm
                    initial={session}
                    onSubmit={data => updateSessionMeta(session.id, data)}
                    onCancel={() => setEditingSessionId(null)}
                  />
                </div>
              )
            }

            return (
              <SortableSessionCard
                key={session.id}
                session={session}
                isOpen={openSessionId === session.id}
                cycleId={cycleId}
                athleteId={athleteId}
                onToggle={() => setOpenSessionId(openSessionId === session.id ? null : session.id)}
                onEdit={() => {
                  setEditingSessionId(session.id)
                  setIsAddingSession(false)
                }}
                onDelete={() => deleteSession(session.id)}
                onChange={updated => updateSessionContent(session.id, updated)}
                onOpenWeekDrawer={() => setWeekDrawerSession(session)}
              />
            )
          })}
        </SortableContext>
      </DndContext>

      {weekDrawerSession && (
        <ProgSessionWeekDrawer
          session={weekDrawerSession}
          cycleId={cycleId}
          athleteId={athleteId}
          onChange={updated => updateSessionContent(weekDrawerSession.id, updated)}
          onClose={() => setWeekDrawerSession(null)}
        />
      )}
    </div>
  )
}
