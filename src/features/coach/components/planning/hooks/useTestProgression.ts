import { useQuery } from "@tanstack/react-query";
import { getTestProgression, testKeys, type TestProgressionSeries } from "@/api/tests";

export type { TestProgressionSeries } from "@/api/tests";

export interface TestProgressionPoint {
  date: string;      // "dd/MM"
  rawDate: string;   // "yyyy-MM-dd" for sorting
  value: number;
  testName: string;
}

export function useTestProgression(macrocycleId: string) {
  return useQuery<TestProgressionSeries[]>({
    queryKey: testKeys.macrocycleProgression(macrocycleId),
    enabled: !!macrocycleId,
    staleTime: 300_000,
    queryFn: () => getTestProgression(macrocycleId),
  });
}
