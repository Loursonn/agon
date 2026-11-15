import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  accountKeys, createCoachInvitation, invalidateCoachInvitations, listCoachInvitations, revokeCoachInvitation, serverReason,
} from "@/api/account";

/** Invitations coach : les siennes (coach certifié), toutes (admin). */
export function useCoachInvitations(enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.coachInvitations,
    queryFn: listCoachInvitations,
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateCoachInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => createCoachInvitation(email),
    onSuccess: () => void invalidateCoachInvitations(qc),
    onError: (e: unknown) => toast.error(serverReason(e) || "Invitation non créée"),
  });
}

export function useRevokeCoachInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeCoachInvitation(id),
    onSuccess: () => {
      void invalidateCoachInvitations(qc);
      toast.success("Invitation annulée");
    },
    onError: (e: unknown) => toast.error(serverReason(e) || "Annulation impossible"),
  });
}
