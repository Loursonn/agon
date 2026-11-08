/**
 * useActivePlan — mésocycle et cycle en cours, cycles terminés et semaine
 * affichée de l'athlète. Adaptateur de `getActivePlan` (src/api/planning.ts).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getActivePlan, planningKeys } from "@/api/planning";

export type {
  ActiveMesocycle, WeekSession, TestBrief, CompetitionBrief, WeekDay, PastCycle, ActivePlanResult,
} from "@/api/planning";
export { localToday, currentWeekRange, weeksBetween, currentWeekOf, timeProgressPct } from "@/api/planning";

export function useActivePlan(athleteId: string, weekOffset = 0) {
  return useQuery({
    queryKey: planningKeys.activePlan(athleteId, weekOffset),
    enabled: !!athleteId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: () => getActivePlan(athleteId, weekOffset),
  });
}
