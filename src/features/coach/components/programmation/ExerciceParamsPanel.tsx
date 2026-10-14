import { useState, useEffect } from "react"
import { C } from "@/lib/theme"
import { ChevronDown } from "lucide-react"
import type { Exercice, ExerciceParams, ClusterConfig, ParamValue } from "./types"
import { defaultExerciceParams } from "./types"
import { ExerciceSearch } from "./ExerciceSearch"
import { ParamSeriesGrid } from "./ParamSeriesGrid"
import { SyntheseBar } from "./SyntheseBar"
import { MethodPickerModal } from "./MethodPickerModal"
import { useTrainingMethods } from "@/features/shared/hooks/useTrainingMethods"
import { useExerciceRM } from "./hooks/useExerciceRM"
import type { TrainingMethod } from "@/types/trainingMethods"
import { methodConfigToExerciceParams } from "@/features/coach/components/library/MethodPreview"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"
const ORANGE = "#F5A623"

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

function pill(active: boolean, color = VIOLET): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 7,
    border: "1px solid " + (active ? color : C.brdL),
    background: active ? color + "20" : "transparent",
    color: active ? color : C.tx3,
    fontSize: 11, fontWeight: active ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", transition: "all 100ms",
  }
}

function pillSmall(active: boolean, color = VIOLET): React.CSSProperties {
  return {
    padding: "4px 9px", borderRadius: 6,
    border: "1px solid " + (active ? color : C.brdL),
    background: active ? color + "20" : "transparent",
    color: active ? color : C.tx3,
    fontSize: 10, fontWeight: active ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", transition: "all 100ms",
  }
}

function pillParSerie(active: boolean): React.CSSProperties {
  return {
    padding: "4px 9px", borderRadius: 6,
    border: "1px solid " + (active ? VIOLET : C.brdL),
    background: active ? VIOLET_S : "transparent",
    color: active ? VIOLET : C.tx3,
    fontSize: 10, fontWeight: active ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", transition: "all 100ms",
  }
}

// ─── Inline section label ─────────────────────────────────────────────────────

function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", flexShrink: 0 }}>
      {children}
    </div>
  )
}

// ─── Section container ────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brdL, padding: "10px 14px" }}>
      {children}
    </div>
  )
}

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{label}</div>
      {right}
    </div>
  )
}

// ─── Stepper — local state, no delay, click-to-edit ──────────────────────────

function Stepper({
  value, onChange, min = 1, max = 20, step = 1, color = C.tx,
}: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; color?: string
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
    <div style={{ display: "flex", alignItems: "center", background: C.s1, borderRadius: 4, border: "1px solid " + C.brdL, overflow: "hidden", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => apply(local - step)}
        style={{ width: 30, height: 30, border: "none", background: "transparent", color: C.tx3, cursor: local <= min ? "default" : "pointer", fontSize: 16, fontFamily: "inherit", flexShrink: 0, opacity: local <= min ? 0.3 : 1 }}
      >−</button>
      {editing ? (
        <input
          autoFocus
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit() }}
          style={{ width: 40, border: "none", background: "transparent", color, fontSize: 14, fontWeight: 800, fontFamily: "inherit", outline: "none", textAlign: "center" as const, padding: 0 }}
        />
      ) : (
        <div
          onClick={startEdit}
          title="Cliquer pour saisir"
          style={{ width: 40, textAlign: "center" as const, fontSize: 14, fontWeight: 800, color, fontFamily: "inherit", cursor: "text", userSelect: "none" as const }}
        >{displayVal}</div>
      )}
      <button
        type="button"
        onClick={() => apply(local + step)}
        style={{ width: 30, height: 30, border: "none", background: "transparent", color: C.tx3, cursor: local >= max ? "default" : "pointer", fontSize: 16, fontFamily: "inherit", flexShrink: 0, opacity: local >= max ? 0.3 : 1 }}
      >+</button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getParams(exercice: Exercice, activeWeek: number, _multiSemaine: boolean): ExerciceParams {
  const p = exercice.params
  if (!p || typeof p !== 'object') return defaultExerciceParams()
  const isRecord = Object.keys(p as object).some((k) => /^\d+$/.test(k))
  let result: ExerciceParams
  if (isRecord) {
    const weekKey = String(activeWeek)
    const rec = p as Record<string, ExerciceParams>
    result = rec[weekKey] ?? rec['1'] ?? defaultExerciceParams()
  } else {
    result = p as ExerciceParams
  }
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
  if (multiSemaine) {
    const weekKey = String(activeWeek)
    const existing = exercice.params
    // Only keep existing as Record base if it actually has numeric week keys (not a flat ExerciceParams)
    const isExistingRecord = typeof existing === 'object' && existing !== null && Object.keys(existing as object).some((k) => /^\d+$/.test(k))
    const rec = isExistingRecord ? { ...(existing as Record<string, ExerciceParams>) } : {}
    rec[weekKey] = params
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
  const { best: bestRM } = useExerciceRM(athleteId, exercice.exercise_name)

  const multiSemaine = sessionMultiSemaine || (exercice.multi_semaine ?? false)
  const params = getParams(exercice, activeWeek, multiSemaine)

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
  const rirGlobal: number | null = rirIsGlobal ? params.rir.value : 2
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0" }}>

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
          <button onClick={() => setShowSearch(true)} style={{
            width: "100%", padding: "9px 12px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s1,
            color: exercice.exercise_name ? C.tx : C.tx3,
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
          }}>
            {exercice.exercise_name || "Choisir un exercice…"}
          </button>
        )}
      </Section>

      {/* 2. Mode + Méthode */}
      <Section>
        <SectionLabel label="Mode" />
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: exercice.mode === 'methode' || exercice.mode === 'libre' ? 10 : 0 }}>
          <button onClick={() => updateMode('classique')} style={pill(exercice.mode === 'classique')}>Classique</button>
          <button onClick={() => updateMode('methode')} style={pill(exercice.mode === 'methode')}>Méthode</button>
          <button onClick={() => updateMode('libre')} style={pill(exercice.mode === 'libre')}>Libre</button>
        </div>
        {exercice.mode === 'libre' && (
          <textarea
            value={exercice.libre_text ?? ""}
            onChange={e => onChange({ ...exercice, libre_text: e.target.value || undefined })}
            placeholder="Texte libre (ex: 10 min de gainage au choix, circuit mobilité épaules...)"
            rows={3}
            autoFocus
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s1,
              color: C.tx, fontSize: 12, fontFamily: "inherit",
              outline: "none", resize: "vertical" as const,
              boxSizing: "border-box" as const,
            }}
          />
        )}
        {exercice.mode === 'methode' && (
          <>
            <button onClick={() => setShowMethodPicker(true)} style={{
              width: "100%", padding: "9px 12px", borderRadius: 4,
              border: "1px solid " + (selectedMethod ? VIOLET : C.brdL),
              background: selectedMethod ? VIOLET_S : C.s1,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ textAlign: "left" as const, minWidth: 0 }}>
                {selectedMethod ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: VIOLET }}>{selectedMethod.name}</div>
                    <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{selectedMethod.category}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: C.tx3 }}>Choisir une méthode…</div>
                )}
              </div>
              <ChevronDown size={14} color={C.tx3} />
            </button>

            {/* Set selector — only for scope='set' methods */}
            {selectedMethod?.scope === 'set' && nb > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 8 }}>
                  Appliquer sur le(s) set(s)
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
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
                        style={{
                          width: 36, height: 36, borderRadius: 4,
                          border: "2px solid " + (active ? VIOLET : C.brdL),
                          background: active ? VIOLET_S : "transparent",
                          color: active ? VIOLET : C.tx3,
                          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
                {!(exercice.applied_to_sets ?? []).length && (
                  <div style={{ fontSize: 11, color: C.o, marginTop: 6 }}>Sélectionne au moins un set.</div>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <InlineLabel>Séries</InlineLabel>
          {blocSeriesMode === 'libre' ? (
            <Stepper value={params.nb_series} onChange={v => updateParams({ nb_series: v })} min={1} max={20} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx2 }}>{blocSeriesCount} (fixe)</span>
          )}
        </div>
      </Section>

      {/* 4. Répétitions */}
      <Section>
        {/* Label row — always one line */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <InlineLabel>{currentRepsMode === 'iso' ? "Durée (sec)" : "Répétitions"}</InlineLabel>

          {/* Inline value when global + no cluster */}
          {!params.cluster && params.reps.mode === 'global' && (
            <>
              <Stepper value={repsGlobal} onChange={v => updateParams({ reps: { mode: 'global', value: v } })} min={1} max={100} />
              {/* Rep range: optional max */}
              {params.reps_max?.mode === 'global' && params.reps_max.value != null ? (
                <>
                  <span style={{ fontSize: 12, color: C.tx3, fontWeight: 700 }}>–</span>
                  <Stepper value={params.reps_max.value} onChange={v => updateParams({ reps_max: { mode: 'global', value: v } })} min={repsGlobal + 1} max={100} />
                  <button onClick={() => updateParams({ reps_max: undefined })} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.r + "40", background: C.r + "15", color: C.r, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                </>
              ) : (
                <button
                  onClick={() => updateParams({ reps_max: { mode: 'global', value: repsGlobal + 4 } })}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px dashed " + VIOLET + "60", background: VIOLET + "10", color: VIOLET, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  title="Ajouter une fourchette (ex: 8-12)"
                >
                  8–12
                </button>
              )}
              {currentRepsMode === 'iso' && <span style={{ fontSize: 10, color: C.tx3, fontWeight: 600 }}>sec</span>}
              <button onClick={() => updateParams({ reps_mode: { mode: 'global', value: 'EC' } })} style={pillSmall(currentRepsMode === 'EC')}>EC</button>
              <button onClick={() => updateParams({ reps_mode: { mode: 'global', value: 'iso' } })} style={pillSmall(currentRepsMode === 'iso')}>ISO</button>
            </>
          )}

          {/* Right buttons */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => {
                if (params.reps.mode === 'par_serie') {
                  updateParams({ reps: { mode: 'global', value: repsValues[0] ?? 8 } })
                } else {
                  updateParams({ reps: { mode: 'par_serie', values: Array(nb).fill(repsGlobal) } })
                }
              }}
              style={pillParSerie(params.reps.mode === 'par_serie')}
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
              style={pillSmall(!!params.cluster, ORANGE)}
            >
              {params.cluster ? "Cluster ✓" : "Cluster"}
            </button>
          </div>
        </div>

        {/* Cluster editor */}
        {params.cluster && (
          <div style={{ marginTop: 8 }}>
            <ClusterEditor cluster={params.cluster} onChange={c => updateParams({ cluster: c })} />
          </div>
        )}

        {/* Par série grid */}
        {!params.cluster && params.reps.mode === 'par_serie' && (
          <div style={{ marginTop: 8 }}>
            <ParamSeriesGrid
              nb_series={nb}
              values={repsValues}
              onChange={values => updateParams({ reps: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="number" value={v}
                  onChange={e => ch(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1} max={100}
                  style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
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
              style={pillParSerie(params.charge.mode === 'par_serie')}
            >
              {params.charge.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          }
        />

        {/* Unit pills */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
          {(['%RM', 'kg', 'PDC'] as const).map(u => (
            <button key={u} onClick={() => updateParams({ charge_unit: u })} style={pill(params.charge_unit === u)}>{u}</button>
          ))}
        </div>

        {params.charge_unit === '%RM' && !bestRM && (
          <div style={{ padding: "7px 10px", borderRadius: 4, marginBottom: 8, background: C.oS, border: "1px solid " + C.o + "40", fontSize: 11, color: C.o }}>
            <div style={{ textAlign: "center", marginBottom: 6 }}>Aucun 1RM enregistré</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: C.tx3 }}>1RM estimé :</span>
              <input
                type="number"
                value={params.manual_rm ?? ""}
                onChange={e => updateParams({ manual_rm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="ex: 100"
                min={0}
                style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const }}
              />
              <span style={{ fontSize: 10, color: C.tx3 }}>kg</span>
            </div>
          </div>
        )}

        {params.charge_unit !== 'PDC' && (
          params.charge.mode === 'global' ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number" value={chargeGlobal ?? ""}
                  onChange={e => updateParams({ charge: { mode: 'global', value: e.target.value === "" ? null : parseFloat(e.target.value) } })}
                  placeholder="—" min={0}
                  style={{ width: 80, padding: "7px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const }}
                />
                <span style={{ fontSize: 12, color: C.tx3, fontWeight: 600 }}>{params.charge_unit}</span>
                {params.charge_unit === '%RM' && (bestRM || params.manual_rm) && chargeGlobal !== null && (
                  <span style={{ fontSize: 12, color: VIOLET, fontWeight: 700, background: VIOLET_S, padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>
                    ≈ {Math.round((bestRM?.kg ?? params.manual_rm ?? 0) * (chargeGlobal as number) / 100)}kg
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
                  style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
                />
              )}
            />
          )
        )}
      </Section>

      {/* 6. RIR — one line */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <InlineLabel>RIR</InlineLabel>

          {rirIsGlobal && (
            <>
              <button
                onClick={() => updateParams({ rir: { mode: 'global', value: rirGlobal === null ? 2 : null } })}
                style={pillSmall(rirGlobal === null)}
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

          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <button
              onClick={() => {
                if (params.rir.mode === 'par_serie') {
                  updateParams({ rir: { mode: 'global', value: (rirValues[0] as number) ?? 2 } })
                } else {
                  updateParams({ rir: { mode: 'par_serie', values: Array(nb).fill(rirGlobal ?? 2) as number[] } })
                }
              }}
              style={pillParSerie(params.rir.mode === 'par_serie')}
            >
              {params.rir.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          </div>
        </div>

        {params.rir.mode === 'par_serie' && (
          <div style={{ marginTop: 8 }}>
            <ParamSeriesGrid
              nb_series={nb}
              values={rirValues as number[]}
              onChange={values => updateParams({ rir: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <select value={v ?? 2} onChange={e => ch(parseFloat(e.target.value))}
                  style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
                  {[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            />
          </div>
        )}
      </Section>

      {/* 7. Tempo — one line */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InlineLabel>Tempo</InlineLabel>
          <span style={{ fontSize: 9, color: C.tx3, flexShrink: 0 }}>ecc–pause–con</span>

          {params.tempo.mode === 'global' && (
            <input
              type="text" value={tempoGlobal}
              onChange={e => updateParams({ tempo: { mode: 'global', value: e.target.value } })}
              placeholder="3-1-2-0"
              style={{ width: 88, padding: "5px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const }}
            />
          )}

          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <button
              onClick={() => {
                if (params.tempo.mode === 'par_serie') {
                  updateParams({ tempo: { mode: 'global', value: tempoValues[0] ?? '' } })
                } else {
                  updateParams({ tempo: { mode: 'par_serie', values: Array(nb).fill(tempoGlobal) } })
                }
              }}
              style={pillParSerie(params.tempo.mode === 'par_serie')}
            >
              {params.tempo.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
          </div>
        </div>

        {params.tempo.mode === 'par_serie' && (
          <div style={{ marginTop: 8 }}>
            <ParamSeriesGrid
              nb_series={nb}
              values={tempoValues}
              onChange={values => updateParams({ tempo: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="text" value={v} onChange={e => ch(e.target.value)} placeholder="3-1-2-0"
                  style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 11, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* 8. Paramètres par semaine */}
      {!sessionMultiSemaine && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => {
              const newMulti = !(exercice.multi_semaine ?? false)
              let newParams = exercice.params
              if (newMulti && typeof exercice.params === 'object' && 'mode' in exercice.params) {
                newParams = { '1': exercice.params as ExerciceParams }
              } else if (!newMulti && typeof exercice.params === 'object' && !('mode' in exercice.params)) {
                const rec = exercice.params as Record<string, ExerciceParams>
                newParams = Object.values(rec)[0] ?? defaultExerciceParams()
              }
              onChange({ ...exercice, multi_semaine: newMulti, params: newParams })
            }}
            style={pill(exercice.multi_semaine ?? false)}
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
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: C.s1,
            color: C.tx, fontSize: 12, fontFamily: "inherit",
            outline: "none", resize: "vertical" as const,
            boxSizing: "border-box" as const,
          }}
        />
      </Section>

      {/* 10. Synthèse */}
      {exercice.mode !== 'libre' && (
        <div style={{ padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2 }}>
          <SyntheseBar params={{ ...params, nb_series: nb }} />
        </div>
      )}
      <div style={{ padding: "8px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2 }}>
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
    <div style={{ padding: "10px", borderRadius: 4, border: "1px solid " + ORANGE + "50", background: ORANGE + "0A" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 4 }}>Clusters</div>
          <Stepper value={cluster.nb_clusters} onChange={setNbClusters} min={2} max={8} color={ORANGE} />
        </div>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 4 }}>Récup (s)</div>
          <Stepper value={cluster.recup_sec} onChange={v => onChange({ ...cluster, recup_sec: v })} min={5} max={120} color={ORANGE} />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 6, textAlign: "center" as const }}>Reps / cluster</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          {safeReps.map((v, i) => (
            <div key={i} style={{ textAlign: "center" as const }}>
              <div style={{ fontSize: 9, color: ORANGE, marginBottom: 3 }}>C{i + 1}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <button onClick={() => updateRep(i, Math.min(20, v + 1))} style={{ width: 24, height: 22, borderRadius: "5px 5px 0 0", border: "1px solid " + ORANGE + "60", background: "transparent", color: ORANGE, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>+</button>
                <div style={{ width: 28, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ORANGE, border: "1px solid " + ORANGE + "60", borderTop: "none", borderBottom: "none", background: ORANGE + "08" }}>{v}</div>
                <button onClick={() => updateRep(i, Math.max(1, v - 1))} style={{ width: 24, height: 22, borderRadius: "0 0 5px 5px", border: "1px solid " + ORANGE + "60", background: "transparent", color: ORANGE, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>−</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center" as const, padding: "5px 10px", borderRadius: 7, background: ORANGE + "18", border: "1px solid " + ORANGE + "40" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: ORANGE, letterSpacing: 2 }}>{pattern}</span>
        <span style={{ fontSize: 10, color: ORANGE + "AA", marginLeft: 6 }}>+ {cluster.recup_sec}s repos</span>
      </div>
    </div>
  )
}
