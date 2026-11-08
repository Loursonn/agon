/**
 * Lectures simples pour l'espace professionnel (/staff), adaptateurs de
 * `src/api/staff.ts`. La RLS (staff_can) filtre : un domaine fermé renvoie
 * simplement une liste vide.
 */
import { useQuery } from "@tanstack/react-query";
import { localIsoDay } from "@shared/domain/dates";
import {
  listStaffAthleteProfiles, listStaffPlanning, listStaffWeeklyRetours, listStaffWorkoutLogs, staffKeys,
  type StaffPlanItem, type StaffWeeklyRetour, type StaffWorkoutLog,
} from "@/api/staff";
import type { Profile } from "@/hooks/useAuth";

export type { StaffAthleteProfile, StaffPlanItem, StaffWeeklyRetour, StaffWorkoutLog } from "@/api/staff";

/** Profils des athlètes suivis, filtrés côté base par domaine (RPC staff_athlete_profiles). */
export const fetchStaffAthleteProfiles = listStaffAthleteProfiles;

export function useStaffWorkoutLogs(athleteId: string, enabled: boolean) {
  return useQuery<StaffWorkoutLog[]>({
    queryKey: staffKeys.logs(athleteId),
    enabled,
    staleTime: 60_000,
    // Jour local (avant : jour UTC → entre minuit et 1 h, 2 h l'été, la séance du jour manquait).
    queryFn: () => listStaffWorkoutLogs(athleteId, localIsoDay()),
  });
}

export function useStaffPlanning(athleteId: string, enabled: boolean) {
  return useQuery<StaffPlanItem[]>({
    queryKey: staffKeys.planning(athleteId),
    enabled,
    staleTime: 60_000,
    queryFn: () => listStaffPlanning(athleteId),
  });
}

export function useStaffWeeklyRetours(athleteId: string, enabled: boolean) {
  return useQuery<StaffWeeklyRetour[]>({
    queryKey: staffKeys.retours(athleteId),
    enabled,
    staleTime: 60_000,
    queryFn: () => listStaffWeeklyRetours(athleteId),
  });
}

/** Profil de l'athlète suivi, au format attendu par AthleteProvider. */
export function useStaffAthleteProfile(athleteId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.athleteProfile(athleteId),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const p = (await listStaffAthleteProfiles()).find((a) => a.id === athleteId);
      if (!p) return null;
      const { coach_name: _coachName, ...fields } = p;
      return { ...fields, role: "athlete" } as unknown as Profile;
    },
  });
}
