import { describe, expect, it } from "vitest";
import {
  analyzeTests, analyzeRunning, axisScore, fmtHm, fmtPace, fmtTime, GRID_SET_V1, noteOf, pointFromPace,
  sledProfile, sledWeek1, type AthleteContext, type GridSet, type HyroxTestInputs, type AthleteTestProfile,
} from "@/lib/hyrox/tests";

// ── Golden test 1 : radar YOXX ───────────────────────────────────────────────
const PROFILE: AthleteTestProfile = { sex: "H", category: "Open", age: 32, weight_kg: 78, height_cm: 180 };
const sides = (left: number, right: number) => ({ left, right });
const GOLDEN1: HyroxTestInputs = {
  run_1200m: { duration_s: 270 },
  run_12min: { distance_m: 2750 },
  run_6min: { distance_m: 1530 },
  row_2000m_s: 468,
  ski_2000m_s: 510,
  strict_press: { kg: 52.5, reps: 5 },
  thruster: { kg: 70, reps: 4 },
  wall_balls_5min: { total: 86 },
  sled_push: { times_s: [7.5, 10, 14] },
  sled_pull: { times_s: [8, 11, 16] },
  bbj_80m: { time_s: 250 },
  broad_jump_cm: 228,
  triple_broad_jump_cm: 620,
  single_leg_hop_cm: sides(165, 178),
  dead_hang_s: 75,
  calf_raise_reps: sides(22, 27),
  knee_to_wall_cm: sides(9.5, 11),
  single_leg_bridge_reps: sides(21, 24),
  single_leg_sit_to_stand_reps: sides(8, 11),
};
const withHr = (i: HyroxTestInputs): HyroxTestInputs => ({
  ...i,
  run_1200m: { ...i.run_1200m, hr_avg: 176 },
  run_6min: { ...i.run_6min, hr_avg: 174 },
  run_12min: { ...i.run_12min, hr_avg: 170 },
});

describe("golden test 1 : radar YOXX", () => {
  const out = analyzeTests(withHr(GOLDEN1), PROFILE);
  const s = out.scores;
  const R = s.running;

  it("stampe les versions", () => {
    expect(out.algo_version).toBe("hyrox-tests@1.0.0");
    expect(out.grid_version).toBe("v1");
  });

  it("course : VMA, VC, D′, E, seuil 1", () => {
    expect(s.vma_kmh).toBeCloseTo(14.5, 1);
    expect(R.cs_kmh).toBeCloseTo(12.343, 3);
    expect(R.dprime_m).toBeCloseTo(283.8, 1);
    expect(R.e).toBeCloseTo(0.8456, 4);
    expect(R.s1_factor).toBe(0.82);
    expect(R.s1_kmh).toBeCloseTo(10.1, 1);
    expect(R.e_reading).toBe("seuils");
    expect(Math.round((R.cs_kmh! / s.vma_kmh!) * 100)).toBe(85);
  });

  it("force : 1RM estimés et ratio", () => {
    expect(Math.round(s.press_1rm!)).toBe(59);
    expect(s.press_1rm! / 78).toBeCloseTo(0.76, 2);
    expect(Math.round(s.thruster_1rm!)).toBe(76);
    expect(s.thruster_1rm! / 78).toBeCloseTo(0.98, 2);
    expect(s.thruster_press).toBeCloseTo(1.29, 2);
  });

  it("sleds : charge max estimée, réserve, vitesse à charge de course", () => {
    const push = s.sled_push, pull = s.sled_pull;
    if (!push.usable || !pull.usable) throw new Error("profil sled non exploitable");
    expect(Math.round(push.l0_kg)).toBe(252);
    expect(Math.round(push.reserve * 100)).toBe(60);
    expect(push.v_race).toBeCloseTo(1.25, 2);
    expect(noteOf(s, "sled_push_reserve")).toBe(4);
    expect(Math.round(pull.l0_kg)).toBe(164);
    expect(Math.round(pull.reserve * 100)).toBe(63);
    expect(pull.v_race).toBeCloseTo(1.14, 2);
    expect(noteOf(s, "sled_pull_reserve")).toBe(4);
  });

  it("puissance : triple et hop", () => {
    expect(Math.round(s.measures.find(m => m.key === "triple_ratio")!.value! * 100)).toBe(91);
    expect(s.measures.find(m => m.key === "hop_height")!.value).toBeCloseTo(0.92, 2);
  });

  it("notes des 8 axes", () => {
    expect(axisScore(s, "cardio")).toBe(3);
    expect(axisScore(s, "seuils")).toBe(3);
    expect(axisScore(s, "ergos")).toBe(3);
    expect(axisScore(s, "force")).toBe(3.5);
    expect(axisScore(s, "endf")).toBe(3.5);
    expect(axisScore(s, "puissance")).toBe(3.5);
    expect(axisScore(s, "grip")).toBe(3);
    expect(axisScore(s, "robustesse")).toBe(2.5);
  });

  it("3 zones athlète, allure et FC", () => {
    const [z1, z2, z3] = R.athlete_zones;
    expect(z1.label).toBe("Zone 1 · Endurance");
    expect(z1.high_kmh).toBeCloseTo(10.1, 1);
    expect(fmtPace(z1.high_kmh)).toBe("5:56");
    expect(z2.label).toBe("Zone 2 · Seuils");
    expect(z2.low_kmh).toBeCloseTo(10.1, 1);
    expect(z2.high_kmh).toBeCloseTo(12.3, 1);
    expect(fmtPace(z2.high_kmh)).toBe("4:52");
    expect(z3.label).toBe("Zone 3 · Haute intensité");
    expect(z3.low_kmh).toBeCloseTo(12.3, 1);
    expect(Math.round(R.hr_threshold!)).toBe(163);
    expect(Math.round(z1.hr_high!)).toBe(139);
    expect(Math.round(z2.hr_low!)).toBe(139);
    expect(Math.round(z2.hr_high!)).toBe(163);
  });

  it("chrono estimé et leviers", () => {
    const c = out.chrono!;
    expect(Math.round(c.median_s)).toBe(5355);
    expect(Math.round(c.low_s)).toBe(5255);
    expect(Math.round(c.high_s)).toBe(5472);
    expect(Math.round(c.run_s)).toBe(2595);
    expect(c.station_level!.mean).toBeCloseTo(3.29, 2);
    expect(c.station_level!.count).toBe(7);
    expect(Math.round(c.gain_cs_05_s)).toBe(205);
    expect(Math.round(c.gain_stations_1_s)).toBe(200);
  });

  it("points forts / faibles et drapeaux, avec leur source", () => {
    expect(out.insights.weaknesses[0]).toMatchObject({ key: "robustesse", score: 2.5 });
    expect(out.insights.strengths.map(x => x.score)).toEqual([3.5, 3.5, 3.5]);
    const keys = out.insights.flags.map(f => f.key);
    expect(keys).toContain("asym_pointes");
    expect(keys).toContain("asym_assis-debout");
    expect(keys).toContain("thruster_press"); // 1,29 < 1,3
    expect(out.insights.flags.every(f => !!f.source)).toBe(true);
    expect(s.measures.find(m => m.key === "e")!.source).toBe("méthode vitesse critique / Riegel");
  });

  it("règles déclenchées", () => {
    const ids = out.rules.map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining(["sec_asym", "sec_calf", "sec_sts", "run_seuils"]));
    expect(ids).not.toContain("grip");
    expect(ids).not.toContain("run_vitesse");
  });
});

// ── Golden test 2 : saisie en allures, comme une montre ──────────────────────
describe("golden test 2 : VC, Riegel, zones et prédictions", () => {
  const R = analyzeRunning([pointFromPace(270, 225), pointFromPace(360, 235), pointFromPace(720, 262)], GRID_SET_V1.running);
  const z = Object.fromEntries(R.coach_speed_zones.map(x => [x.key, x]));

  it("VC, E, seuil 1", () => {
    expect(R.cs_kmh).toBeCloseTo(12.32, 2);
    expect(R.e).toBeCloseTo(0.84, 2);
    expect(R.s1_kmh).toBeCloseTo(10.1, 2);
  });
  it("6 zones coach", () => {
    expect([z.Z1.low_kmh, z.Z1.high_kmh].map(x => +x!.toFixed(1))).toEqual([7.4, 8.6]);
    expect([z.Z2.low_kmh, z.Z2.high_kmh].map(x => +x!.toFixed(1))).toEqual([8.6, 10.1]);
    expect([z.Z3.low_kmh, z.Z3.high_kmh].map(x => +x!.toFixed(1))).toEqual([10.1, 10.8]);
    expect([z.Z4.low_kmh, z.Z4.high_kmh].map(x => +x!.toFixed(1))).toEqual([10.8, 11.8]);
    expect([z.Z5.low_kmh, z.Z5.high_kmh].map(x => +x!.toFixed(1))).toEqual([11.8, 12.9]);
    expect(+z.Z6.low_kmh!.toFixed(1)).toBe(12.9);
    expect(z.Z6.high_kmh).toBeNull();
  });
  it("prédictions 5 et 10 km (Riegel)", () => {
    // secondes tronquées, comme l'outil de référence (10 km = 55:22,8)
    expect(fmtTime(R.predictions.km5_s, { floor: true })).toBe("24:22");
    expect(fmtTime(R.predictions.km10_s, { floor: true })).toBe("55:22");
  });
  it("tableau % de VC -> durée tenable", () => {
    expect(R.pct_vc_table.map(x => x.pct)).toEqual([1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8]);
    const durations = R.pct_vc_table.map(x => x.sustain_s!);
    for (let i = 1; i < durations.length; i++) expect(durations[i]).toBeGreaterThan(durations[i - 1]);
  });
});

// ── Golden test 3 : axes de travail ──────────────────────────────────────────
const CTX0: AthleteContext = { competition: "A" };
const plan = (ctx: Partial<AthleteContext> = {}, profile: AthleteTestProfile = PROFILE) =>
  analyzeTests(GOLDEN1, profile, { target_s: 90 * 60, context: { ...CTX0, ...ctx } }).axes_plan!;
const row = (p: ReturnType<typeof plan>, n: string) => p.rows.find(r => r.segment === n)!;

describe("golden test 3 : axes de travail", () => {
  const P = plan();

  it("chrono visé déjà atteint : recalculé sur 10 min de mieux", () => {
    expect(P.target_shifted).toBe(true);
    expect(Math.round(P.gap_s)).toBe(600);
    expect(fmtHm(P.target_s)).toBe("1:19");
  });

  it("principal 1 = la course, orientée seuils", () => {
    expect(P.principal1.label).toBe("Course");
    expect(P.course.cs_kmh).toBeCloseTo(12.3, 1);
    expect(P.course.cs_min_kmh).toBeCloseTo(14.4, 1);
    expect(P.course.orientation).toBe("seuils");
    expect(P.course.stations_level).toBe("moyennes");
  });

  it("principal 2 = endurance de force (wall balls, BBJ, fentes)", () => {
    expect(P.principal2.from).toBe("matrice");
    expect(P.matrix_group).toBe("Endurance de force");
    expect(fmtTime(row(P, "Wall balls").gain_s)).toBe("1:10");
    expect(fmtTime(row(P, "BBJ").gain_s)).toBe("0:54");
    expect(fmtTime(row(P, "Fentes").gain_s)).toBe("0:45");
    for (const n of ["Wall balls", "BBJ", "Fentes"]) expect(row(P, n).role).toBe("Principal 2");
  });

  it("sleds et Farmers : petit gain, entretien ; ergos en appoint", () => {
    expect(row(P, "Sled Pull")).toMatchObject({ category: "petit", shifted_by_note: true, note: 4, role: "Entretien" });
    expect(row(P, "Sled Push").role).toBe("Entretien");
    expect(row(P, "Farmers").role).toBe("Entretien");
    expect(row(P, "Rameur").role).toBe("Appoint en zone 1");
    expect(row(P, "SkiErg").role).toBe("Appoint en zone 1");
    expect(row(P, "Roxzone").role).toBe("Analyse à part (parcours)");
    expect(P.appoint.items[0]).toBe("ergos en zone 1");
  });

  it("sécurité hors classement", () => {
    expect(P.safety).toEqual(["asymétrie pointes 81 %", "asymétrie assis-debout 73 %", "pointes note 2", "assis-debout 1 jambe note 2"]);
  });

  it("Roxzone sans course passée", () => {
    expect(P.roxzone.loss).toBe(false);
    expect(P.roxzone.text).toMatch(/transitions apprises en simulation/);
  });

  it("Roxzone : perte réelle, cause organisation", () => {
    const p = plan({ last_race: { top_pct_final: 30, top_pct_roxzone: 55, roxzone_s: "7:30", avg_run_s: "5:00", cause: "orga" } });
    expect(p.roxzone.loss).toBe(true);
    expect(p.roxzone.points).toBe(25);
    expect(Math.round(p.roxzone.ratio! * 100)).toBe(150);
    expect(p.appoint.items).toContain("transitions répétées en simulation");
  });

  it("Roxzone : ratio de 120 % seul, pas de perte", () => {
    const p = plan({ last_race: { top_pct_final: 19, top_pct_roxzone: 8, roxzone_s: "5:54", avg_run_s: "4:56" } });
    expect(Math.round(p.roxzone.ratio! * 100)).toBe(120);
    expect(p.roxzone.loss).toBe(false);
  });

  it("compétition B + blessure à risque : robustesse, endurance de force au bloc suivant", () => {
    const p = plan({ competition: "B", injury_risk: true });
    expect(p.principal2.from).toBe("risk");
    expect(p.principal2.label).toMatch(/^Robustesse/);
    expect(p.principal2.detail).toMatch(/Endurance de force passe au bloc suivant/);
    expect(p.principal1.label).toBe("Course, en volume prudent");
  });

  it("passage à Pro : principal 2 sleds", () => {
    const p = plan({ to_pro: true });
    expect(p.matrix_group).toBe("Sleds");
    expect(fmtTime(row(p, "Sled Pull").gain_s)).toBe("0:39");
    expect(fmtTime(row(p, "Sled Push").gain_s)).toBe("0:19");
    expect(row(p, "Sled Pull").role).toBe("Principal 2");
    expect(row(p, "Sled Push").role).toBe("Principal 2");
    for (const n of ["Wall balls", "BBJ", "Fentes"]) expect(row(p, n).role).toBe("Principal 2 au bloc suivant");
  });

  it("compétition A à 6 semaines : gains rapides et bloc unique", () => {
    const p = plan({ competition: "A", weeks_to_a: 6 });
    expect(p.short_prep).toBe(true);
    expect(p.matrix_group).toBe("Gains rapides");
    for (const n of ["Wall balls", "BBJ", "Fentes"]) expect(row(p, n).role).toBe("Principal 2 (technique, no-reps, transitions)");
    expect(p.block[0]).toMatch(/un seul bloc/);
  });

  it("47 ans : décharge systématique et robustesse en appoint", () => {
    const p = plan({}, { ...PROFILE, age: 47 });
    expect(p.block[0]).toMatch(/décharge systématique/);
    expect(p.appoint.items.some(x => x.startsWith("robustesse"))).toBe(true);
  });

  it("douleur déjà présente : kiné d'abord", () => {
    const p = plan({ pain: true });
    expect(p.principal2.label).toBe("Robustesse (réathlétisation)");
    expect(p.principal2.detail).toMatch(/kiné d'abord/);
  });

  it("envie de l'athlète : appoint, ou principal 2 s'il insiste", () => {
    expect(plan({ wish: "SkiErg" }).appoint.items).toContain("SkiErg (envie de l'athlète)");
    const p = plan({ wish: "SkiErg", insists: true });
    expect(p.principal2).toMatchObject({ from: "wish", label: "SkiErg (envie de l'athlète)" });
  });

  it("duo : les stations qu'il ne fait pas passent en entretien", () => {
    const p = plan({ duo: true, duo_stations: ["BBJ", "Fentes"] });
    expect(row(p, "Wall balls").role).toBe("Entretien");
    expect(row(p, "BBJ").role).toBe("Principal 2");
  });

  it("textes affichés : jamais « moteur », jamais « le HYROX »", () => {
    const all = JSON.stringify([plan({ first_hyrox: true }), analyzeTests(GOLDEN1, PROFILE).scores.measures]);
    expect(all).not.toMatch(/moteur/i);
    expect(all).not.toMatch(/le HYROX/);
    expect(all).not.toMatch(/2RSPORT|Rivet/i);
  });
});

// ── Cas limites ─────────────────────────────────────────────────────────────
describe("cas limites", () => {
  it("2 points de course suffisent, et c'est signalé", () => {
    const out = analyzeTests({ run_1200m: { duration_s: 270 }, run_12min: { distance_m: 2750 } }, PROFILE);
    expect(out.scores.running.n_points).toBe(2);
    expect(out.scores.running.cs_kmh).not.toBeNull();
    expect(out.scores.measures.find(m => m.key === "cs")!.label).toMatch(/2 points/);
  });

  it("entrées vides : « — », jamais NaN", () => {
    const out = analyzeTests({}, PROFILE);
    const txt = JSON.stringify(out);
    expect(txt).not.toMatch(/NaN|Infinity/);
    expect(out.scores.measures.every(m => m.value == null && m.display.startsWith("—"))).toBe(true);
    expect(out.scores.axes.every(a => a.score == null)).toBe(true);
    expect(out.chrono).toBeNull();
    expect(analyzeTests({}, PROFILE, { target_s: 5400, context: CTX0 }).axes_plan).toBeNull();
  });

  it("E proche de 1 : durée tenable finie", () => {
    // vitesse quasi constante sur les 3 efforts -> E ≈ 1
    const R = analyzeRunning([{ duration_s: 300, distance_m: 1000 }, { duration_s: 600, distance_m: 1999 }, { duration_s: 900, distance_m: 2997 }], GRID_SET_V1.running);
    expect(R.e).toBeGreaterThan(0.99);
    expect(R.s1_factor).toBe(0.85);
    expect(R.pct_vc_table.every(x => x.sustain_s == null || Number.isFinite(x.sustain_s))).toBe(true);
    expect(JSON.stringify(R)).not.toMatch(/NaN/);
  });

  it("Vmax saisie : réserve de vitesse et profil", () => {
    const R = analyzeRunning([pointFromPace(270, 225), pointFromPace(360, 235), pointFromPace(720, 262)], GRID_SET_V1.running, { vmax_kmh: 28 });
    expect(R.speed_reserve!.reserve_kmh).toBeCloseTo(28 - R.cs_kmh!, 6);
    expect(R.profile).toBe("vitesse"); // E 0,84 ≤ 0,85 et Vmax > 27
  });
});

describe("sled", () => {
  it("profil linéaire parfait : R² = 1, L0 exact", () => {
    // v = 2 − 0,01 × charge -> L0 = 200 kg ; temps = 12,5 / v
    const loads = [80, 100, 120];
    const p = sledProfile(100, { times_s: loads.map(l => 12.5 / (2 - 0.01 * l)) as [number, number, number], loads_kg: loads as [number, number, number] });
    if (!p.usable) throw new Error("profil attendu");
    expect(p.l0_kg).toBeCloseTo(200, 6);
    expect(p.r2).toBeCloseTo(1, 9);
    expect(p.reserve).toBeCloseTo(0.5, 9);
    expect(p.low_fit).toBe(false);
  });

  it("R² faible : signalé", () => {
    const p = sledProfile(100, { times_s: [10, 9, 14] });
    if (!p.usable) throw new Error("profil attendu");
    expect(p.low_fit).toBe(true);
  });

  it("pente non négative : pas de note", () => {
    const p = sledProfile(100, { times_s: [12, 10, 9] });
    expect(p).toMatchObject({ usable: false, reason: "slope_not_negative" });
    const out = analyzeTests({ ...GOLDEN1, sled_push: { times_s: [12, 10, 9] } }, PROFILE);
    expect(noteOf(out.scores, "sled_push_reserve")).toBeNull();
    expect(out.scores.measures.find(m => m.key === "sled_push_reserve")!.display).toMatch(/non exploitable/);
  });

  it("2 points suffisent", () => {
    const p = sledProfile(152, { times_s: [7.5, 10, null] });
    expect(p.usable && p.two_points).toBe(true);
  });

  it("semaine 1 : vitesse moyenne, chutes", () => {
    const w = sledWeek1([[2.5, 2.6, 2.8, 3.0], [2.6, 2.8, 3.0, 3.3], [2.7, 3.0, 3.3, 3.6]], 1.25)!;
    expect(w.rep_speeds[0]).toBeCloseTo(50 / 10.9, 6);
    expect(w.intra_drop[0]).toBeCloseTo(2.5 / 3.0, 6);
    expect(w.worst_intra_drop).toBeCloseTo(2.7 / 3.6, 6);
    expect(w.between_reps_drop).toBeCloseTo(10.9 / 12.6, 6);
    expect(w.vs_fresh).toBeCloseTo(w.mean_speed! / 1.25, 6);
  });

  it("semaine 1 : chute malgré bonne réserve -> règle à recaler", () => {
    const out = analyzeTests({ ...GOLDEN1, week1_sled_push: [[2.5, 2.6, 2.8, 3.2]] }, PROFILE);
    const r = out.rules.find(x => x.id === "sled_push_endf");
    expect(r?.to_recalibrate).toBe(true);
  });
});

describe("versions de grille", () => {
  it("une ancienne analyse reste lisible, un recalcul en crée une nouvelle", () => {
    const frozen = JSON.parse(JSON.stringify(GOLDEN1));
    const v1 = analyzeTests(GOLDEN1, PROFILE);
    const v2set: GridSet = {
      ...GRID_SET_V1,
      version: "v2",
      rows: GRID_SET_V1.rows.map(r => (r.metric_key === "dead_hang" ? { ...r, thresholds: [40, 70, 100, 130] as [number, number, number, number] } : r)),
    };
    const v2 = analyzeTests(GOLDEN1, PROFILE, { set: v2set });
    expect(GOLDEN1).toEqual(frozen); // entrées brutes jamais modifiées
    expect(v1.grid_version).toBe("v1");
    expect(v2.grid_version).toBe("v2");
    expect(noteOf(v1.scores, "dead_hang")).toBe(3);
    expect(noteOf(v2.scores, "dead_hang")).toBe(3);
    expect(axisScore(v1.scores, "grip")).toBe(3);
    const v3set: GridSet = { ...v2set, version: "v3", rows: v2set.rows.map(r => (r.metric_key === "dead_hang" ? { ...r, thresholds: [80, 90, 100, 130] as [number, number, number, number] } : r)) };
    const v3 = analyzeTests(GOLDEN1, PROFILE, { set: v3set });
    expect(noteOf(v3.scores, "dead_hang")).toBe(1);
    expect(noteOf(v1.scores, "dead_hang")).toBe(3); // l'analyse v1 n'a pas bougé
  });
});
