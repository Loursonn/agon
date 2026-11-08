import { useQuery } from "@tanstack/react-query";
import { cycleKeys, getCycleTree } from "@/api/cycles";
import type { Macrocycle, Mesocycle, Cycle, Microcycle } from "./useTimelineData";

/** Microcycle brut : les stats sont calculées séparément. */
export type SummaryMicrocycle = Microcycle;

export interface SummaryCycle extends Cycle {
  microcycles: SummaryMicrocycle[];
}

export interface SummaryMesocycle extends Mesocycle {
  cycles: SummaryCycle[];
}

export interface SummaryMacrocycle extends Macrocycle {
  mesocycles: SummaryMesocycle[];
}

export function usePlanningSummary(athleteId: string) {
  return useQuery<SummaryMacrocycle[]>({
    queryKey: cycleKeys.summary(athleteId),
    enabled: !!athleteId,
    staleTime: 300_000,
    queryFn: async () => {
      const { macrocycles, mesocycles, cycles, microcycles } = await getCycleTree(athleteId);

      // Arbre macro → méso → cycle → semaines (les cycles autonomes n'y figurent pas).
      const microsByCycle: Record<string, SummaryMicrocycle[]> = {};
      for (const micro of microcycles) {
        (microsByCycle[micro.cycle_id] ??= []).push(micro);
      }

      const cyclesByMeso: Record<string, SummaryCycle[]> = {};
      for (const cycle of cycles) {
        if (!cycle.mesocycle_id) continue;
        const c: SummaryCycle = { ...cycle, microcycles: microsByCycle[cycle.id] ?? [] };
        (cyclesByMeso[cycle.mesocycle_id] ??= []).push(c);
      }

      const mesosByMacro: Record<string, SummaryMesocycle[]> = {};
      for (const meso of mesocycles) {
        const m: SummaryMesocycle = { ...meso, cycles: cyclesByMeso[meso.id] ?? [] };
        (mesosByMacro[meso.macrocycle_id] ??= []).push(m);
      }

      return macrocycles.map((macro) => ({
        ...macro,
        mesocycles: mesosByMacro[macro.id] ?? [],
      }));
    },
  });
}
