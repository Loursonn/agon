import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getActivityDetail, LapsConflictError, proposeDetailLaps, resetLapsToProposal, saveLaps } from "@/api/activityDetail";
import { attributionOf } from "@/lib/activityDetail";

afterEach(() => setDbForTests(null));

describe("saveLaps", () => {
  it("envoie la liste entière, triée, avec la version lue", async () => {
    let sent: Record<string, unknown> | null = null;
    const { db } = fakeDb({}, undefined, {
      save_activity_laps: (args) => {
        sent = args;
        return 4;
      },
    });
    setDbForTests(db);
    const v = await saveLaps("act", 3, [
      { startS: 40.4, endS: 70, name: "Wall balls", reps: 100, origin: "manual", status: "validated" },
      { startS: 0, endS: 40.4, origin: "watch", status: "validated" },
    ]);
    expect(v).toBe(4);
    expect(sent!.p_expected_version).toBe(3);
    const laps = sent!.p_laps as Array<Record<string, unknown>>;
    expect(laps.map((l) => [l.start_s, l.end_s, l.name, l.reps])).toEqual([[0, 40, null, null], [40, 70, "Wall balls", 100]]);
    expect(laps[1].needs_review).toBe(false);
  });

  it("proposition d'Agon : tours marqués agon_proposal", async () => {
    let sent: Record<string, unknown> | null = null;
    const { db } = fakeDb({}, undefined, { save_activity_laps: (a) => ((sent = a), 1) });
    setDbForTests(db);
    await resetLapsToProposal("act", 0, [{ startS: 0, endS: 10, origin: "manual", status: "proposed", needsReview: true }]);
    expect((sent!.p_laps as Array<Record<string, unknown>>)[0]).toMatchObject({ origin: "agon_proposal", needs_review: true });
  });

  it("version périmée → LapsConflictError (rien n'est écrasé)", async () => {
    setDbForTests({
      rpc: () => Promise.resolve({ data: null, error: { message: "modifiés entre-temps", code: "40001" } }),
    });
    await expect(saveLaps("act", 0, [])).rejects.toBeInstanceOf(LapsConflictError);
  });
});

/** Séance HYROX fictive : 2 × (course 3,5 m/s 143 s + wall balls immobile 60 s), FC 140→170. */
function hyroxTables(opts: { lapsEdited?: boolean; watchLaps?: Array<[number, number]> } = {}) {
  const speed: number[] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 143; i++) speed.push(3.5);
    for (let i = 0; i < 60; i++) speed.push(0);
  }
  const t = speed.map((_, i) => i);
  const dist: number[] = [];
  speed.forEach((v, i) => dist.push((dist[i - 1] ?? 0) + v));
  const laps = opts.watchLaps ?? [[0, 143], [143, 203], [203, 346], [346, 406]];
  return {
    provider_activities: [{
      id: "act", athlete_id: "lea", source: "garmin", sport: "hyrox", started_at: "2031-03-04T08:00:00Z",
      local_date: "2031-03-04", device_name: "Forerunner 265",
    }],
    activity_streams: [{
      activity_id: "act", sport: "hyrox", t, timer: t, hr: t.map((i) => 140 + Math.round(i / 14)), speed, dist,
      alt: null, cadence: null, power: null, lat: null, lon: null, vosc: null, stance: null, vratio: null,
      step_len: null, temp: null, watch_laps: laps.map(([a, b]) => ({ startS: a, endS: b, trigger: "manual", intensity: null, watch: null })),
      laps_version: 2, laps_edited: opts.lapsEdited ?? false,
    }],
    activity_laps: laps.map(([a, b], i) => ({
      activity_id: "act", position: i, start_s: a, end_s: b, name: null, exercise_id: null, planned_block_ref: null,
      distance_override_m: null, reps: null, load_kg: null, origin: "watch", status: "validated", needs_review: false,
    })),
    activity_plan_links: [{ id: "lnk", activity_id: "act", planned_kind: "energy", planned_id: "asg", status: "auto" }],
    energy_session_assignments: [{ id: "asg", energy_session_id: "ses" }],
    energy_sessions: [{
      id: "ses", name: "HYROX court", format: "wod", classique_structure: null,
      intervals: [{
        type: "group", id: "g", role: "work", repeat: 2, children: [
          { type: "interval", id: "run", role: "work", duration: { kind: "distance", value: 500 } },
          { type: "exercise", id: "wb", role: "work", exercise_id: "ex-wb", exercise_name: "Wall balls", reps_max: 20 },
        ],
      }],
    }],
  };
}

const zones = { hr_zone_bounds_at: () => [{ model_id: "m", kind: "three", bounds: [150, 165] }] };

describe("getActivityDetail", () => {
  it("HYROX : tours nommés d'après la séance prévue, métriques, zones, lien, attribution", async () => {
    const { db } = fakeDb(hyroxTables(), undefined, zones);
    setDbForTests(db);
    const d = await getActivityDetail("act");
    expect(d.attribution).toBe("Garmin Forerunner 265");
    expect(d.link).toMatchObject({ plannedKind: "energy", status: "auto", plannedName: "HYROX court" });
    expect(d.lapsNamedFromPlan).toBe(true);
    expect(d.laps.map((l) => [l.name, l.status])).toEqual([
      ["Course 500 m", "proposed"], ["Wall balls", "proposed"], ["Course 500 m", "proposed"], ["Wall balls", "proposed"],
    ]);
    expect(d.laps[0].metrics.distanceM).toBeCloseTo(497, 0); // 142 s × 3,5 m/s entre premier et dernier point
    expect(d.laps[1].metrics.avgPaceSPerKm).toBeNull(); // station : pas d'allure
    expect(d.laps[1].reps).toBe(20);
    expect(d.zones!.seconds.reduce((x, y) => x + y, 0)).toBe(405); // intervalles entre points
    expect(d.bounds).toMatchObject({ kind: "three", bounds: [150, 165] });
    expect(d.lapsVersion).toBe(2);
    expect(d.display!.t.length).toBe(406);
  });

  it("tours retouchés : gardés tels quels ; proposition disponible depuis la série", async () => {
    const { db } = fakeDb(hyroxTables({ lapsEdited: true, watchLaps: [[0, 406]] }), undefined, zones);
    setDbForTests(db);
    const d = await getActivityDetail("act");
    expect(d.lapsNamedFromPlan).toBe(false);
    expect(d.laps).toHaveLength(1);
    expect(d.proposalAvailable).toBe(true);
    const p = proposeDetailLaps(d);
    expect(p).toHaveLength(4);
    expect(p.every((l) => l.origin === "agon_proposal")).toBe(true);
  });

  it("résumé seul (pas de série), sans zones ni lien : rien d'inventé", async () => {
    const t = hyroxTables();
    const { db } = fakeDb({ provider_activities: t.provider_activities }, undefined, { hr_zone_bounds_at: () => [] });
    setDbForTests(db);
    const d = await getActivityDetail("act");
    expect(d).toMatchObject({ stream: null, display: null, total: null, zones: null, bounds: null, link: null, laps: [] });
  });

  it("activité introuvable (ou invisible) → erreur", async () => {
    const { db } = fakeDb({}, undefined, zones);
    setDbForTests(db);
    await expect(getActivityDetail("x")).rejects.toThrow();
  });
});

describe("attribution", () => {
  it("« Garmin [appareil] », sans doublon de marque ni appareil inconnu", () => {
    expect(attributionOf("garmin", "fenix 7 Pro")).toBe("Garmin fenix 7 Pro");
    expect(attributionOf("garmin", "Garmin Venu 3")).toBe("Garmin Venu 3");
    expect(attributionOf("garmin", "unknown")).toBe("Garmin");
    expect(attributionOf("coros", null)).toBe("COROS");
  });
});
