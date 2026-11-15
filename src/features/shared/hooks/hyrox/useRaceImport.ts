import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { competitionKeys, listCompetitions } from "@/api/competitions";
import { localIsoDay } from "@shared/domain/dates";
import {
  findDuplicateRace,
  genderFromRaces,
  matchCompetition,
  parseResultPage,
  toRaceImport,
  type RaceImport,
} from "@/lib/hyrox/resultImport";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { useHyroxResults } from "./useHyroxResults";

export interface PreparedImport {
  imp: RaceImport;
  /** Course déjà enregistrée qui correspond (même chrono, même date ou même événement). */
  duplicate: HyroxResult | null;
}

/**
 * Prépare l'import d'un résultat HYROX collé : lecture du texte, date et
 * compétition retrouvées dans le calendrier de l'athlète, genre d'après ses
 * courses précédentes, détection d'un doublon. Renvoie `null` si le texte ne
 * contient aucun temps reconnu.
 */
export function useRaceImport(athleteId: string | undefined) {
  const { data: races = [] } = useHyroxResults(athleteId);
  const { data: comps = [] } = useQuery({
    queryKey: competitionKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listCompetitions(athleteId as string),
  });

  const prepare = useCallback((text: string, opts?: { excludeId?: string }): PreparedImport | null => {
    const parsed = parseResultPage(text);
    if (!parsed) return null;
    const match = matchCompetition(comps, parsed, localIsoDay());
    const imp = toRaceImport(parsed, { fallbackGender: genderFromRaces(races), match });
    const others = opts?.excludeId ? races.filter((r) => r.id !== opts.excludeId) : races;
    return { imp, duplicate: findDuplicateRace(others, parsed, imp.date) };
  }, [races, comps]);

  return { prepare, races };
}
