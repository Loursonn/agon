import { useQuery } from "@tanstack/react-query";
import { getLoadWeeks, loadKeys } from "@/api/load";
import { mondayOf } from "@/lib/trainingLoadWeek";
import type { SummaryMesocycle } from "./usePlanningSummary";

export interface WeekLoad {
  week: string;   // "S1", "S2", ...
  /** Points YOXX réalisés (P28). */
  load: number;
  /** Points YOXX prévus, `null` si rien de chiffrable. */
  planned: number | null;
}

/**
 * Charge du mésocycle par semaine : points YOXX réalisés et prévus
 * (`src/api/load.ts`), à la place de l'ancien « séances faites × RPE moyen ».
 */
export function useMesoLoad(meso: SummaryMesocycle, athleteId: string) {
  const first = meso.start_date ? mondayOf(meso.start_date) : "";
  const last = meso.end_date ? mondayOf(meso.end_date) : "";
  const count = first && last ? Math.min(26, Math.round((Date.parse(last) - Date.parse(first)) / (7 * 86_400_000)) + 1) : 0;
  return useQuery<WeekLoad[]>({
    queryKey: [...loadKeys.weeks(athleteId, last, count), "meso", meso.id],
    enabled: !!meso.id && !!athleteId && count > 0,
    staleTime: 300_000,
    queryFn: async () => {
      const r = await getLoadWeeks(athleteId, last, count);
      return r.weeks.map((w, i) => ({ week: `S${i + 1}`, load: Math.round(w.done), planned: w.planned != null ? Math.round(w.planned) : null }));
    },
  });
}
