import { useQuery } from "@tanstack/react-query";
import { listAthleteChoices, workoutKeys, type AthleteChoiceLog } from "@/api/workouts";
import type { AthleteModifications } from "@/features/shared/types/athlete";

/** Une séance que l'athlète a déplacée ou saisie (section « modifications » des Retours). */
export type AthleteModificationLog = Omit<AthleteChoiceLog, "athleteModifications"> & {
  athleteModifications: AthleteModifications | null;
};

/**
 * Séances déplacées par l'athlète ou portant sa saisie (Retours coach).
 * L'ancienne requête demandait `reschedule_reason`, colonne inexistante :
 * elle échouait et la section restait vide.
 */
export function useAthleteModifications(athleteId: string) {
  return useQuery({
    queryKey: workoutKeys.choices(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
    // Saisie déjà passée au parseur tolérant du domaine ; typée ici comme
    // l'attendent les écrans existants.
    queryFn: async (): Promise<AthleteModificationLog[]> =>
      (await listAthleteChoices(athleteId)) as unknown as AthleteModificationLog[],
  });
}
