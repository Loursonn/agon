import { useState, useRef, useEffect } from "react"
import { useIsMutating } from "@tanstack/react-query"
import { programKeys } from "@/api/program"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { Plus, Pencil, X, ChevronDown, ChevronUp, CalendarPlus, Copy, Library, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useProgrammation } from "./hooks/useProgrammation"
import { useUpdateProgrammation } from "./hooks/useUpdateProgrammation"
import ImportMuscuTextDialog from "../import/ImportMuscuTextDialog"
import ImportReportPanel from "../import/ImportReportPanel"
import { scrollToStep } from "../import/importIssues";
import type { ImportIssue } from "@/lib/import/yoxx/common"
import { useDuplicateProgSession } from "./hooks/useDuplicateProgSession"
import { useSessionBank, useUpdateSessionBank } from "./hooks/useSessionBank"
import { prepareSession } from "./bankUtils"
import { usePlaceSession } from "@/features/shared/hooks/usePlaceSession"
import { useAuth } from "@/hooks/useAuth"
import type { ProgSession } from "./types"
import { SessionForm } from "./SessionForm"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { CardSkeleton } from "@/features/shared/components/skeletons"
import { MuscleVolumePanel } from "./MuscleVolumePanel"
import { useMuscleVolume } from "./hooks/useMuscleVolume"
import { localISO } from "@/lib/date"

/** Bouton carré 32 px de la carte séance ; actif = aplat or 12 % (remplace le violet hérité). */
const ICON_BTN = "flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-agon-brd-l"
const ICON_IDLE = "bg-agon-bg/[0.45] text-agon-tx3"
const ICON_ON = "bg-agon-accent/[0.12] text-agon-accent"
const PANEL = "border-t border-agon-brd-l bg-agon-s2 px-3.5 py-2.5"
const PANEL_KICK = "mb-2 text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3"
const CANCEL_BTN = "mt-1.5 w-full cursor-pointer rounded-[7px] border border-agon-brd-l bg-transparent py-1.5 text-[11px] text-agon-tx3"
const DANGER_BTN = "shrink-0 cursor-pointer border-0 bg-agon-erreur-vif text-[11px] font-bold text-agon-ink"
const TOP_BTN = "flex h-[34px] cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[10px] text-[12px]"
const ACCENT_BTN = "cursor-pointer border-0 bg-agon-accent text-[12px] font-bold text-agon-tx"

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

interface ProgrammationViewProps {
  athleteId: string | undefined
  cycleId: string | undefined
  /** Période du cycle affiché (YYYY-MM-DD) pour le volume par muscle. Défaut : 6 semaines depuis aujourd'hui. */
  rangeStart?: string
  rangeEnd?: string
}

/** Séries par muscle et par semaine sur la période du cycle (prévu). */
function ProgrammationMuscleVolume({ athleteId, rangeStart, rangeEnd }: { athleteId: string | undefined; rangeStart?: string; rangeEnd?: string }) {
  const today = localISO(new Date())
  const end = rangeEnd ?? localISO(new Date(Date.now() + 35 * 86_400_000))
  const { weeks, byWeek, isLoading } = useMuscleVolume(athleteId, rangeStart ?? today, end)
  return <MuscleVolumePanel weeks={weeks} byWeek={byWeek} isLoading={isLoading} />
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
  dragHandleProps?: Record<string, unknown>
}

function SessionCard({ session, isOpen, cycleId, athleteId, onToggle, onEdit, onDelete, onChange, dragHandleProps }: SessionCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPlace, setShowPlace] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [placeDate, setPlaceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { user, profile, athletes, canCoachSelf } = useAuth()
  const placeSession = usePlaceSession()
  const duplicateSession = useDuplicateProgSession()

  // Own profile included first (coach / coach_athlete can duplicate for themselves), same pattern as ContextBar
  const targetAthletes = [
    ...(profile && canCoachSelf ? [profile] : []),
    ...athletes.filter(a => a.id !== profile?.id),
  ].filter(a => a.id !== athleteId)

  return (
    <div className={cn(
      "relative mb-2.5 overflow-hidden rounded-[14px] border [transition:border-color_150ms]",
      isOpen ? "border-agon-accent/60 bg-agon-accent/[0.12]" : "border-agon-brd bg-agon-s1",
    )}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", isOpen ? "bg-agon-accent" : "bg-agon-accent/50")} />
      {/* Card header (planche CoachProgrammation : 64 px) */}
      <div
        className="flex min-h-16 cursor-pointer items-center gap-3 pl-[19px] pr-4"
        onClick={onToggle}
      >
        {/* Drag handle */}
        <div
          {...(dragHandleProps ?? {})}
          onClick={e => e.stopPropagation()}
          className="flex shrink-0 cursor-grab items-center text-agon-tx3"
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
          <div className="agon-mono flex h-6 min-w-10 shrink-0 items-center justify-center rounded-[6px] border border-agon-brd-l bg-agon-s2 text-[11px] uppercase tracking-[0.08em] text-agon-tx">
            {DOW[session.day_of_week]}
          </div>
        ) : session.recurrence === 'once' ? (
          <div className="shrink-0 rounded-[6px] bg-agon-s2 px-2 py-[3px] text-[10px] font-bold text-agon-tx3">
            Ponct.
          </div>
        ) : null}

        {/* Short badge — hidden when no code defined */}
        {session.short && session.short !== "?" && (
          <div className="agon-mono flex h-6 shrink-0 items-center rounded-[6px] bg-agon-accent px-2 text-[11px] font-medium tracking-[0.06em] text-agon-ink">
            {session.short}
          </div>
        )}

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-agon-tx">
            {session.name || "Séance sans nom"}
          </div>
          <div className="agon-mono mt-0.5 text-[11px] text-agon-tx2">
            {session.blocs.length} bloc{session.blocs.length !== 1 ? "s" : ""} · {totalExercices(session)} exercice{totalExercices(session) !== 1 ? "s" : ""}
            {session.multi_semaine && session.nb_semaines ? ` · ${session.nb_semaines} sem.` : ""}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className={cn(ICON_BTN, ICON_IDLE)}
          ><Pencil size={12} /></button>

          <button
            onClick={() => { setShowPlace(p => !p); setShowDuplicate(false) }}
            title="Placer dans le planning"
            className={cn(ICON_BTN, "text-[12px]", showPlace ? ICON_ON : ICON_IDLE)}
          ><CalendarPlus size={12} /></button>

          <button
            onClick={() => { setShowDuplicate(p => !p); setShowPlace(false) }}
            title="Dupliquer chez un autre athlète"
            className={cn(ICON_BTN, showDuplicate ? ICON_ON : ICON_IDLE)}
          ><Copy size={12} /></button>

          {confirmDelete ? (
            <>
              <button
                onClick={onDelete}
                className={cn(DANGER_BTN, "rounded-[7px] px-2.5 py-1")}
              >Supprimer</button>
              <button
                onClick={() => setConfirmDelete(false)}
                className={cn(ICON_BTN, ICON_IDLE)}
              ><X size={12} /></button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-agon-erreur/55 bg-agon-erreur/[0.12] text-agon-erreur"
            ><X size={12} /></button>
          )}
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 text-agon-tx3">
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Place panel */}
      {showPlace && (
        <div className={PANEL}>
          <div className={PANEL_KICK}>
            Placer dans le planning
          </div>
          {session.recurrence === 'weekly' && session.day_of_week !== undefined && cycleId ? (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-agon-tx3">
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
                className={cn(ACCENT_BTN, "rounded-[4px] py-2.5")}
              >
                {placeSession.isPending ? "En cours…" : "Générer tout le cycle ▶"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={placeDate}
                onChange={e => setPlaceDate(e.target.value)}
                className="flex-1 rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-2 text-[13px] text-agon-tx outline-none"
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
                className={cn(ACCENT_BTN, "rounded-[4px] px-4 py-2")}
              >
                {placeSession.isPending ? "…" : "Placer"}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowPlace(false)}
            className={CANCEL_BTN}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Duplicate panel */}
      {showDuplicate && (
        <div className={PANEL}>
          <div className={PANEL_KICK}>
            Dupliquer chez un athlète
          </div>
          {targetAthletes.length === 0 ? (
            <div className="py-1.5 text-[12px] text-agon-tx3">Aucun autre athlète disponible</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {targetAthletes.map(a => (
                <button
                  key={a.id}
                  disabled={duplicateSession.isPending}
                  onClick={async () => {
                    await duplicateSession.mutateAsync({ session, targetAthleteId: a.id })
                    setShowDuplicate(false)
                    toast.success(`"${session.name || session.short}" dupliquée chez ${a.full_name} — place-la dans un cycle depuis sa programmation`)
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-2 text-left text-[12px] font-semibold text-agon-tx",
                    duplicateSession.isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  )}
                >
                  <Copy size={11} className="shrink-0 text-agon-accent" />
                  {a.id === profile?.id ? `Moi — ${a.full_name}` : a.full_name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowDuplicate(false)}
            className={CANCEL_BTN}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Expanded: SessionBlocEditor */}
      {isOpen && (
        <div className="border-t border-agon-brd-l px-3.5 pb-3.5">
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

/** Même contrat que `SessionCardProps` : le tri n'ajoute aucune prop. */
type SortableSessionCardProps = SessionCardProps;

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

export function ProgrammationView({ athleteId, cycleId, rangeStart, rangeEnd }: ProgrammationViewProps) {
  const { data: serverSessions = [], isLoading } = useProgrammation(athleteId)
  const updateMutation = useUpdateProgrammation(athleteId)
  const [sessions, setSessions] = useState<ProgSession[]>([])
  const [isAddingSession, setIsAddingSession] = useState(false)
  const [showSessionBank, setShowSessionBank] = useState(false)
  // Modèle choisi dans la banque : SessionForm pré-rempli, blocs copiés à la validation
  const [bankTemplate, setBankTemplate] = useState<ProgSession | null>(null)
  const { user } = useAuth()
  const { data: bankSessions = [] } = useSessionBank(user?.id)
  const updateBank = useUpdateSessionBank(user?.id)
  const [confirmBankDeleteId, setConfirmBankDeleteId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  // Import d'une séance au format texte YOXX
  const [showTextImport, setShowTextImport] = useState(false)
  const [importReport, setImportReport] = useState<{ sessionId: string; issues: ImportIssue[] } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const hasPendingSave = useRef(false)
  // Version serveur dont part l'état local : référence de chaque envoi. Une
  // séance modifiée ou ajoutée ailleurs depuis n'est ni écrasée ni supprimée.
  const baseRef = useRef<ProgSession[]>([])
  const saving = useIsMutating({ mutationKey: programKeys.sessions(athleteId) }) > 0

  // Reprend la version serveur seulement sans saisie en attente NI envoi en
  // cours (un rechargement en vol ramènerait l'état d'avant l'envoi).
  useEffect(() => {
    if (!hasPendingSave.current && !saving) {
      baseRef.current = serverSessions
      setSessions(prev => {
        if (JSON.stringify(prev) === JSON.stringify(serverSessions)) return prev;
        return serverSessions;
      });
    }
  }, [serverSessions, saving])

  /** Envoie tout de suite (annule la sauvegarde différée : `next` l'inclut déjà). */
  function send(next: ProgSession[]) {
    clearTimeout(saveTimer.current)
    hasPendingSave.current = false
    const base = baseRef.current
    baseRef.current = next
    updateMutation.mutate({ base, next })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function debouncedSave(updated: ProgSession[]) {
    hasPendingSave.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => send(updated), 800)
  }

  function addSession(data: Omit<ProgSession, 'id' | 'blocs'>) {
    const prepared = bankTemplate ? prepareSession(bankTemplate) : null
    const newSession: ProgSession = {
      ...data,
      id: crypto.randomUUID(),
      blocs: prepared ? prepared.blocs : [],
      ...(prepared?.fiches?.length ? { fiches: prepared.fiches } : {}),
    }
    setBankTemplate(null)
    const next = [...sessions, newSession]
    setSessions(next)
    send(next)
    setIsAddingSession(false)
    setOpenSessionId(newSession.id)
  }

  function handleTextImport(session: ProgSession, issues: ImportIssue[]) {
    const next = [...sessions, session]
    setSessions(next)
    send(next)
    setShowTextImport(false)
    setOpenSessionId(session.id)
    const shown = issues.filter(i => i.level !== "info")
    setImportReport(shown.length ? { sessionId: session.id, issues: shown } : null)
    const errors = shown.filter(i => i.level === "error").length
    if (errors > 0) toast.warning(`Séance "${session.name}" importée — ${errors} point${errors > 1 ? "s" : ""} à compléter`)
    else toast.success(`Séance "${session.name}" importée`)
  }

  function updateSessionMeta(id: string, data: Omit<ProgSession, 'id' | 'blocs'>) {
    const next = sessions.map(s => s.id === id ? { ...s, ...data } : s)
    setSessions(next)
    send(next)
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
    send(next)
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
    send(reordered)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {[1, 2].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div>
      {/* Top bar */}
      <div className="mb-3.5 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => { setShowSessionBank(p => !p); setIsAddingSession(false); setBankTemplate(null) }}
          className={cn(TOP_BTN, "border px-3.5", showSessionBank ? "border-agon-accent bg-agon-accent/[0.08] text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx2")}
        >
          <Library size={13} />
          Depuis la banque
        </button>
        <button
          onClick={() => { setShowTextImport(true); setIsAddingSession(false); setShowSessionBank(false) }}
          title="Coller une séance écrite au format YOXX"
          className={cn(TOP_BTN, "border border-agon-brd-l bg-transparent px-3.5 text-agon-tx2")}
        >
          Importer un texte
        </button>
        <button
          onClick={() => { setIsAddingSession(true); setEditingSessionId(null); setShowSessionBank(false); setBankTemplate(null) }}
          className="flex h-[34px] cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[10px] border-0 bg-agon-accent px-[18px] text-[11px] font-semibold uppercase text-agon-ink"
        >
          <Plus size={13} />
          Créer une séance
        </button>
      </div>

      {showTextImport && (
        <ImportMuscuTextDialog
          onImport={handleTextImport}
          onClose={() => setShowTextImport(false)}
          importLabel="Ajouter à la programmation"
        />
      )}

      {importReport && (
        <ImportReportPanel
          issues={importReport.issues}
          onClose={() => setImportReport(null)}
          onSelect={(id) => {
            setOpenSessionId(importReport.sessionId)
            setTimeout(() => { if (!scrollToStep(id)) toast.info("Exercice introuvable (déjà modifié ou supprimé)") }, 150)
          }}
        />
      )}

      {/* Session bank picker */}
      {showSessionBank && (
        <div className="mb-3 rounded-[4px] border border-agon-accent/25 bg-agon-accent/[0.031] p-2.5">
          <div className={PANEL_KICK}>
            Séances de la banque
          </div>
          {bankSessions.length === 0 ? (
            <div className="pb-2 pt-1 text-[12px] text-agon-tx3">
              Aucune séance enregistrée — utilise « Enregistrer la séance dans la banque » dans une séance, ou Bibliothèque → Musculaire → Séances.
            </div>
          ) : (
            <div className="flex flex-col gap-[5px]">
              {bankSessions.map(t => {
                const nbEx = totalExercices(t)
                const confirming = confirmBankDeleteId === t.id
                return (
                  <div key={t.id} className="flex items-center gap-[5px]">
                    <button
                      onClick={() => { setBankTemplate(t); setShowSessionBank(false); setIsAddingSession(true); setEditingSessionId(null) }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[9px] text-left text-[12px] font-semibold text-agon-tx"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {t.name || "Séance sans nom"}
                      </span>
                      <span className="shrink-0 text-[10px] text-agon-tx3">
                        {t.blocs.length} bloc{t.blocs.length !== 1 ? "s" : ""} · {nbEx} ex.
                      </span>
                    </button>
                    {confirming ? (
                      <>
                        <button
                          onClick={() => {
                            updateBank.mutate(bankSessions.filter(b => b.id !== t.id))
                            setConfirmBankDeleteId(null)
                            toast.success(`"${t.name || "Séance"}" retirée de la banque`)
                          }}
                          className={cn(DANGER_BTN, "h-[34px] rounded-[4px] px-2.5")}
                        >Supprimer</button>
                        <button
                          onClick={() => setConfirmBankDeleteId(null)}
                          title="Annuler"
                          className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-agon-tx3"
                        ><X size={12} /></button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmBankDeleteId(t.id)}
                        title="Supprimer de la banque"
                        aria-label={`Supprimer ${t.name || "la séance"} de la banque`}
                        className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-agon-erreur/25 bg-agon-erreur-doux text-agon-erreur"
                      ><Trash2 size={12} /></button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <button
            onClick={() => setShowSessionBank(false)}
            className={CANCEL_BTN}
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
        <div className="px-5 py-[50px] text-center">
          <div className="mb-3 text-[36px]"></div>
          <div className="mb-1 text-[15px] font-bold text-agon-tx">Aucune séance</div>
          <div className="mb-5 text-[12px] text-agon-tx3">
            Crée ta première séance pour commencer à programmer.
          </div>
          <button
            onClick={() => setIsAddingSession(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border-0 bg-agon-accent px-[22px] py-2.5 text-[13px] font-bold text-agon-tx"
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
                <div key={session.id} className="mb-2">
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
              />
            )
          })}
        </SortableContext>
      </DndContext>

      {sessions.length > 0 && (
        <ProgrammationMuscleVolume athleteId={athleteId} rangeStart={rangeStart} rangeEnd={rangeEnd} />
      )}
    </div>
  )
}
