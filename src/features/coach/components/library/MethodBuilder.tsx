/**
 * MethodBuilder — formulaire de création / édition d'une méthode d'entraînement.
 * 2 étapes : informations générales → paramètres (ExerciceParams-based, same UX as programmation).
 * React Hook Form + Zod (Step1 only). Step2 uses local ExerciceParams state.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Plus, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { MethodPreview, exerciceParamsToMethodConfig, methodConfigToExerciceParams, methodConfigToText } from "./MethodPreview";
import type { RestConfig } from "./MethodPreview";
import { useTrainingMethods } from "@/features/shared/hooks/useTrainingMethods";
import type { TrainingMethod, FullWeekConfig, MethodScope, MethodConfig } from "@/types/trainingMethods";
import type { ExerciceParams, ClusterConfig, ParamValue } from "../programmation/types";
import { defaultExerciceParams } from "../programmation/types";
import { ParamSeriesGrid } from "../programmation/ParamSeriesGrid";

// ─── Zod schema (Step1 only) ──────────────────────────────────────────────────

const schema = z.object({
  name:            z.string().min(1, "Nom requis").max(60, "60 caractères max"),
  description:     z.string().max(300, "300 caractères max").optional().default(""),
  scope:           z.enum(["classic", "set", "exercise"]),
  category:        z.string().min(1, "Catégorie requise"),
  tags:            z.array(z.string()).default([]),
  _method_config:  z.string().optional().default(""),
});

type FormValues = z.infer<typeof schema>;

// ─── Colors ───────────────────────────────────────────────────────────────────

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"
const GREEN  = "#22c55e"
const GREEN_S  = "rgba(34,197,94,0.10)"
const AMBER  = "#f59e0b"
const AMBER_S  = "rgba(245,158,11,0.10)"
const ORANGE = "#F5A623"

const SCOPE_META = {
  classic:  { color: GREEN,  colorS: GREEN_S,  label: "Classique",  desc: "Séries × reps — template simple" },
  set:      { color: AMBER,  colorS: AMBER_S,  label: "Sous-série", desc: "S'applique à une série spécifique (cluster, drop-set…)" },
  exercise: { color: VIOLET, colorS: VIOLET_S, label: "Exercice",   desc: "Remplace entièrement le pattern de séries" },
} as const

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

const numInputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.brdL}`,
  background: C.s1, color: C.tx, fontSize: 14, fontWeight: 700,
  fontFamily: "inherit", outline: "none", textAlign: "center" as const, width: 80,
  boxSizing: "border-box" as const,
}

const textInputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 4,
  border: `1px solid ${C.brdL}`, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box" as const,
}

// ─── Base components ──────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div style={{ fontSize: 11, color: C.r, marginTop: 4 }}>{message}</div>;
}

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

function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", flexShrink: 0 }}>
      {children}
    </div>
  )
}

function Stepper({ value, onChange, min = 1, max = 20, step = 1, color = C.tx }: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; color?: string
}) {
  const [local, setLocal] = useState(value)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")

  useEffect(() => { if (!editing) setLocal(value) }, [value, editing])

  function apply(v: number) {
    const rounded = step < 1 ? Math.round(v / step) * step : Math.round(v)
    const clamped = Math.max(min, Math.min(max, isNaN(rounded) ? min : rounded))
    setLocal(clamped)
    onChange(clamped)
  }

  function commitEdit() {
    apply(isNaN(parseFloat(editText)) ? local : parseFloat(editText))
    setEditing(false)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", background: C.s1, borderRadius: 4, border: "1px solid " + C.brdL, overflow: "hidden", flexShrink: 0 }}>
      <button type="button" onClick={() => apply(local - step)}
        style={{ width: 30, height: 30, border: "none", background: "transparent", color: C.tx3, cursor: local <= min ? "default" : "pointer", fontSize: 16, fontFamily: "inherit", flexShrink: 0, opacity: local <= min ? 0.3 : 1 }}>−</button>
      {editing ? (
        <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit() }}
          style={{ width: 40, border: "none", background: "transparent", color, fontSize: 14, fontWeight: 800, fontFamily: "inherit", outline: "none", textAlign: "center" as const, padding: 0 }} />
      ) : (
        <div onClick={() => { setEditText(String(local)); setEditing(true) }} title="Cliquer pour saisir"
          style={{ width: 40, textAlign: "center" as const, fontSize: 14, fontWeight: 800, color, fontFamily: "inherit", cursor: "text", userSelect: "none" as const }}>
          {local}
        </div>
      )}
      <button type="button" onClick={() => apply(local + step)}
        style={{ width: 30, height: 30, border: "none", background: "transparent", color: C.tx3, cursor: local >= max ? "default" : "pointer", fontSize: 16, fontFamily: "inherit", flexShrink: 0, opacity: local >= max ? 0.3 : 1 }}>+</button>
    </div>
  )
}

// ─── Tag input ────────────────────────────────────────────────────────────────

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {value.map((tag) => (
          <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: VIOLET_S, color: VIOLET, fontSize: 11, fontWeight: 600 }}>
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))}
              style={{ background: "none", border: "none", cursor: "pointer", color: VIOLET, padding: 0, display: "flex", lineHeight: 1 }}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Ajouter un tag…" style={{ ...textInputStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ width: 34, height: 34, borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Category input ───────────────────────────────────────────────────────────

function CategoryInput({ value, onChange, suggestions, error }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value);
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ex: Intensification, Volume, Technique…" style={textInputStyle} autoComplete="off" />
      {error && <FieldError message={error} />}
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: C.bg, border: `1px solid ${C.brdL}`, borderRadius: 4, overflow: "hidden" }}>
          {filtered.map(s => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setOpen(false); }}
              style={{ width: "100%", padding: "8px 12px", textAlign: "left" as const, border: "none", borderBottom: `1px solid ${C.brd}`, background: "transparent", color: C.tx, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ control, errors, existingCategories }: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  existingCategories: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section>
        <SectionLabel label="Nom de la méthode *" />
        <Controller name="name" control={control} render={({ field }) => (
          <input {...field} placeholder="ex: 3 sous-séries décroissantes…" style={textInputStyle} maxLength={60} />
        )} />
        <FieldError message={errors.name?.message} />
      </Section>

      <Section>
        <SectionLabel label="Description (optionnelle)" />
        <Controller name="description" control={control} render={({ field }) => (
          <textarea {...field} rows={3} placeholder="Comment utiliser cette méthode…" style={{ ...textInputStyle, resize: "vertical" as const }} maxLength={300} />
        )} />
      </Section>

      <Section>
        <SectionLabel label="Application" />
        <Controller name="scope" control={control} render={({ field }) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.entries(SCOPE_META) as [keyof typeof SCOPE_META, typeof SCOPE_META[keyof typeof SCOPE_META]][]).map(([v, cfg]) => {
              const active = field.value === v
              return (
                <button key={v} type="button" onClick={() => field.onChange(v)} style={{
                  padding: "10px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid " + (active ? cfg.color : C.brdL),
                  background: active ? cfg.colorS : C.s1,
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left" as const, transition: "all 100ms",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: active ? cfg.color : C.tx3 + "50", transition: "background 100ms" }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? cfg.color : C.tx }}>{cfg.label}</div>
                    <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{cfg.desc}</div>
                  </div>
                  {active && (
                    <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={10} color="#fff" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )} />
        <FieldError message={errors.scope?.message} />
      </Section>

      <Section>
        <SectionLabel label="Catégorie *" />
        <Controller name="category" control={control} render={({ field }) => (
          <CategoryInput value={field.value} onChange={field.onChange} suggestions={existingCategories} error={errors.category?.message} />
        )} />
      </Section>

      <Section>
        <SectionLabel label="Tags (optionnel)" />
        <Controller name="tags" control={control} render={({ field }) => (
          <TagInput value={field.value} onChange={field.onChange} />
        )} />
      </Section>
    </div>
  );
}

// ─── Helper: ensure array length ──────────────────────────────────────────────

function ensureLength<T>(arr: T[], length: number, fill: T): T[] {
  const result = [...arr]
  while (result.length < length) result.push(fill)
  return result.slice(0, length)
}

// ─── MethodParamsPanel — same UX as ExerciceParamsPanel ──────────────────────

interface MethodParamsPanelProps {
  params: ExerciceParams
  scope: MethodScope
  color: string
  onChange: (p: ExerciceParams) => void
}

function MethodParamsPanel({ params, scope, color, onChange }: MethodParamsPanelProps) {
  function up(partial: Partial<ExerciceParams>) {
    onChange({ ...params, ...partial })
  }

  const nb = params.nb_series
  const repsGlobal = params.reps.mode === 'global' ? params.reps.value : 8
  const repsValues = params.reps.mode === 'par_serie'
    ? ensureLength(params.reps.values, nb, repsGlobal)
    : Array(nb).fill(repsGlobal)

  const chargeGlobal = params.charge.mode === 'global' ? params.charge.value : null
  const chargeValues = params.charge.mode === 'par_serie'
    ? ensureLength(params.charge.values, nb, chargeGlobal)
    : Array(nb).fill(chargeGlobal)

  const rirGlobal: number | null = params.rir.mode === 'global' ? params.rir.value : 2
  const rirValues = params.rir.mode === 'par_serie'
    ? ensureLength(params.rir.values as (number | null)[], nb, 2)
    : Array(nb).fill(rirGlobal ?? 2)

  const tempoGlobal = params.tempo.mode === 'global' ? params.tempo.value : ''
  const tempoValues = params.tempo.mode === 'par_serie'
    ? ensureLength(params.tempo.values, nb, tempoGlobal)
    : Array(nb).fill(tempoGlobal)

  const currentRepsMode = params.reps_mode.mode === 'global' ? params.reps_mode.value : 'EC'

  // ── Set scope: cluster is the main control ──
  if (scope === 'set') {
    const cluster = params.cluster ?? { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 }

    function setCluster(c: ClusterConfig) {
      up({ cluster: c })
    }

    const safeReps: number[] = Array.isArray(cluster.reps)
      ? cluster.reps
      : Array(cluster.nb_clusters).fill(5)

    function updateRep(i: number, v: number) {
      const next = [...safeReps]; next[i] = v
      setCluster({ ...cluster, reps: next })
    }
    function setNbClusters(n: number) {
      const base = safeReps[safeReps.length - 1] ?? 5
      const next = n > safeReps.length
        ? [...safeReps, ...Array(n - safeReps.length).fill(base)]
        : safeReps.slice(0, n)
      setCluster({ ...cluster, nb_clusters: n, reps: next })
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Sous-séries */}
        <Section>
          <div style={{ padding: "10px", borderRadius: 4, border: "1px solid " + AMBER + "50", background: AMBER + "0A" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <div style={{ textAlign: "center" as const }}>
                <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 4 }}>Sous-séries</div>
                <Stepper value={cluster.nb_clusters} onChange={setNbClusters} min={2} max={10} color={AMBER} />
              </div>
              <div style={{ textAlign: "center" as const }}>
                <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 4 }}>Récup intra (s)</div>
                <Stepper value={cluster.recup_sec} onChange={v => setCluster({ ...cluster, recup_sec: v })} min={0} max={300} color={AMBER} />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 6, textAlign: "center" as const }}>Reps par sous-série</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {safeReps.map((v, i) => (
                  <div key={i} style={{ textAlign: "center" as const }}>
                    <div style={{ fontSize: 9, color: AMBER, marginBottom: 3 }}>SS{i + 1}</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <button onClick={() => updateRep(i, Math.min(50, v + 1))} style={{ width: 24, height: 22, borderRadius: "5px 5px 0 0", border: "1px solid " + AMBER + "60", background: "transparent", color: AMBER, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>+</button>
                      <div style={{ width: 28, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: AMBER, border: "1px solid " + AMBER + "60", borderTop: "none", borderBottom: "none", background: AMBER + "08" }}>{v}</div>
                      <button onClick={() => updateRep(i, Math.max(1, v - 1))} style={{ width: 24, height: 22, borderRadius: "0 0 5px 5px", border: "1px solid " + AMBER + "60", background: "transparent", color: AMBER, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>−</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center" as const, padding: "5px 10px", borderRadius: 7, background: AMBER + "18", border: "1px solid " + AMBER + "40" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: AMBER, letterSpacing: 2 }}>{safeReps.join("+")}</span>
              <span style={{ fontSize: 10, color: AMBER + "AA", marginLeft: 6 }}>+ {cluster.recup_sec}s récup</span>
            </div>
          </div>
        </Section>

        {/* Charge */}
        <ChargeSection params={params} nb={nb} chargeGlobal={chargeGlobal} chargeValues={chargeValues} color={color} up={up} />

        {/* RIR */}
        <RirSection params={params} nb={nb} rirGlobal={rirGlobal} rirValues={rirValues} color={color} up={up} />
      </div>
    )
  }

  // ── Classic / Exercise scope ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Séries — one line */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <InlineLabel>Séries</InlineLabel>
          <Stepper value={params.nb_series} onChange={v => up({ nb_series: v })} min={1} max={20} color={color} />
        </div>
      </Section>

      {/* Répétitions */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <InlineLabel>Répétitions</InlineLabel>
          {!params.cluster && params.reps.mode === 'global' && (
            <>
              <Stepper value={repsGlobal} onChange={v => up({ reps: { mode: 'global', value: v } })} min={1} max={100} color={color} />
              <button onClick={() => up({ reps_mode: { mode: 'global', value: 'EC' } })} style={pillSmall(currentRepsMode === 'EC', color)}>EC</button>
              <button onClick={() => up({ reps_mode: { mode: 'global', value: 'iso' } })} style={pillSmall(currentRepsMode === 'iso', color)}>ISO</button>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => {
                if (params.reps.mode === 'par_serie') {
                  up({ reps: { mode: 'global', value: repsValues[0] ?? 8 } })
                } else {
                  up({ reps: { mode: 'par_serie', values: Array(nb).fill(repsGlobal) } })
                }
              }}
              style={pillParSerie(params.reps.mode === 'par_serie')}
            >
              {params.reps.mode === 'par_serie' ? "↩ Global" : "Par série"}
            </button>
            <button
              onClick={() => {
                if (params.cluster) {
                  up({ cluster: undefined })
                } else {
                  up({ cluster: { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 } })
                }
              }}
              style={pillSmall(!!params.cluster, ORANGE)}
            >
              {params.cluster ? "Cluster ✓" : "Cluster"}
            </button>
          </div>
        </div>

        {params.cluster && (
          <div style={{ marginTop: 8 }}>
            <ClusterEditorInline cluster={params.cluster} onChange={c => up({ cluster: c })} />
          </div>
        )}
        {!params.cluster && params.reps.mode === 'par_serie' && (
          <div style={{ marginTop: 8 }}>
            <ParamSeriesGrid nb_series={nb} values={repsValues}
              onChange={values => up({ reps: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="number" value={v} onChange={e => ch(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1} max={100}
                  style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* Récupération entre séries */}
      <RecupSection params={params} color={color} up={up} />

      {/* Charge */}
      <ChargeSection params={params} nb={nb} chargeGlobal={chargeGlobal} chargeValues={chargeValues} color={color} up={up} />

      {/* RIR */}
      <RirSection params={params} nb={nb} rirGlobal={rirGlobal} rirValues={rirValues} color={color} up={up} />

      {/* Tempo (exercise scope only) */}
      {scope === 'exercise' && (
        <Section>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <InlineLabel>Tempo</InlineLabel>
            <span style={{ fontSize: 9, color: C.tx3, flexShrink: 0 }}>ecc–pause–con</span>
            {params.tempo.mode === 'global' && (
              <input type="text" value={tempoGlobal}
                onChange={e => up({ tempo: { mode: 'global', value: e.target.value } })}
                placeholder="3-1-2-0"
                style={{ width: 88, padding: "5px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const }}
              />
            )}
            <div style={{ marginLeft: "auto", flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (params.tempo.mode === 'par_serie') {
                    up({ tempo: { mode: 'global', value: tempoValues[0] ?? '' } })
                  } else {
                    up({ tempo: { mode: 'par_serie', values: Array(nb).fill(tempoGlobal) } })
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
              <ParamSeriesGrid nb_series={nb} values={tempoValues}
                onChange={values => up({ tempo: { mode: 'par_serie', values } })}
                renderCell={(v, _i, ch) => (
                  <input type="text" value={v} onChange={e => ch(e.target.value)} placeholder="3-1-2"
                    style={{ width: "100%", padding: "5px 4px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 11, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
                  />
                )}
              />
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

// ─── Shared sub-sections ──────────────────────────────────────────────────────

interface SubSectionProps {
  params: ExerciceParams
  nb: number
  color: string
  up: (p: Partial<ExerciceParams>) => void
}

function RecupSection({ params, color, up }: Omit<SubSectionProps, 'nb'>) {
  // Store rest config separately — ExerciceParams doesn't have it, so we use a data attribute approach
  // Instead: store as string in tempo's par_serie... nope.
  // Actually: we expose a restConfig field via a wrapper state in MethodParamsPanel
  // For simplicity here, we'll use a meta field via a WeakMap or just expose it through a separate prop.
  // Simpler approach: use params.reps_mode as a carrier for rest type (hack) — NO.
  // Best: add rest as a separate small section with its own state in the parent.

  // Since ExerciceParams doesn't have rest, we'll use a clever approach:
  // Store rest config JSON in params.tempo when it starts with "__rest__"
  // Actually the cleanest solution: just show a simple rest input as a separate small widget
  // and the parent (MethodParamsPanel) needs to expose it separately.

  // For now: show a rest section that reads/writes via a hidden convention.
  // We'll use the "tempo" field in global mode as "rest__TYPE__SECONDS" when it starts with "@rest"
  // No this is too hacky.

  // FINAL DECISION: Add a rest config as an additional prop to MethodParamsPanel
  // But that requires changing the interface. For now, let's skip and default to free.
  // We'll add rest as a simple UI-only section that calls a separate onRestChange prop.
  void up; void color; void params; // suppress unused warnings
  return null  // rest handled externally for now
}

function ChargeSection({ params, nb, chargeGlobal, chargeValues, color, up }: SubSectionProps & { chargeGlobal: number | null, chargeValues: (number | null)[] }) {
  return (
    <Section>
      <SectionLabel
        label="Charge"
        right={
          <button
            onClick={() => {
              if (params.charge.mode === 'par_serie') {
                up({ charge: { mode: 'global', value: chargeValues[0] } })
              } else {
                up({ charge: { mode: 'par_serie', values: Array(nb).fill(chargeGlobal) } })
              }
            }}
            style={pillParSerie(params.charge.mode === 'par_serie')}
          >
            {params.charge.mode === 'par_serie' ? "↩ Global" : "Par série"}
          </button>
        }
      />

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
        {(['%RM', 'kg', 'PDC'] as const).map(u => (
          <button key={u} onClick={() => up({ charge_unit: u })} style={pill(params.charge_unit === u, color)}>{u}</button>
        ))}
      </div>

      {params.charge_unit !== 'PDC' && (
        params.charge.mode === 'global' ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={chargeGlobal ?? ""}
                onChange={e => up({ charge: { mode: 'global', value: e.target.value === "" ? null : parseFloat(e.target.value) } })}
                placeholder="—" min={0}
                style={{ width: 80, padding: "7px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const }}
              />
              <span style={{ fontSize: 12, color: C.tx3, fontWeight: 600 }}>{params.charge_unit}</span>
            </div>
          </div>
        ) : (
          <ParamSeriesGrid nb_series={nb} values={chargeValues}
            onChange={values => up({ charge: { mode: 'par_serie', values } })}
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
  )
}

function RirSection({ params, nb, rirGlobal, rirValues, color, up }: SubSectionProps & { rirGlobal: number | null, rirValues: (number | null)[] }) {
  const rirIsGlobal = params.rir.mode === 'global'
  return (
    <Section>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <InlineLabel>RIR</InlineLabel>
        {rirIsGlobal && (
          <>
            <button
              onClick={() => up({ rir: { mode: 'global', value: rirGlobal === null ? 2 : null } })}
              style={pillSmall(rirGlobal === null, color)}
            >
              {rirGlobal === null ? "Libre ✓" : "Libre"}
            </button>
            {rirGlobal !== null && (
              <Stepper value={rirGlobal} onChange={v => up({ rir: { mode: 'global', value: v } })} min={0} max={5} step={0.5} color={color} />
            )}
          </>
        )}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <button
            onClick={() => {
              if (params.rir.mode === 'par_serie') {
                up({ rir: { mode: 'global', value: (rirValues[0] as number) ?? 2 } })
              } else {
                up({ rir: { mode: 'par_serie', values: Array(nb).fill(rirGlobal ?? 2) as number[] } })
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
          <ParamSeriesGrid nb_series={nb} values={rirValues as number[]}
            onChange={values => up({ rir: { mode: 'par_serie', values } })}
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
  )
}

// ─── Cluster editor (inline for classic/exercise scope) ───────────────────────

function ClusterEditorInline({ cluster, onChange }: { cluster: ClusterConfig; onChange: (c: ClusterConfig) => void }) {
  const safeReps: number[] = Array.isArray(cluster.reps) ? cluster.reps : Array(cluster.nb_clusters).fill(5)
  function updateRep(i: number, v: number) { const n = [...safeReps]; n[i] = v; onChange({ ...cluster, reps: n }) }
  function setNb(n: number) {
    const base = safeReps[safeReps.length - 1] ?? 5
    const next = n > safeReps.length ? [...safeReps, ...Array(n - safeReps.length).fill(base)] : safeReps.slice(0, n)
    onChange({ ...cluster, nb_clusters: n, reps: next })
  }
  return (
    <div style={{ padding: "10px", borderRadius: 4, border: "1px solid " + ORANGE + "50", background: ORANGE + "0A" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 3 }}>Clusters</div>
          <Stepper value={cluster.nb_clusters} onChange={setNb} min={2} max={8} color={ORANGE} />
        </div>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 3 }}>Récup (s)</div>
          <Stepper value={cluster.recup_sec} onChange={v => onChange({ ...cluster, recup_sec: v })} min={5} max={120} color={ORANGE} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginBottom: 6 }}>
        {safeReps.map((v, i) => (
          <div key={i} style={{ textAlign: "center" as const }}>
            <div style={{ fontSize: 9, color: ORANGE, marginBottom: 2 }}>C{i + 1}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <button onClick={() => updateRep(i, Math.min(20, v + 1))} style={{ width: 22, height: 20, borderRadius: "4px 4px 0 0", border: "1px solid " + ORANGE + "60", background: "transparent", color: ORANGE, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>+</button>
              <div style={{ width: 26, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: ORANGE, border: "1px solid " + ORANGE + "60", borderTop: "none", borderBottom: "none", background: ORANGE + "08" }}>{v}</div>
              <button onClick={() => updateRep(i, Math.max(1, v - 1))} style={{ width: 22, height: 20, borderRadius: "0 0 4px 4px", border: "1px solid " + ORANGE + "60", background: "transparent", color: ORANGE, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>−</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center" as const, padding: "4px 8px", borderRadius: 6, background: ORANGE + "18", border: "1px solid " + ORANGE + "40" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: ORANGE, letterSpacing: 2 }}>{safeReps.join("+")}</span>
        <span style={{ fontSize: 10, color: ORANGE + "AA", marginLeft: 5 }}>+ {cluster.recup_sec}s</span>
      </div>
    </div>
  )
}

// ─── Récupération section (standalone, uses local state in WeekFormSlot/main) ─

function RecupSectionFull({ rest, color, onChange }: { rest: RestConfig; color: string; onChange: (r: RestConfig) => void }) {
  return (
    <Section>
      <SectionLabel label="Récupération entre séries" />
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: rest.type !== 'free' ? 10 : 0 }}>
        {(['free', 'fixed', 'variable'] as const).map(t => (
          <button key={t} onClick={() => onChange({ ...rest, type: t })} style={pill(rest.type === t, color)}>
            {t === 'free' ? 'Libre' : t === 'fixed' ? 'Fixe' : 'Variable'}
          </button>
        ))}
      </div>
      {rest.type === 'fixed' && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <input type="number" value={rest.seconds} onChange={e => onChange({ ...rest, seconds: +e.target.value })} style={numInputStyle} min={0} max={600} />
          <span style={{ fontSize: 12, color: C.tx3 }}>secondes</span>
        </div>
      )}
      {rest.type === 'variable' && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <input type="number" value={rest.min_s} onChange={e => onChange({ ...rest, min_s: +e.target.value })} style={numInputStyle} min={0} max={600} />
          <span style={{ fontSize: 12, color: C.tx3 }}>à</span>
          <input type="number" value={rest.max_s} onChange={e => onChange({ ...rest, max_s: +e.target.value })} style={numInputStyle} min={0} max={600} />
          <span style={{ fontSize: 12, color: C.tx3 }}>secondes</span>
        </div>
      )}
    </Section>
  )
}

// ─── WeekFormSlot — uses ExerciceParams state ─────────────────────────────────

function WeekFormSlot({ week, scope, initialConfig, isDeload, onChange, onCopyFrom, prevWeeks }: {
  week: number; scope: MethodScope; initialConfig?: Partial<MethodConfig>; isDeload: boolean;
  onChange: (week: number, config: MethodConfig) => void;
  onCopyFrom?: (fromWeek: number) => void;
  prevWeeks?: number[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const scopeMeta = SCOPE_META[scope]

  const [params, setParams] = useState<ExerciceParams>(() => {
    if (initialConfig && Object.keys(initialConfig).length > 1) {
      return methodConfigToExerciceParams(initialConfig as MethodConfig, scope)
    }
    const def = defaultExerciceParams(4)
    if (scope === 'set') return { ...def, cluster: { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 } }
    return def
  })

  const [rest, setRest] = useState<RestConfig>({ type: 'free', seconds: 90, min_s: 60, max_s: 180 })

  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  // Fire initial config on mount
  useEffect(() => {
    const config = exerciceParamsToMethodConfig(params, rest, scope)
    onChangeRef.current(week, config as MethodConfig)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, scope])

  function handleParamsChange(newParams: ExerciceParams) {
    setParams(newParams)
    const config = exerciceParamsToMethodConfig(newParams, rest, scope)
    onChange(week, config as MethodConfig)
  }

  function handleRestChange(newRest: RestConfig) {
    setRest(newRest)
    const config = exerciceParamsToMethodConfig(params, newRest, scope)
    onChange(week, config as MethodConfig)
  }

  const previewConfig = exerciceParamsToMethodConfig(params, rest, scope)
  const preview = previewConfig ? methodConfigToText(previewConfig as MethodConfig) : "—"

  return (
    <div style={{ borderRadius: 4, border: `1px solid ${expanded ? scopeMeta.color : C.brdL}`, overflow: "hidden", marginBottom: 5 }}>
      <div onClick={() => setExpanded(p => !p)} style={{ padding: "9px 14px", background: expanded ? scopeMeta.colorS : C.s2, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 100ms" }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: expanded ? scopeMeta.color : C.s1, border: `1px solid ${expanded ? scopeMeta.color : C.brdL}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: expanded ? "#fff" : C.tx3 }}>S{week}</span>
        </div>
        <span style={{ flex: 1, fontSize: 10, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{preview}</span>
        {isDeload && <span style={{ fontSize: 9, color: scopeMeta.color, fontWeight: 700, background: scopeMeta.colorS, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>déload</span>}
        {onCopyFrom && prevWeeks && prevWeeks.length > 0 && (
          <div style={{ position: "relative" as const, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowCopyMenu(p => !p)}
              title="Copier depuis une autre semaine"
              style={{ fontSize: 9, fontWeight: 700, color: C.tx3, background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}
            >
              Copier ▾
            </button>
            {showCopyMenu && (
              <div style={{ position: "absolute" as const, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: C.bg, border: `1px solid ${C.brdL}`, borderRadius: 4, overflow: "hidden", minWidth: 100 }}>
                {prevWeeks.map(w => (
                  <button key={w} type="button"
                    onClick={() => { onCopyFrom(w); setShowCopyMenu(false) }}
                    style={{ width: "100%", padding: "8px 12px", textAlign: "left" as const, border: "none", borderBottom: `1px solid ${C.brd}`, background: "transparent", color: C.tx, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Copier S{w}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: 10, color: C.tx3 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "12px", borderTop: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <MethodParamsPanel params={params} scope={scope} color={scopeMeta.color} onChange={handleParamsChange} />
          {scope !== 'set' && (
            <RecupSectionFull rest={rest} color={scopeMeta.color} onChange={handleRestChange} />
          )}
          <MethodPreview config={previewConfig} compact />
        </div>
      )}
    </div>
  )
}

// ─── MethodBuilder ────────────────────────────────────────────────────────────

interface MethodBuilderProps {
  initial?: TrainingMethod;
  coachId: string;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function MethodBuilder({ initial, coachId: _coachId, onSubmit, onCancel, loading }: MethodBuilderProps) {
  const [step, setStep] = useState(1);

  const initWC = (initial?.config as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined;
  const [multiWeek, setMultiWeek] = useState(() => !!initWC?.length);
  const [weekCount, setWeekCount] = useState(() => initWC?.length || 6);
  const [weeklyConfigs, setWeeklyConfigs] = useState<FullWeekConfig[]>(() =>
    initWC ?? Array.from({ length: 6 }, (_, i) => ({ week: i + 1, config: {} as MethodConfig }))
  );
  // Per-slot copy key — increment to force remount with new initialConfig
  const [copyKeys, setCopyKeys] = useState<Record<number, number>>({});

  const updateWeekConfig = useCallback((week: number, config: Partial<MethodConfig>) => {
    setWeeklyConfigs(prev => prev.map(wc => wc.week === week ? { ...wc, config: config as MethodConfig } : wc))
  }, [])

  function resizeWC(n: number) {
    setWeekCount(n)
    setWeeklyConfigs(prev => {
      const next = [...prev]
      while (next.length < n) next.push({ week: next.length + 1, config: {} as MethodConfig })
      return next.slice(0, n)
    })
  }

  function copyWeek(fromWeek: number, toWeek: number) {
    const fromConfig = weeklyConfigs.find(wc => wc.week === fromWeek)?.config
    if (!fromConfig || Object.keys(fromConfig).length === 0) return
    setWeeklyConfigs(prev => prev.map(wc => wc.week === toWeek ? { ...wc, config: { ...fromConfig } } : wc))
    setCopyKeys(prev => ({ ...prev, [toWeek]: (prev[toWeek] ?? 0) + 1 }))
  }

  const { data: methods = [] } = useTrainingMethods();
  const existingCategories = [...new Set(methods.map(m => m.category).filter(Boolean))];

  const defaultValues: FormValues = {
    name:        initial?.name        ?? "",
    description: initial?.description ?? "",
    scope:       initial?.scope       ?? "classic",
    category:    initial?.category    ?? "",
    tags:        initial?.tags        ?? [],
    _method_config: "",
  };

  const { control, handleSubmit, getValues, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const scope = watch("scope")
  const scopeMeta = SCOPE_META[scope] ?? SCOPE_META.classic

  // Step2 local ExerciceParams state
  const [params, setParams] = useState<ExerciceParams>(() => {
    if (initial?.config) {
      return methodConfigToExerciceParams(initial.config as MethodConfig, initial.scope ?? 'classic')
    }
    const def = defaultExerciceParams(4)
    if ((initial?.scope ?? 'classic') === 'set') return { ...def, cluster: { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 } }
    return def
  })
  const [rest, setRest] = useState<RestConfig>({ type: 'free', seconds: 90, min_s: 60, max_s: 180 })

  // Reset params when scope changes — skip on initial mount (useState already set correct initial value)
  const isMountedScope = useRef(false)
  useEffect(() => {
    if (!isMountedScope.current) { isMountedScope.current = true; return }
    const def = defaultExerciceParams(4)
    if (scope === 'set') {
      setParams({ ...def, cluster: { nb_clusters: 3, reps: [5, 4, 3], recup_sec: 15 } })
    } else {
      setParams(def)
    }
  }, [scope])

  async function handleNext() {
    if (step === 1) {
      // Validate step 1 fields — only advance if valid
      await handleSubmit(() => { setStep(2) })()
      return
    }
    // Step 2: form already validated on step 1, read values directly
    const vals = getValues()
    const config = exerciceParamsToMethodConfig(params, rest, scope)
    const hasData = weeklyConfigs.some(wc => wc.config && Object.keys(wc.config).length > 1)
    onSubmit({
      ...vals,
      _method_config: JSON.stringify({
        ...config,
        ...(multiWeek && hasData ? { weekly_configs: weeklyConfigs } : {}),
      }),
    })
  }

  const previewConfig = exerciceParamsToMethodConfig(params, rest, scope)

  return (
    <form onSubmit={e => e.preventDefault()} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Step indicator */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[1, 2].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 3, background: step >= s ? scopeMeta.color : C.brdL, transition: "background 200ms" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
            Étape {step} / 2 — {step === 1 ? "Informations générales" : "Paramètres"}
          </div>
          {step === 2 && (
            <div style={{ fontSize: 9, fontWeight: 700, color: scopeMeta.color, background: scopeMeta.colorS, padding: "2px 7px", borderRadius: 4 }}>
              {scopeMeta.label}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {step === 1 && (
          <Step1 control={control} errors={errors} existingCategories={existingCategories} />
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Base params — hidden when multi-week active */}
            {!multiWeek && (
              <>
                <MethodParamsPanel params={params} scope={scope} color={scopeMeta.color} onChange={setParams} />
                {scope !== 'set' && (
                  <RecupSectionFull rest={rest} color={scopeMeta.color} onChange={setRest} />
                )}
                <div style={{ marginTop: 4 }}>
                  <MethodPreview config={previewConfig} />
                </div>
              </>
            )}

            {/* Multi-week */}
            <div style={{ paddingTop: multiWeek ? 0 : 14, borderTop: multiWeek ? "none" : `1px solid ${C.brd}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button type="button"
                  onClick={() => {
                    if (!multiWeek) setWeeklyConfigs(Array.from({ length: weekCount }, (_, i) => ({ week: i + 1, config: {} as MethodConfig })))
                    setMultiWeek(!multiWeek)
                  }}
                  style={pill(multiWeek, scopeMeta.color)}
                >
                  {multiWeek ? "✓ Protocole multi-semaines" : "Protocole multi-semaines"}
                </button>
                {multiWeek && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.tx3, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Semaines</span>
                    <Stepper value={weekCount} onChange={n => resizeWC(Math.max(2, Math.min(16, n)))} min={2} max={16} color={scopeMeta.color} />
                  </div>
                )}
              </div>
              {multiWeek && (
                <div>
                  <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>Configure chaque semaine. Clique pour ouvrir.</div>
                  {weeklyConfigs.map((wc, idx) => (
                    <WeekFormSlot
                      key={`${wc.week}-${copyKeys[wc.week] ?? 0}`}
                      week={wc.week}
                      scope={scope}
                      initialConfig={wc.config && Object.keys(wc.config).length > 1 ? wc.config : undefined}
                      isDeload={false}
                      onChange={updateWeekConfig}
                      onCopyFrom={idx > 0 ? (fromWeek: number) => copyWeek(fromWeek, wc.week) : undefined}
                      prevWeeks={weeklyConfigs.slice(0, idx).map(w => w.week)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: `1px solid ${C.brd}`, marginTop: 14, flexShrink: 0 }}>
        {step === 1 ? (
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
        ) : (
          <button type="button" onClick={() => setStep(1)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 16px", borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <ChevronLeft size={14} />Retour
          </button>
        )}
        <button type="button" onClick={handleNext} disabled={!!loading} style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "none", background: loading ? C.s2 : scopeMeta.color, color: loading ? C.tx3 : "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 150ms" }}>
          {step === 1 ? <><span>Suivant</span><ChevronRight size={14} /></> :
           loading ? "Enregistrement…" :
           <><Check size={14} /><span>{initial ? "Mettre à jour" : "Créer la méthode"}</span></>}
        </button>
      </div>
    </form>
  );
}

export type { FormValues as MethodFormRawValues };
