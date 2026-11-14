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
import { cn } from "@/lib/utils";
import { MethodPreview } from "./MethodPreview";
import { exerciceParamsToMethodConfig, methodConfigToExerciceParams, methodConfigToText } from "./methodConfigConvert";
import type { RestConfig } from "./methodConfigConvert";
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

/** Teinte d'une portée (classes écrites en entier pour Tailwind). */
type Tone = "succes" | "alerte" | "accent"

const TONE: Record<Tone, { text: string; border: string; bg: string; soft: string; pillOn: string }> = {
  succes: {
    text: "text-agon-succes", border: "border-agon-succes", bg: "bg-agon-succes", soft: "bg-agon-succes/[0.1]",
    pillOn: "border-agon-succes bg-agon-succes/[0.125] text-agon-succes",
  },
  alerte: {
    text: "text-agon-alerte", border: "border-agon-alerte", bg: "bg-agon-alerte", soft: "bg-agon-alerte/[0.1]",
    pillOn: "border-agon-alerte bg-agon-alerte/[0.125] text-agon-alerte",
  },
  accent: {
    text: "text-agon-accent", border: "border-agon-accent", bg: "bg-agon-accent", soft: "bg-agon-accent/[0.12]",
    pillOn: "border-agon-accent bg-agon-accent/[0.125] text-agon-accent",
  },
}

const SCOPE_META = {
  classic:  { tone: "succes", label: "Classique",  desc: "Séries × reps — template simple" },
  set:      { tone: "alerte", label: "Sous-série", desc: "S'applique à une série spécifique (cluster, drop-set…)" },
  exercise: { tone: "accent", label: "Exercice",   desc: "Remplace entièrement le pattern de séries" },
} as const satisfies Record<MethodScope, { tone: Tone; label: string; desc: string }>

// ─── Style helpers ────────────────────────────────────────────────────────────

const PILL_OFF = "border-agon-brd-l bg-transparent font-semibold text-agon-tx3"

function pill(active: boolean, tone: Tone = "accent") {
  return cn(
    "cursor-pointer rounded-[7px] border px-3.5 py-1.5 text-[11px] [transition:all_100ms]",
    active ? cn(TONE[tone].pillOn, "font-bold") : PILL_OFF,
  )
}

function pillSmall(active: boolean, tone: Tone = "accent") {
  return cn(
    "cursor-pointer rounded-[6px] border px-[9px] py-1 text-[10px] [transition:all_100ms]",
    active ? cn(TONE[tone].pillOn, "font-bold") : PILL_OFF,
  )
}

function pillParSerie(active: boolean) {
  return cn(
    "cursor-pointer rounded-[6px] border px-[9px] py-1 text-[10px] [transition:all_100ms]",
    active ? "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent" : PILL_OFF,
  )
}

const NUM_INPUT = "box-border w-20 rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2.5 py-[7px] text-center text-[14px] font-bold text-agon-tx outline-none"
const TEXT_INPUT = "box-border w-full rounded border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx outline-none"
/** Case d'une grille « par série ». */
const CELL = "box-border w-full rounded-[6px] border border-agon-brd-l bg-agon-s1 px-1 py-[5px] text-agon-tx outline-none"
const KICKER = "text-[10px] font-extrabold uppercase tracking-[0.5px] text-agon-tx3"
const SMALL_KICKER = "text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3"
const MENU = "overflow-hidden rounded border border-agon-brd-l bg-agon-bg"
const MENU_ITEM = "w-full cursor-pointer border-b border-agon-brd bg-transparent px-3 py-2 text-left text-agon-tx"

// Éditeur de sous-séries / clusters (teinte alerte).
const CLUSTER_BOX = "rounded border border-agon-alerte/[0.314] bg-agon-alerte/[0.039] p-2.5"
const CLUSTER_KICKER = "text-[9px] font-bold uppercase tracking-[0.4px] text-agon-alerte"
const CLUSTER_STEP = "cursor-pointer border border-agon-alerte/[0.376] bg-transparent text-agon-alerte"
const CLUSTER_VALUE = "flex items-center justify-center border-x border-agon-alerte/[0.376] bg-agon-alerte/[0.031] font-extrabold text-agon-alerte"
const CLUSTER_SUM = "border border-agon-alerte/25 bg-agon-alerte/[0.094] text-center"

const STEP_BTN = "h-[30px] w-[30px] shrink-0 bg-transparent text-[16px] text-agon-tx3"

// ─── Base components ──────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mt-1 text-[11px] text-agon-erreur">{message}</div>;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-agon-brd-l bg-agon-s2 px-3.5 py-2.5">
      {children}
    </div>
  )
}

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <div className={KICKER}>{label}</div>
      {right}
    </div>
  )
}

function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(KICKER, "shrink-0")}>
      {children}
    </div>
  )
}

/** `valueClass` = couleur du chiffre (classe text-agon-*). */
function Stepper({ value, onChange, min = 1, max = 20, step = 1, valueClass = "text-agon-tx" }: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; valueClass?: string
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
    <div className="flex shrink-0 items-center overflow-hidden rounded border border-agon-brd-l bg-agon-s1">
      <button type="button" onClick={() => apply(local - step)}
        className={cn(STEP_BTN, local <= min ? "cursor-default opacity-30" : "cursor-pointer opacity-100")}>−</button>
      {editing ? (
        <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit() }}
          className={cn("w-10 bg-transparent p-0 text-center text-[14px] font-extrabold outline-none", valueClass)} />
      ) : (
        <div onClick={() => { setEditText(String(local)); setEditing(true) }} title="Cliquer pour saisir"
          className={cn("w-10 cursor-text select-none text-center text-[14px] font-extrabold", valueClass)}>
          {local}
        </div>
      )}
      <button type="button" onClick={() => apply(local + step)}
        className={cn(STEP_BTN, local >= max ? "cursor-default opacity-30" : "cursor-pointer opacity-100")}>+</button>
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
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-[6px] bg-agon-accent/[0.12] px-2 py-[3px] text-[11px] font-semibold text-agon-accent">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))}
              className="flex cursor-pointer bg-transparent p-0 leading-none text-agon-accent">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Ajouter un tag…" className={cn(TEXT_INPUT, "flex-1")} />
        <button type="button" onClick={add} className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded border border-agon-brd-l bg-transparent text-agon-tx3">
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
    <div ref={wrapRef} className="relative">
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ex: Intensification, Volume, Technique…" className={TEXT_INPUT} autoComplete="off" />
      {error && <FieldError message={error} />}
      {open && filtered.length > 0 && (
        <div className={cn(MENU, "absolute left-0 right-0 top-[calc(100%+4px)] z-50")}>
          {filtered.map(s => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setOpen(false); }}
              className={cn(MENU_ITEM, "text-[13px]")}>
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
    <div className="flex flex-col gap-2.5">
      <Section>
        <SectionLabel label="Nom de la méthode *" />
        <Controller name="name" control={control} render={({ field }) => (
          <input {...field} placeholder="ex: 3 sous-séries décroissantes…" className={TEXT_INPUT} maxLength={60} />
        )} />
        <FieldError message={errors.name?.message} />
      </Section>

      <Section>
        <SectionLabel label="Description (optionnelle)" />
        <Controller name="description" control={control} render={({ field }) => (
          <textarea {...field} rows={3} placeholder="Comment utiliser cette méthode…" className={cn(TEXT_INPUT, "resize-y")} maxLength={300} />
        )} />
      </Section>

      <Section>
        <SectionLabel label="Application" />
        <Controller name="scope" control={control} render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            {(Object.entries(SCOPE_META) as [keyof typeof SCOPE_META, typeof SCOPE_META[keyof typeof SCOPE_META]][]).map(([v, cfg]) => {
              const active = field.value === v
              const t = TONE[cfg.tone]
              return (
                <button key={v} type="button" onClick={() => field.onChange(v)} className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded border px-3.5 py-2.5 text-left [transition:all_100ms]",
                  active ? cn(t.border, t.soft) : "border-agon-brd-l bg-agon-s1",
                )}>
                  <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full [transition:background_100ms]", active ? t.bg : "bg-agon-tx3/[0.314]")} />
                  <div>
                    <div className={cn("text-[12px] font-bold", active ? t.text : "text-agon-tx")}>{cfg.label}</div>
                    <div className="mt-px text-[10px] text-agon-tx3">{cfg.desc}</div>
                  </div>
                  {active && (
                    <div className={cn("ml-auto flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full", t.bg)}>
                      <Check size={10} className="text-agon-tx" />
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
  tone: Tone
  onChange: (p: ExerciceParams) => void
}

function MethodParamsPanel({ params, scope, tone, onChange }: MethodParamsPanelProps) {
  const valueClass = TONE[tone].text
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
      <div className="flex flex-col gap-2">
        {/* Sous-séries */}
        <Section>
          <div className={CLUSTER_BOX}>
            <div className="mb-2.5 flex items-center justify-center gap-2.5">
              <div className="text-center">
                <div className={cn(CLUSTER_KICKER, "mb-1")}>Sous-séries</div>
                <Stepper value={cluster.nb_clusters} onChange={setNbClusters} min={2} max={10} valueClass="text-agon-alerte" />
              </div>
              <div className="text-center">
                <div className={cn(CLUSTER_KICKER, "mb-1")}>Récup intra (s)</div>
                <Stepper value={cluster.recup_sec} onChange={v => setCluster({ ...cluster, recup_sec: v })} min={0} max={300} valueClass="text-agon-alerte" />
              </div>
            </div>

            <div className="mb-2">
              <div className={cn(CLUSTER_KICKER, "mb-1.5 text-center")}>Reps par sous-série</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {safeReps.map((v, i) => (
                  <div key={i} className="text-center">
                    <div className="mb-[3px] text-[9px] text-agon-alerte">SS{i + 1}</div>
                    <div className="flex flex-col items-center gap-px">
                      <button onClick={() => updateRep(i, Math.min(50, v + 1))} className={cn(CLUSTER_STEP, "h-[22px] w-6 rounded-t-[5px] text-[13px]")}>+</button>
                      <div className={cn(CLUSTER_VALUE, "h-[26px] w-7 text-[13px]")}>{v}</div>
                      <button onClick={() => updateRep(i, Math.max(1, v - 1))} className={cn(CLUSTER_STEP, "h-[22px] w-6 rounded-b-[5px] text-[13px]")}>−</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn(CLUSTER_SUM, "rounded-[7px] px-2.5 py-[5px]")}>
              <span className="text-[13px] font-extrabold tracking-[2px] text-agon-alerte">{safeReps.join("+")}</span>
              <span className="ml-1.5 text-[10px] text-agon-alerte/[0.667]">+ {cluster.recup_sec}s récup</span>
            </div>
          </div>
        </Section>

        {/* Charge */}
        <ChargeSection params={params} nb={nb} chargeGlobal={chargeGlobal} chargeValues={chargeValues} tone={tone} up={up} />

        {/* RIR */}
        <RirSection params={params} nb={nb} rirGlobal={rirGlobal} rirValues={rirValues} tone={tone} up={up} />
      </div>
    )
  }

  // ── Classic / Exercise scope ──
  return (
    <div className="flex flex-col gap-2">

      {/* Séries — one line */}
      <Section>
        <div className="flex items-center justify-between gap-2">
          <InlineLabel>Séries</InlineLabel>
          <Stepper value={params.nb_series} onChange={v => up({ nb_series: v })} min={1} max={20} valueClass={valueClass} />
        </div>
      </Section>

      {/* Répétitions */}
      <Section>
        <div className="flex flex-wrap items-center gap-1.5">
          <InlineLabel>Répétitions</InlineLabel>
          {!params.cluster && params.reps.mode === 'global' && (
            <>
              <Stepper value={repsGlobal} onChange={v => up({ reps: { mode: 'global', value: v } })} min={1} max={100} valueClass={valueClass} />
              <button onClick={() => up({ reps_mode: { mode: 'global', value: 'EC' } })} className={pillSmall(currentRepsMode === 'EC', tone)}>EC</button>
              <button onClick={() => up({ reps_mode: { mode: 'global', value: 'iso' } })} className={pillSmall(currentRepsMode === 'iso', tone)}>ISO</button>
            </>
          )}
          <div className="ml-auto flex shrink-0 gap-1">
            <button
              onClick={() => {
                if (params.reps.mode === 'par_serie') {
                  up({ reps: { mode: 'global', value: repsValues[0] ?? 8 } })
                } else {
                  up({ reps: { mode: 'par_serie', values: Array(nb).fill(repsGlobal) } })
                }
              }}
              className={pillParSerie(params.reps.mode === 'par_serie')}
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
              className={pillSmall(!!params.cluster, "alerte")}
            >
              {params.cluster ? "Cluster ✓" : "Cluster"}
            </button>
          </div>
        </div>

        {params.cluster && (
          <div className="mt-2">
            <ClusterEditorInline cluster={params.cluster} onChange={c => up({ cluster: c })} />
          </div>
        )}
        {!params.cluster && params.reps.mode === 'par_serie' && (
          <div className="mt-2">
            <ParamSeriesGrid nb_series={nb} values={repsValues}
              onChange={values => up({ reps: { mode: 'par_serie', values } })}
              renderCell={(v, _i, ch) => (
                <input type="number" value={v} onChange={e => ch(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min={1} max={100}
                  className={cn(CELL, "text-center text-[12px]")}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* Récupération entre séries */}
      <RecupSection params={params} tone={tone} up={up} />

      {/* Charge */}
      <ChargeSection params={params} nb={nb} chargeGlobal={chargeGlobal} chargeValues={chargeValues} tone={tone} up={up} />

      {/* RIR */}
      <RirSection params={params} nb={nb} rirGlobal={rirGlobal} rirValues={rirValues} tone={tone} up={up} />

      {/* Tempo (exercise scope only) */}
      {scope === 'exercise' && (
        <Section>
          <div className="flex items-center gap-1.5">
            <InlineLabel>Tempo</InlineLabel>
            <span className="shrink-0 text-[9px] text-agon-tx3">ecc–pause–con</span>
            {params.tempo.mode === 'global' && (
              <input type="text" value={tempoGlobal}
                onChange={e => up({ tempo: { mode: 'global', value: e.target.value } })}
                placeholder="3-1-2-0"
                className="w-[88px] rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2 py-[5px] text-center text-[13px] font-bold text-agon-tx outline-none"
              />
            )}
            <div className="ml-auto shrink-0">
              <button
                onClick={() => {
                  if (params.tempo.mode === 'par_serie') {
                    up({ tempo: { mode: 'global', value: tempoValues[0] ?? '' } })
                  } else {
                    up({ tempo: { mode: 'par_serie', values: Array(nb).fill(tempoGlobal) } })
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
              <ParamSeriesGrid nb_series={nb} values={tempoValues}
                onChange={values => up({ tempo: { mode: 'par_serie', values } })}
                renderCell={(v, _i, ch) => (
                  <input type="text" value={v} onChange={e => ch(e.target.value)} placeholder="3-1-2"
                    className={cn(CELL, "text-center text-[11px]")}
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
  tone: Tone
  up: (p: Partial<ExerciceParams>) => void
}

function RecupSection({ params, tone, up }: Omit<SubSectionProps, 'nb'>) {
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
  void up; void tone; void params; // suppress unused warnings
  return null  // rest handled externally for now
}

function ChargeSection({ params, nb, chargeGlobal, chargeValues, tone, up }: SubSectionProps & { chargeGlobal: number | null, chargeValues: (number | null)[] }) {
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
            className={pillParSerie(params.charge.mode === 'par_serie')}
          >
            {params.charge.mode === 'par_serie' ? "↩ Global" : "Par série"}
          </button>
        }
      />

      <div className="mb-2.5 flex justify-center gap-1.5">
        {(['%RM', 'kg', 'PDC'] as const).map(u => (
          <button key={u} onClick={() => up({ charge_unit: u })} className={pill(params.charge_unit === u, tone)}>{u}</button>
        ))}
      </div>

      {params.charge_unit !== 'PDC' && (
        params.charge.mode === 'global' ? (
          <div className="flex justify-center">
            <div className="flex items-center gap-1.5">
              <input type="number" value={chargeGlobal ?? ""}
                onChange={e => up({ charge: { mode: 'global', value: e.target.value === "" ? null : parseFloat(e.target.value) } })}
                placeholder="—" min={0}
                className="w-20 rounded-[7px] border border-agon-brd-l bg-agon-s1 px-2 py-[7px] text-center text-[14px] font-bold text-agon-tx outline-none"
              />
              <span className="text-[12px] font-semibold text-agon-tx3">{params.charge_unit}</span>
            </div>
          </div>
        ) : (
          <ParamSeriesGrid nb_series={nb} values={chargeValues}
            onChange={values => up({ charge: { mode: 'par_serie', values } })}
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
  )
}

function RirSection({ params, nb, rirGlobal, rirValues, tone, up }: SubSectionProps & { rirGlobal: number | null, rirValues: (number | null)[] }) {
  const rirIsGlobal = params.rir.mode === 'global'
  return (
    <Section>
      <div className="flex flex-wrap items-center gap-1.5">
        <InlineLabel>RIR</InlineLabel>
        {rirIsGlobal && (
          <>
            <button
              onClick={() => up({ rir: { mode: 'global', value: rirGlobal === null ? 2 : null } })}
              className={pillSmall(rirGlobal === null, tone)}
            >
              {rirGlobal === null ? "Libre ✓" : "Libre"}
            </button>
            {rirGlobal !== null && (
              <Stepper value={rirGlobal} onChange={v => up({ rir: { mode: 'global', value: v } })} min={0} max={5} step={0.5} valueClass={TONE[tone].text} />
            )}
          </>
        )}
        <div className="ml-auto shrink-0">
          <button
            onClick={() => {
              if (params.rir.mode === 'par_serie') {
                up({ rir: { mode: 'global', value: (rirValues[0] as number) ?? 2 } })
              } else {
                up({ rir: { mode: 'par_serie', values: Array(nb).fill(rirGlobal ?? 2) as number[] } })
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
          <ParamSeriesGrid nb_series={nb} values={rirValues as number[]}
            onChange={values => up({ rir: { mode: 'par_serie', values } })}
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
    <div className={CLUSTER_BOX}>
      <div className="mb-2 flex items-center justify-center gap-2.5">
        <div className="text-center">
          <div className={cn(CLUSTER_KICKER, "mb-[3px]")}>Clusters</div>
          <Stepper value={cluster.nb_clusters} onChange={setNb} min={2} max={8} valueClass="text-agon-alerte" />
        </div>
        <div className="text-center">
          <div className={cn(CLUSTER_KICKER, "mb-[3px]")}>Récup (s)</div>
          <Stepper value={cluster.recup_sec} onChange={v => onChange({ ...cluster, recup_sec: v })} min={5} max={120} valueClass="text-agon-alerte" />
        </div>
      </div>
      <div className="mb-1.5 flex flex-wrap justify-center gap-[5px]">
        {safeReps.map((v, i) => (
          <div key={i} className="text-center">
            <div className="mb-0.5 text-[9px] text-agon-alerte">C{i + 1}</div>
            <div className="flex flex-col items-center gap-px">
              <button onClick={() => updateRep(i, Math.min(20, v + 1))} className={cn(CLUSTER_STEP, "h-5 w-[22px] rounded-t-[4px] text-[12px]")}>+</button>
              <div className={cn(CLUSTER_VALUE, "h-6 w-[26px] text-[12px]")}>{v}</div>
              <button onClick={() => updateRep(i, Math.max(1, v - 1))} className={cn(CLUSTER_STEP, "h-5 w-[22px] rounded-b-[4px] text-[12px]")}>−</button>
            </div>
          </div>
        ))}
      </div>
      <div className={cn(CLUSTER_SUM, "rounded-[6px] px-2 py-1")}>
        <span className="text-[12px] font-extrabold tracking-[2px] text-agon-alerte">{safeReps.join("+")}</span>
        <span className="ml-[5px] text-[10px] text-agon-alerte/[0.667]">+ {cluster.recup_sec}s</span>
      </div>
    </div>
  )
}

// ─── Récupération section (standalone, uses local state in WeekFormSlot/main) ─

function RecupSectionFull({ rest, tone, onChange }: { rest: RestConfig; tone: Tone; onChange: (r: RestConfig) => void }) {
  return (
    <Section>
      <SectionLabel label="Récupération entre séries" />
      <div className={cn("flex justify-center gap-1.5", rest.type !== 'free' ? "mb-2.5" : "mb-0")}>
        {(['free', 'fixed', 'variable'] as const).map(t => (
          <button key={t} onClick={() => onChange({ ...rest, type: t })} className={pill(rest.type === t, tone)}>
            {t === 'free' ? 'Libre' : t === 'fixed' ? 'Fixe' : 'Variable'}
          </button>
        ))}
      </div>
      {rest.type === 'fixed' && (
        <div className="flex items-center justify-center gap-2">
          <input type="number" value={rest.seconds} onChange={e => onChange({ ...rest, seconds: +e.target.value })} className={NUM_INPUT} min={0} max={600} />
          <span className="text-[12px] text-agon-tx3">secondes</span>
        </div>
      )}
      {rest.type === 'variable' && (
        <div className="flex items-center justify-center gap-2">
          <input type="number" value={rest.min_s} onChange={e => onChange({ ...rest, min_s: +e.target.value })} className={NUM_INPUT} min={0} max={600} />
          <span className="text-[12px] text-agon-tx3">à</span>
          <input type="number" value={rest.max_s} onChange={e => onChange({ ...rest, max_s: +e.target.value })} className={NUM_INPUT} min={0} max={600} />
          <span className="text-[12px] text-agon-tx3">secondes</span>
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
  const t = TONE[scopeMeta.tone]

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
    <div className={cn("mb-[5px] overflow-hidden rounded border", expanded ? t.border : "border-agon-brd-l")}>
      <div onClick={() => setExpanded(p => !p)} className={cn("flex cursor-pointer items-center gap-2.5 px-3.5 py-[9px] [transition:all_100ms]", expanded ? t.soft : "bg-agon-s2")}>
        <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border", expanded ? cn(t.bg, t.border) : "border-agon-brd-l bg-agon-s1")}>
          <span className={cn("text-[9px] font-black", expanded ? "text-agon-tx" : "text-agon-tx3")}>S{week}</span>
        </div>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-agon-tx3 [font-family:monospace]">{preview}</span>
        {isDeload && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", t.text, t.soft)}>déload</span>}
        {onCopyFrom && prevWeeks && prevWeeks.length > 0 && (
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowCopyMenu(p => !p)}
              title="Copier depuis une autre semaine"
              className="cursor-pointer rounded-[5px] border border-agon-brd-l bg-agon-s2 px-[7px] py-0.5 text-[9px] font-bold text-agon-tx3"
            >
              Copier ▾
            </button>
            {showCopyMenu && (
              <div className={cn(MENU, "absolute right-0 top-[calc(100%+4px)] z-20 min-w-[100px]")}>
                {prevWeeks.map(w => (
                  <button key={w} type="button"
                    onClick={() => { onCopyFrom(w); setShowCopyMenu(false) }}
                    className={cn(MENU_ITEM, "text-[12px]")}
                  >
                    Copier S{w}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="text-[10px] text-agon-tx3">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-agon-brd p-3">
          <MethodParamsPanel params={params} scope={scope} tone={scopeMeta.tone} onChange={handleParamsChange} />
          {scope !== 'set' && (
            <RecupSectionFull rest={rest} tone={scopeMeta.tone} onChange={handleRestChange} />
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

  const initWC = (initial?.config as unknown as Record<string, unknown>)?.weekly_configs as FullWeekConfig[] | undefined;
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
  const t = TONE[scopeMeta.tone]

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
    <form onSubmit={e => e.preventDefault()} className="flex h-full flex-col">
      {/* Step indicator */}
      <div className="mb-4">
        <div className="mb-2 flex gap-1.5">
          {[1, 2].map(s => (
            <div key={s} className={cn("h-[3px] flex-1 rounded-[3px] [transition:background_200ms]", step >= s ? t.bg : "bg-agon-brd-l")} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className={SMALL_KICKER}>
            Étape {step} / 2 — {step === 1 ? "Informations générales" : "Paramètres"}
          </div>
          {step === 2 && (
            <div className={cn("rounded px-[7px] py-0.5 text-[9px] font-bold", t.text, t.soft)}>
              {scopeMeta.label}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-0.5">
        {step === 1 && (
          <Step1 control={control} errors={errors} existingCategories={existingCategories} />
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2.5">

            {/* Base params — hidden when multi-week active */}
            {!multiWeek && (
              <>
                <MethodParamsPanel params={params} scope={scope} tone={scopeMeta.tone} onChange={setParams} />
                {scope !== 'set' && (
                  <RecupSectionFull rest={rest} tone={scopeMeta.tone} onChange={setRest} />
                )}
                <div className="mt-1">
                  <MethodPreview config={previewConfig} />
                </div>
              </>
            )}

            {/* Multi-week */}
            <div className={multiWeek ? "pt-0" : "border-t border-agon-brd pt-3.5"}>
              <div className="mb-2.5 flex items-center justify-between">
                <button type="button"
                  onClick={() => {
                    if (!multiWeek) setWeeklyConfigs(Array.from({ length: weekCount }, (_, i) => ({ week: i + 1, config: {} as MethodConfig })))
                    setMultiWeek(!multiWeek)
                  }}
                  className={pill(multiWeek, scopeMeta.tone)}
                >
                  {multiWeek ? "✓ Protocole multi-semaines" : "Protocole multi-semaines"}
                </button>
                {multiWeek && (
                  <div className="flex items-center gap-2">
                    <span className={SMALL_KICKER}>Semaines</span>
                    <Stepper value={weekCount} onChange={n => resizeWC(Math.max(2, Math.min(16, n)))} min={2} max={16} valueClass={t.text} />
                  </div>
                )}
              </div>
              {multiWeek && (
                <div>
                  <div className="mb-2 text-[10px] text-agon-tx3">Configure chaque semaine. Clique pour ouvrir.</div>
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
      <div className="mt-3.5 flex shrink-0 gap-2 border-t border-agon-brd pt-3.5">
        {step === 1 ? (
          <button type="button" onClick={onCancel} className="flex-1 cursor-pointer rounded border border-agon-brd-l bg-transparent py-2.5 text-[13px] font-semibold text-agon-tx2">
            Annuler
          </button>
        ) : (
          <button type="button" onClick={() => setStep(1)} className="flex cursor-pointer items-center gap-1 rounded border border-agon-brd-l bg-transparent px-4 py-2.5 text-[13px] font-semibold text-agon-tx2">
            <ChevronLeft size={14} />Retour
          </button>
        )}
        <button type="button" onClick={handleNext} disabled={!!loading} className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded py-2.5 text-[13px] font-bold [transition:background_150ms]",
          loading ? "cursor-default bg-agon-s2 text-agon-tx3" : cn("cursor-pointer text-agon-tx", t.bg),
        )}>
          {step === 1 ? <><span>Suivant</span><ChevronRight size={14} /></> :
           loading ? "Enregistrement…" :
           <><Check size={14} /><span>{initial ? "Mettre à jour" : "Créer la méthode"}</span></>}
        </button>
      </div>
    </form>
  );
}

export type { FormValues as MethodFormRawValues };
