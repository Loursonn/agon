import { describe, it, expect, vi, beforeEach } from "vitest";

// Faux client : enregistre la chaîne d'appels PostgREST.
const calls: Array<[string, unknown[]]> = [];
let result: { error: { message: string } | null } = { error: null };
const chain: Record<string, unknown> = {};
for (const m of ["delete", "in", "eq", "gt", "lte", "neq", "is"]) {
  chain[m] = (...args: unknown[]) => { calls.push([m, args]); return chain; };
}
chain.then = (resolve: (v: unknown) => void) => resolve(result);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => { calls.push(["from", [t]]); return chain; } },
}));

import { deletePlannedWorkouts } from "@/api/workouts";

describe("deletePlannedWorkouts", () => {
  beforeEach(() => { calls.length = 0; result = { error: null }; });

  const guards = [
    ["neq", ["status", "completed"]],
    ["is", ["athlete_modifications", null]],
    ["is", ["rpe_score", null]],
  ];

  it("ne supprime jamais une séance réalisée, commencée ou notée (par semaine de cycle)", async () => {
    await deletePlannedWorkouts({ microcycleIds: ["m1", "m2"] });
    expect(calls).toContainEqual(["in", ["microcycle_id", ["m1", "m2"]]]);
    for (const g of guards) expect(calls).toContainEqual(g);
  });

  it("idem pour une plage de dates", async () => {
    await deletePlannedWorkouts({ athleteId: "a", after: "2026-11-01", until: "2026-11-30" });
    expect(calls).toContainEqual(["gt", ["scheduled_date", "2026-11-01"]]);
    expect(calls).toContainEqual(["lte", ["scheduled_date", "2026-11-30"]]);
    for (const g of guards) expect(calls).toContainEqual(g);
  });

  it("ne fait rien sans semaine à supprimer", async () => {
    await deletePlannedWorkouts({ microcycleIds: [] });
    expect(calls).toHaveLength(0);
  });

  it("lève une erreur lisible si la base refuse", async () => {
    result = { error: { message: "refusé" } };
    await expect(deletePlannedWorkouts({ microcycleIds: ["m1"] })).rejects.toThrow(/refusé/);
  });
});
