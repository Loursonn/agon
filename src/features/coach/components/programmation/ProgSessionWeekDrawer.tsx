/**
 * ProgSessionWeekDrawer
 * Bottom-sheet : navigation par occurrence (1re, 2e… fois que la séance est
 * planifiée) + 3 colonnes
 *   Prévu    — paramètres planifiés de l'occurrence (lecture seule)
 *   Réalisé  — séries athlète depuis workout_logs.athlete_modifications
 *   Séance +1 — éditeur SessionBlocEditor sur l'occurrence suivante ; la modif
 *               vaut pour toutes les occurrences suivantes jusqu'à la prochaine
 *               occurrence qui a ses propres valeurs
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { X, Copy, AlertTriangle, Video, Link2, Link2Off } from "lucide-react"
import { C } from "@/lib/theme"
import type { ProgSession, Exercice, ExerciceParams, Bloc } from "./types"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { useSessionWeekLogs } from "./hooks/useSessionWeekLogs"
import type { SessionSetLog } from "@/features/shared/types/athlete"
import { maxDefinedWeek, resolveExerciceParams, resolveVideoRequest, toMultiWeekSession } from "@/lib/sessionOccurrence"
import { formatReps, formatSetsReps, hasIso, isIsoAt } from "@/lib/formatSetsReps"
import { IsoBadge } from "@/features/shared/components/IsoBadge"
import { useCoachSessionOverride } from "@/features/shared/hooks/useCoachSessionOverride"

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
  /** Occurrence affichée à l'ouverture (ex. séance cliquée dans Retours). Défaut : 1. */
  initialWeek?: number
}

// ─── Param helpers ────────────────────────────────────────────────────────────

function resolveParams(exercice: Exercice, week: number): ExerciceParams | null {
  return resolveExerciceParams(exercice.params, week)
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

function VideoBadge({ note, sent }: { note?: string; sent?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5, marginTop: 6,
      padding: "4px 8px", borderRadius: 4,
      background: sent === true ? GREEN_S : AMBER_S,
      border: "1px solid " + (sent === true ? GREEN : AMBER) + "40",
      fontSize: 10, fontWeight: 700, color: sent === true ? GREEN : AMBER,
    }}>
      <Video size={11} />
      {sent === undefined ? "Retour vidéo demandé" : sent ? "Vidéo envoyée" : "Vidéo pas envoyée"}
      {note && <span style={{ fontWeight: 500, color: C.tx2 }}>· {note}</span>}
    </div>
  )
}

function ExercicePreview({ exercice, params, week }: { exercice: Exercice; params: ExerciceParams; week: number }) {
  const video = resolveVideoRequest(exercice, week)
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
        {hasIso(params) && <IsoBadge size={9} />}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        <Chip label="Séries"  value={String(params.nb_series)} />
        <Chip label={hasIso(params) ? "Durée" : "Reps"} value={formatReps(params)} />
        <Chip label="Charge"  value={fmtCharge(params)} />
        <Chip label="RIR"     value={fmtRIR(params)} />
        {params.tempo?.mode === "global" && params.tempo.value && (
          <Chip label="Tempo" value={params.tempo.value} />
        )}
      </div>
      {video && <VideoBadge note={video.note} />}
    </div>
  )
}

// ─── SetRow (Réalisé tab) ─────────────────────────────────────────────────────

function SetRow({
  index, set, plannedReps, iso = false,
}: {
  index: number
  set: SessionSetLog
  plannedReps?: number
  /** Série en isométrie : reps = secondes */
  iso?: boolean
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
            <span style={{ fontSize: 12, color: C.tx }}>× {set.reps}{iso ? " s" : ""}</span>
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
  exercice, sets, params, athleteComment, week, videoSent,
}: {
  exercice: Exercice
  sets: SessionSetLog[]
  params: ExerciceParams | null
  athleteComment?: string
  week: number
  videoSent: boolean
}) {
  const video = resolveVideoRequest(exercice, week)
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
              Prévu : {formatSetsReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}
            </div>
          )}
        </div>
      ) : (
        sets.map((set, i) => (
          <SetRow key={i} index={i} set={set} plannedReps={plannedReps[i]} iso={isIsoAt(params, i)} />
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
      {video && <VideoBadge note={video.note} sent={videoSent} />}
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

function ColHeader({ label, right, color = VIOLET, linked, onToggleLink }: {
  label: string; right?: React.ReactNode; color?: string
  /** Défilement lié aux autres colonnes */
  linked?: boolean
  onToggleLink?: () => void
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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {right}
        {onToggleLink && (
          <button
            onClick={onToggleLink}
            title={linked ? "Défilement lié aux autres colonnes — cliquer pour défiler seule" : "Défile seule — cliquer pour relier aux autres colonnes"}
            style={{
              width: 22, height: 22, borderRadius: 4, flexShrink: 0,
              border: "1px solid " + (linked ? color + "60" : C.brdL),
              background: linked ? color + "18" : "transparent",
              color: linked ? color : C.tx3,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
            }}
          >
            {linked ? <Link2 size={12} /> : <Link2Off size={12} />}
          </button>
        )}
      </div>
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

export function ProgSessionWeekDrawer({ session, cycleId, athleteId, onChange, onClose, initialWeek = 1 }: Props) {
  const [activeWeek, setActiveWeek] = useState(initialWeek)
  useEffect(() => { setActiveWeek(initialWeek) }, [initialWeek])
  const qc = useQueryClient()
  const { mutate: saveOverride, isPending: clearingOverride } = useCoachSessionOverride()
  // Bandeau « modif ponctuelle » masqué pour ces logs (choix « Garder »)
  const [keptOverrides, setKeptOverrides] = useState<Set<string>>(new Set())

  // Défilement synchronisé des colonnes liées (🔗) ; une colonne déliée défile seule
  const col1Ref = useRef<HTMLDivElement>(null)
  const col2Ref = useRef<HTMLDivElement>(null)
  const col3Ref = useRef<HTMLDivElement>(null)
  const [linked, setLinked] = useState<[boolean, boolean, boolean]>([true, true, true])
  const linkedRef = useRef(linked)
  linkedRef.current = linked
  // Colonnes déplacées par la synchro : leur prochain évènement scroll est ignoré
  const programmatic = useRef(new Set<HTMLDivElement>())

  const syncScroll = useCallback((source: HTMLDivElement) => {
    if (programmatic.current.delete(source)) return
    const refs = [col1Ref, col2Ref, col3Ref]
    const srcIdx = refs.findIndex(r => r.current === source)
    if (srcIdx === -1 || !linkedRef.current[srcIdx]) return
    const top = source.scrollTop
    refs.forEach((ref, i) => {
      const col = ref.current
      if (!col || col === source || !linkedRef.current[i]) return
      if (Math.abs(col.scrollTop - top) < 1) return
      const before = col.scrollTop
      programmatic.current.add(col)
      col.scrollTop = top
      // Colonne déjà en butée (plus courte) : pas d'évènement scroll à ignorer
      if (col.scrollTop === before) programmatic.current.delete(col)
    })
  }, [])

  function toggleLink(i: 0 | 1 | 2) {
    setLinked(prev => {
      const next = [...prev] as [boolean, boolean, boolean]
      next[i] = !next[i]
      return next
    })
  }

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

  const { logs, getLogForWeek, getStatusForWeek, isLoading: loadingLogs } = useSessionWeekLogs(athleteId, session.id)

  // Toujours au moins une occurrence de plus que la dernière connue : on peut
  // préparer la séance suivante même si elle n'est pas encore planifiée.
  const weekCount  = Math.max(logs.length, session.nb_semaines ?? 1, maxDefinedWeek(session.blocs), activeWeek, 1)
  const nextWeek   = activeWeek + 1
  const currentLog = getLogForWeek(activeWeek)
  const nextLog    = getLogForWeek(nextWeek)
  const atMods     = currentLog?.athleteModifications ?? null

  // Modif ponctuelle (override coach) : c'est elle que l'athlète a eue / aura
  const currentOverride = atMods?.coachOverride?.blocs?.length ? atMods.coachOverride : null
  const prevuBlocs: Bloc[] = currentOverride ? (currentOverride.blocs as Bloc[]) : session.blocs
  const nextOverride = nextLog?.athleteModifications?.coachOverride?.blocs?.length ? nextLog : null
  const showOverrideBanner = !!nextOverride && !keptOverrides.has(nextOverride.id)

  // Édition par occurrence : une séance « simple » passe en stockage par
  // occurrence (sans changer son contenu) pour ne pas réécrire le passé.
  const editableSession = useMemo(() => toMultiWeekSession(session), [session])

  function duplicateWeekToNext() {
    const updatedBlocs = editableSession.blocs.map(bloc => ({
      ...bloc,
      exercices: bloc.exercices.map(ex => {
        const rec = ex.params as Record<string, ExerciceParams>
        const thisWeek = resolveParams(ex, activeWeek)
        if (!thisWeek) return ex
        return { ...ex, params: { ...rec, [String(nextWeek)]: structuredClone(thisWeek) } }
      }),
    }))
    onChange({ ...editableSession, blocs: updatedBlocs })
  }

  function clearNextOverride() {
    if (!nextOverride || !athleteId) return
    saveOverride(
      { workoutLogId: nextOverride.id, athleteId, override: null },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["session-week-logs", athleteId, session.id] }) },
    )
  }

  const totalExos = session.blocs.reduce((s, b) => s + b.exercices.length, 0)
  const noRealise = prevuBlocs.every(b =>
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
              {logs.length > 0 ? ` · planifiée ${logs.length} fois` : ""}
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
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 5 }}>
              Séance n°
            </div>
            <div style={{ display: "flex", gap: 5, overflowX: "auto" as const }}>
              {Array.from({ length: weekCount }, (_, i) => i + 1).map(week => {
                const status = getStatusForWeek(week)
                const active = activeWeek === week
                const log = getLogForWeek(week)
                return (
                  <button
                    key={week}
                    onClick={() => setActiveWeek(week)}
                    title={log ? new Date(log.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "Pas encore planifiée"}
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
                    {week}
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
            <ColHeader
              label={`Prévu · Séance ${activeWeek}`}
              color={VIOLET}
              linked={linked[0]}
              onToggleLink={() => toggleLink(0)}
              right={currentOverride ? (
                <span style={{ fontSize: 9, fontWeight: 700, color: AMBER }}>Modif ponctuelle</span>
              ) : undefined}
            />
            <div ref={col1Ref} style={{ flex: 1, overflowY: "auto", padding: "10px 10px", paddingBottom: 32 }}>
              {prevuBlocs.length === 0 ? (
                <EmptyCol msg="Aucun bloc" />
              ) : prevuBlocs.map((bloc, bi) => (
                <BlocSection key={bloc.id} bloc={bloc} index={bi}>
                  {bloc.exercices.map(ex => {
                    const params = resolveParams(ex, activeWeek)
                    if (!params) return (
                      <div key={ex.id} style={{
                        padding: "7px 10px", borderRadius: 4, marginBottom: 5,
                        border: "1px solid " + C.brdL, background: C.s2,
                        fontSize: 10, color: C.tx3,
                      }}>
                        {ex.exercise_name} — pas de paramètres
                      </div>
                    )
                    return <ExercicePreview key={ex.id} exercice={ex} params={params} week={activeWeek} />
                  })}
                </BlocSection>
              ))}
            </div>
          </div>

          {/* ── Col 2 : RÉALISÉ ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.brd, overflow: "hidden" }}>
            <ColHeader
              label={`Réalisé · Séance ${activeWeek}`}
              color={GREEN}
              linked={linked[1]}
              onToggleLink={() => toggleLink(1)}
              right={
                currentLog?.status === "completed" ? (
                  <span style={{ fontSize: 10, color: C.tx3 }}>
                    {currentLog.rpeScore !== null ? `RPE ${currentLog.rpeScore} · ` : ""}
                    {new Date(currentLog.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                ) : currentLog ? (
                  getStatusForWeek(activeWeek) === "missed" ? (
                    <span style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Manquée</span>
                  ) : (
                    <span style={{ fontSize: 10, color: C.tx3 }}>
                      Prévue le {new Date(currentLog.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: 10, color: C.tx3 }}>{loadingLogs ? "…" : "Non réalisée"}</span>
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
              {loadingLogs ? (
                <EmptyCol msg="Chargement…" />
              ) : noRealise && !currentLog ? (
                <EmptyCol msg="Aucune donnée" sub="Séance non encore réalisée" />
              ) : (
                prevuBlocs.map((bloc, bi) => (
                  <BlocSection key={bloc.id} bloc={bloc} index={bi}>
                    {bloc.exercices.map(ex => {
                      const sets = (atMods?.sessionSets?.[ex.id] ?? []) as SessionSetLog[]
                      const params = resolveParams(ex, activeWeek)
                      return <ExerciceRealise key={ex.id} exercice={ex} sets={sets} params={params} athleteComment={atMods?.exerciceComments?.[ex.id]} week={activeWeek} videoSent={!!atMods?.videoSent?.[ex.id]} />
                    })}
                  </BlocSection>
                ))
              )}
            </div>
          </div>

          {/* ── Col 3 : SÉANCE +1 ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ColHeader
              label={`Séance ${nextWeek} · Adapter`}
              color={AMBER}
              linked={linked[2]}
              onToggleLink={() => toggleLink(2)}
              right={
                <button
                  onClick={duplicateWeekToNext}
                  title={`Remplacer la séance ${nextWeek} par le prévu de la séance ${activeWeek}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "3px 8px", borderRadius: 5,
                    border: "1px solid " + AMBER + "60", background: AMBER_S,
                    color: AMBER, fontSize: 9, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Copy size={9} />
                  Copier séance {activeWeek}
                </button>
              }
            />
            <div style={{ padding: "6px 10px", fontSize: 10, color: C.tx3, borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
              {nextLog
                ? `Prévue le ${new Date(nextLog.scheduledDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`
                : "Pas encore planifiée"}
              {" · s'applique aussi aux séances suivantes"}
            </div>
            {showOverrideBanner && nextOverride && (
              <div style={{
                margin: "8px 10px 0", padding: "8px 10px", borderRadius: 4,
                border: "1px solid " + AMBER + "60", background: AMBER_S,
                display: "flex", flexDirection: "column", gap: 6, flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: C.tx }}>
                  <AlertTriangle size={13} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    La séance {nextWeek} a une modif ponctuelle (Planning) : l'athlète fera cette version,
                    pas tes modifs ici.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setKeptOverrides(prev => new Set(prev).add(nextOverride.id))}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >Garder</button>
                  <button
                    onClick={clearNextOverride}
                    disabled={clearingOverride}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: AMBER, color: "#0E0C0A", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: clearingOverride ? 0.6 : 1 }}
                  >{clearingOverride ? "…" : "Écraser"}</button>
                </div>
              </div>
            )}
            <div ref={col3Ref} style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
              <SessionBlocEditor
                session={editableSession}
                cycleId={cycleId}
                athleteId={athleteId}
                onChange={onChange}
                initialWeek={nextWeek}
                hideWeekNav
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
