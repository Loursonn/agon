import { useState } from "react"
import { BLOC_PALETTE } from "@/lib/peps";
import { cn } from "@/lib/utils";
import type { Bloc, BlocCategory } from "./types"
import { BLOC_CATEGORIES } from "./types"

type BlocFormData = Omit<Bloc, 'id' | 'exercices' | 'sort_order'>

interface BlocFormProps {
  initial?: Partial<Bloc>
  onSubmit: (bloc: BlocFormData) => void
  onCancel: () => void
}

const INPUT = "w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx outline-none"
const NUM = "w-[52px] rounded-[7px] border border-agon-brd-l bg-agon-s2 px-2 py-1.5 text-center text-[13px] text-agon-tx outline-none"
const LABEL = "mb-1.5 block text-[11px] font-semibold text-agon-tx3"
const UNIT = "text-[11px] text-agon-tx3"

/** Choix actif : aplat or 12 % (remplace le violet hérité). */
function pill(active: boolean): string {
  return cn(
    "cursor-pointer rounded-[7px] border px-3.5 py-1.5 text-[12px] [transition:all_120ms]",
    active ? "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent" : "border-agon-brd-l bg-transparent font-semibold text-agon-tx3",
  )
}

export function BlocForm({ initial, onSubmit, onCancel }: BlocFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [category, setCategory] = useState<BlocCategory>(initial?.category ?? 'Mixte')
  const [color, setColor] = useState<string>(initial?.color ?? BLOC_PALETTE[0])
  const [seriesMode, setSeriesMode] = useState<'libre' | 'fixe'>(initial?.series_mode ?? 'libre')
  const [seriesCount, setSeriesCount] = useState<number>(initial?.series_count ?? 4)
  const [timingMode, setTimingMode] = useState<'libre' | 'depart' | 'repos'>(initial?.timing_mode ?? 'libre')
  const [timingDepartMin, setTimingDepartMin] = useState<number>(initial?.timing_depart_min ?? 3)
  const [timingDepartSec, setTimingDepartSec] = useState<number>(initial?.timing_depart_sec ?? 0)
  const [timingReposMin, setTimingReposMin] = useState<number>(initial?.timing_repos_min ?? 2)
  const [timingReposSec, setTimingReposSec] = useState<number>(initial?.timing_repos_sec ?? 0)
  const [instructions, setInstructions] = useState(initial?.instructions ?? "")

  function handleSubmit() {
    const data: BlocFormData = {
      name: name.trim() || "Bloc sans nom",
      category,
      color,
      series_mode: seriesMode,
      series_count: seriesMode === 'fixe' ? seriesCount : undefined,
      timing_mode: timingMode,
      timing_depart_min: timingMode === 'depart' ? timingDepartMin : undefined,
      timing_depart_sec: timingMode === 'depart' ? timingDepartSec : undefined,
      timing_repos_min: timingMode === 'repos' ? timingReposMin : undefined,
      timing_repos_sec: timingMode === 'repos' ? timingReposSec : undefined,
      instructions: instructions.trim() || undefined,
    }
    onSubmit(data)
  }

  return (
    <div className="mb-3 rounded-[6px] border border-agon-brd-l bg-agon-s1 px-[18px] py-4">
      {/* Nom */}
      <div className="mb-3.5">
        <label className={cn(LABEL, "mb-1")}>Nom du bloc</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="ex. Force, Hypertrophie…"
          className={INPUT}
        />
      </div>

      {/* Catégorie */}
      <div className="mb-3.5">
        <label className={LABEL}>Catégorie</label>
        <div className="flex flex-wrap gap-1.5">
          {BLOC_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} className={pill(category === cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Couleur */}
      <div className="mb-3.5">
        <label className={LABEL}>Couleur</label>
        <div className="flex flex-wrap gap-[7px]">
          {BLOC_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn("size-6 shrink-0 cursor-pointer rounded-[6px] border-2 p-0", color === c ? "border-agon-tx outline outline-2" : "border-transparent outline-none")}
              style={{ background: c, outlineColor: color === c ? c : undefined }}
            />
          ))}
        </div>
      </div>

      {/* Séries */}
      <div className="mb-3.5">
        <label className={LABEL}>Séries</label>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSeriesMode('libre')} className={pill(seriesMode === 'libre')}>Libre</button>
          <button onClick={() => setSeriesMode('fixe')} className={pill(seriesMode === 'fixe')}>Fixe</button>
          {seriesMode === 'fixe' && (
            <input
              type="number"
              value={seriesCount}
              onChange={e => setSeriesCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              min={1} max={20}
              className={NUM}
            />
          )}
        </div>
      </div>

      {/* Timing */}
      <div className="mb-4">
        <label className={LABEL}>Timing</label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setTimingMode('libre')} className={pill(timingMode === 'libre')}>Libre</button>
          <button onClick={() => setTimingMode('depart')} className={pill(timingMode === 'depart')}>Départ toutes les</button>
          <button onClick={() => setTimingMode('repos')} className={pill(timingMode === 'repos')}>Repos</button>
          {timingMode === 'depart' && (
            <div className="ml-1 flex items-center gap-1">
              <input
                type="number"
                value={timingDepartMin}
                onChange={e => setTimingDepartMin(Math.max(0, parseInt(e.target.value, 10) || 0))}
                min={0} max={30}
                className={NUM}
              />
              <span className={UNIT}>min</span>
              <input
                type="number"
                value={timingDepartSec}
                onChange={e => setTimingDepartSec(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                min={0} max={59}
                className={NUM}
              />
              <span className={UNIT}>sec</span>
            </div>
          )}
          {timingMode === 'repos' && (
            <div className="ml-1 flex items-center gap-1">
              <input
                type="number"
                value={timingReposMin}
                onChange={e => setTimingReposMin(Math.max(0, parseInt(e.target.value, 10) || 0))}
                min={0} max={30}
                className={NUM}
              />
              <span className={UNIT}>min</span>
              <input
                type="number"
                value={timingReposSec}
                onChange={e => setTimingReposSec(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                min={0} max={59}
                className={NUM}
              />
              <span className={UNIT}>sec</span>
            </div>
          )}
        </div>
      </div>

      {/* Consignes */}
      <div className="mb-4">
        <label className={cn(LABEL, "mb-1")}>Consignes</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="ex. Charge progressive, garder 1-2 reps en réserve, gainage serré…"
          rows={3}
          className={cn(INPUT, "resize-y leading-[1.4]")}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent px-4 py-2 text-[12px] font-semibold text-agon-tx2"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          className="cursor-pointer rounded-[4px] border-0 bg-agon-accent px-5 py-2 text-[12px] font-bold text-agon-tx"
        >
          Valider
        </button>
      </div>
    </div>
  )
}
