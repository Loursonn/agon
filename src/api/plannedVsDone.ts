import type { QueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import {
  buildPlannedVsDone,
  type LinkInput,
  type PlannedInput,
  type PlannedKind,
  type PlannedVsDoneDay,
  type PlanLinkStatus,
} from "@/lib/plannedVsDone";
import { check, db, unwrap, unwrapRows } from "./client";
import { listEnergyAssignments } from "./energy";
import { getActivitiesBetween } from "./providers";
import { listTestSessionsBetween } from "./tests";
import { listWorkoutLogs } from "./workouts";
import { getZoneSummaries } from "./zoneModels";

/**
 * Rapprochement séance prévue ↔ activité de montre (`activity_plan_links`).
 *
 * Les liens sont calculés EN BASE à chaque arrivée d'activité ou changement
 * de planning (migration 20261112120000). Ici : lecture de la semaine
 * (prévu + réalisé + libre), et décisions de l'athlète ou du coach.
 */

export const planLinkKeys = {
  all: (aid: string) => ["planLinks", aid] as const,
  week: (aid: string, from: IsoDay, to: IsoDay) => ["planLinks", aid, "week", from, to] as const,
};

/**
 * Après une confirmation, un refus ou un rattachement manuel. Une nouvelle
 * activité ou une séance déplacée change aussi les liens : les écrans qui
 * invalident `invalidateProviders` / `invalidateWorkouts` / `invalidateEnergy`
 * doivent aussi appeler celle-ci.
 */
export function invalidatePlanLinks(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: planLinkKeys.all(athleteId) });
}

export async function listPlanLinks(athleteId: string, from: IsoDay, to: IsoDay): Promise<LinkInput[]> {
  const rows = unwrapRows(
    await db()
      .from("activity_plan_links")
      .select("id, activity_id, planned_kind, planned_id, status")
      .eq("athlete_id", athleteId)
      .gte("local_date", from)
      .lte("local_date", to),
    "rapprochements du planning",
  );
  return rows.map((r) => ({
    id: r.id,
    activityId: r.activity_id,
    plannedKind: r.planned_kind as PlannedKind,
    plannedId: r.planned_id,
    status: r.status as PlanLinkStatus,
  }));
}

/** Semaine (ou toute plage) du planning : par jour, prévu, réalisé, libre. */
export async function getPlannedVsDone(athleteId: string, from: IsoDay, to: IsoDay): Promise<PlannedVsDoneDay[]> {
  const [energy, workouts, tests, activities, links] = await Promise.all([
    listEnergyAssignments({ athleteIds: [athleteId], from, to, join: "summary" }),
    listWorkoutLogs({ athleteIds: [athleteId], from, to, withMods: false }),
    listTestSessionsBetween(athleteId, from, to),
    getActivitiesBetween(athleteId, from, to),
    listPlanLinks(athleteId, from, to),
  ]);
  const ids = activities.map((a) => a.id);
  const [zoneSummaries, withStream] = await Promise.all([getZoneSummaries(athleteId, ids), activitiesWithStream(ids)]);

  const planned: PlannedInput[] = [
    ...energy.map((e) => ({
      kind: "energy" as const,
      id: e.id,
      date: e.scheduled_date,
      label: (e.energy_sessions as { name?: string } | null | undefined)?.name ?? "Séance",
      status: e.status,
      agonRpe: e.rpe_score ?? null,
    })),
    ...workouts.map((w) => ({
      kind: "workout" as const, id: w.id, date: w.scheduled_date, label: w.session_name, status: w.status, agonRpe: w.rpe_score,
    })),
    ...tests.map((t) => ({
      kind: "test" as const, id: t.id, date: t.date, label: t.title, status: t.completed ? "completed" : "planned",
    })),
  ];

  return buildPlannedVsDone({
    from,
    to,
    planned,
    activities: activities.map((a) => ({
      id: a.id,
      date: a.localDate,
      startedAt: a.startedAt,
      source: a.source,
      sport: a.sport,
      distanceM: a.distanceM,
      durationS: a.durationS,
      deviceName: a.deviceName,
      rpe: a.rpe ?? null,
      title: a.title ?? null,
      avgPaceSPerKm: a.avgPaceSPerKm,
      avgHr: a.avgHr,
      hasStream: withStream.has(a.id),
    })),
    links,
    zoneSummaries,
  });
}

/** Activités dont le fichier (courbes) est arrivé. */
async function activitiesWithStream(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = unwrapRows(
    await db().from("activity_streams").select("activity_id").in("activity_id", ids),
    "courbes des activités",
  );
  return new Set(rows.map((r) => r.activity_id as string));
}

/** Confirme le rattachement proposé (athlète ou coach). */
export async function confirmMatch(linkId: string): Promise<void> {
  check(await db().rpc("decide_plan_link", { p_link: linkId, p_confirm: true }), "confirmation du rattachement");
}

/** Refuse : l'activité redevient libre et ce couple ne sera plus proposé. */
export async function rejectMatch(linkId: string): Promise<void> {
  check(await db().rpc("decide_plan_link", { p_link: linkId, p_confirm: false }), "refus du rattachement");
}

/** Rattache à la main une activité à une séance prévue (même athlète). */
export async function linkActivityToPlan(activityId: string, kind: PlannedKind, plannedId: string): Promise<string | null> {
  return unwrap(
    await db().rpc("link_activity_to_plan", { p_activity: activityId, p_kind: kind, p_planned: plannedId }),
    "rattachement de la séance",
  );
}
