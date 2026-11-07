import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRecentMeasurements } from "@/features/shared/hooks/useReferences";

export interface RecentRecord {
  id:             string;
  athleteId:      string;
  athleteName:    string;
  metricName:     string;
  value:          number;
  unit:           string;
  date:           string;
  coachValidated: boolean | null;
}

/**
 * Dernières mesures de performance des athlètes du coach (accueil « Records
 * & tests »), la plus récente d'abord — sans les bornes de zones FC, qui
 * s'affichaient comme des records. Clé `referenceKeys.recent` : invalidée par
 * toute écriture de référence (`invalidateReferences`), et elle dépend de la
 * liste des athlètes.
 */
export function useRecentRecords(limit = 8) {
  const { athletes } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);
  const query = useRecentMeasurements(athleteIds, limit);

  const records = useMemo<RecentRecord[]>(() => {
    return (query.data ?? []).map((r) => ({
      ...r,
      athleteName: athletes.find((a) => a.id === r.athleteId)?.full_name ?? "—",
    }));
  }, [query.data, athletes]);

  return { records, isLoading: query.isLoading };
}
