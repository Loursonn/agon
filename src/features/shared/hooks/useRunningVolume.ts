import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getManualRunSources, getWatchRuns, num, providerKeys, type ManualRunSources } from "@/api/providers";
import type { FreeSession } from "@/features/shared/types/athlete";
import { RUNNING_WEEKS, addDays, computeRunningVolume, iso, mondayOf } from "@/lib/runningVolume";
import { buildRunLedger, summarizeKm, type RunMatch, type WatchActivityInput } from "@/lib/watchRunMatching";

export { RUNNING_WEEKS, computeRunningVolume } from "@/lib/runningVolume";
export type { RunningVolume, RunningWeek, RunEntry } from "@/lib/runningVolume";
export type { RunMatch } from "@/lib/watchRunMatching";

/** Préfixe des km saisis à la main (invalidé par les séances et les séances énergie). */
export const runningVolumeKey = (athleteId: string) => ["runningVolume", athleteId] as const;

/**
 * Volume de course à pied — la seule source de ces km dans l'app.
 *
 * Lit les sorties de montre / fichiers importés, les séances énergie et
 * spécifiques (prévues et validées), les km courus en séance de muscu et les
 * activités libres « course », puis délègue à `buildRunLedger` le rattachement
 * des sorties aux séances prévues et le dédoublonnage. Le volume de l'athlète,
 * celui de la fiche coach, les km des retours et l'indication « réalisée —
 * montre » lisent tous ce hook : un seul calcul.
 *
 * Les sorties sont lues avec la même requête pour l'athlète et pour son coach ;
 * c'est la base (RLS) qui décide ce que le coach voit. Si elle ne rend rien, le
 * volume retombe sur la saisie manuelle, comme avant.
 */
export function useRunningVolume(
  athleteId: string | undefined,
  freeSessions: FreeSession[] = [],
  /** Début de l'historique chargé (défaut : début des RUNNING_WEEKS semaines) */
  fromISO?: string,
) {
  const defaultFrom = iso(addDays(mondayOf(new Date()), -7 * (RUNNING_WEEKS - 1)));
  const from = fromISO && fromISO < defaultFrom ? fromISO : defaultFrom;

  const manual = useQuery<ManualRunSources>({
    queryKey: providerKeys.manualRuns(athleteId ?? "", from),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getManualRunSources(athleteId!, from),
  });

  const watch = useQuery<WatchActivityInput[]>({
    queryKey: providerKeys.runs(athleteId ?? "", from),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getWatchRuns(athleteId!, from),
  });

  const ledger = useMemo(() => {
    const free = freeSessions
      .filter((f) => f.date && f.date >= from)
      .map((f) => ({
        id: f.id,
        date: f.date as string,
        sport: f.sport ?? null,
        km: num(f.distance_km),
        durationMin: num(f.duration),
      }));
    return buildRunLedger({
      activities: watch.data ?? [],
      planned: manual.data?.planned ?? [],
      free,
      strength: manual.data?.strength ?? [],
    });
  }, [watch.data, manual.data, freeSessions, from]);

  const runs = ledger.entries;
  const volume = useMemo(() => computeRunningVolume(runs), [runs]);

  const { matchByPlanned, matchByActivity } = useMemo(() => {
    const byPlanned = new Map<string, RunMatch>();
    const byActivity = new Map<string, RunMatch>();
    for (const m of ledger.matches) {
      byPlanned.set(m.plannedId, m);
      byActivity.set(m.activityId, m);
    }
    return { matchByPlanned: byPlanned, matchByActivity: byActivity };
  }, [ledger.matches]);

  /** Km courus entre deux dates incluses (yyyy-MM-dd) */
  const kmBetween = (start: string, end: string) => summarizeKm(runs, start, end).km;
  /** Km et part montre entre deux dates incluses (yyyy-MM-dd) */
  const summaryBetween = (start: string, end: string) => summarizeKm(runs, start, end);

  return {
    volume,
    runs,
    kmBetween,
    summaryBetween,
    matchByPlanned,
    matchByActivity,
    isLoading: manual.isLoading || watch.isLoading,
  };
}
