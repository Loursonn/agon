import { useQuery } from "@tanstack/react-query";
import { DEFAULT_ACTIVITY_LIMIT, getActivities, providerKeys, type ProviderActivity } from "@/api/providers";

export type { ProviderActivity };

/**
 * Sorties enregistrées par une montre ou importées depuis un fichier.
 *
 * Un seul hook pour l'athlète et pour son coach : la requête est identique, et
 * c'est la base qui décide ce qui est visible. Côté coach, trois conditions
 * doivent être réunies — être le coach de cet athlète, que les conditions du
 * fournisseur autorisent l'affichage à un tiers (`coach_visible`), et que
 * l'athlète ait consenti à la synchronisation de cette source. Les écrire une
 * seconde fois ici, en TypeScript, donnerait deux règles à maintenir dont une
 * seule protège vraiment ; et celle du client serait contournable.
 *
 * Conséquence à connaître : un coach peut voir une liste plus courte que son
 * athlète, sans message d'erreur. C'est voulu — un retrait de consentement doit
 * agir tout de suite, pas après un nettoyage qu'on penserait à faire.
 */

export function useProviderActivities(
  athleteId: string | undefined,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? DEFAULT_ACTIVITY_LIMIT;

  return useQuery({
    queryKey: providerKeys.activities(athleteId ?? "none", limit),
    enabled: !!athleteId,
    staleTime: 60 * 1000,
    queryFn: () => getActivities(athleteId!, limit),
  });
}
