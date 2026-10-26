import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { normalizeBookingUrl } from "@/lib/booking";

/**
 * Lien de réservation du point hebdo du coach de l'athlète.
 *
 * Lecture autorisée par la policy existante `profiles_select_coaches` : un
 * utilisateur authentifié peut lire les lignes dont le rôle est coach, donc pas
 * de RLS à ajouter ici.
 *
 * L'URL est re-validée côté client : une ligne pourrait avoir été écrite avant
 * la contrainte SQL, et on refuse d'injecter dans un iframe une URL dont on
 * n'est pas sûr.
 */
export function useCoachBooking(coachId: string | null | undefined) {
  return useQuery({
    queryKey: QK.coachBooking(coachId ?? "none"),
    enabled: !!coachId,
    // Un lien Calendly ne bouge quasiment jamais : inutile de requêter à chaque
    // ouverture du profil.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ bookingUrl: string | null; coachName: string }> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, booking_url")
        .eq("id", coachId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { bookingUrl: null, coachName: "Coach" };

      return {
        bookingUrl: normalizeBookingUrl(data.booking_url),
        coachName:
          [data.first_name, data.last_name].filter(Boolean).join(" ") ||
          data.full_name ||
          "Coach",
      };
    },
  });
}
