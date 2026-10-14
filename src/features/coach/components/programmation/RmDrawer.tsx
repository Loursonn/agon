import { useState } from "react"
import { C } from "@/lib/theme"
import { X, Plus } from "lucide-react"
import { useExerciceRM } from "./hooks/useExerciceRM"
import { useAddPRLog, epley1RM } from "@/features/shared/hooks/usePRLogs"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { localISO } from "@/lib/date";

const VIOLET = "#FFC933"

interface RmDrawerProps {
  open: boolean
  onClose: () => void
  exerciseName: string
  athleteId: string | undefined
}

export function RmDrawer({ open, onClose, exerciseName, athleteId }: RmDrawerProps) {
  const { history, isLoading } = useExerciceRM(athleteId, exerciseName)
  const addPR = useAddPRLog()
  const [newKg, setNewKg] = useState("")
  const [newReps, setNewReps] = useState("1")

  if (!open) return null

  async function handleAdd() {
    const kg = parseFloat(newKg)
    const reps = parseInt(newReps, 10)
    if (!kg || !reps || !athleteId) return
    await addPR.mutateAsync({
      athleteId,
      exercise_ref: exerciseName,
      kg: reps === 1 ? kg : epley1RM(kg, reps),
      date: localISO(),
      source: "manual",
      source_reps: reps,
      source_kg: kg,
    })
    setNewKg("")
    setNewReps("1")
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)" }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
          width: "min(360px, 92vw)", background: C.s1,
          borderLeft: "1px solid " + C.brdL, padding: "20px 16px",
          display: "flex", flexDirection: "column", gap: 16,
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{exerciseName}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>Historique 1RM</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Add new */}
        <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + C.brdL }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: VIOLET, marginBottom: 8 }}>Ajouter un 1RM</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: C.tx3, display: "block", marginBottom: 3 }}>Charge (kg)</label>
              <input
                type="number"
                value={newKg}
                onChange={e => setNewKg(e.target.value)}
                placeholder="ex: 100"
                style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.tx3, display: "block", marginBottom: 3 }}>Reps</label>
              <input
                type="number"
                value={newReps}
                onChange={e => setNewReps(e.target.value)}
                min={1}
                style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
          {newKg && parseInt(newReps, 10) > 1 && (
            <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>
              1RM estimé (Epley) : <span style={{ color: VIOLET, fontWeight: 700 }}>{epley1RM(parseFloat(newKg) || 0, parseInt(newReps, 10) || 1)} kg</span>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={!newKg || addPR.isPending}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 4,
              border: "none", background: VIOLET, color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              opacity: !newKg || addPR.isPending ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Plus size={13} />
            Enregistrer
          </button>
        </div>

        {/* History */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Historique
          </div>
          {isLoading ? (
            <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", padding: "20px 0" }}>Chargement…</div>
          ) : history.length === 0 ? (
            <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", padding: "20px 0" }}>Aucun 1RM enregistré</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {history.map(pr => (
                <div
                  key={pr.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s2,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: VIOLET }}>{pr.kg} kg</div>
                    {pr.source_reps && pr.source_reps > 1 && pr.source_kg && (
                      <div style={{ fontSize: 10, color: C.tx3 }}>
                        {pr.source_kg} kg × {pr.source_reps} reps (Epley)
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.tx3 }}>
                      {format(new Date(pr.date), "d MMM yyyy", { locale: fr })}
                    </div>
                    {pr.source === "manual" && (
                      <div style={{ fontSize: 9, color: C.tx3 }}>Manuel</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
