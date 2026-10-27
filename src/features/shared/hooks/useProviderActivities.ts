import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";

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

export interface ProviderActivity {
  id: string;
  source: string;
  startedAt: string;
  localDate: string;
  sport: string | null;
  durationS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPaceSPerKm: number | null;
  calories: number | null;
  details: Record<string, unknown> | null;
}

interface ActivityRow {
  id: string;
  source: string;
  started_at: string;
  local_date: string;
  sport: string | null;
  duration_s: number | null;
  distance_m: number | string | null;
  elevation_gain_m: number | string | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_s_per_km: number | string | null;
  calories: number | null;
  details: Record<string, unknown> | null;
}

/**
 * `numeric` de PostgreSQL arrive en chaîne.
 *
 * PostgREST sérialise `numeric` en texte pour ne pas perdre de précision, et un
 * `number | null` déclaré dans le type ne suffit donc pas : sans conversion,
 * `distanceM / 1000` rend `NaN` et la distance s'affiche « — » alors qu'elle est
 * bien en base. Le symptôme est une colonne vide, pas une erreur.
 */
const num = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Nombre de sorties remontées par défaut. */
const DEFAULT_LIMIT = 60;

export function useProviderActivities(
  athleteId: string | undefined,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? DEFAULT_LIMIT;

  return useQuery({
    queryKey: [...QK.providerActivities(athleteId ?? "none"), limit],
    enabled: !!athleteId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ProviderActivity[]> => {
      const { data, error } = await supabase
        .from("provider_activities")
        .select(
          "id, source, started_at, local_date, sport, duration_s, distance_m, elevation_gain_m, avg_hr, max_hr, avg_pace_s_per_km, calories, details",
        )
        .eq("athlete_id", athleteId!)
        // `started_at` en second critère : plusieurs sorties le même jour
        // doivent rester dans l'ordre où elles ont été faites, sans quoi la
        // sortie du matin et celle du soir s'échangent d'un chargement à
        // l'autre.
        .order("local_date", { ascending: false })
        .order("started_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as ActivityRow[]).map((r) => ({
        id: r.id,
        source: r.source,
        startedAt: r.started_at,
        localDate: r.local_date,
        sport: r.sport,
        durationS: r.duration_s,
        distanceM: num(r.distance_m),
        elevationGainM: num(r.elevation_gain_m),
        avgHr: r.avg_hr,
        maxHr: r.max_hr,
        avgPaceSPerKm: num(r.avg_pace_s_per_km),
        calories: r.calories,
        details: r.details,
      }));
    },
  });
}
