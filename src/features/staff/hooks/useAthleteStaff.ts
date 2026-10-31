/**
 * Staff d'un athlète (vu par le coach principal ou par l'athlète) :
 * liens actifs/révoqués, invitations en attente, et mutations.
 *
 * La base fait foi sur les droits : les triggers refusent toute modification
 * de grille qui ne vient pas du coach principal (cf. staff_core.sql).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { errorMessage } from "@/lib/errors";
import {
  staffInviteUrl,
  toPermissions,
  type StaffPermissions,
  type StaffProfession,
} from "../lib/staffPermissions";

export interface StaffPerson {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  profession: string | null;
}

export interface StaffLink {
  id: string;
  athlete_id: string;
  staff_id: string;
  profession: StaffProfession;
  permissions: StaffPermissions;
  can_edit_coach_content: boolean;
  status: "active" | "revoked";
  added_by: string | null;
  added_by_role: "coach" | "athlete";
  athlete_notified_at: string | null;
  coach_notified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  staff: StaffPerson | null;
}

export interface StaffInvitation {
  id: string;
  athlete_id: string;
  profession: StaffProfession;
  permissions: StaffPermissions;
  can_edit_coach_content: boolean;
  invited_by: string;
  invited_by_role: "coach" | "athlete";
  token: string;
  expires_at: string;
  created_at: string;
}

export function personName(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!p) return "Professionnel";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Professionnel";
}

type LinkRow = Omit<StaffLink, "permissions" | "staff"> & { permissions: unknown; staff: StaffPerson | null };

/** Liens staff d'un athlète (actifs d'abord). */
export function useAthleteStaff(athleteId: string | undefined) {
  return useQuery<StaffLink[]>({
    queryKey: QK.athleteStaff(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_staff")
        .select("*, staff:profiles!athlete_staff_staff_id_fkey(id, full_name, first_name, last_name, profession)")
        .eq("athlete_id", athleteId!)
        .order("status", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as LinkRow[]).map((r) => ({ ...r, permissions: toPermissions(r.permissions) }));
    },
  });
}

/** Invitations en attente (non utilisées, non expirées) pour un athlète. */
export function useStaffInvitations(athleteId: string | undefined) {
  return useQuery<StaffInvitation[]>({
    queryKey: QK.staffInvitations(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invitations")
        .select("id, athlete_id, profession, permissions, can_edit_coach_content, invited_by, invited_by_role, token, expires_at, created_at")
        .eq("athlete_id", athleteId!)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as (Omit<StaffInvitation, "permissions"> & { permissions: unknown })[])
        .map((r) => ({ ...r, permissions: toPermissions(r.permissions) }));
    },
  });
}

function useInvalidateStaff() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QK.staff });
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
    }): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Non connecté");
      const { data, error } = await supabase
        .from("staff_invitations")
        .insert({
          athlete_id: input.athleteId,
          profession: input.profession,
          // Ignorés par la base si c'est l'athlète qui invite (grille par défaut).
          permissions: input.permissions ?? {},
          can_edit_coach_content: !!input.canEditCoachContent,
          invited_by: auth.user.id,
          invited_by_role: "coach", // recalculé par le trigger
        })
        .select("token")
        .single();
      if (error) throw error;
      return staffInviteUrl(data.token);
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible de créer l'invitation")),
  });
}

export function useCancelStaffInvitation() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible d'annuler l'invitation")),
  });
}

/** Coach principal : met à jour la grille d'un lien. */
export function useUpdateStaffLink() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async ({ id, permissions, canEditCoachContent }: {
      id: string; permissions?: StaffPermissions; canEditCoachContent?: boolean;
    }) => {
      const patch: { permissions?: StaffPermissions; can_edit_coach_content?: boolean } = {};
      if (permissions) patch.permissions = permissions;
      if (canEditCoachContent !== undefined) patch.can_edit_coach_content = canEditCoachContent;
      const { error } = await supabase.from("athlete_staff").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, "Impossible d'enregistrer les droits")),
  });
}

/** Coach, athlète ou le pro lui-même : retire l'accès (effet immédiat). */
export function useRevokeStaffLink() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("athlete_staff").update({ status: "revoked" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Accès retiré");
    },
    onError: (e) => toast.error(errorMessage(e, "Impossible de retirer l'accès")),
  });
}

/** Coach : copie la grille de ce lien sur tous ses athlètes suivis par ce pro. */
export function useApplyStaffToAll() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async (linkId: string): Promise<number> => {
      const { data, error } = await supabase.rpc("staff_apply_to_all", { p_link_id: linkId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(n > 0 ? `Droits appliqués à ${n} autre${n > 1 ? "s" : ""} athlète${n > 1 ? "s" : ""}` : "Aucun autre athlète suivi par ce pro");
    },
    onError: (e) => toast.error(errorMessage(e, "Impossible d'appliquer les droits")),
  });
}

/** Accusé de lecture (athlète : ajouts et changements de droits ; coach : ajouts par l'athlète). */
export function useMarkStaffSeen() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: async ({ ids, as }: { ids: string[]; as: "athlete" | "coach" }) => {
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      const patch = as === "athlete" ? { athlete_notified_at: now } : { coach_notified_at: now };
      const { error } = await supabase.from("athlete_staff").update(patch).in("id", ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
