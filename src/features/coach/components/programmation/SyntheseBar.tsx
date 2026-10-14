import { C } from "@/lib/theme"
import type { ExerciceParams, ParamValue } from "./types"
import { formatClusterReps } from "./clusterFormat"

const VIOLET = "#FFC933"

interface SyntheseBarProps {
  params: ExerciceParams
  color?: string
}

function getVal<T>(pv: ParamValue<T>): T | undefined {
  return pv.mode === 'global' ? pv.value : undefined
}

function formatCharge(value: number | null, unit: ExerciceParams['charge_unit']): string {
  if (value == null) return '—'
  if (unit === '%RM') return `${value}%`
  if (unit === 'kg') return `${value}kg`
  return String(value)
}

function fmtRepsRange(reps: ParamValue<number>, reps_max?: ParamValue<number | null>): string {
  const min = reps.mode === 'global' ? reps.value : undefined
  const max = reps_max?.mode === 'global' ? reps_max.value : undefined
  if (min == null) return '?'
  if (max != null && max !== min) return `${min}-${max}`
  return String(min)
}

export function SyntheseBar({ params, color }: SyntheseBarProps) {
  const accent = color ?? VIOLET
  const { nb_series, cluster, reps, reps_max, reps_mode: _reps_mode, charge_unit, charge, rir, tempo } = params

  // Guard: if reps is missing, nothing meaningful to show
  if (!reps) return null

  // Cluster mode — checked first: cluster reps replace reps, whatever the charge unit
  if (cluster) {
    const chargeVal = charge ? getVal(charge) : undefined
    const rirVal = rir ? getVal(rir) : undefined
    let text = `${nb_series}×${formatClusterReps(cluster)}`
    if (charge_unit === 'PDC') text += ` @ PDC`
    else if (chargeVal != null) text += ` @ ${formatCharge(chargeVal, charge_unit)}`
    if (rirVal != null) text += ` — RIR ${rirVal}`
    return (
      <div style={{ fontSize: 11, color: accent, fontFamily: "inherit", fontWeight: 600 }}>
        {text}
      </div>
    )
  }

  if (charge_unit === 'PDC') {
    // PDC — body weight
    const rirVal = rir ? getVal(rir) : undefined
    const tempoVal = tempo ? getVal(tempo) : undefined
    let text = `${nb_series}×${fmtRepsRange(reps, reps_max)} @ PDC`
    if (rirVal != null) text += ` — RIR ${rirVal}`
    if (tempoVal) text += ` — Tempo ${tempoVal}`
    return (
      <div style={{ fontSize: 11, color: accent, fontFamily: "inherit", fontWeight: 600 }}>
        {text}
      </div>
    )
  }

  // Par série mode
  if (reps.mode === 'par_serie' || charge?.mode === 'par_serie') {
    const parts: string[] = []
    for (let i = 0; i < nb_series; i++) {
      const r = reps.mode === 'par_serie' ? reps.values[i] : getVal(reps)
      const rm = reps_max?.mode === 'par_serie' ? reps_max.values[i] : (reps_max?.mode === 'global' ? reps_max.value : null)
      const c = charge?.mode === 'par_serie' ? charge.values[i] : (charge ? getVal(charge) : undefined)
      const rStr = r == null ? '?' : (rm != null && rm !== r ? `${r}-${rm}` : String(r))
      let seg = `S${i + 1}: ${rStr}`
      if (c != null) seg += `×${formatCharge(c, charge_unit)}`
      parts.push(seg)
    }
    const rirVal = rir?.mode === 'global' ? getVal(rir) : null
    let text = parts.join(' / ')
    if (rirVal != null) text += ` — RIR ${rirVal}`
    return (
      <div style={{ fontSize: 11, color: accent, fontFamily: "inherit", fontWeight: 600 }}>
        {text}
      </div>
    )
  }

  // Global mode
  const chargeVal = charge ? getVal(charge) : undefined
  const rirVal = rir ? getVal(rir) : undefined
  const tempoVal = tempo ? getVal(tempo) : undefined

  let text = `${nb_series}×${fmtRepsRange(reps, reps_max)}`
  if (chargeVal != null) text += ` @ ${formatCharge(chargeVal, charge_unit)}`
  if (rirVal != null) text += ` — RIR ${rirVal}`
  if (tempoVal) text += ` — Tempo ${tempoVal}`

  return (
    <div style={{ fontSize: 11, color: accent, fontFamily: "inherit", fontWeight: 600 }}>
      {text || <span style={{ color: C.tx3 }}>Aucun paramètre défini</span>}
    </div>
  )
}
