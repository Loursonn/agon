import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  activateReference,
  addMeasurement,
  deleteMeasurement,
  getActiveReferences,
  getMeasurements,
  getPerformanceReviews,
  getRecentMeasurements,
  groupMeasurements,
  invalidateReferences,
  referenceKeys,
  referenceValues,
  reviewMeasurement,
  saveFcZones,
  setReference,
  storedFcZones,
} from "@/api/references";

const log = (id: string, o: Partial<Row>): Row => ({
  id, athlete_id: "a", metric_type: "reference", metric_name: "VMA", value: 17, unit: "km/h",
  custom_unit: null, date: "2026-10-01", test_session_id: null, is_active_reference: false,
  coach_validated: true, notes: null, created_by: "c", created_at: "2026-10-01T10:00:00Z", ...o,
});

afterEach(() => setDbForTests(null));

describe("lectures", () => {
  it("références actives par nom canonique, avec id / date / unité", async () => {
    const { db } = fakeDb({
      performance_logs: [
        log("v1", { is_active_reference: true, value: 18.5 }),
        log("v0", { value: 17 }),
        log("fc", { metric_name: "FC Max", value: 192, unit: "bpm", is_active_reference: true }),
        log("z1", { metric_name: "FCzone_Z1_max", metric_type: "zone", value: 120, unit: "bpm", is_active_reference: true }),
        log("autre", { athlete_id: "b", is_active_reference: true, value: 20 }),
      ],
    });
    setDbForTests(db);
    const refs = await getActiveReferences("a");
    expect(refs.VMA).toMatchObject({ id: "v1", value: 18.5, unit: "km/h", date: "2026-10-01", metricType: "reference" });
    expect(referenceValues(refs)).toEqual({ VMA: 18.5, FCmax: 192, FCzone_Z1_max: 120 });
    expect(storedFcZones(refs)).toEqual({ FCzone_Z1_max: 120 });
  });

  it("historique trié et groupé ; les anciens noms rejoignent le nom canonique", async () => {
    const { db } = fakeDb({
      performance_logs: [
        log("1", { metric_name: "FCmax", date: "2026-09-01" }),
        log("2", { metric_name: "FC Max", date: "2026-10-01" }),
        log("3", { metric_name: "VMA", date: "2026-08-01" }),
      ],
    });
    setDbForTests(db);
    const logs = await getMeasurements("a");
    expect(logs.map((l) => l.id)).toEqual(["2", "1", "3"]);
    const g = groupMeasurements(logs);
    expect(Object.keys(g)).toEqual(["FCmax", "VMA"]);
    expect(g.FCmax.map((l) => l.id)).toEqual(["2", "1"]);
  });

  it("mesures récentes du coach : sans zones FC, seulement ses athlètes", async () => {
    const { db } = fakeDb({
      performance_logs: [
        log("vma", { date: "2026-11-01" }),
        log("z", { metric_name: "FCzone_Z2_max", metric_type: "zone", date: "2026-11-05" }),
        log("b", { athlete_id: "b", date: "2026-11-03" }),
        log("x", { athlete_id: "x", date: "2026-11-06" }),
      ],
    });
    setDbForTests(db);
    const recent = await getRecentMeasurements(["a", "b"], 8);
    expect(recent.map((r) => r.id)).toEqual(["b", "vma"]);
    expect(await getRecentMeasurements([], 8)).toEqual([]);
  });

  it("validations : enrichies en lot (nom, mesure, test)", async () => {
    const { db } = fakeDb({
      performance_notifications: [
        { id: "n1", athlete_id: "a", coach_id: "c", performance_log_id: "l1", status: "pending", created_at: "2026-11-02" },
        { id: "n2", athlete_id: "a", coach_id: "c", performance_log_id: "l2", status: "approved", created_at: "2026-11-01" },
        { id: "n3", athlete_id: "b", coach_id: "c2", performance_log_id: "l3", status: "pending", created_at: "2026-11-03" },
      ],
      performance_logs: [log("l1", { test_session_id: "t1", value: 19 }), log("l2", { metric_name: "FCmax", value: 190 })],
      profiles: [{ id: "a", full_name: "Léa Démo" }],
      test_sessions: [{ id: "t1", title: "Test VMA" }],
    });
    setDbForTests(db);
    const list = await getPerformanceReviews({ athleteId: "a" });
    expect(list.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(list[0]).toMatchObject({ athleteName: "Léa Démo", metricName: "VMA", value: 19, testTitle: "Test VMA", status: "pending" });
    expect(list[1]).toMatchObject({ metricName: "FCmax", testTitle: null });
    expect((await getPerformanceReviews({ coachId: "c2" })).map((n) => n.id)).toEqual(["n3"]);
  });

  it("une lecture en échec lève (jamais une liste vide silencieuse)", async () => {
    const { db } = fakeDb({ performance_logs: [] }, { table: "performance_logs", op: "select" });
    setDbForTests(db);
    await expect(getActiveReferences("a")).rejects.toThrow(/Références non chargées/);
    await expect(getMeasurements("a")).rejects.toThrow(/Performances non chargées/);
  });
});

describe("écritures", () => {
  it("addMeasurement normalise le nom et prévient le coach", async () => {
    const { db, tables } = fakeDb({ profiles: [{ id: "a", coach_id: "c" }] });
    setDbForTests(db);
    const { log: l, notified } = await addMeasurement({
      athleteId: "a", metricName: "FC Max", metricType: "fc_max", value: 195, unit: "bpm", date: "2026-11-08", createdBy: "a", notifyCoach: true,
    });
    expect(l.metric_name).toBe("FCmax");
    expect(l.is_active_reference).toBe(false);
    expect(notified).toBe(true);
    expect(tables.performance_notifications).toEqual([
      expect.objectContaining({ coach_id: "c", athlete_id: "a", performance_log_id: l.id, status: "pending" }),
    ]);
  });

  it("addMeasurement : la mesure reste enregistrée si la notification échoue", async () => {
    const { db, tables } = fakeDb({ profiles: [{ id: "a", coach_id: "c" }] }, { table: "performance_notifications", op: "insert" });
    setDbForTests(db);
    const { notified } = await addMeasurement({
      athleteId: "a", metricName: "VMA", metricType: "vma", value: 18, unit: "km/h", date: "2026-11-08", notifyCoach: true,
    });
    expect(notified).toBe(false);
    expect(tables.performance_logs).toHaveLength(1);
  });

  it("setReference / saveFcZones / activateReference / reviewMeasurement passent par les RPC atomiques", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const spy = (name: string, ret: unknown = null) => (args: Record<string, unknown>) => (calls.push([name, args]), ret);
    const { db } = fakeDb({}, undefined, {
      set_performance_reference: spy("set_performance_reference", "new-id"),
      save_fc_zones: spy("save_fc_zones", 2),
      set_active_performance_reference: spy("set_active_performance_reference"),
      review_performance_notification: spy("review_performance_notification"),
    });
    setDbForTests(db);
    expect(await setReference({ athleteId: "a", metricName: "vitesse critique", value: 15.2, unit: "km/h" })).toBe("new-id");
    expect(await saveFcZones("a", { FCzone_Z0_min: 60, FCzone_Z1_max: 121 })).toBe(2);
    await activateReference("a", "l1", "FCmax");
    await reviewMeasurement("n1", "l1", true);
    expect(calls).toEqual([
      ["set_performance_reference", { p_athlete: "a", p_metric: "VC", p_value: 15.2, p_unit: "km/h", p_date: null, p_validated: true }],
      ["save_fc_zones", { p_athlete: "a", p_zones: { FCzone_Z0_min: 60, FCzone_Z1_max: 121 } }],
      ["set_active_performance_reference", { p_performance_log_id: "l1", p_athlete_id: "a", p_metric_name: "FCmax" }],
      ["review_performance_notification", { p_notification: "n1", p_log: "l1", p_approve: true }],
    ]);
  });

  it("saveFcZones refuse une clé inconnue avant tout appel", async () => {
    const { db } = fakeDb();
    setDbForTests(db);
    await expect(saveFcZones("a", { FCmax: 190 } as never)).rejects.toThrow(/Zone FC inconnue/);
  });

  it("une RPC refusée lève une erreur lisible", async () => {
    const { db } = fakeDb({}, { table: "set_performance_reference", op: "rpc" });
    setDbForTests(db);
    await expect(setReference({ athleteId: "a", metricName: "VMA", value: 18 })).rejects.toThrow(/Référence non enregistrée/);
  });

  it("deleteMeasurement", async () => {
    const { db, tables } = fakeDb({ performance_logs: [log("1", {}), log("2", {})] });
    setDbForTests(db);
    await deleteMeasurement("1");
    expect(tables.performance_logs.map((r) => r.id)).toEqual(["2"]);
  });
});

describe("invalidateReferences", () => {
  it("invalide les références de l'athlète, les mesures récentes et les validations", async () => {
    const qc = new QueryClient();
    const keys = [
      referenceKeys.active("a"),
      referenceKeys.history("a"),
      referenceKeys.recent(["a", "b"], 8),
      referenceKeys.coachReviews("c"),
      referenceKeys.active("b"),
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateReferences(qc, "a");
    const stale = keys.map((k) => qc.getQueryState(k)?.isInvalidated);
    expect(stale).toEqual([true, true, true, true, false]);
  });
});
