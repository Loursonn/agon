/**
 * Côté professionnel : ses liens actifs vers des athlètes, avec le coach
 * principal de chacun, et l'état du consentement unique de l'athlète.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { fetchStaffAthleteProfiles } from "./useStaffAthleteData";
import { toPermissions, type StaffPermissions, type StaffProfession } from "../lib/staffPermissions";

export interface MyStaffAthlete {
  linkId: string;
  athleteId: string;
  athleteName: string;
  athleteFirstName: string | null;
  coachId: string | null;
  coachName: string | null;
  profession: StaffProfession;
  permissions: StaffPermissions;
  canEditCoachContent: boolean;
  /** Consentement unique de l'athlète au partage de ses données de santé. */
  healthConsent: boolean;
  createdAt: string;
}

interface Row {
  id: string;
  athlete_id: string;
  profession: StaffProfession;
  permissions: unknown;
  can_edit_coach_content: boolean;
  created_at: string;
}

export function useMyStaffLinks() {
  const { user } = useAuth();
  return useQuery<MyStaffAthlete[]>({
    queryKey: QK.myStaffLinks(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_staff")
        .select("id, athlete_id, profession, permissions, can_edit_coach_content, created_at")
        .eq("staff_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];

      // Identité de l'athlète et nom du coach : via la RPC filtrée (le pro n'a
      // pas de lecture directe de la ligne profiles de l'athlète).
      const profiles = rows.length ? await fetchStaffAthleteProfiles() : [];
      const byId = new Map(profiles.map((p) => [p.id, p]));

      const consents = await Promise.all(
        rows.map(async (r) => {
          const { data: ok } = await supabase.rpc("staff_sharing_consented", { athlete_uuid: r.athlete_id });
          return !!ok;
        }),
      );

      return rows.map((r, i) => {
        const a = byId.get(r.athlete_id);
        return {
          linkId: r.id,
          athleteId: r.athlete_id,
          athleteName: a ? [a.first_name, a.last_name].filter(Boolean).join(" ") || a.full_name : "Athlète",
          athleteFirstName: a?.first_name ?? null,
          coachId: a?.coach_id ?? null,
          coachName: a?.coach_name ?? null,
          profession: r.profession,
          permissions: toPermissions(r.permissions),
          canEditCoachContent: r.can_edit_coach_content,
          healthConsent: consents[i],
          createdAt: r.created_at,
        };
      });
    },
  });
}

/** Vrai si l'utilisateur courant a au moins un athlète en tant que pro. */
export function useHasStaffLinks() {
  const { data = [], isLoading } = useMyStaffLinks();
  return { hasLinks: data.length > 0, count: data.length, isLoading };
}

// ── Invitation ────────────────────────────────────────────────────────────────

export interface StaffInvitationPreview {
  athlete_name: string;
  coach_name: string | null;
  inviter_name: string | null;
  invited_by_role: "coach" | "athlete";
  profession: StaffProfession;
  status: "valid" | "used" | "expired";
}

/** Lecture publique d'une invitation par son jeton (avant connexion). */
export function useStaffInvitationPreview(token: string | undefined) {
  return useQuery<StaffInvitationPreview | null>({
    queryKey: QK.staffInvitation(token ?? ""),
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_staff_invitation", { p_token: token! });
      if (error) throw error;
      const row = (data ?? [])[0];
      return (row as StaffInvitationPreview | undefined) ?? null;
    },
  });
}

export async function acceptStaffInvitation(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_staff_invitation", { p_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

export function useAcceptStaffInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acceptStaffInvitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.staff }),
  });
}
