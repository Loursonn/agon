import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    queryKey: ["planning-summary", athleteId],
    enabled: !!athleteId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data: macros } = await supabase
        .from("macrocycles")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("start_date");

      if (!macros?.length) return [];

      const macroIds = macros.map((m) => m.id);

      const { data: mesos } = await supabase
        .from("mesocycles")
        .select("*")
        .in("macrocycle_id", macroIds)
        .order("start_date");

      const mesoIds = (mesos ?? []).map((m) => m.id);
      let cycles: Cycle[] = [];
      let micros: Microcycle[] = [];

      if (mesoIds.length > 0) {
        const { data: cycleData } = await supabase
          .from("cycles")
          .select("*")
          .in("mesocycle_id", mesoIds)
          .order("start_date");
        cycles = (cycleData ?? []) as Cycle[];

        const cycleIds = cycles.map((c) => c.id);
        if (cycleIds.length > 0) {
          const { data: microData } = await supabase
            .from("microcycles")
            .select("*")
            .in("cycle_id", cycleIds)
            .order("start_date");
          micros = (microData ?? []) as Microcycle[];
        }
      }

      // Build nested structure
      const microsByCycle: Record<string, SummaryMicrocycle[]> = {};
      for (const micro of micros) {
        (microsByCycle[micro.cycle_id] ??= []).push(micro);
      }

      const cyclesByMeso: Record<string, SummaryCycle[]> = {};
      for (const cycle of cycles) {
        const c: SummaryCycle = { ...cycle, microcycles: microsByCycle[cycle.id] ?? [] };
        (cyclesByMeso[cycle.mesocycle_id] ??= []).push(c);
      }

      const mesosByMacro: Record<string, SummaryMesocycle[]> = {};
      for (const meso of mesos ?? []) {
        const m: SummaryMesocycle = { ...meso as Mesocycle, cycles: cyclesByMeso[meso.id] ?? [] };
        (mesosByMacro[meso.macrocycle_id] ??= []).push(m);
      }

      return (macros as Macrocycle[]).map((macro) => ({
        ...macro,
        mesocycles: mesosByMacro[macro.id] ?? [],
      }));
    },
  });
}
