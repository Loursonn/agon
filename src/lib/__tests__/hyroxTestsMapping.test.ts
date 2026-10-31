import { describe, expect, it } from "vitest";
import {
  analyzeTests, BATTERY_IDS, calibrationCsv, calibrationRows, calibrationSummary, defaultWindow, inputsFromResults,
  profileFromAthlete, storedOutputs, validatedFromPlan, type BatteryResult, type CalibrationRace, type HyroxTestInputs,
} from "@/lib/hyrox/tests";

const PROFILE = { sex: "H" as const, category: "Open" as const, age: 32, weight_kg: 78, height_cm: 180 };

let n = 0;
const res = (slug: keyof typeof BATTERY_IDS, date: string, values: Record<string, number>): BatteryResult => ({
  id: `r${++n}`, test_definition_id: BATTERY_IDS[slug], performed_at: date, values,
});

// Golden 1 saisi comme l'athlète le saisit (variables des presets v3).
const GOLDEN1_RESULTS: BatteryResult[] = [
  res("broad_jump", "2026-11-02", { best_cm: 228 }),
  res("triple_broad_jump", "2026-11-02", { distance_cm: 620 }),
  res("run_12min", "2026-11-02", { distance_m: 2750 }),
  res("run_1200m", "2026-11-02", { time: 270 }),
  res("strict_press", "2026-11-04", { load_kg: 52.5, reps: 5 }),
  res("thruster", "2026-11-04", { load_kg: 70, reps: 4 }),
  res("row_2000m", "2026-11-04", { time: 468 }),
  res("knee_to_wall", "2026-11-05", { left_cm: 9.5, right_cm: 11 }),
  res("run_6min", "2026-11-05", { distance_m: 1530 }),
  res("calf_raise", "2026-11-05", { left_reps: 22, right_reps: 27 }),
  res("bridge", "2026-11-05", { left_reps: 21, right_reps: 24 }),
  res("sit_to_stand", "2026-11-05", { left_reps: 8, right_reps: 11 }),
  res("hop", "2026-11-05", { left_cm: 165, right_cm: 178 }),
  res("sled_push", "2026-11-06", { time_80: 7.5, time_100: 10, time_120: 14 }),
  res("sled_pull", "2026-11-06", { time_80: 8, time_100: 11, time_120: 16 }),
  res("ski_2000m", "2026-11-06", { time: 510 }),
  res("dead_hang", "2026-11-06", { time: 75 }),
  res("bbj_80m", "2026-11-08", { time: 250 }),
  res("wall_balls_5min", "2026-11-08", { total: 86 }),
];

const GOLDEN1: HyroxTestInputs = {
  run_1200m: { duration_s: 270 }, run_12min: { distance_m: 2750 }, run_6min: { distance_m: 1530 },
  row_2000m_s: 468, ski_2000m_s: 510, strict_press: { kg: 52.5, reps: 5 }, thruster: { kg: 70, reps: 4 },
  wall_balls_5min: { total: 86 }, sled_push: { times_s: [7.5, 10, 14] }, sled_pull: { times_s: [8, 11, 16] },
  bbj_80m: { time_s: 250 }, broad_jump_cm: 228, triple_broad_jump_cm: 620, single_leg_hop_cm: { left: 165, right: 178 },
  dead_hang_s: 75, calf_raise_reps: { left: 22, right: 27 }, knee_to_wall_cm: { left: 9.5, right: 11 },
  single_leg_bridge_reps: { left: 21, right: 24 }, single_leg_sit_to_stand_reps: { left: 8, right: 11 },
};

describe("Tests HYROX : résultats saisis -> moteur", () => {
  it("golden 1 saisi dans les presets v3 donne exactement les mêmes notes", () => {
    const w = defaultWindow(GOLDEN1_RESULTS)!;
    expect(w).toEqual({ from: "2026-10-19", to: "2026-11-08" });
    const m = inputsFromResults(GOLDEN1_RESULTS, w);
    expect(m.missing).toEqual(["week1_sled_push", "week1_sled_pull"]);
    expect(m.source_result_ids).toHaveLength(19);
    expect(m.first_date).toBe("2026-11-02");
    const a = analyzeTests(m.inputs, PROFILE).scores;
    const b = analyzeTests(GOLDEN1, PROFILE).scores;
    expect(a.axes).toEqual(b.axes);
    expect(a.measures.map(x => [x.key, x.note])).toEqual(b.measures.map(x => [x.key, x.note]));
    expect(a.running.cs_kmh).toBeCloseTo(b.running.cs_kmh!, 9);
  });

  it("le plus récent dans la fenêtre gagne ; hors fenêtre ignoré", () => {
    const rs = [
      res("dead_hang", "2026-09-01", { time: 30 }),
      res("dead_hang", "2026-11-03", { time: 60 }),
      res("dead_hang", "2026-11-06", { time: 75 }),
      res("dead_hang", "2026-12-20", { time: 99 }),
    ];
    const m = inputsFromResults(rs, { from: "2026-11-01", to: "2026-11-30" });
    expect(m.inputs.dead_hang_s).toBe(75);
    expect(m.source_result_ids).toEqual([rs[2].id]);
  });

  it("charges réelles des sleds, wall balls minute par minute, RPE et semaine 1", () => {
    const rs = [
      res("sled_push", "2026-11-06", { load_80: 120, time_80: 7.5, load_100: 152, time_100: 10, time_120: 14 }),
      res("wall_balls_5min", "2026-11-08", { min_1: 20, min_2: 18, min_3: 17, min_4: 16, min_5: 15, no_reps: 3, rpe: 9, hr_1min: 150 }),
      res("week1_sled_push", "2026-11-12", { r1_t1: 10, r1_t2: 10.5, r1_t3: 11, r1_t4: 12, r2_t1: 10.2, r2_t2: 11, r2_t3: 11.5, r2_t4: 12.5, rpe: 8 }),
    ];
    const m = inputsFromResults(rs, { from: "2026-11-01", to: "2026-11-30" });
    expect(m.inputs.sled_push).toEqual({ times_s: [7.5, 10, 14], loads_kg: [120, 152, null] });
    expect(m.inputs.wall_balls_5min).toEqual({ per_minute: [20, 18, 17, 16, 15], total: null, no_reps: 3 });
    expect(m.inputs.rpe).toEqual({ wall_balls: { rpe: 9, hr_1min: 150 }, week1_sled_push: { rpe: 8, hr_1min: null } });
    expect(m.inputs.week1_sled_push).toEqual([[10, 10.5, 11, 12], [10.2, 11, 11.5, 12.5]]);
    const s = analyzeTests(m.inputs, PROFILE).scores;
    expect(s.measures.find(x => x.key === "wall_balls")!.value).toBe(86);
    expect(s.week1_push!.rep_speeds).toHaveLength(2);
  });

  it("aucun résultat : pas de fenêtre", () => {
    expect(defaultWindow([])).toBeNull();
  });
});

describe("Tests HYROX : profil", () => {
  it("homme sans catégorie : Open par défaut, signalé", () => {
    const p = profileFromAthlete({ gender: "male", birth_date: "1994-11-10", weight_kg: 78, height_cm: 180 }, "2026-11-08");
    expect(p.profile).toEqual({ sex: "H", category: "Open", age: 31, weight_kg: 78, height_cm: 180 });
    expect(p.warnings.join(" ")).toMatch(/Open par défaut/);
  });
  it("sexe manquant : pas de profil", () => {
    const p = profileFromAthlete({ hyrox_category: "pro" }, "2026-11-08");
    expect(p.profile).toBeNull();
    expect(p.warnings.length).toBeGreaterThan(2);
  });
  it("femme Pro, âge du profil sans date de naissance", () => {
    expect(profileFromAthlete({ gender: "female", hyrox_category: "pro", age: 41, weight_kg: 60, height_cm: 168 }, "2026-11-08").profile)
      .toEqual({ sex: "F", category: "Pro", age: 41, weight_kg: 60, height_cm: 168 });
  });
});

describe("Tests HYROX : stockage et axes validés", () => {
  const out = analyzeTests(GOLDEN1, PROFILE, { target_s: 80 * 60, context: { competition: "A", weeks_to_a: 16 } });
  it("outputs stockés sans proposition d'axes, sérialisables", () => {
    const st = storedOutputs(out);
    expect("axes_plan" in st).toBe(false);
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
    expect(st.chrono!.median_s).toBeCloseTo(out.chrono!.median_s, 6);
  });
  it("axes validés partent de la proposition", () => {
    const v = validatedFromPlan(out.axes_plan);
    expect(v.from_engine).toBe("axes@1.0.0");
    expect(v.principal1.label).toBe("Course");
    expect(v.principal2.label).toBe(out.axes_plan!.principal2.label);
    expect(validatedFromPlan(null).from_engine).toBeNull();
  });
});

describe("Tests HYROX : calibration", () => {
  const out = storedOutputs(analyzeTests(GOLDEN1, PROFILE));
  const analyses = [
    { id: "a1", athlete_id: "x", date: "2026-11-08", profile: PROFILE, outputs: out, algo_version: "hyrox-tests@1.0.0", grid_version: "v1" },
    { id: "a0", athlete_id: "x", date: "2026-06-01", profile: PROFILE, outputs: out, algo_version: "hyrox-tests@1.0.0", grid_version: "v1" },
  ];
  const race = (over: Partial<CalibrationRace>): CalibrationRace => ({
    id: "c1", athlete_id: "x", date: "2027-02-14", event_name: "HYROX Bordeaux", format: "solo", division: "men", status: "finished",
    total_s: 4800, ski_s: 300, wall_balls_s: 420, ...over,
  });

  it("dernière analyse avant la course, écart réel − estimé, segments", () => {
    const rows = calibrationRows(analyses, [race({})]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.analysis_id).toBe("a1");
    expect(r.days_before).toBe(98);
    expect(r.gap_s).toBeCloseTo(4800 - out.chrono!.median_s, 6);
    expect(r.division_mismatch).toBe(false);
    expect(r.segments.map(s => s.segment)).toEqual(["SkiErg", "Wall balls"]);
  });

  it("ignore : relais, DNF, course avant toute analyse", () => {
    expect(calibrationRows(analyses, [race({ format: "relay" }), race({ status: "dnf" }), race({ date: "2026-01-01" })])).toHaveLength(0);
  });

  it("division différente signalée, résumé et CSV", () => {
    const rows = calibrationRows(analyses, [race({ division: "men_pro" })]);
    expect(rows[0].division_mismatch).toBe(true);
    const s = calibrationSummary(rows);
    expect(s.n).toBe(1);
    const csv = calibrationCsv(rows, { x: "Athlète X" }).split("\n");
    expect(csv[0].split(";")[0]).toBe("athlete");
    expect(csv).toHaveLength(1 + 1 + 2);
    expect(csv[1].startsWith("Athlète X;HYROX Bordeaux;2027-02-14")).toBe(true);
  });
});
