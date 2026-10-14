import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEF_BLOCK_CONFIG } from "@/lib/exercises";
import type { WellnessData, BlockConfig, Session } from "../types/athlete";
import type { CoachOverview, CoachOverviewRaw } from "../types/coach-overview";
import { asBlockConfig, asSessions, asCompletedMap, asWellnessData } from "../types/coach-overview";
import { localISO } from "@/lib/date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COMMON = { staleTime: 60_000, refetchOnWindowFocus: true } as const;

/** Computes current block week (1-based) from blockConfig.startDate. */
function computeCurrentWeek(bc: BlockConfig): number {
  const tw = bc.totalWeeks || 6;
  if (bc.startDate) {
    const days = Math.floor((Date.now() - new Date(bc.startDate).getTime()) / 86400000);
    return Math.min(Math.max(1, Math.floor(days / 7) + 1), tw);
  }
  return 1;
}

function deriveWellness(wellnessToday: CoachOverviewRaw["wellness_today"]) {
  const scores = wellnessToday
    .map((r) => asWellnessData(r.value as unknown)?.score)
    .filter((s): s is number => typeof s === "number");
  if (!scores.length) return { wellnessMean: null, wellnessColor: "#9194A0" };
  const mean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const color = mean >= 70 ? "#66F03C" : mean >= 50 ? "#F5A623" : "#FF5A33";
  return { wellnessMean: mean, wellnessColor: color };
}

function deriveSessionRatio(sessionsData: CoachOverviewRaw["sessions_data"]) {
  if (!sessionsData.length) return null;

  const byAthlete: Record<string, Record<string, unknown>> = {};
  sessionsData.forEach((r) => {
    byAthlete[r.athlete_id] ??= {};
    byAthlete[r.athlete_id][r.key] = r.value;
  });

  let totalCompleted = 0;
  let totalPlanned = 0;

  Object.values(byAthlete).forEach((data) => {
    const bc   = asBlockConfig(data["asp:blockConfig"] ?? DEF_BLOCK_CONFIG);
    const sess = asSessions(data["asp:sessions"] ?? []) as Session[];
    const done = asCompletedMap(data["asp:completed"] ?? {});
    const week = computeCurrentWeek(bc);
    totalCompleted += (done[week] ?? []).length;
    totalPlanned   += sess.length || 1;
  });

  return { completed: totalCompleted, planned: totalPlanned };
}

/**
 * Aggregated KPI data for the coach home dashboard.
 *
 * Primary path : calls get_coach_overview() RPC (single round-trip).
 * Fallback     : individual queries if RPC unavailable (e.g. migration not applied yet).
 */
export function useCoachOverview(): CoachOverview {
  const { athletes, user } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const today = useMemo(() => localISO(), []);
  const in30  = useMemo(
    () => localISO(new Date(Date.now() + 30 * 86400000)),
    [],
  );

  // ── Primary: RPC get_coach_overview ────────────────────────────────────────
  const rpcQ = useQuery({
    queryKey: ["coach_overview_rpc", user?.id, today],
    queryFn: async () => {
      const { data, error } = await db
        .rpc("get_coach_overview", { coach_uuid: user!.id });
      if (error) throw error;
      return data as CoachOverviewRaw;
    },
    enabled: !!user && athleteIds.length > 0,
    ...COMMON,
  });

  // ── Fallback: individual queries (used if RPC not yet deployed) ─────────────
  const wellnessQ = useQuery({
    queryKey: ["coach_kpi", "wellness", user?.id, today],
    queryFn: async () => {
      const { data, error } = await db
        .from("app_data").select("athlete_id, value")
        .in("athlete_id", athleteIds).eq("key", "asp:wellness");
      if (error) throw error;
      return (data ?? []) as { athlete_id: string; value: WellnessData | null }[];
    },
    enabled: !rpcQ.data && athleteIds.length > 0,
    ...COMMON,
  });

  const sessionsQ = useQuery({
    queryKey: ["coach_kpi", "sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("app_data").select("athlete_id, key, value")
        .in("athlete_id", athleteIds)
        .in("key", ["asp:completed", "asp:blockConfig", "asp:sessions"]);
      if (error) throw error;
      return (data ?? []) as { athlete_id: string; key: string; value: unknown }[];
    },
    enabled: !rpcQ.data && athleteIds.length > 0,
    ...COMMON,
  });

  const competQ = useQuery({
    queryKey: ["coach_kpi", "competitions", user?.id, today],
    queryFn: async () => {
      const { data, error } = await db
        .from("competitions").select("id")
        .in("athlete_id", athleteIds).gte("date", today).lte("date", in30);
      if (error) throw error;
      return (data ?? []) as { id: string }[];
    },
    enabled: !rpcQ.data && athleteIds.length > 0,
    ...COMMON,
  });

  // ── Derive KPIs ─────────────────────────────────────────────────────────────

  return useMemo<CoachOverview>(() => {
    // ── RPC path ──
    if (rpcQ.data) {
      const raw = rpcQ.data;
      const { wellnessMean, wellnessColor } = deriveWellness(raw.wellness_today ?? []);
      const sessionRatio = deriveSessionRatio(raw.sessions_data ?? []);
      return {
        athleteCount:      raw.athlete_count,
        wellnessMean,
        wellnessColor,
        competitionsCount: raw.competitions_count,
        sessionRatio,
        isLoading:         false,
      };
    }

    // ── Fallback path ──
    if (wellnessQ.isLoading || sessionsQ.isLoading || competQ.isLoading) {
      return {
        athleteCount:      athletes.length,
        wellnessMean:      null,
        wellnessColor:     "#9194A0",
        competitionsCount: 0,
        sessionRatio:      null,
        isLoading:         true,
      };
    }

    const { wellnessMean, wellnessColor } = (() => {
      const scores = (wellnessQ.data ?? [])
        .map((r) => (r.value as WellnessData | null)?.score)
        .filter((s): s is number => typeof s === "number");
      if (!scores.length) return { wellnessMean: null, wellnessColor: "#9194A0" };
      const mean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const color = mean >= 70 ? "#66F03C" : mean >= 50 ? "#F5A623" : "#FF5A33";
      return { wellnessMean: mean, wellnessColor: color };
    })();

    const sessionRatio = (() => {
      const rows = (sessionsQ.data ?? []) as { athlete_id: string; key: string; value: unknown }[];
      if (!rows.length) return null;
      const byAthlete: Record<string, Record<string, unknown>> = {};
      rows.forEach((r) => {
        byAthlete[r.athlete_id] ??= {};
        byAthlete[r.athlete_id][r.key] = r.value;
      });
      let completed = 0, planned = 0;
      Object.values(byAthlete).forEach((data) => {
        const bc   = asBlockConfig(data["asp:blockConfig"] ?? DEF_BLOCK_CONFIG);
        const sess = asSessions(data["asp:sessions"] ?? []) as Session[];
        const done = asCompletedMap(data["asp:completed"] ?? {});
        const week = computeCurrentWeek(bc);
        completed += (done[week] ?? []).length;
        planned   += sess.length || 1;
      });
      return { completed, planned };
    })();

    return {
      athleteCount:      athletes.length,
      wellnessMean,
      wellnessColor,
      competitionsCount: competQ.data?.length ?? 0,
      sessionRatio,
      isLoading:         false,
    };
  }, [rpcQ.data, wellnessQ.data, sessionsQ.data, competQ.data,
      wellnessQ.isLoading, sessionsQ.isLoading, competQ.isLoading, athletes]);
}
