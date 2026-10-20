/**
 * SessionEvolutionDrawer
 * Ouvre, depuis Retours, la vue Prévu / Réalisé / Séance +1 d'une séance de
 * programmation, positionnée sur l'occurrence cliquée. Les modifs de la
 * colonne « Séance +1 » sont enregistrées dans le modèle (asp:prog) : elles
 * valent pour les occurrences à venir.
 */
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { toast } from "sonner"
import { C } from "@/lib/theme"
import { QK } from "@/lib/queryKeys"
import { ProgSessionWeekDrawer } from "@/features/coach/components/programmation/ProgSessionWeekDrawer"
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation"
import { useUpdateProgrammation } from "@/features/coach/components/programmation/hooks/useUpdateProgrammation"
import type { ProgSession } from "@/features/coach/components/programmation/types"

interface Props {
  athleteId: string
  sessionId: string
  /** Occurrence cliquée (n-ième fois que la séance est planifiée) */
  occurrence: number
  onClose: () => void
}

export function SessionEvolutionDrawer({ athleteId, sessionId, occurrence, onClose }: Props) {
  const qc = useQueryClient()
  const { data: sessions, isSuccess, isLoading } = useProgrammation(athleteId)
  const updateMutation = useUpdateProgrammation(athleteId)
  const [draft, setDraft] = useState<ProgSession | null>(null)
  const pending = useRef<ProgSession | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const session = draft ?? sessions?.find(s => s.id === sessionId) ?? null

  function flush() {
    clearTimeout(timer.current)
    const updated = pending.current
    if (!updated) return
    pending.current = null
    // Ne jamais réécrire asp:prog à partir d'une lecture en erreur
    const latest = qc.getQueryData<ProgSession[]>(["asp-prog", athleteId])
    if (!latest) {
      toast.error("Programmation non chargée : modification non enregistrée")
      return
    }
    updateMutation.mutate(latest.map(s => s.id === updated.id ? updated : s), {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: QK.weeklyRetours() })
        qc.invalidateQueries({ queryKey: QK.monthlyRetours() })
      },
    })
  }

  function handleChange(updated: ProgSession) {
    setDraft(updated)
    pending.current = updated
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 800)
  }

  function handleClose() {
    flush()
    onClose()
  }

  // Fermeture par démontage (changement de semaine, navigation) : on enregistre
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return null

  if (!isSuccess || !session) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
        <div style={{ position: "relative", maxWidth: 360, width: "100%", background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "16px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.tx }}>Vue évolutive indisponible</span>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.tx3, cursor: "pointer", display: "flex" }}><X size={14} /></button>
          </div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
            {isSuccess
              ? "Cette séance n'existe plus dans la programmation de l'athlète."
              : "Impossible de charger la programmation."}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProgSessionWeekDrawer
      session={session}
      cycleId={undefined}
      athleteId={athleteId}
      onChange={handleChange}
      onClose={handleClose}
      initialWeek={occurrence}
    />
  )
}
