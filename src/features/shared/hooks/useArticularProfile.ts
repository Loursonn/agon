import { useQuery } from '@tanstack/react-query';
import { getArticularProfile, profileKeys } from '@/api/profile';

export type { ArticularAction, ArticularGroup, ScorePoint } from '@/api/profile';

/** Profil articulaire : dernière note /5 de chaque action, regroupée par articulation. */
export function useArticularProfile(athleteId: string) {
  return useQuery({
    queryKey: profileKeys.articular(athleteId),
    queryFn: () => getArticularProfile(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}
