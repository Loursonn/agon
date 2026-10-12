import { useState } from "react"
import { toast } from "sonner"
import { C } from "@/lib/theme"
import { useAuth } from "@/hooks/useAuth"
import type { Bloc, ProgSession } from "./types"
import { useBlocBank, useUpdateBlocBank } from "./hooks/useBlocBank"
import { useSessionBank, useUpdateSessionBank } from "./hooks/useSessionBank"
import { hasMultiWeekParams, prepareBloc, prepareSession, type BankWeekMode } from "./bankUtils"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

export type SaveToBankTarget =
  | { kind: 'bloc'; bloc: Bloc }
  | { kind: 'session'; session: ProgSession }

interface SaveToBankDialogProps {
  target: SaveToBankTarget
  /** Semaine affichée dans l'éditeur — proposée si on n'enregistre qu'une semaine */
  activeWeek: number
  onClose: () => void
}

function option(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
    padding: "9px 12px", borderRadius: 4,
    border: "1px solid " + (active ? VIOLET : C.brdL),
    background: active ? VIOLET_S : "transparent",
    color: active ? VIOLET : C.tx2,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  }
}

/** Enregistre un bloc ou une séance de la programmation athlète dans la banque du coach. */
export function SaveToBankDialog({ target, activeWeek, onClose }: SaveToBankDialogProps) {
  const { user } = useAuth()
  const coachId = user?.id
  const { data: blocBank, isLoading: loadingBlocs } = useBlocBank(coachId)
  const { data: sessionBank, isLoading: loadingSessions } = useSessionBank(coachId)
  const updateBlocBank = useUpdateBlocBank(coachId)
  const updateSessionBank = useUpdateSessionBank(coachId)

  const blocs = target.kind === 'bloc' ? [target.bloc] : target.session.blocs
  const multiWeek = hasMultiWeekParams(blocs)

  const [name, setName] = useState(target.kind === 'bloc' ? target.bloc.name : target.session.name)
  const [weekMode, setWeekMode] = useState<BankWeekMode>('all')
  const [alsoBlocs, setAlsoBlocs] = useState(false)
  const [saving, setSaving] = useState(false)

  const loading = loadingBlocs || loadingSessions || !blocBank || !sessionBank

  async function handleSave() {
    if (loading || saving) return
    const finalName = name.trim() || (target.kind === 'bloc' ? "Bloc sans nom" : "Séance sans nom")
    setSaving(true)
    try {
      if (target.kind === 'bloc') {
        const bloc = { ...prepareBloc(target.bloc, weekMode), name: finalName, sort_order: blocBank.length }
        await updateBlocBank.mutateAsync([...blocBank, bloc])
        toast.success(`« ${finalName} » ajouté à la banque de blocs`)
      } else {
        const session = { ...prepareSession(target.session, weekMode), name: finalName }
        await updateSessionBank.mutateAsync([...sessionBank, session])
        if (alsoBlocs && target.session.blocs.length > 0) {
          const newBlocs = target.session.blocs.map((b, i) => ({
            ...prepareBloc(b, weekMode),
            sort_order: blocBank.length + i,
          }))
          await updateBlocBank.mutateAsync([...blocBank, ...newBlocs])
          toast.success(`« ${finalName} » et ${newBlocs.length} bloc${newBlocs.length > 1 ? "s" : ""} ajoutés à la banque`)
        } else {
          toast.success(`« ${finalName} » ajoutée à la banque de séances`)
        }
      }
      onClose()
    } catch {
      // Error toast already shown by the mutation
      setSaving(false)
    }
  }

  const title = target.kind === 'bloc' ? "Enregistrer le bloc dans la banque" : "Enregistrer la séance dans la banque"
  const nbBlocs = target.kind === 'session' ? target.session.blocs.length : 0

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL, padding: 20 }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>{title}</div>

        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Nom</div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
        />

        {multiWeek && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Semaines</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              <button onClick={() => setWeekMode('all')} style={option(weekMode === 'all')}>
                Toutes les semaines (progression complète)
              </button>
              <button onClick={() => setWeekMode(activeWeek)} style={option(weekMode === activeWeek)}>
                Semaine affichée seulement (S{activeWeek})
              </button>
            </div>
          </>
        )}

        {target.kind === 'session' && nbBlocs > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.tx2, cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={alsoBlocs} onChange={e => setAlsoBlocs(e.target.checked)} style={{ accentColor: VIOLET }} />
            Ajouter aussi ses {nbBlocs} bloc{nbBlocs > 1 ? "s" : ""} à la banque de blocs
          </label>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "none", background: VIOLET, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: loading || saving ? "default" : "pointer", opacity: loading || saving ? 0.6 : 1, fontFamily: "inherit" }}
          >{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  )
}
