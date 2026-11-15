import { describe, expect, it } from "vitest";
import type { HyroxRacePlan } from "@/features/shared/types/hyrox";
import { planTargets, type PlanSegments } from "@/lib/hyrox/racePlan";
import { objectiveForRace } from "../forRace";
import { objectiveLookup } from "../vsObjective";
import { ON_TARGET, race } from "./fixtures";

const segs = Object.fromEntries(Object.entries(ON_TARGET).map(([k, v]) => [k.replace(/_s$/, ""), v])) as unknown as PlanSegments;

const plan = (o: Partial<HyroxRacePlan> = {}): HyroxRacePlan => ({
  id: "p", athlete_id: "a", competition_id: null, result_id: "r", created_by: null, name: "Paris", division: "men",
  profile: "equilibre" as HyroxRacePlan["profile"], target_total_s: 4900, targets: planTargets({ ...segs, ski: 250 }),
  predicted_total_s: null, predicted_high_s: null, predicted_from: null, notes: null,
  run_avg_s: 300, model_version: "obj@1", created_at: "", updated_at: "",
  ...o,
});

describe("objectif d'une course", () => {
  it("sans plan : construit sur le run du jour, course pile dessus", () => {
    const v = objectiveForRace(race(), [])!;
    expect(v.objective.source).toBe("run_du_jour");
    expect(v.objective.runAvgS).toBe(300);
    expect(v.vs.total).toMatchObject({ targetS: 4985, deltaS: 0, state: "on" });
  });

  it("avec le plan de la course : ses cibles telles que saisies", () => {
    const v = objectiveForRace(race(), [plan()])!;
    expect(v.objective).toMatchObject({ source: "plan", runAvgS: 300, modelVersion: "obj@1" });
    expect(v.vs.segments.find((x) => x.key === "ski")).toMatchObject({ targetS: 250, deltaS: 20, state: "behind" });
  });

  it("plan d'une autre course ignoré ; run manquant : pas d'objectif", () => {
    expect(objectiveForRace(race(), [plan({ result_id: "autre" })])!.objective.source).toBe("run_du_jour");
    expect(objectiveForRace(race({ run_4_s: null as unknown as number }), [])).toBeNull();
  });

  it("lecture par segment, total compris", () => {
    const at = objectiveLookup(segs);
    expect(at("ski")).toBe(270);
    expect(at("roxzone_total")).toBe(400);
    expect(at("total")).toBe(4985);
    expect(at("inconnu")).toBeNull();
  });
});
