import { describe, expect, it } from "vitest";
import { runFromCS } from "@/lib/hyrox/tests/chrono";
import { proposeRun, runFromAnalysis } from "../proposal";
import { race } from "./fixtures";

const test = (date: string, cs = 13, validated: string | null = date) => ({
  date, validated_at: validated, outputs: { scores: { running: { cs_kmh: cs, dprime_m: 180 } } },
});
const base = { category: "men", races: [race()], analyses: [], day: "2026-12-01" };

describe("run moyen proposé", () => {
  it("le plan, puis l'objectif de saison", () => {
    expect(proposeRun({ ...base, plan: { run_avg_s: 290 } })).toMatchObject({ runAvgS: 290, source: "plan" });
    expect(proposeRun({ ...base, seasonGoal: { run_avg_s: 285, season: "2026-27" } }))
      .toEqual({ runAvgS: 285, source: "saison", label: "Objectif de saison 26/27" });
  });

  it("sinon la dernière course de la catégorie (run moyen réalisé)", () => {
    expect(proposeRun(base)).toEqual({ runAvgS: 300, source: "derniere_course", label: "Dernière course : HYROX Paris (16/09)" });
    expect(proposeRun({ ...base, category: "women" })).toBeNull();
  });

  it("ou le bilan de tests validé, s'il est plus récent ; jamais un brouillon ni une date postérieure", () => {
    const pace = runFromCS(13, 180, { sex: "H", category: "Open" }).pace_s_per_km;
    expect(proposeRun({ ...base, analyses: [test("2026-10-01")] })).toMatchObject({ source: "tests", runAvgS: pace, label: "Bilan de tests du 01/10" });
    expect(proposeRun({ ...base, analyses: [test("2026-09-01")] })?.source).toBe("derniere_course");
    expect(proposeRun({ ...base, analyses: [test("2026-10-01", 13, null)] })?.source).toBe("derniere_course");
    expect(proposeRun({ ...base, day: "2026-09-01", analyses: [test("2026-10-01")] })).toBeNull();
  });

  it("allure des tests : femme pour le duo mixte, Pro selon la catégorie", () => {
    const o = { scores: { running: { cs_kmh: 12 } } };
    expect(runFromAnalysis(o, "doubles_mixed")).toBe(runFromCS(12, null, { sex: "F", category: "Open" }).pace_s_per_km);
    expect(runFromAnalysis(o, "men_pro")).toBe(runFromCS(12, null, { sex: "H", category: "Pro" }).pace_s_per_km);
    expect(runFromAnalysis({}, "men")).toBeNull();
  });
});
