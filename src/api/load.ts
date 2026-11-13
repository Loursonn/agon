import type { QueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import { fiveZoneBounds } from "@shared/domain/hrZones";
import type { WatchLap } from "@shared/activityFiles/stream";
import { isStepSport } from "@shared/activityFiles/stream";
import type { ExerciseInfo, PlanStepForLoad } from "@shared/domain/trainingLoad";
import {
  buildLoadWeeks,
  type LoadInputs,
  type LoadSetRow,
  type LoadWeeks,
  type ProgBlocLite,
} from "@/lib/trainingLoadWeek";
import { db, unwrapRows } from "./client";
import { listEnergyAssignments } from "./energy";
import { listPlanLinks } from "./plannedVsDone";
import { getProgram } from "./program";
import { getActivitiesBetween } from "./providers";
import { listWorkoutLogs } from "./workouts";
import { getAthleteCriticalSpeed } from "./criticalSpeed";
import { getActiveReferences, referenceValues } from "./references";
import { getZoneModels, getZoneSummaries } from "./zoneModels";

/**
 * Charge d'entraînement YOXX (P28) : lecture seule, calculée à la volée
 * (aucune table de cache). Calculs : `_shared/domain/trainingLoad.ts` et
 * `src/lib/trainingLoadWeek.ts`. Données de montre lues pour un calcul local,
 * jamais envoyées à une IA.
 */

/** Semaines lues en plus avant la première affichée (charge chronique = 4 semaines). */
export const CHRONIC_WEEKS = 4;

export const loadKeys = {
  all: (aid: string) => ["load", aid] as const,
  weeks: (aid: string, lastMonday: IsoDay, count: number) => ["load", aid, "weeks", lastMonday, count] as const,
};

/**
 * Tout ce qui change la charge : séance validée ou modifiée, activité,
 * rattachement, zones, VC. Les écrans qui invalident séances, énergie,
 * planning ou zones appellent aussi celle-ci.
 */
export function invalidateLoad(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: loadKeys.all(athleteId) });
}

type Row = Record<string, unknown>;
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day = (v: unknown): IsoDay => String(v ?? "").slice(0, 10);

/**
 * Semaines de charge se terminant par celle qui commence `lastMonday`
 * (`count` semaines affichées, la plus ancienne en premier).
 */
export async function getLoadWeeks(athleteId: string, lastMonday: IsoDay, count = 6): Promise<LoadWeeks> {
  const shown = Math.max(1, count);
  const firstShown = addDays(lastMonday, -(shown - 1) * 7);
  const from = addDays(firstShown, -CHRONIC_WEEKS * 7);
  const to = addDays(lastMonday, 6);
  // 30 jours avant la plus ancienne semaine pour le plafond de séance.
  const actFrom = addDays(from, -30);

  const [energyRows, workoutRows, actRows, links, program, zoneModels, refs, cs] = await Promise.all([
    listEnergyAssignments({ athleteIds: [athleteId], from, to, join: "full" }),
    listWorkoutLogs({ athleteIds: [athleteId], from, to }),
    getActivitiesBetween(athleteId, actFrom, to),
    listPlanLinks(athleteId, from, to),
    getProgram(athleteId),
    getZoneModels(athleteId),
    getActiveReferences(athleteId),
    getAthleteCriticalSpeed(athleteId, to),
  ]);

  const workouts = workoutRows.map((w) => {
    const mods = w.athlete_modifications;
    const blocs = mods?.coachOverride?.blocs;
    return {
      id: w.id,
      day: w.scheduled_date,
      status: w.status,
      sessionId: w.session_id,
      name: w.session_name || "Séance",
      weekNumber: w.week_number,
      sessionSets: (mods?.sessionSets ?? null) as Record<string, LoadSetRow[]> | null,
      overrideBlocs: Array.isArray(blocs) && blocs.length > 0 ? (blocs as ProgBlocLite[]) : null,
    };
  });

  // Fiches exercices (f(exercice)) des séances muscu de la plage.
  const exIds = new Set<string>();
  const usedSessions = new Set(workouts.map((w) => w.sessionId));
  for (const s of program) if (usedSessions.has(s.id)) for (const b of s.blocs ?? []) for (const e of b.exercices ?? []) if (e.exercise_id) exIds.add(e.exercise_id);
  for (const w of workouts) for (const b of w.overrideBlocs ?? []) for (const e of b.exercices ?? []) if (e.exercise_id) exIds.add(e.exercise_id);
  const exRows = exIds.size
    ? unwrapRows(
        await db().from("exercises").select("id, name, is_compound, target").in("id", [...exIds]),
        "fiches exercices (charge)",
      )
    : [];
  const exercises: Record<string, ExerciseInfo> = {};
  for (const e of exRows) exercises[e.id as string] = { name: e.name as string, isCompound: (e.is_compound as boolean | null) ?? null, target: (e.target as string | null) ?? null };

  const activities = actRows.map((a) => ({
    id: a.id,
    day: day(a.localDate),
    sport: a.sport ?? null,
    distanceM: a.distanceM,
    title: a.title ?? null,
  }));
  const inRange = activities.filter((a) => a.day >= from);
  const actIds = inRange.map((a) => a.id);
  const runIds = inRange.filter((a) => isStepSport(a.sport)).map((a) => a.id);

  const [summaries, streams, laps] = await Promise.all([
    getZoneSummaries(athleteId, actIds),
    runIds.length
      ? unwrapRows(
          await db().from("activity_streams").select("activity_id, t, timer, hr, dist, watch_laps").in("activity_id", runIds),
          "séries des courses (charge)",
        )
      : [],
    runIds.length
      ? unwrapRows(
          await db().from("activity_laps").select("activity_id, start_s, end_s, position").in("activity_id", runIds),
          "tours des courses (charge)",
        )
      : [],
  ]);

  const zoneSeconds: LoadInputs["zoneSeconds"] = {};
  for (const z of summaries) zoneSeconds[z.activityId] = z.seconds;

  const lapsBy = new Map<string, Array<{ startS: number; endS: number; pos: number }>>();
  for (const l of laps) {
    const id = l.activity_id as string;
    const list = lapsBy.get(id) ?? [];
    list.push({ startS: Number(l.start_s), endS: Number(l.end_s), pos: Number(l.position ?? 0) });
    lapsBy.set(id, list);
  }
  const runStreams: LoadInputs["runStreams"] = {};
  for (const s of streams) {
    if (!Array.isArray(s.t)) continue;
    const id = s.activity_id as string;
    const agonLaps = (lapsBy.get(id) ?? []).sort((a, b) => a.pos - b.pos).map(({ startS, endS }) => ({ startS, endS }));
    const watchLaps = Array.isArray(s.watch_laps) ? (s.watch_laps as unknown as WatchLap[]).map((l) => ({ startS: l.startS, endS: l.endS })) : [];
    runStreams[id] = {
      stream: {
        t: s.t as number[],
        timer: (s.timer as Array<number | null> | null) ?? null,
        hr: (s.hr as Array<number | null> | null) ?? null,
        dist: (s.dist as Array<number | null> | null) ?? null,
      },
      laps: agonLaps.length ? agonLaps : watchLaps,
    };
  }

  const refVals = referenceValues(refs);
  const speedRefs: Record<string, number> = {};
  for (const k of ["VMA", "VC", "Allure 10K", "Allure semi", "Allure marathon"]) if (refVals[k]) speedRefs[k] = refVals[k];

  const inputs: LoadInputs = {
    from,
    weeks: shown + CHRONIC_WEEKS,
    energy: energyRows.map((r) => {
      const s = (r as unknown as { energy_sessions?: Row | null }).energy_sessions ?? null;
      return {
        id: r.id,
        day: r.scheduled_date,
        status: String(r.status),
        actualDurationMin: r.actual_duration_min ?? null,
        distanceKm: r.distance_km ?? null,
        name: String(s?.name ?? "Séance"),
        sessionKind: (s?.session_kind as string | null) ?? null,
        intervals: Array.isArray(s?.intervals) ? (s!.intervals as PlanStepForLoad[]) : null,
      };
    }),
    workouts,
    program,
    exercises,
    activities,
    links: links.filter((l) => l.status !== "rejected"),
    zoneSeconds,
    runStreams,
    zoneModels,
    fiveBounds: fiveZoneBounds(refVals),
    fcmax: refVals.FCmax ?? null,
    speedRefs,
    s1Kmh: cs.s1Kmh,
    csKmh: cs.current?.csKmh ?? null,
  };
  const all = buildLoadWeeks(inputs);
  return { ...all, weeks: all.weeks.slice(CHRONIC_WEEKS) };
}
