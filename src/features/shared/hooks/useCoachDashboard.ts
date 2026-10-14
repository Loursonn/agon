import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calcScore } from "@/lib/wellness";
import { QK } from "@/lib/queryKeys";
import { localISO } from "@/lib/date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const WELL_COLOR = (s: number) =>
  s >= 70 ? "#66F03C" : s >= 50 ? "#F5A623" : "#FF5A33";

export type SessionStatus = "planned" | "in_progress" | "completed" | "missed" | "skipped";

export interface TodaySession {
  id: string;
  sessionName: string | null;
  status: SessionStatus;
  rpeScore: number | null;
}

export interface TodayAthlete {
  athleteId: string;
  athleteName: string;
  sessions: TodaySession[];
  wellnessScore: number | null;
  wellnessColor: string;
}

export interface MissedSession {
  athleteId: string;
  athleteName: string;
  sessionName: string | null;
  date: string;
}

const COMMON = { staleTime: 30_000, refetchOnWindowFocus: true } as const;

export function useCoachDashboard() {
  const { athletes, user } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const today = useMemo(() => localISO(), []);
  const yesterday = useMemo(() => {
    const d = new Date(Date.now() - 86400000);
    return localISO(d);
  }, []);

  // ── 1. Today's workout_logs ─────────────────────────────────────────────────
  const logsQ = useQuery({
    queryKey: QK.coachDashboard.today(user?.id ?? "", today),
    queryFn: async () => {
      const { data, error } = await db
        .from("workout_logs")
        .select("id, athlete_id, session_name, status, rpe_score")
        .in("athlete_id", athleteIds)
        .eq("scheduled_date", today);
      if (error) throw error;
      return (data ?? []) as {
        id: string; athlete_id: string; session_name: string | null;
        status: string; rpe_score: number | null;
      }[];
    },
    enabled: !!user && athleteIds.length > 0,
    ...COMMON,
  });

  // ── 2. Wellness from app_data (latest entry per athlete) ───────────────────
  const wellQ = useQuery({
    queryKey: QK.coachDashboard.wellness(user?.id ?? "", today),
    queryFn: async () => {
      const { data, error } = await db
        .from("app_data")
        .select("athlete_id, value")
        .in("athlete_id", athleteIds)
        .eq("key", "asp:wellness");
      if (error) throw error;
      return (data ?? []) as { athlete_id: string; value: unknown }[];
    },
    enabled: !!user && athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── 3. Yesterday's missed sessions ─────────────────────────────────────────
  const missedQ = useQuery({
    queryKey: QK.coachDashboard.missed(user?.id ?? "", yesterday),
    queryFn: async () => {
      const { data, error } = await db
        .from("workout_logs")
        .select("id, athlete_id, session_name, scheduled_date")
        .in("athlete_id", athleteIds)
        .eq("scheduled_date", yesterday)
        .eq("status", "missed");
      if (error) throw error;
      return (data ?? []) as {
        id: string; athlete_id: string; session_name: string | null; scheduled_date: string;
      }[];
    },
    enabled: !!user && athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── 4. Upcoming test sessions ──────────────────────────────────────────────
  const testsQ = useQuery({
    queryKey: QK.coachDashboard.upcomingTests(user?.id ?? "", today),
    queryFn: async () => {
      const { data, error } = await db
        .from("test_sessions")
        .select("id, athlete_id, title, date")
        .in("athlete_id", athleteIds)
        .gte("date", today)
        .eq("completed", false)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: string; athlete_id: string; title: string; date: string;
      }[];
    },
    enabled: !!user && athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── Merge: today's athletes ─────────────────────────────────────────────────
  const todayAthletes = useMemo<TodayAthlete[]>(() => {
    const wellMap: Record<string, unknown> = {};
    (wellQ.data ?? []).forEach((r) => {
      // Only use wellness if it was filled TODAY — otherwise score is stale
      const v = r.value as { date?: string } | null;
      if (v?.date === today) wellMap[r.athlete_id] = r.value;
    });

    const logsByAthlete: Record<string, (typeof logsQ.data)[number][]> = {};
    (logsQ.data ?? []).forEach((r) => {
      logsByAthlete[r.athlete_id] ??= [];
      logsByAthlete[r.athlete_id].push(r);
    });

    const seenIds = new Set([
      ...Object.keys(logsByAthlete),
      ...Object.keys(wellMap),
    ]);

    return athletes
      .filter((a) => seenIds.has(a.id))
      .map((a) => {
        const rawWell = wellMap[a.id];
        const score = rawWell ? calcScore(rawWell) : null;
        return {
          athleteId:     a.id,
          athleteName:   a.full_name,
          sessions:      (logsByAthlete[a.id] ?? []).map((l) => ({
            id:          l.id,
            sessionName: l.session_name,
            status:      l.status as SessionStatus,
            rpeScore:    l.rpe_score,
          })),
          wellnessScore: score,
          wellnessColor: score != null ? WELL_COLOR(score) : "#7D7468",
        };
      });
  }, [logsQ.data, wellQ.data, athletes]);

  // ── Missed sessions ─────────────────────────────────────────────────────────
  const missedSessions = useMemo<MissedSession[]>(() => {
    return (missedQ.data ?? []).map((r) => {
      const athlete = athletes.find((a) => a.id === r.athlete_id);
      return {
        athleteId:   r.athlete_id,
        athleteName: athlete?.full_name ?? "—",
        sessionName: r.session_name,
        date:        r.scheduled_date,
      };
    });
  }, [missedQ.data, athletes]);

  const upcomingTests = useMemo(() => {
    return (testsQ.data ?? []).map((t) => {
      const athlete = athletes.find((a) => a.id === t.athlete_id);
      return { ...t, athleteName: athlete?.full_name ?? "—" };
    });
  }, [testsQ.data, athletes]);

  return {
    todayAthletes,
    missedSessions,
    upcomingTests,
    isLoadingToday:  logsQ.isLoading || wellQ.isLoading,
    isLoadingMissed: missedQ.isLoading,
    isLoadingTests:  testsQ.isLoading,
  };
}
