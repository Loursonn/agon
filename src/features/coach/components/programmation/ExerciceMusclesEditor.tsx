import { C } from "@/lib/theme"
import { getMC, mL, MTREE } from "@/lib/muscles"
import { MAX_PRIMARY_MUSCLES, SECONDARY_FACTOR, formatSets, resolveMuscles } from "@/lib/muscleVolume"
import type { Exercice, ExerciceMuscles } from "./types"
import { useExerciseBankMuscles } from "./hooks/useExerciseBankMuscles"

/** Muscles sélectionnables : sous-muscles quand ils existent, sinon le groupe. */
const PICKABLE = MTREE.flatMap((g) => (g.s.length ? g.s.map((s) => s.id) : [g.id]))

type Role = "primary" | "secondary" | null

function roleOf(m: ExerciceMuscles, id: string): Role {
  return m.primary.includes(id) ? "primary" : m.secondary.includes(id) ? "secondary" : null
}

/** Cycle d'un clic : aucun → principal (2 max) → secondaire → aucun. */
function nextMuscles(m: ExerciceMuscles, id: string): ExerciceMuscles {
  const role = roleOf(m, id)
  const without = {
    primary: m.primary.filter((x) => x !== id),
    secondary: m.secondary.filter((x) => x !== id),
  }
  if (role === null) {
    return m.primary.length < MAX_PRIMARY_MUSCLES
      ? { ...without, primary: [...without.primary, id] }
      : { ...without, secondary: [...without.secondary, id] }
  }
  if (role === "primary") return { ...without, secondary: [...without.secondary, id] }
  return without
}

interface MuscleChipsProps {
  muscles: ExerciceMuscles
}

/** Lecture seule : principaux en plein, secondaires atténués. */
export function MuscleChips({ muscles }: MuscleChipsProps) {
  if (!muscles.primary.length && !muscles.secondary.length) {
    return <span style={{ fontSize: 9, color: C.tx3 }}>Muscles non définis</span>
  }
  return (
    <>
      {muscles.primary.map((m) => (
        <span key={m} style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: getMC(m) + "30", color: getMC(m) }}>
          {mL(m)}
        </span>
      ))}
      {muscles.secondary.map((m) => (
        <span key={m} style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "transparent", border: "1px dashed " + getMC(m) + "70", color: getMC(m) }}>
          {mL(m)}
        </span>
      ))}
    </>
  )
}

interface ExerciceMusclesEditorProps {
  exercice: Exercice
  onChange: (updated: Exercice) => void
}

/**
 * Voir / modifier les muscles d'un exercice du programme. Par défaut ils
 * viennent de la banque ; toute modification ici ne vaut que pour cet exercice
 * dans ce programme, la banque n'est pas touchée.
 */
export function ExerciceMusclesEditor({ exercice, onChange }: ExerciceMusclesEditorProps) {
  const { data: bank } = useExerciseBankMuscles()
  const bankMap = bank ?? new Map()
  const current = resolveMuscles(exercice, bankMap)
  const overridden = !!exercice.muscles

  const set = (m: ExerciceMuscles) => onChange({ ...exercice, muscles: m })

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Muscles travaillés
        </div>
        {overridden && (
          <button
            onClick={() => { const { muscles: _drop, ...rest } = exercice; onChange(rest as Exercice) }}
            style={{ background: "none", border: "none", color: C.coach, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            Revenir à la banque
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>
        Clique : 1er clic = principal (max {MAX_PRIMARY_MUSCLES}, compte 1 série) · 2e clic = secondaire (compte {formatSets(SECONDARY_FACTOR)}) · 3e clic = retirer.
        {!overridden && " Valeurs de la banque."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {PICKABLE.map((id) => {
          const role = roleOf(current, id)
          const color = getMC(id)
          return (
            <button
              key={id}
              onClick={() => set(nextMuscles(current, id))}
              title={role === "primary" ? "Principal" : role === "secondary" ? "Secondaire" : "Non travaillé"}
              style={{
                fontSize: 10, fontWeight: role ? 700 : 500, padding: "3px 9px", borderRadius: 6,
                cursor: "pointer", fontFamily: "inherit",
                border: role === "secondary" ? "1px dashed " + color : "1px solid " + (role ? color : C.brdL),
                background: role === "primary" ? color + "35" : "transparent",
                color: role ? color : C.tx3,
              }}
            >
              {mL(id)}{role === "primary" ? " ●" : role === "secondary" ? " ◐" : ""}
            </button>
          )
        })}
      </div>
    </div>
  )
}
