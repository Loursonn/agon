import { C } from "@/lib/theme"
import { useCycleWeeks } from "./hooks/useProgramCycles"
import { Copy } from "lucide-react"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

interface SemaineNavProps {
  cycleId: string | undefined
  activeWeek: number
  onWeekChange: (week: number) => void
  onDuplicateWeek: () => void
  /** Nombre de semaines à afficher quand il n'y a pas de cycle (ex. séance de la banque) */
  weekCount?: number
}

export function SemaineNav({ cycleId, activeWeek, onWeekChange, onDuplicateWeek, weekCount }: SemaineNavProps) {
  const { data: microcycles = [] } = useCycleWeeks(cycleId)

  // Occurrences : au moins les semaines du cycle, plus si des params existent au-delà
  const count = Math.max(microcycles.length, weekCount ?? 0, 1)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8 }}>
      <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
        {Array.from({ length: count }).map((_, i) => {
          const week = i + 1
          const active = activeWeek === week
          return (
            <button
              key={week}
              onClick={() => onWeekChange(week)}
              style={{
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid " + (active ? VIOLET : C.brdL),
                background: active ? VIOLET_S : "transparent",
                color: active ? VIOLET : C.tx3,
                fontSize: 11, fontWeight: active ? 700 : 500,
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 120ms",
              }}
            >
              S{week}
            </button>
          )
        })}
      </div>
      <button
        onClick={onDuplicateWeek}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: 6,
          border: "1px solid " + C.brdL, background: "transparent",
          color: C.tx3, fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        <Copy size={11} />
        Dupliquer sem.
      </button>
    </div>
  )
}
