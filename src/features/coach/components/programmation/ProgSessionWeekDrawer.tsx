/**
 * ProgSessionWeekDrawer
 * Bottom-sheet : navigation semaine + 3 onglets
 *   Prévu    — paramètres planifiés (lecture seule)
 *   Réalisé  — séries athlète depuis workout_logs.athlete_modifications
 *   S+1 Adapter — éditeur SessionBlocEditor sur la semaine suivante
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { X, Copy } from "lucide-react"
import { C } from "@/lib/theme"
import type { ProgSession, Exercice, ExerciceParams, Bloc } from "./types"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { useSessionWeekLogs } from "./hooks/useSessionWeekLogs"
import type { SessionSetLog } from "@/features/shared/types/athlete"

const VIOLET  = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"
const GREEN   = "#22c55e"
const GREEN_S = "rgba(34,197,94,0.10)"
const RED     = "#ef4444"
const RED_S   = "rgba(239,68,68,0.10)"
const AMBER   = "#f59e0b"
const AMBER_S = "rgba(245,158,11,0.10)"

const BLOC_PALETTE = [
  "#FFC933", "#F97316", "#22C55E", "#EF4444",
  "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6",
]

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface Props {
  session:    ProgSession
  cycleId:    string | undefined
  athleteId:  string | undefined
  onChange:   (updated: ProgSession) => void
  onClose:    () => void
}

// ─── Param helpers ────────────────────────────────────────────────────────────

function resolveParams(
  exercice: Exercice,
  week: number,
  sessionMultiSemaine: boolean,
): ExerciceParams | null {
  const p = exercice.params
  if (!p || typeof p !== "object") return null

  // Detect Record by presence of numeric string keys (more robust than checking 'nb_series'
  // because mixed objects can have both — e.g. flat params accidentally spread into a Record)
  const isFlat = !Object.keys(p as object).some((k) => /^\d+$/.test(k))

  const multi = sessionMultiSemaine || (exercice.multi_semaine ?? false)

  if (!multi || isFlat) {
    return isFlat
      ? (p as ExerciceParams)
      : (Object.values(p as Record<string, ExerciceParams>)[0] ?? null)
  }

  const rec = p as Record<string, ExerciceParams>
  return rec[String(week)] ?? null
}

function fmtReps(p: ExerciceParams): string {
  if (!p.reps) return "?"
  if (p.reps.mode === "par_serie") {
    return p.reps.values.map((v, i) => {
      const mx = p.reps_max?.mode === "par_serie" ? p.reps_max.values[i] : (p.reps_max?.mode === "global" ? p.reps_max.value : null)
      return mx != null && mx !== v ? `${v}-${mx}` : String(v)
    }).join(" / ")
  }
  const mx = p.reps_max?.mode === "global" ? p.reps_max.value : null
  if (mx != null && mx !== p.reps.value) return `${p.reps.value}-${mx}`
  return String(p.reps.value)
}

function fmtCharge(p: ExerciceParams): string {
  if (p.charge_unit === "PDC") return "PDC"
  if (!p.charge) return "—"
  const unit = p.charge_unit === "%RM" ? "%" : "kg"
  if (p.charge.mode === "par_serie")
    return p.charge.values.map(v => (v !== null ? `${v}${unit}` : "—")).join(" / ")
  return p.charge.value !== null ? `${p.charge.value}${unit}` : "—"
}

function fmtRIR(p: ExerciceParams): string {
  if (!p.rir) return "—"
  if (p.rir.mode === "par_serie")
    return "RIR " + p.rir.values.map(v => (v === null ? "?" : v)).join("/")
  return p.rir.value === null ? "Libre" : `RIR ${p.rir.value}`
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "5px 9px", borderRadius: 7,
      background: C.s1, border: "1px solid " + C.brdL,
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{value}</span>
    </div>
  )
}

// ─── ExercicePreview (Prévu tab) ───────────────────────────────────────────────

function ExercicePreview({ exercice, params }: { exercice: Exercice; params: ExerciceParams }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 4,
      border: "1px solid " + C.brdL, background: C.s2, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
          {exercice.exercise_name || "—"}
        </span>
        {exercice.mode === "methode" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: VIOLET, background: VIOLET_S, padding: "2px 6px", borderRadius: 4 }}>
            MÉTHODE
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        <Chip label="Séries"  value={String(params.nb_series)} />
        <Chip label="Reps"    value={fmtReps(params)} />
        <Chip label="Charge"  value={fmtCharge(params)} />
        <Chip label="RIR"     value={fmtRIR(params)} />
        {params.tempo?.mode === "global" && params.tempo.value && (
          <Chip label="Tempo" value={params.tempo.value} />
        )}
      </div>
    </div>
  )
}

// ─── SetRow (Réalisé tab) ─────────────────────────────────────────────────────

function SetRow({
  index, set, plannedReps,
}: {
  index: number
  set: SessionSetLog
  plannedReps?: number
}) {
  const ok = set.done && (plannedReps === undefined || (set.reps !== undefined && set.reps >= plannedReps))
  const color = !set.done ? RED : ok ? GREEN : AMBER

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px", borderRadius: 7, marginBottom: 3,
      background: !set.done ? RED_S : ok ? GREEN_S : AMBER_S,
      border: "1px solid " + color + "40",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.tx3, minWidth: 22 }}>S{index + 1}</span>
      {set.done ? (
        <>
          {set.kg !== undefined && set.kg !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{set.kg} kg</span>
          )}
          {set.reps !== undefined && (
            <span style={{ fontSize: 12, color: C.tx }}>× {set.reps}</span>
          )}
          {set.rir !== null && set.rir !== undefined && (
            <span style={{ fontSize: 11, color: C.tx3 }}>RIR {set.rir}</span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color }}>
            {ok ? "✓" : "~"}
          </span>
        </>
      ) : (
        <span style={{ fontSize: 11, color: RED }}>Non réalisé</span>
      )}
    </div>
  )
}

// ─── ExerciceRealise ───────────────────────────────────────────────────────────

function ExerciceRealise({
  exercice, sets, params, athleteComment,
}: {
  exercice: Exercice
  sets: SessionSetLog[]
  params: ExerciceParams | null
  athleteComment?: string
}) {
  const plannedReps: (number | undefined)[] = params
    ? (params.reps.mode === "par_serie"
        ? params.reps.values
        : Array(params.nb_series).fill(params.reps.value))
    : []

  return (
    <div style={{
      padding: "10px 12px", borderRadius: 4,
      border: "1px solid " + C.brdL, background: C.s2, marginBottom: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
        {exercice.exercise_name || "—"}
      </div>

      {sets.length === 0 ? (
        <div>
          <div style={{
            padding: "7px 10px", borderRadius: 7,
            background: RED_S, border: "1px solid " + RED + "40",
            fontSize: 11, color: RED, fontWeight: 600,
          }}>
            Aucune série enregistrée
          </div>
          {params && (
            <div style={{
              padding: "6px 10px", borderRadius: 7, marginTop: 4,
              background: C.s1, border: "1px dashed " + C.brdL,
              fontSize: 10, color: C.tx3,
            }}>
              Prévu : {params.nb_series}× {fmtReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}
            </div>
          )}
        </div>
      ) : (
        sets.map((set, i) => (
          <SetRow key={i} index={i} set={set} plannedReps={plannedReps[i]} />
        ))
      )}

      {athleteComment && (
        <div style={{
          padding: "5px 8px", borderRadius: 6, marginTop: 4,
          background: AMBER_S, border: "1px solid " + AMBER + "30",
          fontSize: 10, color: C.tx2, fontStyle: "italic",
        }}>
          {athleteComment}
        </div>
      )}
    </div>
  )
}

// ─── BlocSection ──────────────────────────────────────────────────────────────

function BlocSection({ bloc, index, children }: { bloc: Bloc; index: number; children: React.ReactNode }) {
  const color = bloc.color ?? BLOC_PALETTE[index % BLOC_PALETTE.length]
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 6,
        padding: "4px 8px 4px 10px",
        borderRadius: 6,
        background: hexToRgba(color, 0.08),
        borderLeft: `3px solid ${color}`,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color,
          textTransform: "uppercase" as const, letterSpacing: "0.5px",
        }}>
          {bloc.name || `Bloc ${index + 1}`}
        </span>
      </div>
      {children}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function ColHeader({ label, right, color = VIOLET }: {
  label: string; right?: React.ReactNode; color?: string
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 10px",
      borderBottom: "2px solid " + color,
      background: color + "0A",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
        {label}
      </span>
      {right}
    </div>
  )
}

function EmptyCol({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div style={{ padding: "30px 12px", textAlign: "center" as const, color: C.tx3 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: sub ? 4 : 0 }}>{msg}</div>
      {sub && <div style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProgSessionWeekDrawer({ session, cycleId, athleteId, onChange, onClose }: Props) {
  const [activeWeek, setActiveWeek] = useState(1)

  // Synchronized scroll across 3 columns
  const col1Ref = useRef<HTMLDivElement>(null)
  const col2Ref = useRef<HTMLDivElement>(null)
  const col3Ref = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

  const syncScroll = useCallback((source: HTMLDivElement) => {
    if (isSyncing.current) return
    isSyncing.current = true
    const top = source.scrollTop
    for (const ref of [col1Ref, col2Ref, col3Ref]) {
      if (ref.current && ref.current !== source) {
        ref.current.scrollTop = top
      }
    }
    isSyncing.current = false
  }, [])

  useEffect(() => {
    const cols = [col1Ref.current, col2Ref.current, col3Ref.current]
    const handlers = cols.map(col => {
      if (!col) return null
      const handler = () => syncScroll(col)
      col.addEventListener("scroll", handler, { passive: true })
      return { col, handler }
    })
    return () => {
      handlers.forEach(h => h?.col.removeEventListener("scroll", h.handler))
    }
  }, [syncScroll])

  const { getLogForWeek, getStatusForWeek, microcycles } = useSessionWeekLogs(
    athleteId, session.id, cycleId,
  )

  // Also account for exercise-level multi_semaine (session.multi_semaine may be false
  // but individual exercises can have params keyed by week number)
  const maxExWeek = session.blocs.reduce((max, bloc) =>
    bloc.exercices.reduce((m, ex) => {
      if (!ex.multi_semaine) return m
      const p = ex.params
      if (!p || typeof p !== "object" || "nb_series" in (p as object)) return m
      const keys = Object.keys(p as Record<string, unknown>).map(Number).filter(n => !isNaN(n) && n > 0)
      return keys.length > 0 ? Math.max(m, ...keys) : m
    }, max)
  , 1)
  const weekCount  = Math.max(microcycles.length, session.nb_semaines ?? 1, maxExWeek, 1)
  const currentLog = getLogForWeek(activeWeek)
  const atMods     = currentLog?.athleteModifications ?? null
  const isLastWeek = activeWeek >= weekCount

  function duplicateWeekToNext() {
    const wk   = String(activeWeek)
    const next = String(activeWeek + 1)
    const updatedBlocs = session.blocs.map(bloc => ({
      ...bloc,
      exercices: bloc.exercices.map(ex => {
        const multi = session.multi_semaine || (ex.multi_semaine ?? false)
        if (!multi) return ex
        if (typeof ex.params === "object" && !("nb_series" in (ex.params as object))) {
          const rec = ex.params as Record<string, ExerciceParams>
          const thisWeek = rec[wk]
          if (thisWeek) return { ...ex, params: { ...rec, [next]: { ...thisWeek } } }
        }
        return ex
      }),
    }))
    onChange({ ...session, blocs: updatedBlocs })
  }

  const totalExos = session.blocs.reduce((s, b) => s + b.exercices.length, 0)
  const noRealise = session.blocs.every(b =>
    b.exercices.every(ex => !(atMods?.sessionSets?.[ex.id]?.length)),
  )

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

      <div style={{
        position: "relative", width: "100%", height: "92vh",
        background: C.bg, borderRadius: "6px 6px 0 0",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{session.name}</div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
              {session.blocs.length} bloc{session.blocs.length !== 1 ? "s" : ""} · {totalExos} exercice{totalExos !== 1 ? "s" : ""}
              {weekCount > 1 ? ` · ${weekCount} semaines` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          ><X size={14} /></button>
        </div>

        {/* ── Week nav ── */}
        {weekCount > 1 && (
          <div style={{ padding: "8px 16px 8px", borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 5, overflowX: "auto" as const }}>
              {Array.from({ length: weekCount }, (_, i) => i + 1).map(week => {
                const status = getStatusForWeek(week)
                const active = activeWeek === week
                return (
                  <button
                    key={week}
                    onClick={() => setActiveWeek(week)}
                    style={{
                      position: "relative" as const,
                      padding: "5px 12px", borderRadius: 7, flexShrink: 0,
                      border: "1px solid " + (active ? VIOLET : C.brdL),
                      background: active ? VIOLET_S : "transparent",
                      color: active ? VIOLET : C.tx3,
                      fontSize: 11, fontWeight: active ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    S{week}
                    {status && (
                      <span style={{
                        position: "absolute" as const, top: -3, right: -3,
                        width: 7, height: 7, borderRadius: "50%",
                        background: status === "completed" ? GREEN : status === "missed" ? RED : AMBER,
                        border: "1px solid " + C.bg,
                      }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 3 colonnes ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", borderTop: "1px solid " + C.brd }}>

          {/* ── Col 1 : PRÉVU ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.brd, overflow: "hidden" }}>
            <ColHeader label={`Prévu · S${activeWeek}`} color={VIOLET} />
            <div ref={col1Ref} style={{ flex: 1, overflowY: "auto", padding: "10px 10px", paddingBottom: 32 }}>
              {session.blocs.length === 0 ? (
                <EmptyCol msg="Aucun bloc" />
              ) : session.blocs.map((bloc, bi) => (
                <BlocSection key={bloc.id} bloc={bloc} index={bi}>
                  {bloc.exercices.map(ex => {
                    const params = resolveParams(ex, activeWeek, session.multi_semaine)
                    if (!params) return (
                      <div key={ex.id} style={{
                        padding: "7px 10px", borderRadius: 4, marginBottom: 5,
                        border: "1px solid " + C.brdL, background: C.s2,
                        fontSize: 10, color: C.tx3,
                      }}>
                        {ex.exercise_name} — pas de params S{activeWeek}
                      </div>
                    )
                    return <ExercicePreview key={ex.id} exercice={ex} params={params} />
                  })}
                </BlocSection>
              ))}
            </div>
          </div>

          {/* ── Col 2 : RÉALISÉ ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.brd, overflow: "hidden" }}>
            <ColHeader
              label={`Réalisé · S${activeWeek}`}
              color={GREEN}
              right={
                currentLog?.status === "completed" ? (
                  <span style={{ fontSize: 10, color: C.tx3 }}>
                    {currentLog.rpeScore !== null ? `RPE ${currentLog.rpeScore} · ` : ""}
                    {new Date(currentLog.scheduledDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                ) : currentLog ? (
                  <span style={{ fontSize: 10, color: RED, fontWeight: 700 }}>
                    {currentLog.status === "missed" ? "Manquée" : currentLog.status}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: C.tx3 }}>Non réalisée</span>
                )
              }
            />
            <div ref={col2Ref} style={{ flex: 1, overflowY: "auto", padding: "10px 10px", paddingBottom: 32 }}>
              {/* Session forme + comment */}
              {(atMods?.sessionForme != null || atMods?.sessionComment) && (
                <div style={{
                  padding: "7px 10px", borderRadius: 4, marginBottom: 8,
                  border: "1px solid " + C.brdL, background: C.s2,
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  {atMods?.sessionForme != null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Forme</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                        background: atMods.sessionForme >= 4 ? GREEN_S : atMods.sessionForme >= 3 ? AMBER_S : RED_S,
                        color: atMods.sessionForme >= 4 ? GREEN : atMods.sessionForme >= 3 ? AMBER : RED,
                      }}>
                        {atMods.sessionForme}/5
                      </span>
                    </div>
                  )}
                  {atMods?.sessionComment && (
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 2 }}>
                        Commentaire athlète
                      </div>
                      <div style={{ fontSize: 11, color: C.tx, fontStyle: "italic" }}>« {atMods.sessionComment} »</div>
                    </div>
                  )}
                </div>
              )}
              {noRealise && !currentLog ? (
                <EmptyCol msg="Aucune donnée" sub="Séance non encore réalisée" />
              ) : (
                session.blocs.map((bloc, bi) => (
                  <BlocSection key={bloc.id} bloc={bloc} index={bi}>
                    {bloc.exercices.map(ex => {
                      const sets = (atMods?.sessionSets?.[ex.id] ?? []) as SessionSetLog[]
                      const params = resolveParams(ex, activeWeek, session.multi_semaine)
                      return <ExerciceRealise key={ex.id} exercice={ex} sets={sets} params={params} athleteComment={atMods?.exerciceComments?.[ex.id]} />
                    })}
                  </BlocSection>
                ))
              )}
            </div>
          </div>

          {/* ── Col 3 : S+1 ADAPTER ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ColHeader
              label={isLastWeek ? "S+1 · Adapter" : `S+1 · Adapter · S${activeWeek + 1}`}
              color={AMBER}
              right={!isLastWeek ? (
                <button
                  onClick={duplicateWeekToNext}
                  style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "3px 8px", borderRadius: 5,
                    border: "1px solid " + AMBER + "60", background: AMBER_S,
                    color: AMBER, fontSize: 9, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Copy size={9} />
                  Copier S{activeWeek}
                </button>
              ) : undefined}
            />
            <div ref={col3Ref} style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
              {isLastWeek ? (
                <EmptyCol msg="Dernière semaine" sub="Pas de S+1 pour ce cycle" />
              ) : (
                <SessionBlocEditor
                  session={session}
                  cycleId={cycleId}
                  athleteId={athleteId}
                  onChange={onChange}
                  initialWeek={activeWeek + 1}
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
