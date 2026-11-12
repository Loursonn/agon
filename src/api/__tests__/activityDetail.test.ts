import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { LapsConflictError, resetLapsToProposal, saveLaps } from "@/api/activityDetail";

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
