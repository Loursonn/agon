import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getReco } from "@/lib/wellness";
import { localISO } from "@/lib/date";
import { wellnessScore, type WellnessEntry } from "@shared/domain/wellness";
import { listWorkoutLogs } from "@/api/workouts";
import { coachKeys, listUpcomingTestSessions } from "@/api/coaches";
import { useWellnessHistories } from "./useWellness";

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
  /** Score du wellness saisi aujourd'hui (domaine wellness) ; null = pas de saisie ou incomplète. */
  wellnessScore: number | null;
  wellnessColor: string;
  /** Palier (Optimal, Bon, Modéré, Fatigué, Surmenage) ; null sans score. */
  wellnessLabel: string | null;
  /** Réponse « blessé/malade » du wellness d'aujourd'hui ; null sinon. */
  injuryNote: string | null;
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
    queryKey: coachKeys.dashboardToday(user?.id ?? "", today),
    queryFn: () => listWorkoutLogs({ athleteIds, from: today, to: today, withMods: false }),
    enabled: !!user && athleteIds.length > 0,
    ...COMMON,
  });

  // ── 2. Wellness du jour (asp:wh + archive, lu par src/api/wellness) ────────
  // Avant : `asp:wellness.date` (compacte "20261107") comparée à "2026-11-07"
  // → le wellness du jour n'apparaissait jamais. Même requête que les alertes.
  const wellQ = useWellnessHistories(athleteIds, { enabled: !!user });

  // ── 3. Yesterday's missed sessions ─────────────────────────────────────────
  const missedQ = useQuery({
    queryKey: coachKeys.dashboardMissed(user?.id ?? "", yesterday),
    queryFn: () => listWorkoutLogs({ athleteIds, from: yesterday, to: yesterday, statuses: ["missed"], withMods: false }),
    enabled: !!user && athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── 4. Upcoming test sessions ──────────────────────────────────────────────
  const testsQ = useQuery({
    queryKey: coachKeys.dashboardUpcomingTests(user?.id ?? "", today),
    queryFn: () => listUpcomingTestSessions(athleteIds, today),
    enabled: !!user && athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── Merge: today's athletes ─────────────────────────────────────────────────
  const logs = logsQ.data;
  const todayAthletes = useMemo<TodayAthlete[]>(() => {
    // Seulement la saisie d'AUJOURD'HUI (jour ISO local) : sinon le score est périmé.
    const wellMap: Record<string, WellnessEntry> = {};
    for (const [aid, h] of Object.entries(wellQ.data ?? {})) {
      if (h[today]) wellMap[aid] = h[today];
    }

    const logsByAthlete: Record<string, NonNullable<typeof logs>[number][]> = {};
    (logs ?? []).forEach((r) => {
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
        const entry = wellMap[a.id];
        const score = wellnessScore(entry);
        const reco = getReco(score);
        return {
          athleteId:     a.id,
          athleteName:   a.full_name,
          sessions:      (logsByAthlete[a.id] ?? []).map((l) => ({
            id:          l.id,
            sessionName: l.session_name,
            status:      l.status,
            rpeScore:    l.rpe_score,
          })),
          wellnessScore: score,
          wellnessColor: reco.c,
          wellnessLabel: score != null ? reco.label : null,
          injuryNote:    entry?.injuryNote ?? null,
        };
      });
  }, [logs, wellQ.data, athletes, today]);

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
