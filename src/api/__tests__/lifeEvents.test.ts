import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { createLifeEvent, deleteLifeEvent, invalidateLifeEvents, lifeEventKeys, listLifeEvents } from "@/api/lifeEvents";

afterEach(() => setDbForTests(null));

describe("événements de vie", () => {
  it("crée, liste par date de début, supprime", async () => {
    const { db, tables } = fakeDb({
      athlete_life_events: [
        { id: "e2", athlete_id: "a", date_start: "2026-12-20", date_end: "2026-12-27", title: "Vacances" },
        { id: "x", athlete_id: "b", date_start: "2026-11-01", date_end: "2026-11-02", title: "Autre" },
      ],
    });
    setDbForTests(db);
    const e = await createLifeEvent({ athlete_id: "a", date_start: "2026-11-15", date_end: "2026-11-16", title: "Examens" });
    expect((await listLifeEvents("a")).map((x) => x.title)).toEqual(["Examens", "Vacances"]);
    await deleteLifeEvent(e.id);
    expect(tables.athlete_life_events.map((x) => x.id)).toEqual(["e2", "x"]);
  });

  it("une lecture en erreur lève", async () => {
    const { db } = fakeDb({}, { table: "athlete_life_events", op: "select" });
    setDbForTests(db);
    await expect(listLifeEvents("a")).rejects.toThrow("Événements non chargés");
  });

  it("invalide la liste et le calendrier de l'athlète", async () => {
    const qc = new QueryClient();
    for (const k of [lifeEventKeys.list("a"), ["cal", "a"], lifeEventKeys.list("b")]) qc.setQueryData(k, 1);
    await invalidateLifeEvents(qc, "a");
    expect(qc.getQueryState(lifeEventKeys.list("a"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["cal", "a"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(lifeEventKeys.list("b"))?.isInvalidated).toBe(false);
  });
});
