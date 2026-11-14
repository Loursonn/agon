import { cn } from "@/lib/utils"
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
    return <span className="text-[9px] text-agon-tx3">Muscles non définis</span>
  }
  return (
    <>
      {muscles.primary.map((m) => (
        <span key={m} className="rounded-[4px] px-1.5 py-px text-[9px] font-extrabold" style={{ background: getMC(m) + "30", color: getMC(m) }}>
          {mL(m)}
        </span>
      ))}
      {muscles.secondary.map((m) => (
        <span key={m} className="rounded-[4px] border border-dashed bg-transparent px-1.5 py-px text-[9px] font-semibold" style={{ borderColor: getMC(m) + "70", color: getMC(m) }}>
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
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
          Muscles travaillés
        </div>
        {overridden && (
          <button
            onClick={() => { const { muscles: _drop, ...rest } = exercice; onChange(rest as Exercice) }}
            className="cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold text-agon-coach"
          >
            Revenir à la banque
          </button>
        )}
      </div>
      <div className="mb-2 text-[10px] text-agon-tx3">
        Clique : 1er clic = principal (max {MAX_PRIMARY_MUSCLES}, compte 1 série) · 2e clic = secondaire (compte {formatSets(SECONDARY_FACTOR)}) · 3e clic = retirer.
        {!overridden && " Valeurs de la banque."}
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {PICKABLE.map((id) => {
          const role = roleOf(current, id)
          const color = getMC(id)
          return (
            <button
              key={id}
              onClick={() => set(nextMuscles(current, id))}
              title={role === "primary" ? "Principal" : role === "secondary" ? "Secondaire" : "Non travaillé"}
              className={cn(
                "cursor-pointer rounded-[6px] border px-[9px] py-[3px] text-[10px]",
                role ? "font-bold" : "border-agon-brd-l bg-transparent font-medium text-agon-tx3",
                role === "secondary" && "border-dashed bg-transparent",
              )}
              style={role ? { borderColor: color, color, background: role === "primary" ? color + "35" : undefined } : undefined}
            >
              {mL(id)}{role === "primary" ? " ●" : role === "secondary" ? " ◐" : ""}
            </button>
          )
        })}
      </div>
    </div>
  )
}
