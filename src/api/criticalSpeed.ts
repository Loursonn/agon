import type { QueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import { isStepSport } from "@shared/activityFiles/stream";
import {
  chooseCriticalSpeed,
  criticalSpeedFromRuns,
  RUN_WINDOW_DAYS,
  s1SpeedKmh,
  type ChosenCriticalSpeed,
  type CriticalSpeedCandidate,
  type RunStream,
} from "@shared/domain/criticalSpeed";
import { db, unwrapRows } from "./client";

/**
 * Vitesse critique de l'athlète (calcul : `_shared/domain/criticalSpeed.ts`).
 *
 * Lit les trois sources : analyses de tests HYROX (`hyrox_test_analyses`,
 * VC et seuil 1 calculés par le moteur des tests), VC active du profil
 * sportif (`performance_logs`, métrique « VC »), courses des 90 derniers
 * jours (séries seconde par seconde, meilleurs efforts 3 / 6 / 12 min).
 * Lecture seule : rien n'est écrit, la VC des courses reste une proposition.
 */

export const criticalSpeedKeys = {
  all: (aid: string) => ["criticalSpeed", aid] as const,
  current: (aid: string, day: IsoDay) => ["criticalSpeed", aid, day] as const,
};

/** Après un test, une VC saisie ou une nouvelle course. */
export function invalidateCriticalSpeed(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: criticalSpeedKeys.all(athleteId) });
}

export interface AthleteCriticalSpeed extends ChosenCriticalSpeed {
  /** Vitesse au seuil 1 (km/h) de la VC retenue, `null` sans VC. */
  s1Kmh: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** VC d'une analyse de tests (sorties stockées du moteur). */
export function candidateFromAnalysis(row: { date: string; outputs: unknown }): CriticalSpeedCandidate | null {
  const running = (row.outputs as { scores?: { running?: { cs_kmh?: unknown; s1_kmh?: unknown } } } | null)?.scores?.running;
  const cs = num(running?.cs_kmh);
  if (!cs) return null;
  return { source: "test", day: row.date.slice(0, 10), csKmh: cs, s1Kmh: num(running?.s1_kmh) };
}

/** VC retenue au jour `day` (sources datées au plus tard ce jour-là). */
export async function getAthleteCriticalSpeed(athleteId: string, day: IsoDay): Promise<AthleteCriticalSpeed> {
  const from = addDays(day, -RUN_WINDOW_DAYS);
  const [analyses, refs, runs] = await Promise.all([
    unwrapRows(
      await db().from("hyrox_test_analyses").select("date, outputs").eq("athlete_id", athleteId).lte("date", day),
      "analyses de tests",
    ),
    unwrapRows(
      await db()
        .from("performance_logs")
        .select("value, date")
        .eq("athlete_id", athleteId)
        .eq("metric_name", "VC")
        .eq("is_active_reference", true)
        .lte("date", day),
      "vitesse critique du profil",
    ),
    unwrapRows(
      await db()
        .from("provider_activities")
        .select("id, sport")
        .eq("athlete_id", athleteId)
        .gte("local_date", from)
        .lte("local_date", day),
      "courses récentes",
    ),
  ]);

  const candidates: CriticalSpeedCandidate[] = [];
  for (const a of analyses) {
    const c = candidateFromAnalysis(a);
    if (c) candidates.push(c);
  }
  for (const r of refs) {
    const cs = num(r.value);
    if (cs) candidates.push({ source: "reference", day: String(r.date).slice(0, 10), csKmh: cs });
  }

  const runIds = runs.filter((r) => isStepSport(r.sport) && !/walk|hik/i.test(r.sport ?? "")).map((r) => r.id as string);
  if (runIds.length > 0) {
    const streams = unwrapRows(
      await db().from("activity_streams").select("t, dist").in("activity_id", runIds),
      "séries des courses",
    );
    const usable: RunStream[] = streams
      .filter((s) => Array.isArray(s.t) && Array.isArray(s.dist))
      .map((s) => ({ t: s.t as number[], dist: s.dist as Array<number | null> }));
    const fit = criticalSpeedFromRuns(usable);
    if (fit) candidates.push({ source: "runs", day, csKmh: fit.csKmh });
  }

  const chosen = chooseCriticalSpeed(candidates);
  return { ...chosen, s1Kmh: s1SpeedKmh(chosen.current) };
}
