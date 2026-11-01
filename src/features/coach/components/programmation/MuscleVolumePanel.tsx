import { useMemo, useState } from "react"
import { C } from "@/lib/theme"
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
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: 14, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.tx2, cursor: "pointer" }}>
          <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} style={{ accentColor: C.coach }} />
          Détail des sous-muscles
        </label>
      </div>
      <div style={{ fontSize: 11, color: C.tx3, marginBottom: 12 }}>
        Muscle principal = 1 série · muscle secondaire = {formatSets(SECONDARY_FACTOR)} série (2 séries pour en faire 1)
        {showDone && " · terminé / prévu"}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", color: C.tx3, fontSize: 12, padding: "16px 0" }}>Calcul du volume…</div>
      ) : rows.ids.length === 0 ? (
        <div style={{ textAlign: "center", color: C.tx3, fontSize: 12, padding: "16px 0" }}>
          Aucune série planifiée sur cette période. Place tes séances dans le calendrier pour voir le volume.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontWeight: 600, color: C.tx3, fontSize: 10, padding: "0 6px 4px 0", position: "sticky", left: 0, background: C.s1 }}>Muscle</th>
                {weeks.map((w, i) => (
                  <th
                    key={w}
                    title={`Semaine du ${weekLabel(w)}`}
                    style={{
                      fontWeight: 600, fontSize: 10, padding: "0 2px 4px", minWidth: showDone ? 54 : 40, textAlign: "center",
                      color: w === currentWeek ? C.coach : C.tx3,
                    }}
                  >
                    S{i + 1}
                    <div style={{ fontWeight: 400, fontSize: 9, opacity: 0.8 }}>{weekLabel(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.ids.map((id) => {
                const color = getMC(id)
                return (
                  <tr key={id}>
                    <td style={{ padding: "0 6px 0 0", whiteSpace: "nowrap", fontWeight: 600, color, position: "sticky", left: 0, background: C.s1 }}>
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
                          style={{
                            textAlign: "center", borderRadius: 4, padding: "5px 2px",
                            fontWeight: 700, fontVariantNumeric: "tabular-nums",
                            background: planned ? color + Math.round(18 + heat * 70).toString(16).padStart(2, "0") : C.s2,
                            color: planned ? C.tx : C.tx3,
                            outline: weeks[i] === currentWeek ? "1px solid " + C.coach + "60" : undefined,
                          }}
                        >
                          {planned ? (showDone ? `${formatSets(cell.done)}/${formatSets(planned)}` : formatSets(planned)) : "·"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr>
                <td style={{ padding: "6px 6px 0 0", fontWeight: 700, color: C.tx2, position: "sticky", left: 0, background: C.s1 }}>Total</td>
                {weekTotals.map((t, i) => (
                  <td key={weeks[i]} style={{ textAlign: "center", paddingTop: 6, fontWeight: 700, color: C.tx2, fontVariantNumeric: "tabular-nums" }}>
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
