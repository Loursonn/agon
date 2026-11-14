import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { getMC, mL, MTREE } from "@/lib/muscles"
import { formatSets, rollUpToGroups, SECONDARY_FACTOR, type WeekVolume } from "@/lib/muscleVolume"
import { localISO } from "@/lib/date"

interface MuscleVolumePanelProps {
  /** Lundis des semaines, dans l'ordre */
  weeks: string[]
  byWeek: Record<string, WeekVolume>
  isLoading?: boolean
  /** Affiche « réalisé / prévu » (vue Retours) au lieu du seul prévu. */
  showDone?: boolean
  title?: string
}

/** Séries pondérées au-delà desquelles la cellule est à pleine intensité. */
const FULL_HEAT = 20

const STICKY = "sticky left-0 bg-agon-s1"
const EMPTY = "py-4 text-center text-[12px] text-agon-tx3"

const GROUP_ORDER = MTREE.map((g) => g.id)

function weekLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
}

/**
 * Séries par muscle et par semaine : une ligne par muscle, une colonne par
 * semaine civile. Principal = 1 série, secondaire = 0,5 (2 séries pour en
 * faire 1). Partagé entre la vue Programmation (prévu) et Retours (prévu +
 * terminé).
 */
export function MuscleVolumePanel({ weeks, byWeek, isLoading, showDone = false, title = "Séries par muscle et par semaine" }: MuscleVolumePanelProps) {
  const [showSubs, setShowSubs] = useState(false)
  const currentWeek = useMemo(() => {
    const today = localISO(new Date())
    return [...weeks].reverse().find((w) => w <= today)
  }, [weeks])

  const rows = useMemo(() => {
    const perWeek = weeks.map((w) => (showSubs ? byWeek[w] ?? {} : rollUpToGroups(byWeek[w] ?? {})))
    const ids = new Set<string>()
    perWeek.forEach((wv) => Object.keys(wv).forEach((id) => ids.add(id)))
    const total = (id: string) => perWeek.reduce((a, wv) => a + (wv[id]?.planned ?? 0), 0)
    const rank = (id: string) => {
      const g = MTREE.find((x) => x.id === id || x.s.some((s) => s.id === id))
      return GROUP_ORDER.indexOf(g?.id ?? id)
    }
    return {
      perWeek,
      ids: [...ids].sort((a, b) => (showSubs ? rank(a) - rank(b) || a.localeCompare(b) : total(b) - total(a))),
    }
  }, [weeks, byWeek, showSubs])

  const weekTotals = useMemo(
    () => rows.perWeek.map((wv) => Object.values(wv).reduce((a, c) => a + c.planned, 0)),
    [rows],
  )

  return (
    <div className="mt-4 rounded-[6px] border border-agon-brd bg-agon-s1 p-3.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">{title}</div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-agon-tx2">
          <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} className="accent-agon-coach" />
          Détail des sous-muscles
        </label>
      </div>
      <div className="mb-3 text-[11px] text-agon-tx3">
        Muscle principal = 1 série · muscle secondaire = {formatSets(SECONDARY_FACTOR)} série (2 séries pour en faire 1)
        {showDone && " · terminé / prévu"}
      </div>

      {isLoading ? (
        <div className={EMPTY}>Calcul du volume…</div>
      ) : rows.ids.length === 0 ? (
        <div className={EMPTY}>
          Aucune série planifiée sur cette période. Place tes séances dans le calendrier pour voir le volume.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-[3px] text-[12px]">
            <thead>
              <tr>
                <th className={cn(STICKY, "pb-1 pr-1.5 text-left text-[10px] font-semibold text-agon-tx3")}>Muscle</th>
                {weeks.map((w, i) => (
                  <th
                    key={w}
                    title={`Semaine du ${weekLabel(w)}`}
                    className={cn(
                      "px-0.5 pb-1 text-center text-[10px] font-semibold",
                      showDone ? "min-w-[54px]" : "min-w-10",
                      w === currentWeek ? "text-agon-coach" : "text-agon-tx3",
                    )}
                  >
                    S{i + 1}
                    <div className="text-[9px] font-normal opacity-80">{weekLabel(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.ids.map((id) => {
                const color = getMC(id)
                return (
                  <tr key={id}>
                    <td className={cn(STICKY, "whitespace-nowrap pr-1.5 font-semibold")} style={{ color }}>
                      {mL(id)}
                    </td>
                    {rows.perWeek.map((wv, i) => {
                      const cell = wv[id]
                      const planned = cell?.planned ?? 0
                      const heat = Math.min(planned / FULL_HEAT, 1)
                      return (
                        <td
                          key={weeks[i]}
                          title={cell ? `${mL(id)} · ${formatSets(planned)} séries prévues${showDone ? ` · ${formatSets(cell.done)} terminées` : ""}` : undefined}
                          className={cn(
                            "rounded-[4px] px-0.5 py-[5px] text-center font-bold tabular-nums",
                            planned ? "text-agon-tx" : "bg-agon-s2 text-agon-tx3",
                            weeks[i] === currentWeek && "outline outline-1 outline-agon-coach/[0.376]",
                          )}
                          style={planned ? { background: color + Math.round(18 + heat * 70).toString(16).padStart(2, "0") } : undefined}
                        >
                          {planned ? (showDone ? `${formatSets(cell.done)}/${formatSets(planned)}` : formatSets(planned)) : "·"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr>
                <td className={cn(STICKY, "pr-1.5 pt-1.5 font-bold text-agon-tx2")}>Total</td>
                {weekTotals.map((t, i) => (
                  <td key={weeks[i]} className="pt-1.5 text-center font-bold tabular-nums text-agon-tx2">
                    {t ? formatSets(t) : "·"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
