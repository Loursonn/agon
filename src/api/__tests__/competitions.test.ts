import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  competitionKeys,
  createCompetition,
  daysUntil,
  deleteCompetition,
  getNextCompetition,
  invalidateCompetitions,
  listCompetitions,
  listUpcomingCompetitions,
  setCompetitionComment,
  updateCompetition,
} from "@/api/competitions";

const comp = (id: string, o: Partial<Row>): Row => ({
  id, athlete_id: "a", coach_id: "c", name: `Course ${id}`, type: "competition", date: "2026-12-01",
  location: null, notes: null, priority: "A", macrocycle_id: null, athlete_comment: null, created_at: "2026-10-01T00:00:00Z", ...o,
});

afterEach(() => setDbForTests(null));

describe("daysUntil", () => {
  it("jours calendaires, jamais négatif", () => {
    expect(daysUntil("2026-11-08", "2026-11-08")).toBe(0);
    expect(daysUntil("2026-11-09", "2026-11-08")).toBe(1);
    expect(daysUntil("2026-12-01", "2026-11-08")).toBe(23);
    expect(daysUntil("2026-11-01", "2026-11-08")).toBe(0);
    // passage à l'heure d'hiver sans décalage
    expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
  });
});

describe("lectures", () => {
  it("liste par date croissante, seulement l'athlète demandé", async () => {
    const { db } = fakeDb({ competitions: [comp("2", { date: "2027-02-01" }), comp("1", { date: "2026-12-01" }), comp("x", { athlete_id: "b" })] });
    setDbForTests(db);
    expect((await listCompetitions("a")).map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("prochaine compétition : aujourd'hui compris, avec jours restants", async () => {
    const { db } = fakeDb({
      competitions: [comp("passée", { date: "2026-11-01" }), comp("loin", { date: "2027-01-10" }), comp("jour", { date: "2026-11-08" })],
    });
    setDbForTests(db);
    const next = await getNextCompetition("a", "2026-11-08");
    expect(next?.id).toBe("jour");
    expect(next?.daysUntil).toBe(0);
    expect(await getNextCompetition("b", "2026-11-08")).toBeNull();
  });

  it("à venir pour plusieurs athlètes dans la fenêtre", async () => {
    const { db } = fakeDb({
      competitions: [
        comp("a1", { date: "2026-11-20" }), comp("a2", { date: "2026-12-20" }),
        comp("b1", { athlete_id: "b", date: "2026-11-10" }), comp("z", { athlete_id: "z", date: "2026-11-10" }),
      ],
    });
    setDbForTests(db);
    const rows = await listUpcomingCompetitions(["a", "b"], "2026-11-08", "2026-12-08");
    expect(rows.map((c) => [c.id, c.daysUntil])).toEqual([["b1", 2], ["a1", 12]]);
    expect(await listUpcomingCompetitions([], "2026-11-08", "2026-12-08")).toEqual([]);
  });

  it("une erreur de lecture lève (jamais de liste vide silencieuse)", async () => {
    const { db } = fakeDb({ competitions: [comp("1", {})] }, { table: "competitions", op: "select" });
    setDbForTests(db);
    await expect(listCompetitions("a")).rejects.toThrow("Compétitions non chargées");
    await expect(getNextCompetition("a")).rejects.toThrow();
    await expect(listUpcomingCompetitions(["a"], "2026-01-01", "2027-01-01")).rejects.toThrow();
  });
});

describe("écritures", () => {
  it("crée, modifie, commente puis supprime", async () => {
    const { db, tables } = fakeDb({});
    setDbForTests(db);
    const c = await createCompetition({
      coach_id: "c", athlete_id: "a", name: "HYROX Paris", type: "competition", date: "2027-03-01", location: null, notes: null, priority: "A",
    });
    expect(tables.competitions).toHaveLength(1);
    const u = await updateCompetition(c.id, { priority: "B", location: "Paris" });
    expect(u).toMatchObject({ priority: "B", location: "Paris", athlete_id: "a" });
    expect((await setCompetitionComment(c.id, "Bonne course")).athlete_comment).toBe("Bonne course");
    await deleteCompetition(c.id);
    expect(tables.competitions).toHaveLength(0);
  });

  it("une écriture refusée lève", async () => {
    const { db } = fakeDb({ competitions: [comp("1", {})] }, { table: "competitions", op: "delete" });
    setDbForTests(db);
    await expect(deleteCompetition("1")).rejects.toThrow("Compétition non supprimée");
  });
});

describe("invalidation", () => {
  it("rafraîchit listes, prochaine compétition, vues coach et planning de l'athlète seulement", async () => {
    const qc = new QueryClient();
    const keys = [
      competitionKeys.list("a"), competitionKeys.next("a"), competitionKeys.upcoming(["a", "b"], "2026-11-08", "2026-12-08"),
      ["cal", "a", "2026-11-01", "2026-11-30"], ["timeline-data", "a"], ["activePlan", "a"],
      competitionKeys.list("b"), ["cal", "b"],
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateCompetitions(qc, "a");
    const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated;
    expect(keys.slice(0, 6).map(stale)).toEqual([true, true, true, true, true, true]);
    expect(stale(competitionKeys.list("b"))).toBe(false);
    expect(stale(["cal", "b"])).toBe(false);
  });
});
