/**
 * Accès au « thème du jour » (`day_themes`).
 *
 * Adaptateurs React Query de `src/api/dayThemes.ts`. Le coach écrit,
 * l'athlète lit : la RLS le garantit, les hooks ne font que suivre. Deux
 * lectures selon l'écran — une fenêtre de dates pour les vues calendrier, un seul jour pour le drawer et le bandeau athlète — et deux
 * écritures, upsert et suppression.
 *
 * Toute écriture passe par `invalidateDayThemes` : la pastille du calendrier,
 * le bandeau du jour et le drawer lisent la même ligne, ils doivent se
 * contredire zéro seconde.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  dayThemeKeys,
  deleteDayTheme,
  getDayTheme,
  invalidateDayThemes,
  listDayThemes,
  listRecentDayThemes,
  upsertDayTheme,
  type DayTheme,
  type UpsertDayThemeInput,
} from "@/api/dayThemes";

export type { DayTheme, UpsertDayThemeInput };

/** Thèmes d'une fenêtre de dates, indexables par `indexDayThemesByDate`. */
export function useDayThemesRange(
  athleteId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery<DayTheme[]>({
    queryKey: dayThemeKeys.range(athleteId ?? "", from ?? "", to ?? ""),
    queryFn: () => listDayThemes(athleteId!, from!, to!),
    enabled: !!athleteId && !!from && !!to,
    staleTime: 60_000,
  });
}

/** Thème d'une date précise, ou `null` si le coach n'a rien posé. */
export function useDayTheme(athleteId: string | undefined, date: string | undefined) {
  return useQuery<DayTheme | null>({
    queryKey: dayThemeKeys.day(athleteId ?? "", date ?? ""),
    queryFn: () => getDayTheme(athleteId!, date!),
    enabled: !!athleteId && !!date,
    staleTime: 60_000,
  });
}

/**
 * Écrit (ou réécrit) le thème d'un jour (valeurs normalisées par le module).
 * Le thème posé apparaît aussi dans les raccourcis « récents » du coach, y
 * compris pour ses autres athlètes.
 */
export function useUpsertDayTheme() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertDayThemeInput) => upsertDayTheme(input),
    onSuccess: (data) => {
      qc.setQueryData(dayThemeKeys.day(data.athlete_id, data.date), data);
      void invalidateDayThemes(qc, data.athlete_id);
    },
  });
}

/**
 * Les derniers thèmes posés par le coach, tous athlètes confondus.
 *
 * Sert à proposer en un clic ce qu'il écrit déjà toutes les semaines. On tire
 * large (`RECENT_FETCH`) puis on déduplique côté client : la base ne sait pas
 * que « Seuil bleu » posé lundi et mercredi sont le même raccourci.
 */
const RECENT_FETCH = 60;

export function useRecentDayThemes(coachId: string | undefined) {
  return useQuery<DayTheme[]>({
    queryKey: dayThemeKeys.recent(coachId ?? ""),
    queryFn: () => listRecentDayThemes(coachId!, RECENT_FETCH),
    enabled: !!coachId,
    staleTime: 5 * 60_000,
  });
}

/** Retire le thème d'un jour. Le jour redevient muet, sans pastille. */
export function useDeleteDayTheme() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ athleteId, date }: { athleteId: string; date: string }) => deleteDayTheme(athleteId, date),
    onSuccess: (_d, { athleteId, date }) => {
      qc.setQueryData(dayThemeKeys.day(athleteId, date), null);
      void invalidateDayThemes(qc, athleteId);
    },
  });
}
