/**
 * Côté professionnel : ses liens actifs vers des athlètes, avec le coach
 * principal de chacun, et l'état de l'accord staff de l'athlète.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  acceptStaffInvitation, getStaffInvitationPreview, invalidateStaff, listMyStaffLinks, listStaffAthleteProfiles,
  staffKeys, staffSharingConsented, type StaffInvitationPreview,
} from "@/api/staff";
import type { StaffPermissions, StaffProfession } from "../lib/staffPermissions";

export type { StaffInvitationPreview } from "@/api/staff";
export { acceptStaffInvitation } from "@/api/staff";

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
  /** Accord de l'athlète au partage avec son staff : sans lui, aucune donnée visible. */
  sharingConsent: boolean;
  createdAt: string;
}

export function useMyStaffLinks() {
  const { user } = useAuth();
  return useQuery<MyStaffAthlete[]>({
    queryKey: staffKeys.mine(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const rows = await listMyStaffLinks(user!.id);

      // Identité de l'athlète et nom du coach : via la RPC filtrée (le pro n'a
      // pas de lecture directe de la ligne profiles de l'athlète).
      const profiles = rows.length ? await listStaffAthleteProfiles() : [];
      const byId = new Map(profiles.map((p) => [p.id, p]));

      // Une lecture d'accord qui échoue lève (avant : lue comme « pas d'accord »).
      const consents = await Promise.all(rows.map((r) => staffSharingConsented(r.athlete_id)));

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
          permissions: r.permissions,
          canEditCoachContent: r.can_edit_coach_content,
          sharingConsent: consents[i],
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

/** Lecture publique d'une invitation par son jeton (avant connexion). */
export function useStaffInvitationPreview(token: string | undefined) {
  return useQuery<StaffInvitationPreview | null>({
    queryKey: staffKeys.invitation(token ?? ""),
    enabled: !!token,
    staleTime: 60_000,
    queryFn: () => getStaffInvitationPreview(token!),
  });
}

export function useAcceptStaffInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acceptStaffInvitation,
    onSuccess: () => invalidateStaff(qc),
  });
}
