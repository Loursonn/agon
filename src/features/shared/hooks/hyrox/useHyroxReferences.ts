import { useQuery } from "@tanstack/react-query";
import { hyroxKeys, listHyroxReferences } from "@/api/hyrox";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";

export { pickRef } from "@/api/hyrox";

export function useHyroxReferences() {
  return useQuery<HyroxReferenceSegment[]>({
    queryKey: hyroxKeys.references,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    queryFn: listHyroxReferences,
  });
}
