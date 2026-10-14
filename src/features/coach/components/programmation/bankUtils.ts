import type { Bloc, Exercice, ExerciceParams, ProgSession } from "./types"
import { flattenFichesToWeek } from "@/features/shared/types/fiches"

/** 'all' keeps every week's params; a number keeps only that week (flattened). */
export type BankWeekMode = 'all' | number

function isWeekRecord(p: Exercice['params']): p is Record<string, ExerciceParams> {
  return !!p && typeof p === 'object' && !('nb_series' in p)
}

/** True when at least one exercise has per-week params. */
export function hasMultiWeekParams(blocs: Bloc[]): boolean {
  return blocs.some(b => b.exercices.some(ex => isWeekRecord(ex.params)))
}

/** Highest week number found in per-week params (0 if none). */
function maxWeek(blocs: Bloc[]): number {
  let max = 0
  for (const b of blocs) for (const ex of b.exercices) {
    if (!isWeekRecord(ex.params)) continue
    for (const k of Object.keys(ex.params)) max = Math.max(max, Number(k) || 0)
  }
  return max
}

function prepareExercice(ex: Exercice, mode: BankWeekMode): Exercice {
  const base = { ...ex, id: crypto.randomUUID() }
  if (!isWeekRecord(ex.params)) return base
  if (mode === 'all') {
    // Per-exercise multi flag so the params stay editable outside a multi-week session
    return { ...base, multi_semaine: true }
  }
  const rec = ex.params
  const params = rec[String(mode)] ?? rec['1'] ?? Object.values(rec)[0]
  return { ...base, params, multi_semaine: false }
}

/** Deep copy with fresh ids, ready to be stored in (or inserted from) a bank. */
export function prepareBloc(bloc: Bloc, mode: BankWeekMode = 'all'): Bloc {
  const clone = structuredClone(bloc) as Bloc
  return {
    ...clone,
    id: crypto.randomUUID(),
    // Rattachements de fiches conservés ; en mode mono-semaine, variante de cette semaine
    ...(mode !== 'all' && clone.fiches ? { fiches: flattenFichesToWeek(clone.fiches, mode) } : {}),
    exercices: clone.exercices.map((ex, i) => ({ ...prepareExercice(ex, mode), sort_order: i })),
  }
}

/** Deep copy with fresh ids, ready to be stored in (or inserted from) a bank. */
export function prepareSession(session: ProgSession, mode: BankWeekMode = 'all'): ProgSession {
  const blocs = session.blocs.map((b, i) => ({ ...prepareBloc(b, mode), sort_order: i }))
  if (mode !== 'all') {
    return {
      ...session, id: crypto.randomUUID(), blocs, multi_semaine: false, nb_semaines: undefined,
      ...(session.fiches ? { fiches: flattenFichesToWeek(session.fiches, mode) } : {}),
    }
  }
  const weeks = maxWeek(blocs)
  return {
    ...session,
    id: crypto.randomUUID(),
    blocs,
    nb_semaines: session.multi_semaine ? Math.max(session.nb_semaines ?? 0, weeks) || undefined : session.nb_semaines,
  }
}
