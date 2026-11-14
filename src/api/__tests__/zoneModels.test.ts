import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { applyZoneModelToPast, getZoneModels, saveZoneModel } from "@/api/zoneModels";

afterEach(() => setDbForTests(null));

describe("zoneModels", () => {
  it("lit les modèles avec qui les a posés", async () => {
    const { db } = fakeDb({
      hr_zone_models: [{
        id: "m1", athlete_id: "a1", kind: "custom", bounds: [120, 135, 150, 160, 170, 180], valid_from: "2026-11-12",
        status: "active", origin: "manual", test_result_id: null, created_by: "c1", decided_by: "c1",
        decided_at: "2026-11-12T10:00:00Z", created_at: "2026-11-12T10:00:00Z",
      }],
    });
    setDbForTests(db);
    const rows = await getZoneModels("a1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "custom", createdBy: "c1", validFrom: "2026-11-12" });
  });

  it("enregistre un modèle five sans bornes, refuse des bornes incohérentes", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { db } = fakeDb({}, undefined, { save_hr_zone_model: (args) => { calls.push(args); return "new-id"; } });
    setDbForTests(db);
    expect(await saveZoneModel("a1", "five", [], "2026-11-12")).toBe("new-id");
    expect(calls[0]).toMatchObject({ p_kind: "five", p_bounds: [] });
    await expect(saveZoneModel("a1", "three", [170, 150], "2026-11-12")).rejects.toThrow();
  });

  it("appliquer au passé : erreur de la base remontée", async () => {
    const { db } = fakeDb({}, { table: "apply_hr_zone_model_to_past", op: "rpc" });
    setDbForTests(db);
    await expect(applyZoneModelToPast("m1")).rejects.toThrow();
  });
});
