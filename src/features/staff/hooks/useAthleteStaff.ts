/**
 * Staff d'un athlète (vu par le coach principal ou par l'athlète) :
 * liens actifs/révoqués, invitations en attente, et mutations.
 * Adaptateurs de `src/api/staff.ts`.
 *
 * La base fait foi sur les droits : les triggers refusent toute modification
 * de grille qui ne vient pas du coach principal (cf. staff_core.sql).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import {
  applyStaffToAll, cancelStaffInvitation, createStaffInvitation, invalidateStaff, listAthleteStaff,
  listStaffInvitations, markStaffSeen, revokeStaffLink, staffKeys, staffSharingConsented, updateStaffLink,
  type StaffInvitation, type StaffLink,
} from "@/api/staff";
import { staffInviteUrl, type StaffPermissions, type StaffProfession } from "../lib/staffPermissions";

export type { StaffInvitation, StaffLink, StaffPerson } from "@/api/staff";

export function personName(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!p) return "Professionnel";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Professionnel";
}

/** Liens staff d'un athlète (actifs d'abord). */
export function useAthleteStaff(athleteId: string | undefined) {
  return useQuery<StaffLink[]>({
    queryKey: staffKeys.athlete(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => listAthleteStaff(athleteId!),
  });
}

/** Invitations en attente (non utilisées, non expirées) pour un athlète. */
export function useStaffInvitations(athleteId: string | undefined) {
  return useQuery<StaffInvitation[]>({
    queryKey: staffKeys.invitations(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => listStaffInvitations(athleteId!),
  });
}

/** Accord unique de l'athlète au partage de ses données avec son staff (`staff_sharing`). */
export function useStaffHealthConsent(athleteId: string) {
  return useQuery({
    queryKey: staffKeys.consent(athleteId),
    staleTime: 60_000,
    queryFn: () => staffSharingConsented(athleteId),
  });
}

function useInvalidateStaff() {
  const qc = useQueryClient();
  return () => invalidateStaff(qc);
}

/** Crée une invitation et renvoie le lien à copier. */
export function useCreateStaffInvitation() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async (input: {
      athleteId: string;
      profession: StaffProfession;
      permissions?: StaffPermissions;
      canEditCoachContent?: boolean;
    }): Promise<string> => staffInviteUrl(await createStaffInvitation(input)),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible de créer l'invitation")),
  });
}

export function useCancelStaffInvitation() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: cancelStaffInvitation,
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible d'annuler l'invitation")),
  });
}

/** Coach principal : met à jour la grille d'un lien. */
export function useUpdateStaffLink() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ id, ...p }: { id: string; permissions?: StaffPermissions; canEditCoachContent?: boolean }) =>
      updateStaffLink(id, p),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible d'enregistrer les droits")),
  });
}

/** Coach, athlète ou le pro lui-même : retire l'accès (effet immédiat). */
export function useRevokeStaffLink() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: revokeStaffLink,
    onSuccess: () => {
      void invalidate();
      toast.success("Accès retiré");
    },
    onError: (e) => toast.error(errorMessage(e, "Impossible de retirer l'accès")),
  });
}

/** Coach : copie la grille de ce lien sur tous ses athlètes suivis par ce pro. */
export function useApplyStaffToAll() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: applyStaffToAll,
    onSuccess: (n) => {
      void invalidate();
      toast.success(n > 0 ? `Droits appliqués à ${n} autre${n > 1 ? "s" : ""} athlète${n > 1 ? "s" : ""}` : "Aucun autre athlète suivi par ce pro");
    },
    onError: (e) => toast.error(errorMessage(e, "Impossible d'appliquer les droits")),
  });
}

/** Accusé de lecture (athlète : ajouts et changements de droits ; coach : ajouts par l'athlète). */
export function useMarkStaffSeen() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ ids, as }: { ids: string[]; as: "athlete" | "coach" }) => markStaffSeen(ids, as),
    onSuccess: invalidate,
  });
}
