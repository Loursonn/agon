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
import { SessionPainDetail } from "@/features/shared/components/SessionPain";
import { useState, useEffect, useMemo, useRef } from "react"
import { blocColor } from "@/lib/peps";
import { toast } from "sonner"
import { X, Copy, AlertTriangle, Video } from "lucide-react"
import { cn } from "@/lib/utils";
import type { ProgSession, Exercice, ExerciceParams, Bloc, ParamValue } from "./types"
import { SessionBlocEditor } from "./SessionBlocEditor"
import { useSessionWeekLogs } from "./hooks/useSessionWeekLogs"
import type { SessionSetLog } from "@/features/shared/types/athlete"
import { exerciseHasEntries } from "@shared/domain/athleteMods"
import { maxDefinedWeek, resolveExerciceParams, resolveVideoRequest, toMultiWeekSession } from "@/lib/sessionOccurrence"
import { formatSetsReps, hasIso, isIsoAt } from "@/lib/formatSetsReps"
import { IsoBadge } from "@/features/shared/components/IsoBadge"
import { useCoachSessionOverride } from "@/features/shared/hooks/useCoachSessionOverride"
import { compareDone, type Cmp } from "@/lib/compareDone"

/** Statuts : fait = succès, manqué = erreur, partiel / à programmer = alerte (remplacent vert, rouge vif et ambre hérités). */
type Tone = "succes" | "erreur" | "alerte"
const TONE_TEXT: Record<Tone, string> = { succes: "text-agon-succes", erreur: "text-agon-erreur", alerte: "text-agon-alerte" }
const TONE_SOFT: Record<Tone, string> = {
  succes: "border-agon-succes/25 bg-agon-succes/10",
  erreur: "border-agon-erreur/25 bg-agon-erreur/10",
  alerte: "border-agon-alerte/25 bg-agon-alerte/10",
}
const TONE_DOT: Record<Tone, string> = { succes: "bg-agon-succes", erreur: "bg-agon-erreur", alerte: "bg-agon-alerte" }
const SMALL_BTN = "cursor-pointer rounded-[4px] px-2.5 py-1 text-[10px] font-bold"

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
    <div className={cn(
      "mt-1.5 flex items-center gap-[5px] rounded-[4px] border px-2 py-[3px] text-[10px] font-bold",
      sent === true ? cn(TONE_SOFT.succes, TONE_TEXT.succes) : cn(TONE_SOFT.alerte, TONE_TEXT.alerte),
    )}>
      <Video size={11} />
      {sent === undefined ? "Retour vidéo demandé" : sent ? "Vidéo envoyée" : "Vidéo pas envoyée"}
      {note && <span className="font-medium text-agon-tx2">· {note}</span>}
    </div>
  )
}

function BlocLabel({ bloc, index }: { bloc: Bloc; index: number }) {
  const color = blocColor(bloc.color, index)
  return (
    <div className="mb-[5px] mt-3 border-l-[3px] pl-2 text-[10px] font-extrabold uppercase tracking-[0.5px]" style={{ color, borderLeftColor: color }}>
      {bloc.name || `Bloc ${index + 1}`}
    </div>
  )
}

function EmptyCol({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div className="px-3 py-[30px] text-center text-agon-tx3">
      <div className={cn("text-[12px] font-semibold", sub && "mb-1")}>{msg}</div>
      {sub && <div className="text-[11px]">{sub}</div>}
    </div>
  )
}

// ─── Colonne 1 : une carte par exercice (prévu + réalisé) ─────────────────────

/** Couleur d'une case réalisée face au prévu : plus dur = vert, plus facile = rouge, identique = gris. */
const CMP_CLS: Record<Cmp, string> = {
  egal:   "bg-agon-s1 text-agon-tx2",
  plus:   "bg-agon-succes/15 text-agon-succes",
  moins:  "bg-agon-erreur/15 text-agon-erreur",
  neutre: "bg-agon-s1 text-agon-tx3",
}

const CELL = "rounded-[5px] py-[3px] text-center text-[12px] font-bold tabular-nums"

function RealiseTable({ exercice, params, sets, comment, week, videoSent, showRealise }: {
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
  const kgComparable = params?.charge_unit === "kg"
  const rows = Math.max(sets.length, params?.nb_series ?? 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-agon-tx">
          {exercice.exercise_name || "—"}{params && hasIso(params) && <IsoBadge size={9} />}
        </span>
        <span className="text-[10.5px] text-agon-tx3">
          {params ? <>prévu {formatSetsReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}</> : exercice.libre_text || "Pas de paramètres"}
        </span>
      </div>
      {sets.length > 0 && params && !params.cluster ? (
        <div className="grid max-w-[300px] grid-cols-[28px_repeat(3,minmax(0,1fr))] items-center gap-1">
          <span />
          <span className="text-center text-[9px] font-bold uppercase text-agon-tx3">{hasIso(params) ? "s" : "reps"}</span>
          <span className="text-center text-[9px] font-bold uppercase text-agon-tx3">kg</span>
          <span className="text-center text-[9px] font-bold uppercase text-agon-tx3">RIR</span>
          {Array.from({ length: rows }, (_, k) => {
            const set = sets[k]
            const pReps = pvAt(params.reps, k)
            const pKg = kgComparable ? pvAt(params.charge, k) : null
            const pRir = pvAt(params.rir, k)
            return [
              <span key={`n${k}`} className="text-[10.5px] font-bold text-agon-tx3">S{k + 1}</span>,
              ...(!set?.done
                ? [<span key={`x${k}`} className={cn(CELL, "col-span-3", CMP_CLS.moins)}>non faite</span>]
                : [
                    <span key={`r${k}`} title={pReps != null ? `prévu ${pReps}` : undefined} className={cn(CELL, CMP_CLS[compareDone(set.reps, pReps)])}>{set.reps ?? "—"}</span>,
                    <span key={`k${k}`} title={pKg != null ? `prévu ${pKg} kg` : undefined} className={cn(CELL, CMP_CLS[compareDone(set.kg, pKg)])}>{set.kg ?? "—"}</span>,
                    <span key={`i${k}`} title={pRir != null ? `prévu RIR ${pRir}` : undefined} className={cn(CELL, CMP_CLS[compareDone(set.rir, pRir, false)])}>{set.rir ?? "—"}</span>,
                  ]),
            ]
          })}
        </div>
      ) : sets.length > 0 ? (
        <div className="text-[11px] text-agon-tx2">{sets.filter(x => x.done).length} série(s) faite(s)</div>
      ) : showRealise && params ? (
        <div className="text-[11px] font-semibold text-agon-erreur">Non réalisé</div>
      ) : null}
      {comment && (
        <div className="rounded-[6px] bg-agon-alerte/10 px-2 py-1 text-[11px] italic text-agon-tx2">« {comment} »</div>
      )}
      {video && <VideoBadge note={video.note} sent={sets.length > 0 || showRealise ? videoSent : undefined} />}
    </div>
  )
}

// ─── Colonne 2 : ligne compacte à programmer ──────────────────────────────────

function CellInput({ value, onChange, step = 1, width = "w-14", placeholder }: {
  value: number | null; onChange: (v: number | null) => void; step?: number
  /** Classe de largeur (w-[54px]…). */
  width?: string; placeholder?: string
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
      className={cn("rounded-[5px] border border-agon-brd-l bg-agon-s1 px-1.5 py-1 text-[12px] font-bold text-agon-tx", width)}
    />
  )
}

const TH = "px-1 pb-[3px] pt-0 text-left text-[8px] font-bold uppercase tracking-[0.4px] text-agon-tx3"
const TD = "px-1 py-0.5"

function NextRow({ exercice, params, onPatch, onComment, onMore }: {
  exercice: Exercice
  params: ExerciceParams | null
  onPatch: (mutate: (p: ExerciceParams) => ExerciceParams) => void
  onComment: (text: string) => void
  onMore: () => void
}) {
  const n = params?.nb_series ?? 0
  const iso = hasIso(params)
  const showCharge = params?.charge_unit !== "PDC"
  const showRepsMax = !!params?.reps_max && Array.from({ length: n }, (_, i) => pvAt(params.reps_max!, i)).some(v => v != null)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[13px] font-bold text-agon-tx">{exercice.exercise_name || "—"}</span>
        <button onClick={onMore} title="Méthode, tempo, unité, vidéo… (éditeur complet)" className="cursor-pointer rounded-[5px] border border-agon-brd-l bg-transparent px-2 py-[3px] text-[10.5px] text-agon-tx3">Plus d&apos;options ›</button>
        {params && !params.cluster && (
          <div className="flex gap-1">
            <button
              onClick={() => onPatch(p => {
                const k = Math.max(1, p.nb_series - 1)
                return { ...p, nb_series: k, reps: pvResize(p.reps, k), reps_max: p.reps_max && pvResize(p.reps_max, k), reps_mode: pvResize(p.reps_mode, k), charge: pvResize(p.charge, k), rir: pvResize(p.rir, k) }
              })}
              title="Retirer une série"
              className={STEP_BTN}
            >−</button>
            <button
              onClick={() => onPatch(p => {
                const k = p.nb_series + 1
                return { ...p, nb_series: k, reps: pvResize(p.reps, k), reps_max: p.reps_max && pvResize(p.reps_max, k), reps_mode: pvResize(p.reps_mode, k), charge: pvResize(p.charge, k), rir: pvResize(p.rir, k) }
              })}
              title="Ajouter une série"
              className={STEP_BTN}
            >+</button>
          </div>
        )}
      </div>
      {!params ? (
        <div className="mt-1 text-[11px] text-agon-tx3">{exercice.libre_text || "Pas de paramètres"}</div>
      ) : params.cluster ? (
        <div className="mt-1 text-[11px] text-agon-tx2">
          {formatSetsReps(params)} · {fmtCharge(params)} · {fmtRIR(params)}
          <span className="text-agon-tx3"> — cluster : voir « Édition avancée »</span>
        </div>
      ) : (
        <table className="mt-1.5 border-collapse">
          <thead>
            <tr>
              <th className={TH}>Série</th>
              <th className={TH}>{iso ? (showRepsMax ? "Durée min" : "Durée") : (showRepsMax ? "Reps min" : "Reps")}</th>
              {showRepsMax && <th className={TH}>{iso ? "Durée max" : "Reps max"}</th>}
              {showCharge && <th className={TH}>{params.charge_unit === "%RM" ? "Charge %" : "Charge kg"}</th>}
              <th className={TH}>RIR</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <td className="py-0.5 pl-1 pr-1.5 text-[11px] font-bold text-agon-tx3">S{i + 1}</td>
                <td className={TD}>
                  <CellInput width="w-[54px]" value={pvAt(params.reps, i)}
                    onChange={v => onPatch(p => ({ ...p, reps: pvSetAt(p.reps, i, v ?? 0, p.nb_series) }))} />
                </td>
                {showRepsMax && (
                  <td className={TD}>
                    <CellInput width="w-[54px]" placeholder="—" value={pvAt(params.reps_max, i)}
                      onChange={v => onPatch(p => ({
                        ...p,
                        reps_max: pvSetAt<number | null>(p.reps_max ?? { mode: "global", value: null }, i, v, p.nb_series),
                      }))} />
                  </td>
                )}
                {showCharge && (
                  <td className={TD}>
                    <CellInput width="w-[66px]" step={0.5} value={pvAt(params.charge, i)}
                      onChange={v => onPatch(p => ({ ...p, charge: pvSetAt(p.charge, i, v, p.nb_series) }))} />
                  </td>
                )}
                <td className={TD}>
                  <CellInput width="w-[46px]" value={pvAt(params.rir, i)}
                    onChange={v => onPatch(p => ({ ...p, rir: pvSetAt(p.rir, i, v, p.nb_series) }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <input
        aria-label={`Commentaire pour la prochaine séance : ${exercice.exercise_name}`}
        placeholder="Commentaire pour la prochaine séance…"
        defaultValue={exercice.comment ?? ""}
        onBlur={e => { if (e.target.value !== (exercice.comment ?? "")) onComment(e.target.value) }}
        className="w-full max-w-[380px] rounded-[6px] border border-agon-brd-l bg-agon-s1 px-2 py-1.5 text-[12px] text-agon-alerte placeholder:text-agon-tx3"
      />
    </div>
  )
}

const STEP_BTN = "size-6 cursor-pointer rounded-[5px] border border-agon-brd-l bg-transparent p-0 text-[14px] font-bold text-agon-tx2 leading-none"

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProgSessionWeekDrawer({ session, cycleId, athleteId, onChange, onClose, initialWeek = 1 }: Props) {
  const [activeWeek, setActiveWeek] = useState(initialWeek)
  useEffect(() => { setActiveWeek(initialWeek) }, [initialWeek])
  const [advanced, setAdvanced] = useState(false)
  // « Plus d'options » : ouvre l'édition avancée et l'amène à l'écran (elle est en bas de la page).
  const advancedRef = useRef<HTMLDivElement>(null)
  const [scrollToAdvanced, setScrollToAdvanced] = useState(0)
  useEffect(() => {
    if (scrollToAdvanced) advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [scrollToAdvanced])
  const openAdvanced = () => { setAdvanced(true); setScrollToAdvanced(n => n + 1) }
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

  /** Commentaire de l'exercice (consigne lue par l'athlète dès la prochaine séance). */
  function setComment(exId: string, text: string) {
    onChange({
      ...editableSession,
      blocs: editableSession.blocs.map(bloc => ({
        ...bloc,
        exercices: bloc.exercices.map(ex => ex.id === exId ? { ...ex, comment: text.trim() || undefined } : ex),
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
    <div className="fixed inset-0 z-[400] flex items-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />

      <div className="relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[6px] bg-agon-bg">

        {/* ── Header + navigation par séance ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-agon-brd px-4 py-3">
          <div className="min-w-0 flex-[1_1_160px]">
            <div className="text-[15px] font-extrabold text-agon-tx">{session.name}</div>
            <div className="mt-0.5 text-[10px] text-agon-tx3">
              {totalExos} exercice{totalExos !== 1 ? "s" : ""}
              {logs.length > 0 ? ` · planifiée ${logs.length} fois` : ""}
            </div>
          </div>
          {weekCount > 1 && (
            <div className="flex max-w-full items-center gap-[5px] overflow-x-auto">
              <span className="mr-0.5 text-[9px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
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
                    className={cn(
                      "relative shrink-0 cursor-pointer rounded-[7px] border px-[11px] py-[5px] text-[11px]",
                      active ? "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent" : "border-agon-brd-l bg-transparent font-medium text-agon-tx3",
                    )}
                  >
                    {week}
                    {status && (
                      <span className={cn(
                        "absolute -right-[3px] -top-[3px] size-[7px] rounded-full border border-agon-bg",
                        TONE_DOT[status === "completed" ? "succes" : status === "missed" ? "erreur" : "alerte"],
                      )} />
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={onClose}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-agon-tx3"
          ><X size={14} /></button>
        </div>

        {/* ── Ressenti + actions ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-agon-brd px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-agon-tx2">
            <span className="font-bold text-agon-succes">Séance {activeWeek}</span>
            {currentLog?.status === "completed" ? (
              <>
                <span>{dateLabel(currentLog.scheduledDate, { weekday: "short", day: "numeric", month: "short" })}</span>
                {currentLog.rpeScore !== null && <span>RPE <strong className="text-agon-tx">{currentLog.rpeScore}</strong></span>}
                {atMods?.sessionForme != null && <span>Forme <strong className="text-agon-tx">{atMods.sessionForme}/5</strong></span>}
              </>
            ) : currentLog ? (
              getStatusForWeek(activeWeek) === "missed"
                ? <span className="font-bold text-agon-erreur">Manquée</span>
                : <span>Prévue le {dateLabel(currentLog.scheduledDate, { day: "numeric", month: "short" })}</span>
            ) : <span>{loadingLogs ? "…" : "Non planifiée"}</span>}
            <span className="text-agon-tx3">→</span>
            <span className="font-bold text-agon-alerte">Séance {nextWeek}</span>
            <span>{nextLog ? dateLabel(nextLog.scheduledDate, { weekday: "short", day: "numeric", month: "short" }) : "pas encore planifiée"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasAnySets && (
              <button
                onClick={() => copyToNext("realise")}
                title={`Prévu de la séance ${activeWeek} avec les charges réellement soulevées`}
                className="flex cursor-pointer items-center gap-1.5 rounded-[8px] border-0 bg-agon-accent px-3.5 py-2 text-[12.5px] font-bold text-agon-ink"
              ><Copy size={13} /> Reprogrammer la séance {nextWeek} avec le réalisé</button>
            )}
            <button
              onClick={() => copyToNext("prevu")}
              title={`Reprendre le prévu de la séance ${activeWeek} sur la séance ${nextWeek}`}
              className="flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-agon-brd-l bg-transparent px-3 py-2 text-[12px] font-semibold text-agon-tx"
            ><Copy size={12} /> Copier le prévu</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          {currentLog?.status === "completed" && Object.keys(currentLog.painLevels ?? {}).length > 0 && (
            <div className="px-4 pt-2"><SessionPainDetail levels={currentLog.painLevels} note={currentLog.painNote} /></div>
          )}
          {atMods?.sessionComment && (
            <div className="px-4 pt-2 text-[12px] italic text-agon-tx2">Séance : « {atMods.sessionComment} »</div>
          )}
          {currentOverride && (
            <div className="px-4 pt-2 text-[11px] font-bold text-agon-alerte">Modif ponctuelle appliquée à la séance {activeWeek}</div>
          )}
          {showOverrideBanner && nextOverride && (
            <div className="mx-4 mt-2 flex flex-col gap-1.5 rounded-[6px] border border-agon-alerte/[0.376] bg-agon-alerte/10 px-2.5 py-2">
              <div className="flex items-start gap-1.5 text-[11px] text-agon-tx">
                <AlertTriangle size={13} className="mt-px shrink-0 text-agon-alerte" />
                <span>La séance {nextWeek} a une modif ponctuelle (Planning) : l&apos;athlète fera cette version, pas tes modifs ici.</span>
              </div>
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setKeptOverrides(prev => new Set(prev).add(nextOverride.id))} className={cn(SMALL_BTN, "border border-agon-brd-l bg-transparent text-agon-tx2")}>Garder</button>
                <button onClick={clearNextOverride} disabled={clearingOverride} className={cn(SMALL_BTN, "border-0 bg-agon-alerte text-agon-ink", clearingOverride && "opacity-60")}>{clearingOverride ? "…" : "Écraser"}</button>
              </div>
            </div>
          )}

          {/* En-têtes de colonnes */}
          <div className="sticky top-0 z-[1] mt-2 grid grid-cols-2 border-y border-agon-brd bg-agon-bg">
            <div className="px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.5px] text-agon-succes">Séance {activeWeek} · réalisé</div>
            <div className="border-l border-agon-brd px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.5px] text-agon-alerte">Séance {nextWeek} · à programmer <span className="font-medium normal-case tracking-normal text-agon-tx3">(vaut aussi pour les suivantes)</span></div>
          </div>

          {editableSession.blocs.length === 0 ? (
            <EmptyCol msg="Aucun bloc" />
          ) : loadingLogs ? (
            <EmptyCol msg="Chargement…" />
          ) : editableSession.blocs.map((bloc, bi) => (
            <div key={bloc.id}>
              <div className="px-4"><BlocLabel bloc={bloc} index={bi} /></div>
              {bloc.exercices.map(ex => {
                const done = prevuBlocs.flatMap(b => b.exercices).find(x => x.id === ex.id) ?? ex
                return (
                  <div key={ex.id} className="grid grid-cols-1 border-b border-agon-brd md:grid-cols-2">
                    <div className="px-4 py-2.5">
                      <RealiseTable
                        exercice={done}
                        params={resolveParams(done, activeWeek)}
                        sets={(atMods?.sessionSets?.[ex.id] ?? []) as SessionSetLog[]}
                        comment={atMods?.exerciceComments?.[ex.id]}
                        week={activeWeek}
                        videoSent={!!atMods?.videoSent?.[ex.id]}
                        showRealise={!!currentLog && (currentLog.status === "completed" || hasAnySets)}
                      />
                    </div>
                    <div className="border-t border-agon-brd bg-agon-alerte/[0.03] px-4 py-2.5 md:border-l md:border-t-0">
                      <NextRow
                        exercice={ex}
                        params={resolveParams(ex, nextWeek)}
                        onPatch={mutate => patchNext(ex.id, mutate)}
                        onComment={text => setComment(ex.id, text)}
                        onMore={openAdvanced}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[11px] text-agon-tx3">
            <span>
              Réalisé : <span className="text-agon-tx2">gris = comme prévu</span> · <span className="text-agon-succes">vert = plus dur que prévu (plus de reps ou de kg, moins de RIR)</span> · <span className="text-agon-erreur">rouge = plus facile que prévu (moins de reps ou de kg, plus de RIR)</span>
            </span>
          </div>

          <div ref={advancedRef} className="scroll-mt-2 px-4">
            <button
              onClick={() => setAdvanced(v => !v)}
              className="mt-3.5 w-full cursor-pointer rounded-[5px] border border-dashed border-agon-brd-l bg-transparent px-2.5 py-1.5 text-[11px] font-semibold text-agon-tx3"
            >{advanced ? "Masquer l'édition avancée" : `Édition avancée de la séance ${nextWeek} (méthodes, tempo, fiches, vidéo, bloc…)`}</button>
            {advanced && (
              <div className="mt-2.5">
                <div className="mb-2 rounded-[6px] border border-agon-alerte/40 bg-agon-alerte/10 px-3 py-2 text-[12px] font-semibold text-agon-alerte">
                  Tu modifies la séance {nextWeek}
                  {nextLog ? ` (${dateLabel(nextLog.scheduledDate, { weekday: "short", day: "numeric", month: "short" })})` : " (pas encore planifiée)"}
                  <span className="font-normal text-agon-tx2"> · vaut aussi pour les suivantes, jusqu&apos;à celle qui a ses propres valeurs</span>
                </div>
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
  )
}
