/**
 * Lectures simples pour l'espace professionnel (/staff). La RLS (staff_can)
 * filtre : un domaine fermé renvoie simplement une liste vide.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Profile } from "@/hooks/useAuth";

export interface StaffWorkoutLog {
  id: string;
  scheduled_date: string;
  session_name: string;
  status: string;
  rpe_score: number | null;
  duration_s: number | null;
  notes: string | null;
  run_distance_km: number | null;
}

export function useStaffWorkoutLogs(athleteId: string, enabled: boolean) {
  return useQuery<StaffWorkoutLog[]>({
    queryKey: ["staff", "logs", athleteId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, scheduled_date, session_name, status, rpe_score, duration_s, notes, run_distance_km")
        .eq("athlete_id", athleteId)
        .lte("scheduled_date", new Date().toISOString().slice(0, 10))
        .order("scheduled_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as StaffWorkoutLog[];
    },
  });
}

export interface StaffPlanItem {
  id: string;
  kind: "saison" | "macro" | "cycle" | "competition";
  name: string;
  start: string;
  end: string | null;
  detail: string | null;
}

export function useStaffPlanning(athleteId: string, enabled: boolean) {
  return useQuery<StaffPlanItem[]>({
    queryKey: ["staff", "planning", athleteId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [seasons, macros, cycles, comps] = await Promise.all([
        supabase.from("seasons").select("id, name, start_date, end_date").eq("athlete_id", athleteId),
        supabase.from("macrocycles").select("id, name, start_date, end_date, objective").eq("athlete_id", athleteId),
        supabase.from("cycles").select("id, name, start_date, end_date, objective").eq("athlete_id", athleteId),
        supabase.from("competitions").select("id, name, date, location, priority, type").eq("athlete_id", athleteId),
      ]);
      for (const r of [seasons, macros, cycles, comps]) if (r.error) throw r.error;
      const items: StaffPlanItem[] = [
        ...(seasons.data ?? []).map((s) => ({ id: s.id, kind: "saison" as const, name: s.name, start: s.start_date, end: s.end_date, detail: null })),
        ...(macros.data ?? []).map((m) => ({ id: m.id, kind: "macro" as const, name: m.name, start: m.start_date, end: m.end_date, detail: m.objective })),
        ...(cycles.data ?? []).map((c) => ({ id: c.id, kind: "cycle" as const, name: c.name, start: c.start_date, end: c.end_date, detail: c.objective })),
        ...(comps.data ?? []).map((c) => ({
          id: c.id, kind: "competition" as const, name: c.name, start: c.date, end: null,
          detail: [c.priority, c.type, c.location].filter(Boolean).join(" · ") || null,
        })),
      ];
      return items.sort((a, b) => b.start.localeCompare(a.start));
    },
  });
}

export interface StaffWeeklyRetour {
  id: string;
  week_start: string;
  comment: string;
  athlete_reaction: string | null;
}

export function useStaffWeeklyRetours(athleteId: string, enabled: boolean) {
  return useQuery<StaffWeeklyRetour[]>({
    queryKey: ["staff", "retours", athleteId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_retours")
        .select("id, week_start, comment, athlete_reaction")
        .eq("athlete_id", athleteId)
        .order("week_start", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as StaffWeeklyRetour[];
    },
  });
}

/**
 * Profils des athlètes suivis, filtrés côté base par domaine (RPC
 * staff_athlete_profiles) : nom et coach toujours, le reste seulement si le
 * domaine correspondant est ouvert et que l'athlète a donné son accord staff.
 * Le pro n'a plus de lecture directe de la ligne `profiles` de l'athlète.
 */
export type StaffAthleteProfile = Database["public"]["Functions"]["staff_athlete_profiles"]["Returns"][number];

export async function fetchStaffAthleteProfiles(): Promise<StaffAthleteProfile[]> {
  const { data, error } = await supabase.rpc("staff_athlete_profiles");
  if (error) throw error;
  return data ?? [];
}

/** Profil de l'athlète suivi, au format attendu par AthleteProvider. */
export function useStaffAthleteProfile(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["staff", "athlete-profile", athleteId],
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const p = (await fetchStaffAthleteProfiles()).find((a) => a.id === athleteId);
      if (!p) return null;
      const { coach_name: _coachName, ...fields } = p;
      return { ...fields, role: "athlete" } as unknown as Profile;
    },
  });
}
