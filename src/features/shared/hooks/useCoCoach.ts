/**
 * Double coach : coach référent (profiles.coach_id) + co-coach éventuel
 * (table athlete_co_coaches, 1 max). Les deux ont les mêmes droits sur
 * l'entraînement ; la base fait foi (is_coach_of couvre les deux).
 * Adaptateurs de `src/api/coaches.ts`.
 *
 * Ajout : par le coach référent ou par l'athlète, avec le code coach du 2e coach.
 * Retrait : coach référent, athlète, ou le co-coach lui-même.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCoCoach, coachKeys, getAthleteCoaches, invalidateAthleteCoaches, removeCoCoach, unlinkAthlete,
  type AthleteCoaches,
} from "@/api/coaches";

export type { AthleteCoaches, CoachPerson } from "@/api/coaches";
export { addSelfAsCoCoach } from "@/api/coaches";

export function useAthleteCoaches(athleteId: string | null | undefined) {
  return useQuery<AthleteCoaches>({
    queryKey: coachKeys.athleteCoaches(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getAthleteCoaches(athleteId!),
  });
}

export function useAddCoCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ athleteId, coachCode }: { athleteId: string; coachCode: string }) => addCoCoach(athleteId, coachCode),
    onSuccess: (_d, vars) => invalidateAthleteCoaches(qc, vars.athleteId),
  });
}

export function useRemoveCoCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ athleteId }: { athleteId: string }) => removeCoCoach(athleteId),
    onSuccess: (_d, vars) => invalidateAthleteCoaches(qc, vars.athleteId),
  });
}

/** Coach référent : détache un athlète (RPC `unlink_athlete`). */
export function useUnlinkAthlete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ athleteId }: { athleteId: string }) => unlinkAthlete(athleteId),
    onSuccess: (_d, vars) => invalidateAthleteCoaches(qc, vars.athleteId),
  });
}
