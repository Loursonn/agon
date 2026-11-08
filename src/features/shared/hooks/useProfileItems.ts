import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createProfileItem, deleteProfileItem, getProfileItems, invalidateProfile, profileKeys, updateProfileItem,
  type ProfileItemInput,
} from '@/api/profile';

export type { ProfileItem, ProfileItemInput } from '@/api/profile';

export function useProfileItems(athleteId: string) {
  return useQuery({
    queryKey: profileKeys.items(athleteId),
    queryFn: () => getProfileItems(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}

export function useCreateProfileItem(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileItemInput) => createProfileItem(athleteId, input),
    onSuccess: () => invalidateProfile(qc, athleteId),
    onError: () => toast.error("Erreur lors de l'ajout"),
  });
}

export function useUpdateProfileItem(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ProfileItemInput & { id: string }) => updateProfileItem(id, input),
    onSuccess: () => invalidateProfile(qc, athleteId),
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

export function useDeleteProfileItem(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProfileItem(id),
    onSuccess: () => invalidateProfile(qc, athleteId),
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}
