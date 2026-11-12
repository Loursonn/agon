/**
 * ProgSessionWeekDrawer
 * Bottom-sheet : navigation par occurrence (1re, 2e… fois que la séance est
 * planifiée) + 2 colonnes
 *   Séance N   — prévu et réalisé (workout_logs.athlete_modifications) côte à côte,
 *                par exercice, en lecture seule
 *   Séance N+1 — lignes compactes séries / reps / charge / RIR ; la modif vaut
 *                pour toutes les occurrences suivantes jusqu'à la prochaine
 *                occurrence qui a ses propres valeurs. « Édition avancée »
 *                ouvre l'éditeur complet (SessionBlocEditor).
 */
import { useState, useEffect, useMemo } from "react"
import { blocColor } from "@/lib/peps";
import { toast } from "sonner"
import { X, Copy, AlertTriangle, Video } from "lucide-react"
import { C } from "@/lib/theme"
import type { ProgSession, Exercice, ExerciceParams, Bloc, ParamValue } from "./types"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { useSessionWeekLogs } from "./hooks/useSessionWeekLogs"
import type { SessionSetLog } from "@/features/shared/types/athlete"
import { exerciseHasEntries } from "@shared/domain/athleteMods"
import { maxDefinedWeek, resolveExerciceParams, resolveVideoRequest, toMultiWeekSession } from "@/lib/sessionOccurrence"
import { formatSetsReps, hasIso, isIsoAt } from "@/lib/formatSetsReps"
import { IsoBadge } from "@/features/shared/components/IsoBadge"
import { useCoachSessionOverride } from "@/features/shared/hooks/useCoachSessionOverride"

const VIOLET  = "#FFC933"
const GREEN   = "#22c55e"
const GREEN_S = "rgba(34,197,94,0.10)"
const RED     = "#ef4444"
const RED_S   = "rgba(239,68,68,0.10)"
const AMBER   = "#f59e0b"
const AMBER_S = "rgba(245,158,11,0.10)"


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

function pvAt<T>(pv: ParamValue<T> | undefined, i: number): T | null {
  if (!pv) return null
  return pv.mode === "global" ? pv.value : (pv.values?.[i] ?? null)
}

/** Passe en « par série » (n valeurs) puis écrit la série i. */
function pvSetAt<T>(pv: ParamValue<T>, i: number, v: T, n: number): ParamValue<T> {
  const fallback = pv.mode === "global" ? pv.value : (pv.values?.[pv.values.length - 1] as T)
  const values = Array.from({ length: n }, (_, k) => (pv.mode === "global" ? pv.value : (pv.values?.[k] ?? fallback)) as T)
  values[i] = v
  return { mode: "par_serie", values }
}

/** Ajuste le nombre de séries (valeurs par série tronquées / complétées avec la dernière). */
function pvResize<T>(pv: ParamValue<T>, n: number): ParamValue<T> {
  if (pv.mode === "global") return pv
  const last = pv.values[pv.values.length - 1]
  return { mode: "par_serie", values: Array.from({ length: n }, (_, k) => (pv.values[k] ?? last) as T) }
}

// ─── Petits composants ────────────────────────────────────────────────────────

function VideoBadge({ note, sent }: { note?: string; sent?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5, marginTop: 6,
      padding: "3px 8px", borderRadius: 4,
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

function BlocLabel({ bloc, index }: { bloc: Bloc; index: number }) {
  const color = blocColor(bloc.color, index)
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color, textTransform: "uppercase" as const, letterSpacing: "0.5px",
      margin: "12px 0 5px", paddingLeft: 8, borderLeft: `3px solid ${color}`,
    }}>
      {bloc.name || `Bloc ${index + 1}`}
    </div>
  )
}

function ColHeader({ label, color, right }: { label: string; color: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      padding: "8px 12px", borderBottom: "2px solid " + color, background: color + "0A", flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{right}</div>
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

function ActionBtn({ onClick, title, children, primary = false }: {
  onClick: () => void; title: string; children: React.ReactNode; primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 9px", borderRadius: 5,
        border: "1px solid " + AMBER + (primary ? "" : "60"),
        background: primary ? AMBER : AMBER_S,
        color: primary ? "#0E0C0A" : AMBER, fontSize: 10, fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >{children}</button>
  )
}

// ─── Colonne 1 : une carte par exercice (prévu + réalisé) ─────────────────────

function SetChip({ set, plannedReps, iso }: { set: SessionSetLog; plannedReps?: number; iso: boolean }) {
  const ok = set.done && (plannedReps === undefined || (set.reps !== undefined && set.reps >= plannedReps))
  const color = !set.done ? RED : ok ? GREEN : AMBER
  const text = !set.done
    ? "—"
    : [
        set.kg != null ? `${set.kg} kg` : null,
        set.reps !== undefined ? `× ${set.reps}${iso ? " s" : ""}` : null,
        set.rir != null ? `RIR ${set.rir}` : null,
      ].filter(Boolean).join(" ")
  return (
    <span style={{
      padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, color: C.tx,
      background: !set.done ? RED_S : ok ? GREEN_S : AMBER_S, border: "1px solid " + color + "40",
    }}>{text}</span>
  )
}

function ExerciceCard({ exercice, params, sets, comment, week, videoSent, showRealise }: {
  exercice: Exercice
  params: ExerciceParams | null
  sets: SessionSetLog[]
  comment?: string
  week: number
  videoSent: boolean
  /** Une séance a été planifiée pour cette occurrence : « Non réalisé » a un sens */
  showRealise: boolean
}) {
  const video = resolveVideoRequest(exercice, week)
  const plannedReps: (number | undefined)[] = params
    ? (params.reps.mode === "par_serie"
        ? params.reps.values
        : Array(params.nb_series).fill(params.reps.value))
    : []
  return (
    <div style={{ padding: "9px 11px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{exercice.exercise_name || "—"}</span>
        {params && hasIso(params) && <IsoBadge size={9} />}
      </div>
      <div style={{ fontSize: 11, color: C.tx3, marginTop: 3 }}>
        {params
          ? <>Prévu · <span style={{ color: C.tx2, fontWeight: 600 }}>{formatSetsReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}</span></>
          : exercice.libre_text || "Pas de paramètres"}
      </div>
      {sets.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginTop: 6 }}>
          {sets.map((set, i) => <SetChip key={i} set={set} plannedReps={plannedReps[i]} iso={isIsoAt(params, i)} />)}
        </div>
      ) : showRealise && params ? (
        <div style={{ fontSize: 11, color: RED, fontWeight: 600, marginTop: 5 }}>Non réalisé</div>
      ) : null}
      {comment && (
        <div style={{ padding: "4px 8px", borderRadius: 6, marginTop: 6, background: AMBER_S, fontSize: 10, color: C.tx2, fontStyle: "italic" }}>
          {comment}
        </div>
      )}
      {video && <VideoBadge note={video.note} sent={sets.length > 0 || showRealise ? videoSent : undefined} />}
    </div>
  )
}

// ─── Colonne 2 : ligne compacte à programmer ──────────────────────────────────

function CellInput({ value, onChange, step = 1, width = 56, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; step?: number; width?: number; placeholder?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
      style={{
        width, padding: "4px 6px", borderRadius: 5, fontSize: 12, fontWeight: 700,
        border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontFamily: "inherit",
      }}
    />
  )
}

const TH: React.CSSProperties = {
  fontSize: 8, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "left", padding: "0 4px 3px",
}

function NextRow({ exercice, params, onPatch }: {
  exercice: Exercice
  params: ExerciceParams | null
  onPatch: (mutate: (p: ExerciceParams) => ExerciceParams) => void
}) {
  const n = params?.nb_series ?? 0
  const iso = hasIso(params)
  const showCharge = params?.charge_unit !== "PDC"
  return (
    <div style={{ padding: "9px 11px", borderRadius: 4, border: "1px solid " + AMBER + "30", background: C.s2, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.tx }}>{exercice.exercise_name || "—"}</span>
        {params && !params.cluster && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => onPatch(p => {
                const k = Math.max(1, p.nb_series - 1)
                return { ...p, nb_series: k, reps: pvResize(p.reps, k), reps_max: p.reps_max && pvResize(p.reps_max, k), reps_mode: pvResize(p.reps_mode, k), charge: pvResize(p.charge, k), rir: pvResize(p.rir, k) }
              })}
              title="Retirer une série"
              style={stepBtn}
            >−</button>
            <button
              onClick={() => onPatch(p => {
                const k = p.nb_series + 1
                return { ...p, nb_series: k, reps: pvResize(p.reps, k), reps_max: p.reps_max && pvResize(p.reps_max, k), reps_mode: pvResize(p.reps_mode, k), charge: pvResize(p.charge, k), rir: pvResize(p.rir, k) }
              })}
              title="Ajouter une série"
              style={stepBtn}
            >+</button>
          </div>
        )}
      </div>
      {!params ? (
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>{exercice.libre_text || "Pas de paramètres"}</div>
      ) : params.cluster ? (
        <div style={{ fontSize: 11, color: C.tx2, marginTop: 4 }}>
          {formatSetsReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}
          <span style={{ color: C.tx3 }}> — cluster : voir « Édition avancée »</span>
        </div>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 6 }}>
          <thead>
            <tr>
              <th style={TH}>Série</th>
              <th style={TH}>{iso ? "Durée min" : "Reps min"}</th>
              <th style={TH}>{iso ? "Durée max" : "Reps max"}</th>
              {showCharge && <th style={TH}>{params.charge_unit === "%RM" ? "Charge %" : "Charge kg"}</th>}
              <th style={TH}>RIR</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <td style={{ fontSize: 11, fontWeight: 700, color: C.tx3, padding: "2px 6px 2px 4px" }}>S{i + 1}</td>
                <td style={{ padding: "2px 4px" }}>
                  <CellInput width={54} value={pvAt(params.reps, i)}
                    onChange={v => onPatch(p => ({ ...p, reps: pvSetAt(p.reps, i, v ?? 0, p.nb_series) }))} />
                </td>
                <td style={{ padding: "2px 4px" }}>
                  <CellInput width={54} placeholder="—" value={pvAt(params.reps_max, i)}
                    onChange={v => onPatch(p => ({
                      ...p,
                      reps_max: pvSetAt<number | null>(p.reps_max ?? { mode: "global", value: null }, i, v, p.nb_series),
                    }))} />
                </td>
                {showCharge && (
                  <td style={{ padding: "2px 4px" }}>
                    <CellInput width={66} step={0.5} value={pvAt(params.charge, i)}
                      onChange={v => onPatch(p => ({ ...p, charge: pvSetAt(p.charge, i, v, p.nb_series) }))} />
                  </td>
                )}
                <td style={{ padding: "2px 4px" }}>
                  <CellInput width={46} value={pvAt(params.rir, i)}
                    onChange={v => onPatch(p => ({ ...p, rir: pvSetAt(p.rir, i, v, p.nb_series) }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const stepBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, border: "1px solid " + C.brdL, background: "transparent",
  color: C.tx2, fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: "inherit", padding: 0,
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProgSessionWeekDrawer({ session, cycleId, athleteId, onChange, onClose, initialWeek = 1 }: Props) {
  const [activeWeek, setActiveWeek] = useState(initialWeek)
  useEffect(() => { setActiveWeek(initialWeek) }, [initialWeek])
  const [advanced, setAdvanced] = useState(false)
  const { mutate: saveOverride, isPending: clearingOverride } = useCoachSessionOverride()
  // Bandeau « modif ponctuelle » masqué pour ces logs (choix « Garder »)
  const [keptOverrides, setKeptOverrides] = useState<Set<string>>(new Set())

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

  /** Applique `mutate` aux params de l'occurrence suivante d'un exercice. */
  function patchNext(exId: string, mutate: (p: ExerciceParams) => ExerciceParams) {
    onChange({
      ...editableSession,
      blocs: editableSession.blocs.map(bloc => ({
        ...bloc,
        exercices: bloc.exercices.map(ex => {
          if (ex.id !== exId) return ex
          const base = resolveParams(ex, nextWeek)
          if (!base) return ex
          const rec = ex.params as Record<string, ExerciceParams>
          return { ...ex, params: { ...rec, [String(nextWeek)]: mutate(structuredClone(base)) } }
        }),
      })),
    })
  }

  /** Copie sur la séance N+1 : le prévu de N (`prevu`) ou le prévu de N avec les charges réalisées (`realise`). */
  function copyToNext(source: "prevu" | "realise") {
    let touched = 0
    // Source = ce que l'athlète a eu (override coach éventuel), sinon le modèle
    const sourceByExo = new Map<string, Exercice>()
    for (const b of prevuBlocs) for (const ex of b.exercices) sourceByExo.set(ex.id, ex)

    const blocs = editableSession.blocs.map(bloc => ({
      ...bloc,
      exercices: bloc.exercices.map(ex => {
        const src = sourceByExo.get(ex.id) ?? ex
        const thisWeek = resolveParams(src, activeWeek) ?? resolveParams(ex, activeWeek)
        if (!thisWeek) return ex
        const next = structuredClone(thisWeek)
        if (source === "realise") {
          const sets = (atMods?.sessionSets?.[ex.id] ?? []) as SessionSetLog[]
          const kgs = sets.filter(s => s.done && s.kg != null).map(s => s.kg as number)
          if (kgs.length) {
            next.charge_unit = "kg"
            next.charge = { mode: "global", value: Math.max(...kgs) }
          }
        }
        touched++
        const rec = ex.params as Record<string, ExerciceParams>
        return { ...ex, params: { ...rec, [String(nextWeek)]: next } }
      }),
    }))
    if (!touched) { toast.error(`Rien à copier depuis la séance ${activeWeek}`); return }
    onChange({ ...editableSession, blocs })
    toast.success(
      source === "realise"
        ? `Séance ${nextWeek} : prévu de la séance ${activeWeek} + charges réalisées`
        : `Séance ${nextWeek} : reprise du prévu de la séance ${activeWeek}`,
    )
  }

  function clearNextOverride() {
    if (!nextOverride || !athleteId) return
    // useCoachSessionOverride invalide déjà toutes les séances de l'athlète.
    saveOverride({ workoutLogId: nextOverride.id, athleteId, override: null })
  }

  const totalExos = session.blocs.reduce((s, b) => s + b.exercices.length, 0)
  const hasAnySets = prevuBlocs.some(b => b.exercices.some(ex => exerciseHasEntries(atMods, ex.id)))
  const dateLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", opts)

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

      <div style={{
        position: "relative", width: "100%", height: "92vh",
        background: C.bg, borderRadius: "6px 6px 0 0",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── Header + navigation par séance ── */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" as const,
        }}>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{session.name}</div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
              {totalExos} exercice{totalExos !== 1 ? "s" : ""}
              {logs.length > 0 ? ` · planifiée ${logs.length} fois` : ""}
            </div>
          </div>
          {weekCount > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, overflowX: "auto" as const, maxWidth: "100%" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginRight: 2 }}>
                Séance n°
              </span>
              {Array.from({ length: weekCount }, (_, i) => i + 1).map(week => {
                const status = getStatusForWeek(week)
                const active = activeWeek === week
                const log = getLogForWeek(week)
                return (
                  <button
                    key={week}
                    onClick={() => setActiveWeek(week)}
                    title={log ? dateLabel(log.scheduledDate, { weekday: "short", day: "numeric", month: "short" }) : "Pas encore planifiée"}
                    style={{
                      position: "relative" as const,
                      padding: "5px 11px", borderRadius: 7, flexShrink: 0,
                      border: "1px solid " + (active ? VIOLET : C.brdL),
                      background: active ? "rgba(255,201,51,0.12)" : "transparent",
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
          )}
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

        {/* ── 2 colonnes ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Col 1 : SÉANCE N — prévu et réalisé ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.brd, overflow: "hidden" }}>
            <ColHeader
              label={`Séance ${activeWeek} · Prévu et réalisé`}
              color={GREEN}
              right={
                currentLog?.status === "completed" ? (
                  <span style={{ fontSize: 10, color: C.tx3 }}>
                    {currentLog.rpeScore !== null ? `RPE ${currentLog.rpeScore} · ` : ""}
                    {dateLabel(currentLog.scheduledDate, { day: "numeric", month: "short" })}
                  </span>
                ) : currentLog ? (
                  getStatusForWeek(activeWeek) === "missed"
                    ? <span style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Manquée</span>
                    : <span style={{ fontSize: 10, color: C.tx3 }}>Prévue le {dateLabel(currentLog.scheduledDate, { day: "numeric", month: "short" })}</span>
                ) : (
                  <span style={{ fontSize: 10, color: C.tx3 }}>{loadingLogs ? "…" : "Non planifiée"}</span>
                )
              }
            />
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 32px" }}>
              {(atMods?.sessionForme != null || atMods?.sessionComment) && (
                <div style={{
                  display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" as const,
                  padding: "6px 10px", borderRadius: 4, margin: "8px 0 0",
                  border: "1px solid " + C.brdL, background: C.s2, fontSize: 11, color: C.tx,
                }}>
                  {atMods?.sessionForme != null && (
                    <span style={{
                      fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                      background: atMods.sessionForme >= 4 ? GREEN_S : atMods.sessionForme >= 3 ? AMBER_S : RED_S,
                      color: atMods.sessionForme >= 4 ? GREEN : atMods.sessionForme >= 3 ? AMBER : RED,
                    }}>Forme {atMods.sessionForme}/5</span>
                  )}
                  {atMods?.sessionComment && <span style={{ fontStyle: "italic" }}>« {atMods.sessionComment} »</span>}
                </div>
              )}
              {currentOverride && (
                <div style={{ fontSize: 10, fontWeight: 700, color: AMBER, marginTop: 8 }}>Modif ponctuelle appliquée à cette séance</div>
              )}
              {prevuBlocs.length === 0 ? (
                <EmptyCol msg="Aucun bloc" />
              ) : loadingLogs ? (
                <EmptyCol msg="Chargement…" />
              ) : prevuBlocs.map((bloc, bi) => (
                <div key={bloc.id}>
                  <BlocLabel bloc={bloc} index={bi} />
                  {bloc.exercices.map(ex => (
                    <ExerciceCard
                      key={ex.id}
                      exercice={ex}
                      params={resolveParams(ex, activeWeek)}
                      sets={(atMods?.sessionSets?.[ex.id] ?? []) as SessionSetLog[]}
                      comment={atMods?.exerciceComments?.[ex.id]}
                      week={activeWeek}
                      videoSent={!!atMods?.videoSent?.[ex.id]}
                      showRealise={!!currentLog && (currentLog.status === "completed" || hasAnySets)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Col 2 : SÉANCE N+1 — à programmer ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ColHeader
              label={`Séance ${nextWeek} · À programmer`}
              color={AMBER}
              right={
                <>
                  <ActionBtn onClick={() => copyToNext("prevu")} title={`Reprendre le prévu de la séance ${activeWeek} sur la séance ${nextWeek}`}>
                    <Copy size={10} /> Copier le prévu
                  </ActionBtn>
                  {hasAnySets && (
                    <ActionBtn primary onClick={() => copyToNext("realise")} title={`Prévu de la séance ${activeWeek} avec les charges réellement soulevées`}>
                      <Copy size={10} /> Copier avec le réalisé
                    </ActionBtn>
                  )}
                </>
              }
            />
            <div style={{ padding: "6px 12px", fontSize: 10, color: C.tx3, borderBottom: "1px solid " + C.brd, flexShrink: 0 }}>
              {nextLog
                ? `Prévue le ${dateLabel(nextLog.scheduledDate, { weekday: "short", day: "numeric", month: "short" })}`
                : "Pas encore planifiée"}
              {" · vaut aussi pour les séances suivantes"}
            </div>
            {showOverrideBanner && nextOverride && (
              <div style={{
                margin: "8px 12px 0", padding: "8px 10px", borderRadius: 4,
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
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 32px" }}>
              {editableSession.blocs.map((bloc, bi) => (
                <div key={bloc.id}>
                  <BlocLabel bloc={bloc} index={bi} />
                  {bloc.exercices.map(ex => (
                    <NextRow
                      key={ex.id}
                      exercice={ex}
                      params={resolveParams(ex, nextWeek)}
                      onPatch={mutate => patchNext(ex.id, mutate)}
                    />
                  ))}
                </div>
              ))}

              <button
                onClick={() => setAdvanced(v => !v)}
                style={{
                  marginTop: 14, padding: "6px 10px", borderRadius: 5, width: "100%",
                  border: "1px dashed " + C.brdL, background: "transparent",
                  color: C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >{advanced ? "Masquer l'édition avancée" : "Édition avancée (fiches, vidéo, méthodes, bloc…)"}</button>
              {advanced && (
                <div style={{ marginTop: 10 }}>
                  <SessionBlocEditor
                    session={editableSession}
                    cycleId={cycleId}
                    athleteId={athleteId}
                    onChange={onChange}
                    initialWeek={nextWeek}
                    hideWeekNav
                  />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
