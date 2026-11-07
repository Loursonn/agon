import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  addRecord,
  computeRecordsFromSession,
  deleteRecord,
  getBestByRef,
  getLegacyRecordSets,
  getRecordLinks,
  getRecords,
  groupRecords,
  invalidateRecords,
  recordKeys,
  resolveRecordRef,
} from "@/api/records";

const pr = (id: string, o: Partial<Row>): Row => ({
  id, athlete_id: "a", exercise_ref: "Squat", kg: 100, date: "2026-10-01", notes: null,
  source: "manual", source_reps: null, source_kg: null, created_at: "2026-10-01T10:00:00Z", ...o,
});

afterEach(() => setDbForTests(null));

describe("lectures", () => {
  it("records triés, groupés par référence, meilleur = plus lourd puis plus récent", async () => {
    const { db } = fakeDb({
      exercise_pr_logs: [
        pr("1", { kg: 100, date: "2026-09-01" }),
        pr("2", { kg: 110, date: "2026-10-01" }),
        pr("3", { kg: 110, date: "2026-10-15" }),
        pr("4", { exercise_ref: "Développé couché", kg: 80 }),
        pr("x", { athlete_id: "b", kg: 200 }),
      ],
    });
    setDbForTests(db);
    const list = await getRecords("a");
    expect(list.map((r) => r.id)).toEqual(["3", "2", "4", "1"]);
    const { byRef, bestByRef } = groupRecords(list);
    expect(byRef.Squat).toHaveLength(3);
    expect(bestByRef.Squat.id).toBe("3");
    expect(Object.keys(await getBestByRef("a")).sort()).toEqual(["Développé couché", "Squat"]);
  });

  it("une lecture en échec lève", async () => {
    const { db } = fakeDb({}, { table: "exercise_pr_logs", op: "select" });
    setDbForTests(db);
    await expect(getRecords("a")).rejects.toThrow(/Records non chargés/);
  });

  it("liens rm_ref : programme courant prioritaire, par nom et par id de banque", async () => {
    const { db } = fakeDb({
      app_data: [
        { athlete_id: "a", key: "asp:exos", value: { s1: [{ id: "e1", name: "DC haltères", exercise_id: "bank-1", rm_ref: "Développé couché" }] } },
        { athlete_id: "a", key: "asp:exos::cycle1", value: { s1: [{ id: "e2", name: "DC haltères", rm_ref: "Ancien" }, { id: "e3", name: "Front squat", rm_ref: "Squat" }] } },
        { athlete_id: "a", key: "asp:wh", value: { "20261101": { poids: 70 } } },
        { athlete_id: "b", key: "asp:exos", value: { s1: [{ name: "Tirage", rm_ref: "Rowing" }] } },
      ],
    });
    setDbForTests(db);
    const links = await getRecordLinks("a");
    expect(links).toEqual({ "dc haltères": "Développé couché", "id:bank-1": "Développé couché", "front squat": "Squat" });
    expect(resolveRecordRef({ exercise_name: "DC Haltères " }, links)).toBe("Développé couché");
    expect(resolveRecordRef({ exercise_name: "Autre nom", exercise_id: "bank-1" }, links)).toBe("Développé couché");
    expect(resolveRecordRef({ exercise_name: "Soulevé de terre" }, links)).toBe("Soulevé de terre");
    expect(resolveRecordRef({ exercise_name: "" }, links)).toBeNull();
  });
});

describe("écritures", () => {
  it("addRecord : 1RM direct ou estimé (Epley, 0,5 kg), série source gardée", async () => {
    const { db, tables } = fakeDb();
    setDbForTests(db);
    const direct = await addRecord({ athleteId: "a", ref: " Squat ", kg: 120, date: "2026-11-08" });
    expect(direct).toMatchObject({ exercise_ref: "Squat", kg: 120, source: "manual", source_reps: null, source_kg: null });
    const est = await addRecord({ athleteId: "a", ref: "Squat", kg: 100, reps: 5, date: "2026-11-08", source: "manual" });
    expect(est).toMatchObject({ kg: 116.5, source_reps: 5, source_kg: 100 });
    expect(tables.exercise_pr_logs).toHaveLength(2);
    await expect(addRecord({ athleteId: "a", ref: "", kg: 100 })).rejects.toThrow(/Référence/);
    await expect(addRecord({ athleteId: "a", ref: "Squat", kg: 0 })).rejects.toThrow(/invalides/);
  });

  it("deleteRecord", async () => {
    const { db, tables } = fakeDb({ exercise_pr_logs: [pr("1", {}), pr("2", {})] });
    setDbForTests(db);
    await deleteRecord("1");
    expect(tables.exercise_pr_logs.map((r) => r.id)).toEqual(["2"]);
  });

  it("computeRecordsFromSession : n'écrit que les records battus", async () => {
    const { db, tables } = fakeDb({
      exercise_pr_logs: [pr("1", { exercise_ref: "Squat", kg: 115 }), pr("2", { exercise_ref: "DC", kg: 100 }), pr("b", { athlete_id: "b", exercise_ref: "Squat", kg: 300 })],
    });
    setDbForTests(db);
    const found = await computeRecordsFromSession(
      "a",
      [
        { ref: "Squat", kg: 110, reps: 3 },
        { ref: "Squat", kg: 100, reps: 5 },
        { ref: "DC", kg: 80, reps: 5 },
        { ref: "Tirage", kg: 60, reps: 10, done: false },
      ],
      { date: "2026-11-08" },
    );
    expect(found).toEqual([{ ref: "Squat", kg: 121, sourceKg: 110, sourceReps: 3 }]);
    expect(tables.exercise_pr_logs.filter((r) => r.source === "computed")).toEqual([
      expect.objectContaining({ athlete_id: "a", exercise_ref: "Squat", kg: 121, date: "2026-11-08", source_reps: 3, source_kg: 110 }),
    ]);
    // Rejouer la même séance n'ajoute rien.
    expect(await computeRecordsFromSession("a", [{ ref: "Squat", kg: 110, reps: 3 }])).toEqual([]);
    expect(await computeRecordsFromSession("a", [])).toEqual([]);
  });

  it("computeRecordsFromSession : une écriture refusée lève", async () => {
    const { db } = fakeDb({}, { table: "exercise_pr_logs", op: "insert" });
    setDbForTests(db);
    await expect(computeRecordsFromSession("a", [{ ref: "Squat", kg: 100, reps: 1 }])).rejects.toThrow(/Records non enregistrés/);
  });

  it("séries de l'ancien stockage rattachées à leur référence", async () => {
    const { db } = fakeDb({
      app_data: [{ athlete_id: "a", key: "asp:sets", value: {
        e_1_1: [{ done: true, kg: 100, reps: 5 }, { done: false, kg: 120, reps: 1 }],
        e_1_2: [{ done: true, kg: 105, reps: 5 }],
        e_10_1: [{ done: true, kg: 50, reps: 10 }],
        inconnu_1: [{ done: true, kg: 999, reps: 1 }],
      } }],
    });
    setDbForTests(db);
    const sets = await getLegacyRecordSets("a", [
      { id: "e_1", name: "Squat barre", rm_ref: "Squat" },
      { id: "e_10", name: "Curl" },
      { id: "e_2", name: "Gainage", isFlexibility: true },
    ]);
    expect(sets).toEqual([
      { ref: "Squat", kg: 100, reps: 5 },
      { ref: "Squat", kg: 105, reps: 5 },
      { ref: "Curl", kg: 50, reps: 10 },
    ]);
  });
});

describe("invalidateRecords", () => {
  it("invalide toutes les requêtes records de l'athlète, pas celles d'un autre", async () => {
    const qc = new QueryClient();
    qc.setQueryData(recordKeys.list("a"), 1);
    qc.setQueryData(recordKeys.links("a"), 1);
    qc.setQueryData(recordKeys.list("b"), 1);
    await invalidateRecords(qc, "a");
    expect([recordKeys.list("a"), recordKeys.links("a"), recordKeys.list("b")].map((k) => qc.getQueryState(k)?.isInvalidated))
      .toEqual([true, true, false]);
  });
});
