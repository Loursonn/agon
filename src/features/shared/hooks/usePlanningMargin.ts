import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { localISO } from "@/lib/date";
import { cycleKeys, listCyclesEndingSoon } from "@/api/cycles";

export interface CycleEndingSoon {
  cycleId:      string;
  athleteId:    string;
  athleteName:  string;
  cycleName:    string;
  endDate:      string;
  daysLeft:     number;
}

/** Cycles ending within `daysAhead` days — signals the coach to plan the next block. */
export function usePlanningMargin(daysAhead = 14) {
  const { athletes, user } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const today = useMemo(() => localISO(), []);
  const limit = useMemo(
    () => localISO(new Date(Date.now() + daysAhead * 86400000)),
    [daysAhead],
  );

  const query = useQuery({
    queryKey: cycleKeys.endingSoon(user?.id ?? ""),
    queryFn: () => listCyclesEndingSoon(athleteIds, today, limit),
    enabled: !!user && athleteIds.length > 0,
    staleTime: 120_000,
    refetchOnWindowFocus: true,
  });

  const cycles = useMemo<CycleEndingSoon[]>(() => {
    const now = Date.now();
    return (query.data ?? []).map((c) => {
      const athlete = athletes.find((a) => a.id === c.athlete_id);
      const daysLeft = Math.ceil(
        (new Date(c.end_date).getTime() - now) / 86400000,
      );
      return {
        cycleId:     c.id,
        athleteId:   c.athlete_id,
        athleteName: athlete?.full_name ?? "—",
        cycleName:   c.name,
        endDate:     c.end_date,
        daysLeft:    Math.max(0, daysLeft),
      };
    });
  }, [query.data, athletes]);

  return { cycles, isLoading: query.isLoading };
}
