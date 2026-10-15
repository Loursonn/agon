import { useState, useRef, useEffect } from "react"
import { C } from "@/lib/theme"
import { Plus, Pencil, X } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import type { ProgSession } from "./types"
import { SessionForm } from "./SessionForm"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { useSessionBank, useUpdateSessionBank } from "./hooks/useSessionBank"
import { CardSkeleton } from "@/features/shared/components/skeletons"
import { toast } from "sonner"
import ImportMuscuTextDialog from "../import/ImportMuscuTextDialog"
import ImportReportPanel from "../import/ImportReportPanel"
import { scrollToStep } from "../import/ImportIssueList"
import type { ImportIssue } from "@/lib/import/yoxx/common"

const VIOLET = "#FFC933"

function totalExercices(session: ProgSession): number {
  return session.blocs.reduce((sum, b) => sum + b.exercices.length, 0)
}

/**
 * Banque de séances musculaires du coach.
 * Alimentée depuis la programmation athlète (Enregistrer la séance dans la banque)
 * ou créée ici ; réutilisable via Programmation → Depuis la banque.
 */
export function SessionBankView() {
  const { user } = useAuth()
  const coachId = user?.id
  const { data: serverSessions = [], isLoading } = useSessionBank(coachId)
  const updateMutation = useUpdateSessionBank(coachId)

  const [sessions, setSessions] = useState<ProgSession[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showTextImport, setShowTextImport] = useState(false)
  const [importReport, setImportReport] = useState<{ sessionId: string; issues: ImportIssue[] } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const hasPendingSave = useRef(false)

  useEffect(() => {
    if (!hasPendingSave.current) {
      setSessions(serverSessions)
    }
  }, [serverSessions])

  function debouncedSave(updated: ProgSession[]) {
    hasPendingSave.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate(updated)
      hasPendingSave.current = false
    }, 800)
  }

  function addSession(data: Omit<ProgSession, 'id' | 'blocs'>) {
    const newSession: ProgSession = { ...data, id: crypto.randomUUID(), blocs: [] }
    const next = [...sessions, newSession]
    setSessions(next)
    updateMutation.mutate(next)
    setIsAdding(false)
    setOpenId(newSession.id)
  }

  function handleTextImport(session: ProgSession, issues: ImportIssue[]) {
    const next = [...sessions, session]
    setSessions(next)
    updateMutation.mutate(next)
    setShowTextImport(false)
    setOpenId(session.id)
    const shown = issues.filter(i => i.level !== "info")
    setImportReport(shown.length ? { sessionId: session.id, issues: shown } : null)
    toast.success(`Séance "${session.name}" ajoutée à la banque`)
  }

  function updateMeta(id: string, data: Omit<ProgSession, 'id' | 'blocs'>) {
    const next = sessions.map(s => s.id === id ? { ...s, ...data } : s)
    setSessions(next)
    updateMutation.mutate(next)
    setEditingMetaId(null)
  }

  function updateContent(id: string, updated: ProgSession) {
    const next = sessions.map(s => s.id === id ? updated : s)
    setSessions(next)
    debouncedSave(next)
  }

  function deleteSession(id: string) {
    // Annule une sauvegarde différée en attente : elle réécrirait la séance supprimée
    clearTimeout(saveTimer.current)
    hasPendingSave.current = false
    const next = sessions.filter(s => s.id !== id)
    setSessions(next)
    updateMutation.mutate(next)
    if (openId === id) setOpenId(null)
    setConfirmDeleteId(null)
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  const iconBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.brdL,
    background: "transparent", color: C.tx3, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.tx3 }}>
          Séances réutilisables (Programmation → Depuis la banque)
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => setShowTextImport(true)}
          title="Coller une séance écrite au format YOXX"
          style={{
            padding: "8px 16px", borderRadius: 4,
            border: "1px solid " + C.ac + "40", background: C.ac + "12", color: C.ac,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Importer un texte
        </button>
        <button
          onClick={() => setIsAdding(true)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 16px", borderRadius: 4,
            border: "none", background: VIOLET, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          <Plus size={13} />
          Créer une séance
        </button>
        </div>
      </div>

      {showTextImport && (
        <ImportMuscuTextDialog
          onImport={handleTextImport}
          onClose={() => setShowTextImport(false)}
          importLabel="Ajouter à la banque"
        />
      )}

      {importReport && (
        <ImportReportPanel
          issues={importReport.issues}
          onClose={() => setImportReport(null)}
          onSelect={(id) => {
            setOpenId(importReport.sessionId)
            setTimeout(() => { if (!scrollToStep(id)) toast.info("Exercice introuvable (déjà modifié ou supprimé)") }, 150)
          }}
        />
      )}

      {isAdding && <SessionForm onSubmit={addSession} onCancel={() => setIsAdding(false)} />}

      {!isAdding && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Aucune séance enregistrée</div>
          <div style={{ fontSize: 12, color: C.tx3 }}>
            Depuis la programmation d'un athlète : « Enregistrer la séance dans la banque ».
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sessions.map(session => {
          if (editingMetaId === session.id) {
            return (
              <SessionForm
                key={session.id}
                initial={session}
                onSubmit={data => updateMeta(session.id, data)}
                onCancel={() => setEditingMetaId(null)}
              />
            )
          }
          const isOpen = openId === session.id
          const nbEx = totalExercices(session)
          return (
            <div key={session.id} style={{ borderRadius: 6, border: "1px solid " + (isOpen ? VIOLET : C.brdL), background: C.s1, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                <button
                  onClick={() => setOpenId(isOpen ? null : session.id)}
                  style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? VIOLET : C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.name || "Séance sans nom"}
                  </div>
                  <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                    {session.blocs.length} bloc{session.blocs.length !== 1 ? "s" : ""} · {nbEx} exercice{nbEx !== 1 ? "s" : ""}
                    {session.multi_semaine && ` · ${session.nb_semaines ?? "?"} semaines`}
                  </div>
                </button>
                <button onClick={() => { setEditingMetaId(session.id); setIsAdding(false) }} title="Modifier" style={iconBtn}>
                  <Pencil size={11} />
                </button>
                {confirmDeleteId === session.id ? (
                  <>
                    <button
                      onClick={() => deleteSession(session.id)}
                      style={{ padding: "0 8px", height: 26, borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}
                    >Supprimer</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={iconBtn}><X size={11} /></button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(session.id)}
                    title="Supprimer"
                    style={{ ...iconBtn, border: "1px solid " + C.r + "40", background: C.rS, color: C.r }}
                  ><X size={11} /></button>
                )}
              </div>
              {isOpen && (
                <div style={{ padding: "0 12px 4px", borderTop: "1px solid " + C.brdL }}>
                  <SessionBlocEditor
                    session={session}
                    cycleId={undefined}
                    athleteId={coachId}
                    onChange={updated => updateContent(session.id, updated)}
                    bankActions={false}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
