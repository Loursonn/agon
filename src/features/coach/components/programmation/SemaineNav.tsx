import { cn } from "@/lib/utils";
import { useCycleWeeks } from "./hooks/useProgramCycles"
import { Copy } from "lucide-react"

const PILL = "cursor-pointer rounded-[6px] border px-2.5 py-1 text-[11px]"

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
    <div className="flex items-center gap-1.5 pt-2">
      <div className="flex flex-1 flex-wrap gap-1">
        {Array.from({ length: count }).map((_, i) => {
          const week = i + 1
          const active = activeWeek === week
          return (
            <button
              key={week}
              onClick={() => onWeekChange(week)}
              className={cn(
                PILL, "[transition:all_120ms]",
                active ? "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent" : "border-agon-brd-l bg-transparent font-medium text-agon-tx3",
              )}
            >
              S{week}
            </button>
          )
        })}
      </div>
      <button
        onClick={onDuplicateWeek}
        className={cn(PILL, "flex shrink-0 items-center gap-1 border-agon-brd-l bg-transparent font-semibold text-agon-tx3")}
      >
        <Copy size={11} />
        Dupliquer sem.
      </button>
    </div>
  )
}
