import { useQuery } from "@tanstack/react-query"
import { getProgram, programKeys } from "@/api/program"
import type { ProgSession } from "../types"

export function useProgrammation(athleteId: string | undefined) {
  return useQuery<ProgSession[]>({
    queryKey: programKeys.sessions(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => getProgram(athleteId!),
  })
}
