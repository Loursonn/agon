import { useState, useEffect } from "react"
import { cn } from "@/lib/utils";
import { ChevronDown, Video } from "lucide-react"
import type { Exercice, ExerciceParams, ClusterConfig, ParamValue } from "./types"
import { defaultExerciceParams } from "./types"
import { ExerciceSearch } from "./ExerciceSearch"
import { ParamSeriesGrid } from "./ParamSeriesGrid"
import { SyntheseBar } from "./SyntheseBar"
import { MethodPickerModal } from "./MethodPickerModal"
import { useTrainingMethods } from "@/features/shared/hooks/useTrainingMethods"
import { useExerciceRM } from "./hooks/useExerciceRM"
import { loadFromPctRm } from "@shared/domain/performance"
import type { TrainingMethod } from "@/types/trainingMethods"
import { methodConfigToExerciceParams } from "@/features/coach/components/library/methodConfigConvert";
import { isWeekRecord, resolveExerciceParams, resolveVideoRequest, setVideoRequest } from "@/lib/sessionOccurrence"

interface ExerciceParamsProps {
  exercice: Exercice
  blocSeriesMode: 'libre' | 'fixe'
  blocSeriesCount?: number
  sessionMultiSemaine: boolean
  activeWeek: number
  athleteId: string | undefined
  onChange: (updated: Exercice) => void
}

// ─── Style helpers ────────────────────────────────────────────────────────────
// Actif = or de la charte (remplace le violet hérité) ; cluster = alerte (remplace le miel hérité).

type Tone = "accent" | "alerte"
const PILL_ON: Record<Tone, string> = {
  accent: "border-agon-accent bg-agon-accent/[0.125] font-bold text-agon-accent",
  alerte: "border-agon-alerte bg-agon-alerte/[0.125] font-bold text-agon-alerte",
}
const PILL_OFF = "border-agon-brd-l bg-transparent font-semibold text-agon-tx3"
const PILL_BASE = "cursor-pointer border [transition:all_100ms]"

function pill(active: boolean, tone: Tone = "accent"): string {
  return cn(PILL_BASE, "rounded-[7px] px-3.5 py-1.5 text-[11px]", active ? PILL_ON[tone] : PILL_OFF)
}

function pillSmall(active: boolean, tone: Tone = "accent"): string {
  return cn(PILL_BASE, "rounded-[6px] px-[9px] py-1 text-[10px]", active ? PILL_ON[tone] : PILL_OFF)
}

function pillParSerie(active: boolean): string {
  return cn(PILL_BASE, "rounded-[6px] px-[9px] py-1 text-[10px]", active ? "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent" : PILL_OFF)
}

const KICK = "text-[10px] font-extrabold uppercase tracking-[0.5px] text-agon-tx3"
/** Champ des grilles « par série ». */
const CELL = "w-full rounded-[6px] border border-agon-brd-l bg-agon-s1 px-1 py-[5px] text-agon-tx outline-none"
const TEXTAREA = "w-full resize-y rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-2 text-[12px] text-agon-tx outline-none"
const SYNTH = "rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3.5 py-2"

// ─── Inline section label ─────────────────────────────────────────────────────

function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(KICK, "shrink-0")}>
      {children}
    </div>
  )
}

// ─── Section container ────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3.5 py-2.5">
      {children}
    </div>
  )
}

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <div className={KICK}>{label}</div>
      {right}
    </div>
  )
}

// ─── Stepper — local state, no delay, click-to-edit ──────────────────────────

const STEP_BTN = "size-[30px] shrink-0 border-0 bg-transparent text-[16px] text-agon-tx3"

function Stepper({
  value, onChange, min = 1, max = 20, step = 1, tone = "text-agon-tx",
}: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number
  /** Classe de couleur du chiffre. */
  tone?: string
}) {
  const [local, setLocal] = useState(value)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")

  // Sync when external value changes (e.g. reset from parent)
  useEffect(() => {
    if (!editing) setLocal(value)
  }, [value, editing])

  function apply(v: number) {
    const rounded = step < 1 ? Math.round(v / step) * step : Math.round(v)
    const clamped = Math.max(min, Math.min(max, isNaN(rounded) ? min : rounded))
    setLocal(clamped)
    onChange(clamped)
  }

  function startEdit() {
    setEditText(String(local))
    setEditing(true)
  }

  function commitEdit() {
    const parsed = parseFloat(editText)
    apply(isNaN(parsed) ? local : parsed)
    setEditing(false)
  }

  const displayVal = step < 1 ? local : String(local)

  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-[4px] border border-agon-brd-l bg-agon-s1">
      <button
        type="button"
        onClick={() => apply(local - step)}
        className={cn(STEP_BTN, local <= min ? "cursor-default opacity-30" : "cursor-pointer")}
      >−</button>
      {editing ? (
        <input
          autoFocus
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit() }}
          className={cn("w-10 border-0 bg-transparent p-0 text-center text-[14px] font-extrabold outline-none", tone)}
        />
      ) : (
        <div
          onClick={startEdit}
          title="Cliquer pour saisir"
          className={cn("w-10 cursor-text select-none text-center text-[14px] font-extrabold", tone)}
        >{displayVal}</div>
      )}
      <button
        type="button"
        onClick={() => apply(local + step)}
        className={cn(STEP_BTN, local >= max ? "cursor-default opacity-30" : "cursor-pointer")}
      >+</button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getParams(exercice: Exercice, activeWeek: number, _multiSemaine: boolean): ExerciceParams {
  const p = exercice.params
  if (!p || typeof p !== 'object') return defaultExerciceParams()
  // Occurrence sans valeur propre → reprend la dernière définie avant elle
  const result: ExerciceParams = resolveExerciceParams(p, activeWeek) ?? defaultExerciceParams()
  // Guard against incomplete/corrupt stored params
  const def = defaultExerciceParams(result.nb_series)
  return {
    ...def,
    ...result,
    reps: result.reps ?? def.reps,
    reps_mode: result.reps_mode ?? def.reps_mode,
    charge: result.charge ?? def.charge,
    rir: result.rir ?? def.rir,
    tempo: result.tempo ?? def.tempo,
  }
}

function setParams(exercice: Exercice, params: ExerciceParams, activeWeek: number, multiSemaine: boolean): Exercice {
  const existing = exercice.params
  const isExistingRecord = isWeekRecord(existing)
  // Params déjà par occurrence : on n'écrase jamais les autres occurrences
  if (multiSemaine || isExistingRecord) {
    // Params plats = valables pour toutes les occurrences → deviennent l'occurrence 1
    // (sinon l'édition d'une occurrence réécrirait aussi les précédentes)
    const rec: Record<string, ExerciceParams> = isExistingRecord
      ? { ...existing }
      : existing && typeof existing === 'object' ? { '1': existing as ExerciceParams } : {}
    rec[String(activeWeek)] = params
    return { ...exercice, params: rec }
  }
  return { ...exercice, params }
}

function ensureLength<T>(arr: T[], length: number, fill: T): T[] {
  const result = [...arr]
  while (result.length < length) result.push(fill)
  return result.slice(0, length)
}

function methodToParams(method: TrainingMethod, currentParams: ExerciceParams): ExerciceParams {
  try {
    const converted = methodConfigToExerciceParams(method.config, method.scope)
    return {
      ...converted,
      // EC/ISO is an exercise-level preference, not method-defined
      reps_mode: currentParams.reps_mode,
      // For set scope: nb_series = how many main sets have the method applied (not the cluster count)
      ...(method.scope === 'set' ? { nb_series: currentParams.nb_series } : {}),
    }
  } catch (err) {
    console.error('[methodToParams] conversion failed for method:', method.id, method.name, err)
    return currentParams
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExerciceParamsPanel({
  exercice,
  blocSeriesMode,
  blocSeriesCount,
  sessionMultiSemaine,
  activeWeek,
  athleteId,
  onChange,
}: ExerciceParamsProps) {
  const [showSearch, setShowSearch] = useState(!exercice.exercise_name)
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const { data: methods = [] } = useTrainingMethods()
  const { best: bestRM } = useExerciceRM(athleteId, exercice)

  const multiSemaine = sessionMultiSemaine || (exercice.multi_semaine ?? false)
  const params = getParams(exercice, activeWeek, multiSemaine)
  const videoRequest = resolveVideoRequest(exercice, activeWeek)
  // Consigne reprise si on recoche après avoir décoché
  const lastVideoNote = Object.values(exercice.video_request ?? {}).map(v => v.note).filter(Boolean).pop()

  function updateParams(partial: Partial<ExerciceParams>) {
    onChange(setParams(exercice, { ...params, ...partial }, activeWeek, multiSemaine))
  }

  function updateMode(mode: 'classique' | 'methode' | 'libre') {
    onChange({ ...exercice, mode, methode_id: undefined, applied_to_sets: undefined })
  }

  function handleMethodSelect(method: TrainingMethod) {
    const converted = methodToParams(method, params)
    onChange(setParams({ ...exercice, methode_id: method.id, mode: 'methode', applied_to_sets: undefined }, converted, activeWeek, multiSemaine))
  }

  const nb = blocSeriesMode === 'fixe' && blocSeriesCount ? blocSeriesCount : params.nb_series

  const repsGlobal = params.reps.mode === 'global' ? params.reps.value : 8
  const repsValues = params.reps.mode === 'par_serie'
    ? ensureLength(params.reps.values, nb, repsGlobal)
    : Array(nb).fill(repsGlobal)

  const chargeGlobal = params.charge.mode === 'global' ? params.charge.value : null
  const chargeValues = params.charge.mode === 'par_serie'
    ? ensureLength(params.charge.values, nb, chargeGlobal)
    : Array(nb).fill(chargeGlobal)

  // rir can be null (Libre mode)
  const rirIsGlobal = params.rir.mode === 'global'
  const rirGlobal: number | null = params.rir.mode === 'global' ? params.rir.value : 2
  const rirValues = params.rir.mode === 'par_serie'
    ? ensureLength(params.rir.values as (number | null)[], nb, 2)
    : Array(nb).fill(rirGlobal ?? 2)

  const tempoGlobal = params.tempo.mode === 'global' ? params.tempo.value : ''
  const tempoValues = params.tempo.mode === 'par_serie'
    ? ensureLength(params.tempo.values, nb, tempoGlobal)
    : Array(nb).fill(tempoGlobal)

  const currentRepsMode = params.reps_mode.mode === 'global' ? params.reps_mode.value : 'EC'
  const selectedMethod = methods.find(m => m.id === exercice.methode_id)

  return (
    <div className="flex flex-col gap-2 py-2.5">

      {/* 1. Exercice */}
      <Section>
        <SectionLabel label="Exercice" />
        {showSearch ? (
          <ExerciceSearch
            value={exercice.exercise_name}
            onSelect={ex => { onChange({ ...exercice, exercise_id: ex.id, exercise_name: ex.name }); setShowSearch(false) }}
            onClose={() => setShowSearch(false)}
          />
        ) : (
          <button onClick={() => setShowSearch(true)} className={cn(
            "w-full cursor-pointer rounded-[4px] border border-agon-brd-l bg-agon-s1 px-3 py-[9px] text-left text-[13px] font-semibold",
            exercice.exercise_name ? "text-agon-tx" : "text-agon-tx3",
          )}>
            {exercice.exercise_name || "Choisir un exercice…"}
          </button>
        )}
      </Section>

      {/* 2. Mode + Méthode */}
      <Section>
        <SectionLabel label="Mode" />
        <div className={cn("flex justify-center gap-1.5", (exercice.mode === 'methode' || exercice.mode === 'libre') && "mb-2.5")}>
          <button onClick={() => updateMode('classique')} className={pill(exercice.mode === 'classique')}>Classique</button>
          <button onClick={() => updateMode('methode')} className={pill(exercice.mode === 'methode')}>Méthode</button>
          <button onClick={() => updateMode('libre')} className={pill(exercice.mode === 'libre')}>Libre</button>
        </div>
        {exercice.mode === 'libre' && (
          <textarea
            value={exercice.libre_text ?? ""}
            onChange={e => onChange({ ...exercice, libre_text: e.target.value || undefined })}
            placeholder="Texte libre (ex: 10 min de gainage au choix, circuit mobilité épaules...)"
            rows={3}
            autoFocus
            className={TEXTAREA}
          />
        )}
        {exercice.mode === 'methode' && (
          <>
            <button onClick={() => setShowMethodPicker(true)} className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-[4px] border px-3 py-[9px]",
              selectedMethod ? "border-agon-accent bg-agon-accent/[0.12]" : "border-agon-brd-l bg-agon-s1",
            )}>
              <div className="min-w-0 text-left">
                {selectedMethod ? (
                  <>
                    <div className="text-[13px] font-bold text-agon-accent">{selectedMethod.name}</div>
                    <div className="mt-px text-[10px] text-agon-tx3">{selectedMethod.category}</div>
                  </>
                ) : (
                  <div className="text-[13px] text-agon-tx3">Choisir une méthode…</div>
                )}
              </div>
              <ChevronDown size={14} className="text-agon-tx3" />
            </button>

            {/* Set selector — only for scope='set' methods */}
            {selectedMethod?.scope === 'set' && nb > 0 && (
              <div className="mt-2.5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
                  Appliquer sur le(s) set(s)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: nb }, (_, i) => i + 1).map(n => {
                    const active = (exercice.applied_to_sets ?? []).includes(n)
                    return (
                      <button
                        key={n}
                        onClick={() => {
                          const cur = exercice.applied_to_sets ?? []
                          const next = cur.includes(n) ? cur.filter(s => s !== n) : [...cur, n].sort((a, b) => a - b)
                          onChange({ ...exercice, applied_to_sets: next })
                        }}
                        className={cn(
                          "flex size-9 cursor-pointer items-center justify-center rounded-[4px] border-2 text-[13px] font-bold",
                          active ? "border-agon-accent bg-agon-accent/[0.12] text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx3",
                        )}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
                {!(exercice.applied_to_sets ?? []).length && (
                  <div className="mt-1.5 text-[11px] text-agon-alerte">Sélectionne au moins un set.</div>
                )}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Sections 3-8 + synthèse masquées en mode libre (juste texte) */}
      {exercice.mode !== 'libre' && (
      <>
      {/* 3. Séries — one line */}
      <Section>
        <div className="flex items-center justify-between gap-2">
          <InlineLabel>Séries</InlineLabel>
          {blocSeriesMode === 'libre' ? (
            <Stepper value={params.nb_series} onChange={v => updateParams({ nb_series: v })} min={1} max={20} />
          ) : (
            <span className="text-[13px] font-bold text-agon-tx2">{blocSeriesCount} (fixe)</span>
          )}
        </div>
      </Section>

      {/* 4. Répétitions */}
      <Section>
        {/* Label row — always one line */}
        <div className="flex flex-wrap items-center gap-1.5">
          <InlineLabel>{currentRepsMode === 'iso' ? "Durée (s)" : "Répétitions"}</InlineLabel>

          {/* Inline value when global + no cluster */}
          {!params.cluster && params.reps.mode === 'global' && (
            <>
              <Stepper value={repsGlobal} onChange={v => updateParams({ reps: { mode: 'global', value: v } })} min={1} max={100} />
              {/* Rep range: optional max */}
              {params.reps_max?.mode === 'global' && params.reps_max.value != null ? (
                <>
                  <span className="text-[12px] font-bold text-agon-tx3">–</span>
                  <Stepper value={params.reps_max.value} onChange={v => updateParams({ reps_max: { mode: 'global', value: v } })} min={repsGlobal + 1} max={100} />
                  <button onClick={() => updateParams({ reps_max: undefined })} className="cursor-pointer rounded-[6px] border border-agon-erreur/25 bg-agon-erreur/[0.082] px-2 py-1 text-[10px] font-bold text-agon-erreur">×</button>
                </>
              ) : (
                <button
                  onClick={() => updateParams({ reps_max: { mode: 'global', value: repsGlobal + 4 } })}
                  className="cursor-pointer rounded-[6px] border border-dashed border-agon-accent/[0.376] bg-agon-accent/[0.063] px-2.5 py-1 text-[10px] font-bold text-agon-accent"
                  title="Ajouter une fourchette (ex: 8-12)"
                >
                  8–12
                </button>
              )}
              {currentRepsMode === 'iso' && <span className="text-[10px] font-semibold text-agon-tx3">s</span>}
            </>
          )}

          {/* EC / ISO — aussi en mode « par série » ; enregistré pour l'occurrence éditée */}
          {!params.cluster && (
            <>
              <button onClick={() => updateParams({ reps_mode: { mode: 'global', value: 'EC' } })} className={pillSmall(currentRepsMode === 'EC')}>EC</button>
              <button onClick={() => updateParams({ reps_mode: { mode: 'global', value: 'iso' } })} className={pillSmall(currentRepsMode === 'iso')}>ISO</button>
            </>
          )}

          {/* Right buttons */}
          <div className="ml-auto flex shrink-0 gap-1">
            <button
              onClick={() => {
                if (params.reps.mode === 'par_serie') {
                  updateParams({ reps: { mode: 'global', value: repsValues[0] ?? 8 } })
                } else {
                  updateParams({ reps: { mode: 'par_serie', values: Array(nb).fill(repsGlobal) } })
                }
              }}
              className={pillParSerie(params.reps.mode === 'par_serie')}
            >
              {params.reps.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
            <button
              onClick={() => {
                if (params.cluster) {
                  updateParams({ cluster: undefined })
                } else {
                  updateParams({ cluster: { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 } })
                }
              }}
              className={pillSmall(!!params.cluster, "alerte")}
            >
              {params.cluster ? "Cluster ✓" : "Cluster"}
            </button>
          </div>
        </div>

        {/* Cluster editor */}
        {params.cluster && (
          <div className="mt-2">
            <ClusterEditor cluster={params.cluster} onChange={c => updateParams({ cluster: c })} />
          </div>
        )}

        {/* Par série grid */}
        {!params.cluster && params.reps.mode === 'par_serie' && (
          <div className="mt-2">
            <ParamSeriesGrid
              nb_series={nb}
              values={repsValues}
              onChange={values => updateParams({ reps: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="number" value={v}
                  onChange={e => ch(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1} max={100}
                  className={cn(CELL, "text-center text-[12px]")}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* 5. Charge */}
      <Section>
        <SectionLabel
          label="Charge"
          right={
            <button
              onClick={() => {
                if (params.charge.mode === 'par_serie') {
                  updateParams({ charge: { mode: 'global', value: chargeValues[0] } })
                } else {
                  updateParams({ charge: { mode: 'par_serie', values: Array(nb).fill(chargeGlobal) } })
                }
              }}
              className={pillParSerie(params.charge.mode === 'par_serie')}
            >
              {params.charge.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          }
        />

        {/* Unit pills */}
        <div className="mb-2.5 flex justify-center gap-1.5">
          {(['%RM', 'kg', 'PDC'] as const).map(u => (
            <button key={u} onClick={() => updateParams({ charge_unit: u })} className={pill(params.charge_unit === u)}>{u}</button>
          ))}
        </div>

        {params.charge_unit === '%RM' && !bestRM && (
          <div className="mb-2 rounded-[4px] border border-agon-alerte/25 bg-agon-alerte-doux px-2.5 py-[7px] text-[11px] text-agon-alerte">
            <div className="mb-1.5 text-center">Aucun 1RM enregistré</div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-[10px] text-agon-tx3">1RM estimé :</span>
              <input
                type="number"
                value={params.manual_rm ?? ""}
                onChange={e => updateParams({ manual_rm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="ex: 100"
                min={0}
                className="w-[70px] rounded-[6px] border border-agon-brd-l bg-agon-s1 px-1.5 py-1 text-center text-[12px] font-bold text-agon-tx outline-none"
              />
              <span className="text-[10px] text-agon-tx3">kg</span>
            </div>
          </div>
        )}

        {params.charge_unit !== 'PDC' && (
          params.charge.mode === 'global' ? (
            <div className="flex justify-center">
              <div className="flex items-center gap-1.5">
                <input
                  type="number" value={chargeGlobal ?? ""}
                  onChange={e => updateParams({ charge: { mode: 'global', value: e.target.value === "" ? null : parseFloat(e.target.value) } })}
                  placeholder="—" min={0}
                  className="w-20 rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2 py-[7px] text-center text-[14px] font-bold text-agon-tx outline-none"
                />
                <span className="text-[12px] font-semibold text-agon-tx3">{params.charge_unit}</span>
                {params.charge_unit === '%RM' && (bestRM || params.manual_rm) && chargeGlobal !== null && (
                  <span className="shrink-0 rounded-[6px] bg-agon-accent/[0.12] px-[7px] py-0.5 text-[12px] font-bold text-agon-accent">
                    ≈ {loadFromPctRm(bestRM?.kg ?? params.manual_rm, chargeGlobal as number)}kg
                  </span>
                )}
              </div>
            </div>
          ) : (
            <ParamSeriesGrid
              nb_series={nb}
              values={chargeValues}
              onChange={values => updateParams({ charge: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="number" value={v ?? ""}
                  onChange={e => ch(e.target.value === "" ? null : parseFloat(e.target.value))}
                  placeholder="—"
                  className={cn(CELL, "text-center text-[12px]")}
                />
              )}
            />
          )
        )}
      </Section>

      {/* 6. RIR — one line */}
      <Section>
        <div className="flex flex-wrap items-center gap-1.5">
          <InlineLabel>RIR</InlineLabel>

          {rirIsGlobal && (
            <>
              <button
                onClick={() => updateParams({ rir: { mode: 'global', value: rirGlobal === null ? 2 : null } })}
                className={pillSmall(rirGlobal === null)}
              >
                {rirGlobal === null ? "Libre ✓" : "Libre"}
              </button>
              {rirGlobal !== null && (
                <Stepper
                  value={rirGlobal}
                  onChange={v => updateParams({ rir: { mode: 'global', value: v } })}
                  min={0} max={5} step={0.5}
                />
              )}
            </>
          )}

          <div className="ml-auto shrink-0">
            <button
              onClick={() => {
                if (params.rir.mode === 'par_serie') {
                  updateParams({ rir: { mode: 'global', value: (rirValues[0] as number) ?? 2 } })
                } else {
                  updateParams({ rir: { mode: 'par_serie', values: Array(nb).fill(rirGlobal ?? 2) as number[] } })
                }
              }}
              className={pillParSerie(params.rir.mode === 'par_serie')}
            >
              {params.rir.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          </div>
        </div>

        {params.rir.mode === 'par_serie' && (
          <div className="mt-2">
            <ParamSeriesGrid
              nb_series={nb}
              values={rirValues as number[]}
              onChange={values => updateParams({ rir: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <select value={v ?? 2} onChange={e => ch(parseFloat(e.target.value))}
                  className={cn(CELL, "text-[11px]")}>
                  {[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            />
          </div>
        )}
      </Section>

      {/* 7. Tempo — one line */}
      <Section>
        <div className="flex items-center gap-1.5">
          <InlineLabel>Tempo</InlineLabel>
          <span className="shrink-0 text-[9px] text-agon-tx3">ecc–pause–con</span>

          {params.tempo.mode === 'global' && (
            <input
              type="text" value={tempoGlobal}
              onChange={e => updateParams({ tempo: { mode: 'global', value: e.target.value } })}
              placeholder="3-1-2-0"
              className="w-[88px] rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2 py-[5px] text-center text-[13px] font-bold text-agon-tx outline-none"
            />
          )}

          <div className="ml-auto shrink-0">
            <button
              onClick={() => {
                if (params.tempo.mode === 'par_serie') {
                  updateParams({ tempo: { mode: 'global', value: tempoValues[0] ?? '' } })
                } else {
                  updateParams({ tempo: { mode: 'par_serie', values: Array(nb).fill(tempoGlobal) } })
                }
              }}
              className={pillParSerie(params.tempo.mode === 'par_serie')}
            >
              {params.tempo.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          </div>
        </div>

        {params.tempo.mode === 'par_serie' && (
          <div className="mt-2">
            <ParamSeriesGrid
              nb_series={nb}
              values={tempoValues}
              onChange={values => updateParams({ tempo: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="text" value={v} onChange={e => ch(e.target.value)} placeholder="3-1-2-0"
                  className={cn(CELL, "text-center text-[11px]")}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* 8. Paramètres par semaine */}
      {!sessionMultiSemaine && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              const newMulti = !(exercice.multi_semaine ?? false)
              let newParams = exercice.params
              if (newMulti && typeof exercice.params === 'object' && 'mode' in exercice.params) {
                newParams = { '1': exercice.params as unknown as ExerciceParams }
              } else if (!newMulti && typeof exercice.params === 'object' && !('mode' in exercice.params)) {
                const rec = exercice.params as Record<string, ExerciceParams>
                newParams = Object.values(rec)[0] ?? defaultExerciceParams()
              }
              onChange({ ...exercice, multi_semaine: newMulti, params: newParams })
            }}
            className={pill(exercice.multi_semaine ?? false)}
          >
            {(exercice.multi_semaine ?? false) ? "◉ Paramètres par semaine" : "◎ Paramètres par semaine"}
          </button>
        </div>
      )}
      </>
      )}

      {/* 9. Commentaire coach */}
      <Section>
        <SectionLabel label="Note / consigne" />
        <textarea
          value={exercice.comment ?? ""}
          onChange={e => onChange({ ...exercice, comment: e.target.value || undefined })}
          placeholder="Instruction pour l'athlète (ex: Garder les coudes serrés, tempo contrôlé...)"
          rows={2}
          className={TEXTAREA}
        />
      </Section>

      {/* 9b. Retour vidéo */}
      <Section>
        <button
          type="button"
          onClick={() => onChange(setVideoRequest(exercice, activeWeek, videoRequest
            ? { requested: false }
            : { requested: true, ...(lastVideoNote ? { note: lastVideoNote } : {}) }))}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-[4px] border px-2.5 py-2 text-left text-[12px] font-bold",
            videoRequest ? "border-agon-accent/50 bg-agon-accent/[0.078] text-agon-accent" : "border-agon-brd-l bg-transparent text-agon-tx2",
          )}
        >
          <span className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[3px] border-2 text-[11px] font-black text-agon-ink",
            videoRequest ? "border-agon-accent bg-agon-accent" : "border-agon-brd-l bg-transparent",
          )}>{videoRequest ? "✓" : ""}</span>
          <Video size={13} />
          Retour vidéo demandé
          {multiSemaine && (
            <span className="ml-auto text-[10px] font-medium text-agon-tx3">
              dès la séance {activeWeek}
            </span>
          )}
        </button>
        {videoRequest && (
          <input
            value={videoRequest.note ?? ""}
            onChange={e => onChange(setVideoRequest(exercice, activeWeek, { requested: true, ...(e.target.value ? { note: e.target.value } : {}) }))}
            placeholder="Consigne (optionnel) : ex. dernière série, vue de profil"
            className="mt-1.5 w-full rounded-[4px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[7px] text-[12px] text-agon-tx outline-none"
          />
        )}
      </Section>

      {/* 10. Synthèse */}
      {exercice.mode !== 'libre' && (
        <div className={SYNTH}>
          <SyntheseBar params={{ ...params, nb_series: nb }} />
        </div>
      )}
      <div className={SYNTH}>
        <SyntheseBar params={{ ...params, nb_series: nb }} />
      </div>

      {/* Method picker modal */}
      {showMethodPicker && (
        <MethodPickerModal
          methods={methods}
          selectedId={exercice.methode_id}
          onSelect={handleMethodSelect}
          onClose={() => setShowMethodPicker(false)}
        />
      )}
    </div>
  )
}

// ─── Cluster editor ───────────────────────────────────────────────────────────

const CL_KICK = "text-[9px] font-bold uppercase tracking-[0.4px] text-agon-alerte"
const CL_STEP = "h-[22px] w-6 cursor-pointer border border-agon-alerte/[0.376] bg-transparent text-[13px] text-agon-alerte"

function ClusterEditor({ cluster, onChange }: { cluster: ClusterConfig; onChange: (c: ClusterConfig) => void }) {
  const safeReps: number[] = Array.isArray(cluster.reps)
    ? cluster.reps
    : Array(cluster.nb_clusters).fill((cluster as unknown as { reps_per_cluster?: number }).reps_per_cluster ?? 5)

  function updateRep(i: number, v: number) {
    const next = [...safeReps]
    next[i] = v
    onChange({ ...cluster, reps: next })
  }

  function setNbClusters(n: number) {
    const base = safeReps[safeReps.length - 1] ?? 5
    const next = n > safeReps.length
      ? [...safeReps, ...Array(n - safeReps.length).fill(base)]
      : safeReps.slice(0, n)
    onChange({ ...cluster, nb_clusters: n, reps: next })
  }

  const pattern = safeReps.join("+")

  return (
    <div className="rounded-[4px] border border-agon-alerte/[0.314] bg-agon-alerte/[0.039] p-2.5">
      <div className="mb-2.5 flex items-center justify-center gap-2.5">
        <div className="text-center">
          <div className={cn(CL_KICK, "mb-1")}>Clusters</div>
          <Stepper value={cluster.nb_clusters} onChange={setNbClusters} min={2} max={8} tone="text-agon-alerte" />
        </div>
        <div className="text-center">
          <div className={cn(CL_KICK, "mb-1")}>Récup (s)</div>
          <Stepper value={cluster.recup_sec} onChange={v => onChange({ ...cluster, recup_sec: v })} min={5} max={120} tone="text-agon-alerte" />
        </div>
      </div>

      <div className="mb-2">
        <div className={cn(CL_KICK, "mb-1.5 text-center")}>Reps / cluster</div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {safeReps.map((v, i) => (
            <div key={i} className="text-center">
              <div className="mb-[3px] text-[9px] text-agon-alerte">C{i + 1}</div>
              <div className="flex flex-col items-center gap-px">
                <button onClick={() => updateRep(i, Math.min(20, v + 1))} className={cn(CL_STEP, "rounded-t-[5px]")}>+</button>
                <div className="flex h-[26px] w-7 items-center justify-center border-x border-agon-alerte/[0.376] bg-agon-alerte/[0.031] text-[13px] font-extrabold text-agon-alerte">{v}</div>
                <button onClick={() => updateRep(i, Math.max(1, v - 1))} className={cn(CL_STEP, "rounded-b-[5px]")}>−</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[7px] border border-agon-alerte/25 bg-agon-alerte/[0.094] px-2.5 py-[5px] text-center">
        <span className="text-[13px] font-extrabold tracking-[2px] text-agon-alerte">{pattern}</span>
        <span className="ml-1.5 text-[10px] text-agon-alerte/[0.667]">+ {cluster.recup_sec}s repos</span>
      </div>
    </div>
  )
}
