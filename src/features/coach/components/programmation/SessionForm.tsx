import { useState } from "react"
import { cn } from "@/lib/utils";
import type { ProgSession } from "./types"

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

interface SessionFormProps {
  initial?: Partial<ProgSession>
  onSubmit: (session: Omit<ProgSession, 'id' | 'blocs'>) => void
  onCancel: () => void
}

const INPUT = "w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx outline-none"
const LABEL = "mb-1 block text-[11px] font-semibold text-agon-tx3"
const FIELD = "mb-3.5"
/** Choix actif : aplat or 12 % (remplace le violet hérité). */
const ON = "border-agon-accent bg-agon-accent/[0.12] font-bold text-agon-accent"

function pill(active: boolean): string {
  return cn("cursor-pointer rounded-[7px] border px-3.5 py-1.5 text-[12px] [transition:all_120ms]", active ? ON : "border-agon-brd-l bg-transparent font-semibold text-agon-tx3")
}

function pillSmall(active: boolean): string {
  return cn("cursor-pointer rounded-[6px] border px-2.5 py-[5px] text-[11px] [transition:all_120ms]", active ? ON : "border-agon-brd-l bg-transparent font-medium text-agon-tx3")
}

export function SessionForm({ initial, onSubmit, onCancel }: SessionFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [short, setShort] = useState(initial?.short ?? "")
  const [recurrence, setRecurrence] = useState<'weekly' | 'once'>(initial?.recurrence ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(initial?.day_of_week)
  const [multiSemaine, setMultiSemaine] = useState<boolean>(initial?.multi_semaine ?? false)
  const [nbSemaines, setNbSemaines] = useState<number>(initial?.nb_semaines ?? 4)

  function handleSubmit() {
    const data: Omit<ProgSession, 'id' | 'blocs'> = {
      name: name.trim() || "Séance sans nom",
      short: short.trim().toUpperCase().slice(0, 6) || "?",
      recurrence,
      day_of_week: recurrence === 'weekly' ? dayOfWeek : undefined,
      multi_semaine: multiSemaine,
      nb_semaines: multiSemaine ? nbSemaines : undefined,
    }
    onSubmit(data)
  }

  return (
    <div className="mb-3 rounded-[6px] border border-agon-brd-l bg-agon-s1 px-[18px] py-4">
      {/* Nom */}
      <div className={FIELD}>
        <label className={LABEL}>Nom de la séance</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="ex. Full Body, Upper, Legs…"
          className={INPUT}
        />
      </div>

      {/* Abréviation */}
      <div className={FIELD}>
        <label className={LABEL}>Abréviation <span className="font-normal">(max 6 car.)</span></label>
        <input
          value={short}
          onChange={e => setShort(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="FB, UPP, LEG…"
          className={cn(INPUT, "w-[120px]")}
        />
      </div>

      {/* Type */}
      <div className={FIELD}>
        <label className={cn(LABEL, "mb-1.5")}>Type</label>
        <div className="flex gap-1.5">
          <button onClick={() => setRecurrence('weekly')} className={pill(recurrence === 'weekly')}>Récurrente</button>
          <button onClick={() => setRecurrence('once')} className={pill(recurrence === 'once')}>Ponctuelle</button>
        </div>
      </div>

      {/* Jour de la semaine (weekly only) */}
      {recurrence === 'weekly' && (
        <div className={FIELD}>
          <label className={cn(LABEL, "mb-1.5")}>Jour de la semaine</label>
          <div className="flex flex-wrap gap-1">
            {DOW.map((label, i) => (
              <button
                key={i}
                onClick={() => setDayOfWeek(dayOfWeek === i ? undefined : i)}
                className={pillSmall(dayOfWeek === i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multi-semaine */}
      <div className="mb-4">
        <label className={cn(LABEL, "mb-1.5")}>Multi-semaine</label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMultiSemaine(v => !v)}
            className={pill(multiSemaine)}
          >
            {multiSemaine ? "Activé" : "Activer"}
          </button>
          {multiSemaine && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={nbSemaines}
                onChange={e => setNbSemaines(Math.max(1, parseInt(e.target.value, 10) || 1))}
                min={1} max={24}
                className="w-[52px] rounded-[7px] border border-agon-brd-l bg-agon-s2 px-2 py-1.5 text-center text-[13px] text-agon-tx outline-none"
              />
              <span className="text-[11px] text-agon-tx3">semaines</span>
            </div>
          )}
        </div>
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
