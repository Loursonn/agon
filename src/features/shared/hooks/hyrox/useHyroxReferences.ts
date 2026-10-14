import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useHyroxReferences() {
  return useQuery<HyroxReferenceSegment[]>({
    queryKey: QK.hyroxReferences,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    queryFn: async () => {
      const { data, error } = await db
        .from("hyrox_reference_segments")
        .select("*");
      if (error) throw error;
      return data as HyroxReferenceSegment[];
    },
  });
}

/** Pure selector: pick a reference row, falling back bracket→'all' then division→'all'. */
export function pickRef(
  refs: HyroxReferenceSegment[],
  division: string,
  segment: string,
  bracket = "all",
): HyroxReferenceSegment | null {
  const find = (d: string, b: string) =>
    refs.find(r => r.division === d && r.bracket === b && r.segment === segment) ?? null;
  return find(division, bracket) ?? find(division, "all") ?? find("all", bracket) ?? find("all", "all");
}
