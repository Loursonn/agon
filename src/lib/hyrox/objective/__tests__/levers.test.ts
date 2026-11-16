import { describe, expect, it } from "vitest";
import type { HyroxTestAnalysisRow } from "@/lib/hyrox/tests/db";
import type { WorkAxisRule } from "@/lib/hyrox/tests/types";
import type { RaceWatchAnalysis, SegmentWatch } from "@/lib/hyrox/raceWatch";
import type { ActivityStream } from "@shared/activityFiles/stream";
import { objectiveFromRun } from "../model";
import { raceStrategy } from "../strategy";
import {
  LEVER_RULES, NO_REPS_PROPOSAL, PACING_PROPOSAL, cascadeSteps, leverAxis, leverHints, leverProposal, leverViews, validatedRules,
} from "../levers";
import { race } from "./fixtures";

const obj = objectiveFromRun("men", 300)!.segments;

const rule = (id: string): WorkAxisRule => ({
  id, step: "station" as WorkAxisRule["step"], group: "g", condition: { all: [] }, axis: `Axe ${id}`, means: `Moyen ${id}`, rationale: "", active: true,
});

const analysis = (o: Partial<HyroxTestAnalysisRow>): HyroxTestAnalysisRow => ({
  id: "t", athlete_id: "a", kind: "complet" as HyroxTestAnalysisRow["kind"], date: "2026-09-01", source_result_ids: [],
  inputs: {} as HyroxTestAnalysisRow["inputs"], profile: {} as HyroxTestAnalysisRow["profile"], outputs: { rules: [rule("run_seuils")] },
  algo_version: "1", grid_version: "1", target_s: null, axes_validated: null, validated_at: "2026-09-02", validated_by: null,
  recalculated_from: null, created_by: null, created_at: "", updated_at: "",
  ...o,
});

describe("leviers reliés au travail", () => {
  it("proposition : allure, course après le sled qui a coûté, no reps, station", () => {
    expect(leverProposal({ key: "depart" })).toBe(PACING_PROPOSAL);
    expect(leverProposal({ key: "apres_sleds", focus: "sled_pull" })).toMatch(/sled pull \+ 1 km/);
    expect(leverProposal({ key: "run_8" })).toMatch(/fentes \+ 1 km/);
    expect(leverProposal({ key: "no_reps" })).toBe(NO_REPS_PROPOSAL);
    expect(leverProposal({ key: "roxzone" })).toMatch(/transitions/);
    expect(leverProposal({ key: "ski" })).toMatch(/SkiErg/);
    expect(leverProposal({ key: "allure" })).toBeNull();
  });

  it("axe : première règle déclenchée dans l'ordre du levier", () => {
    const fired = [rule("sled_pull_gap"), rule("sled_pull_force")];
    expect(leverAxis("sled_pull", fired)?.id).toBe("sled_pull_force");
    expect(leverAxis("lunges", fired)).toBeNull();
    expect(LEVER_RULES.allure).toEqual(["run_seuils", "run_vitesse", "run_vo2"]);
  });

  it("bilan : le dernier validé avant la course, jamais un brouillon ni un bilan postérieur", () => {
    const rows = [
      analysis({ id: "vieux", date: "2026-06-01", outputs: { rules: [rule("grip")] } }),
      analysis({ id: "bon", date: "2026-09-01" }),
      analysis({ id: "brouillon", date: "2026-09-10", validated_at: null, outputs: { rules: [rule("wb_tech")] } }),
      analysis({ id: "apres", date: "2026-10-01", outputs: { rules: [rule("bj_force")] } }),
    ];
    expect(validatedRules(rows, "2026-09-16").map((r) => r.id)).toEqual(["run_seuils"]);
    expect(validatedRules([], "2026-09-16")).toEqual([]);
  });
});

// Montre : segments de 300 s chacun, enchaînés, FC constante par segment.
const ORDER = ["run_1", "ski", "run_2", "sled_push", "run_3", "sled_pull", "run_4", "bbj", "run_5", "row", "run_6", "farmers", "run_7", "lunges", "run_8", "wall_balls"];
function watch(hr: Record<string, number>, cad: Record<string, number>) {
  const segments = ORDER.map((key, i) => ({
    key, kind: key.startsWith("run") ? "run" : "station", label: key === "sled_push" ? "Sled push" : key,
    startS: i * 300, endS: (i + 1) * 300, officialS: 300, avgHr: hr[key] ?? 150, maxHr: null,
    avgCadence: key.startsWith("run") ? cad[key] ?? 170 : null, coverage: 1,
  })) as unknown as SegmentWatch[];
  const t = Array.from({ length: ORDER.length * 300 }, (_, i) => i);
  const stream = { t, hr: t.map((s) => hr[ORDER[Math.floor(s / 300)]] ?? 150) } as unknown as ActivityStream;
  return { analysis: { segments } as unknown as RaceWatchAnalysis, stream };
}

describe("indices de la montre", () => {
  it("course après les sleds : sled au-dessus de SV2 et cadence en baisse", () => {
    const strategy = raceStrategy(race({ run_3_s: 330, run_4_s: 310 }), obj);
    const { analysis: a, stream } = watch({ sled_push: 175, run_1: 172 }, { run_3: 162 });
    const h = leverHints({ strategy, analysis: a, stream, sv2: 170, offset: 0, roxzoneRecoveryBpm: null });
    expect(h.apres_sleds).toBe("Sled push passé à 100 % au-dessus de SV2 (170 bpm), cadence du run 3 −8 pas/min vs ta croisière.");
    expect(h.depart).toBeUndefined(); // pas de levier départ : pas d'indice
  });

  it("départ et Roxzone", () => {
    const strategy = raceStrategy(race({ run_1_s: 250, run_5_s: 334, run_6_s: 328, run_7_s: 328, run_8_s: 355, roxzone_total_s: 444 }), obj);
    const { analysis: a, stream } = watch({ run_1: 175 }, {});
    const h = leverHints({ strategy, analysis: a, stream, sv2: 170, offset: 0, roxzoneRecoveryBpm: 12 });
    expect(h.depart).toBe("Run 1 à 100 % au-dessus de SV2 (170 bpm).");
    expect(h.roxzone).toMatch(/12 bpm en 60 s/);
  });

  it("sans montre : aucun indice", () => {
    const strategy = raceStrategy(race({ run_3_s: 330 }), obj);
    expect(leverHints({ strategy, analysis: null, stream: null, sv2: 170, offset: 0, roxzoneRecoveryBpm: null })).toEqual({});
  });
});

describe("vue des leviers", () => {
  it("proposition, axe et indice joints à chaque levier", () => {
    const strategy = raceStrategy(race({ run_3_s: 330, sled_pull_s: 320 }), obj);
    const v = leverViews(strategy, [rule("sled_pull_force")], { apres_sleds: "Indice." });
    expect(v.find((l) => l.key === "apres_sleds")).toMatchObject({ hint: "Indice.", axis: null });
    expect(v.find((l) => l.key === "sled_pull")?.axis?.id).toBe("sled_pull_force");
    expect(v.find((l) => l.key === "sled_pull")?.proposal).toMatch(/sled pull lourd/);
  });

  it("cascade : au-delà de 6, les plus petites marches réunies en « Autres »", () => {
    const l = (key: string, gainS: number, group: "strategie" | "capacite" = "capacite") => ({ key, gainS, group, label: key, detail: "" }) as never;
    const steps = cascadeSteps([l("depart", 30, "strategie"), l("ski", 12), l("row", 40), l("bbj", 11), l("farmers", 20), l("lunges", 25), l("sled_push", 15)]);
    expect(steps.map((s) => s.label)).toEqual(["Départ", "row", "farmers", "lunges", "sled_push", "2 autres"]);
    expect(steps[5]).toMatchObject({ gainS: 23, group: "autres" });
    expect(cascadeSteps([l("ski", 12)])).toHaveLength(1);
  });
});
