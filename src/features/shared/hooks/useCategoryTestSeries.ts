import { useQuery } from '@tanstack/react-query';
import { getCategoryTestSeries, testKeys } from '@/api/tests';
import type { TestCategory } from '@/features/shared/types/tests';

export type { CatSeries, CatSeriesPoint } from '@/api/tests';

/** Séries de résultats (par test + variable) pour une catégorie, ordre chronologique. */
export function useCategoryTestSeries(athleteId: string, category: TestCategory) {
  return useQuery({
    queryKey: testKeys.categorySeries(athleteId, category),
    queryFn: () => getCategoryTestSeries(athleteId, category),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}
