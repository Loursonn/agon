import { usePRsByRef, useRecordLinks } from "@/features/shared/hooks/usePRLogs"
import { resolveRecordRef } from "@/api/records"

/**
 * 1RM d'un exercice programmé : cherché sous sa référence de record — le
 * `rm_ref` posé par le coach dans « Records personnels » (plusieurs exercices
 * partagent un record), sinon le nom de l'exercice. Avant : seul le nom
 * exact était cherché, un exercice lié à « Développé couché » n'avait pas de 1RM.
 */
export function useExerciceRM(
  athleteId: string | undefined,
  exercice: { exercise_name: string; exercise_id?: string | null },
) {
  const { bestByRef, byRef, isLoading } = usePRsByRef(athleteId)
  const { data: links } = useRecordLinks(athleteId)
  const linked = resolveRecordRef(exercice, links ?? {})
  const name = exercice.exercise_name?.trim()
  // Lien posé mais aucun record sous ce nom : les records rangés sous le nom exact restent visibles.
  const ref = linked && !byRef[linked] && name && byRef[name] ? name : linked
  return {
    /** Référence sous laquelle le 1RM est rangé (à utiliser pour en ajouter un). */
    ref,
    best: ref ? bestByRef[ref] ?? null : null,
    history: ref ? byRef[ref] ?? [] : [],
    isLoading,
  }
}
