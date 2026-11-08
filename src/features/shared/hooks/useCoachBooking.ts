import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coachKeys, getCoachBooking, setBookingUrl } from "@/api/coaches";

/**
 * Lien de réservation du point hebdo du coach de l'athlète (adaptateur de
 * `src/api/coaches.ts`, qui re-valide l'URL avant de l'injecter dans un iframe).
 */
export function useCoachBooking(coachId: string | null | undefined) {
  return useQuery({
    queryKey: coachKeys.booking(coachId ?? "none"),
    enabled: !!coachId,
    // Un lien Calendly ne bouge quasiment jamais : inutile de requêter à chaque
    // ouverture du profil.
    staleTime: 10 * 60 * 1000,
    queryFn: () => getCoachBooking(coachId!),
  });
}

/** Coach : enregistre (ou retire avec `null`) son lien de réservation. */
export function useSaveBookingUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ coachId, url }: { coachId: string; url: string | null }) => setBookingUrl(coachId, url),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: coachKeys.booking(v.coachId) }),
  });
}
