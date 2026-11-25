import { describe, expect, it } from "vitest";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import type { EnergyStep } from "@/types/energy";
import { buildMuscuShare, sessionRecords, setLabel, setsSummary, type MuscuShareInput } from "../buildMuscuShare";
import { buildEnergyShare, type EnergyShareInput } from "../buildEnergyShare";
import { coachLabel, DEFAULT_SHARE_OPTIONS, defaultObjectiveId, firstNameOf, objectiveChoices, shareDayLabel, shareObjective, type ShareCard } from "../sessionShare";
import { CARD_H, CARD_W, layoutShareCard, opBounds, type FontSpec, type Measure } from "../shareLayout";

const measure: Measure = (t: string, f: FontSpec) => Array.from(t).length * f.size * (f.family === "data" ? 0.62 : f.wide ? 0.82 : 0.56) + (f.spacing ?? 0) * Math.max(0, Array.from(t).length - 1);
const PAL = { bg: "#000", s1: "#111", s2: "#222", tx: "#fff", tx2: "#aaa", brd: "#333", onAccent: "#000", gold: "#FC3" };

function fits(c: ShareCard) {
  const out = layoutShareCard(c, measure, PAL);
  for (const o of out.ops) {
    const b = opBounds(o, measure);
    expect(b.x0).toBeGreaterThanOrEqual(-0.5);
    expect(b.x1).toBeLessThanOrEqual(CARD_W + 0.5);
    expect(b.y1).toBeLessThanOrEqual(CARD_H + 0.5);
  }
  return out;
}

const params = (o: Partial<ExerciceParams> = {}): ExerciceParams => ({
  nb_series: 5, reps: { mode: "global", value: 3 }, reps_mode: { mode: "global", value: "EC" }, charge_unit: "kg",
  charge: { mode: "global", value: 120 }, rir: { mode: "global", value: 2 }, tempo: { mode: "global", value: "" }, ...o,
});

const muscu = (o: Partial<MuscuShareInput> = {}): MuscuShareInput => ({
  done: false, day: "2026-11-25", title: "Squat & chaîne postérieure", weekNumber: 3,
  blocs: [
    { name: "Échauffement", color: "#999", exercices: [{ id: "w1", exercise_name: "Goblet squat", params: params(), mode: "classique" }] },
    { name: "Force", color: "#F53", exercices: [{ id: "a", exercise_name: "Back squat", params: params(), mode: "classique" }] },
    { name: "Hypertrophie", color: "#FC3", exercices: [
      { id: "b1", exercise_name: "Soulevé de terre roumain", params: params({ nb_series: 4, charge_unit: "%RM", charge: { mode: "global", value: 75 }, tempo: { mode: "global", value: "3-1-1" } }), mode: "classique" },
      { id: "b2", exercise_name: "Hip thrust", params: params({ nb_series: 4 }), mode: "classique" },
    ] },
  ],
  oneRmByEx: { b1: 120 },
  athleteFirstName: "Léa", coach: "Hugo T.", accent: "#FC3", successColor: "#6F3", ...o,
});

describe("noms et dates", () => {
  it("coach : prénom + initiale", () => {
    expect(coachLabel("Hugo Tanguy")).toBe("Hugo T.");
    expect(coachLabel("  hugo  de tanguy ")).toBe("hugo T.");
    expect(coachLabel("Hugo")).toBe("Hugo");
    expect(coachLabel("")).toBeNull();
    expect(coachLabel(null)).toBeNull();
  });
  it("prénom de l'athlète", () => {
    expect(firstNameOf("Léa", "Léa Démo")).toBe("Léa");
    expect(firstNameOf(null, "Léa Démo")).toBe("Léa");
    expect(firstNameOf(" ", null)).toBeNull();
  });
  it("jour court en français", () => {
    expect(shareDayLabel("2026-11-25")).toBe("mer. 25 nov.");
    expect(shareDayLabel("n'importe quoi")).toBeNull();
  });
});

describe("muscu", () => {
  it("prévue : échauffement à part, lettres de bloc, %RM converti en kg", () => {
    const c = buildMuscuShare(muscu(), DEFAULT_SHARE_OPTIONS);
    expect(c.kicker).toBe("Musculation · mer. 25 nov.");
    expect(c.who).toBe("Séance de Léa");
    expect(c.sections[0]).toMatchObject({ type: "note", text: "Goblet squat" });
    const rows = (c.sections[1] as Extract<ShareCard["sections"][number], { type: "rows" }>).rows;
    expect(rows.map((r) => r.badge?.text)).toEqual(["A", "B1", "B2"]);
    expect(rows[0]).toMatchObject({ right: "5 × 3", rightSub: "120 kg" });
    expect(rows[1]).toMatchObject({ rightSub: "90 kg", sub: "tempo 3-1-1" });
    expect(c.stats).toEqual([]);
    expect(c.footerRight).toBe("Ma séance du jour");
    fits(c);
  });

  it("prévue sans charges ni prénom ni coach", () => {
    const c = buildMuscuShare(muscu(), { showName: false, showLoads: false, showCoach: false });
    const rows = (c.sections[1] as Extract<ShareCard["sections"][number], { type: "rows" }>).rows;
    expect(rows[0].rightSub).toBe("RIR 2");
    expect(c.who).toBeNull();
    expect(c.coach).toBeNull();
  });

  it("faite : pastilles, séries faites, RPE, record en or, jamais de tonnage", () => {
    const s = (kg: string, reps: string, done = true) => ({ kg, reps, done });
    const c = buildMuscuShare(muscu({
      done: true, rpe: 8, comment: "Jambes cuites",
      sets: { a: [s("120", "3"), s("120", "3"), s("125", "3"), s("125", "3"), s("125", "3")], b1: [s("80", "8"), s("", "", false)], b2: [] },
      records: { a: { kg: 125, reps: 3 } },
    }), DEFAULT_SHARE_OPTIONS);
    const rows = (c.sections[1] as Extract<ShareCard["sections"][number], { type: "rows" }>).rows;
    expect(rows[0].pills?.map((p) => p.text)).toEqual(["120×3", "120×3", "125×3", "125×3", "125×3"]);
    expect(rows[0].pills?.filter((p) => p.strong)).toHaveLength(1);
    expect(rows[0].tag).toBe("Record");
    expect(rows[2]).toMatchObject({ dim: true, sub: "Pas faite" });
    expect(c.stats.map((x) => x.label)).toEqual(["Séries", "RPE", "Record"]);
    expect(c.stats[0]).toMatchObject({ value: "6", unit: "/11" });
    expect(JSON.stringify(c)).not.toMatch(/tonnage/i);
    expect(c.quote).toBe("Jambes cuites");
    fits(c);
  });

  it("libellés de série", () => {
    expect(setLabel({ kg: "122,5", reps: "3", done: true }, false, true)).toBe("122,5×3");
    expect(setLabel({ kg: "122,5", reps: "3", done: true }, false, false)).toBe("3 reps");
    expect(setLabel({ kg: "", reps: "30", done: true }, true, true)).toBe("30 s");
    expect(setLabel({ kg: "", reps: "", done: true }, false, true)).toBeNull();
    expect(setsSummary([{ kg: "120", reps: "3", done: true }, { kg: "125", reps: "3", done: true }], false, true)).toBe("2 séries · 120 → 125 kg × 3");
    expect(setsSummary([{ kg: "", reps: "8", done: true }, { kg: "", reps: "10", done: true }], false, true)).toBe("2 séries · 8-10 reps");
  });

  it("40 exercices de 12 séries : la carte tient", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, exercise_name: `Exercice au nom particulièrement long numéro ${i}`, params: params({ nb_series: 12 }), mode: "classique" as const }));
    const sets = Object.fromEntries(many.map((e) => [e.id, Array.from({ length: 12 }, () => ({ kg: "142,5", reps: "12", done: true }))]));
    const out = fits(buildMuscuShare(muscu({ done: true, blocs: [{ name: "Gros bloc", color: "#F53", exercices: many }], sets }), DEFAULT_SHARE_OPTIONS));
    expect(out.hidden).toBeGreaterThan(0);
  });
});

const iv = (id: string, role: "warmup" | "work" | "recovery" | "cooldown", s: number, zone: number): EnergyStep => ({
  type: "interval", id, role, duration: { kind: "time", value: s }, target: { kind: "hr_zone", zone } as never,
});
const seuil: EnergyStep[] = [
  iv("w", "warmup", 900, 2),
  { type: "group", id: "g", role: "work", repeat: 5, children: [iv("r", "work", 360, 4)], rest_between: iv("rc", "recovery", 120, 1) as never } as EnergyStep,
  iv("c", "cooldown", 600, 1),
];
const energy = (o: Partial<EnergyShareInput> = {}): EnergyShareInput => ({
  kind: "energie", done: false, day: "2026-11-27",
  session: { name: "Seuil 5 × 6 min", intervals: seuil, total_duration_s: 3780, total_distance_m: 13000 },
  athleteFirstName: "Léa", coach: "Hugo T.", accent: "#3BF",
  colors: { tint: (t) => (t.kind === "zone" ? `#z${t.zone}` : "#rec"), zones: (n) => Array.from({ length: n }, (_, i) => `#Z${i + 1}`), success: "#6F3", error: "#F53", muted: "#888" },
  ...o,
});

describe("énergie", () => {
  it("prévue : profil + déroulé", () => {
    const c = buildEnergyShare(energy(), DEFAULT_SHARE_OPTIONS);
    expect(c.kicker).toBe("Énergie · ven. 27 nov.");
    expect(c.meta).toBe("≈ 1 h 03 · ≈ 13 km");
    expect(c.sections.map((s) => s.type)).toEqual(["profile", "rows"]);
    fits(c);
  });

  it("faite avec montre : distance en gros, allure de chaque répétition, zones", () => {
    const laps = [
      { name: "Échauffement", kind: "run" as const, durationS: 900, distanceM: 2800, avgPaceSPerKm: 321, phase: "warmup" as const },
      ...[232, 234, 233, 231, 227].map((p, i) => ({ name: `Rep ${i + 1}`, kind: "run" as const, durationS: 360, distanceM: 1550, avgPaceSPerKm: p, phase: "work" as const })),
    ];
    const c = buildEnergyShare(energy({
      done: true, rpe: 7, laps, source: "Garmin Forerunner 265",
      activity: { distanceM: 13200, durationS: 3790, avgPaceSPerKm: 287, avgHr: 162, isRun: true, zoneShares: [17, 22, 10, 46, 5] },
    }), DEFAULT_SHARE_OPTIONS);
    // Attribution obligatoire des données de montre.
    expect(c.meta?.startsWith("Garmin Forerunner 265")).toBe(true);
    expect(c.hero).toMatchObject({ value: "13,2", unit: "km", caption: "en 1:03:10" });
    expect(c.stats.map((s) => s.label)).toEqual(["Allure moy.", "Moy. reps", "RPE"]);
    const prof = c.sections.find((s) => s.type === "profile") as Extract<ShareCard["sections"][number], { type: "profile" }>;
    expect(prof.bars.filter((b) => b.label).map((b) => b.label)).toEqual(["3:52", "3:54", "3:53", "3:51", "3:47"]);
    const z = c.sections.find((s) => s.type === "zones") as Extract<ShareCard["sections"][number], { type: "zones" }>;
    expect(z.zones.map((x) => x.value)).toEqual(["11'", "14'", "6'", "29'", "3'"]);
    fits(c);
  });

  it("faite avec montre mais tours qui ne correspondent pas : pas d'allure par répétition", () => {
    const c = buildEnergyShare(energy({
      done: true,
      laps: [{ name: "1", kind: "run", durationS: 600, distanceM: 2000, avgPaceSPerKm: 300, phase: "work" }],
      activity: { distanceM: 13200, durationS: 3790, avgPaceSPerKm: 287, avgHr: null, isRun: true, zoneShares: null },
    }), DEFAULT_SHARE_OPTIONS);
    const prof = c.sections.find((s) => s.type === "profile") as Extract<ShareCard["sections"][number], { type: "profile" }>;
    expect(prof.bars.some((b) => b.label)).toBe(false);
    expect(c.sections.some((s) => s.type === "rows")).toBe(true);
  });

  it("faite sans montre : déroulé coché, durée et RPE saisis", () => {
    const c = buildEnergyShare(energy({ done: true, rpe: 6, durationMin: 65, blockLogs: { "r__r0": { done: true }, "r__r1": { done: false } } as never }), DEFAULT_SHARE_OPTIONS);
    expect(c.stats.map((s) => s.label)).toEqual(["Durée", "RPE"]);
    const rows = (c.sections.find((s) => s.type === "rows") as Extract<ShareCard["sections"][number], { type: "rows" }>).rows;
    expect(rows.map((r) => r.badge?.shape)).toEqual(["check", "check", "check"]);
    expect(rows[1].sub).toMatch(/en partie/);
    fits(c);
  });
});

describe("spécifique", () => {
  it("HYROX fait avec montre : temps total, segments, écart au prévu, roxzone", () => {
    const c = buildEnergyShare(energy({
      kind: "specifique", done: true, rpe: 9,
      session: { name: "Demi-simulation HYROX", intervals: [], total_duration_s: null, total_distance_m: null },
      activity: { distanceM: 4000, durationS: 2036, avgPaceSPerKm: null, avgHr: 170, isRun: false, zoneShares: null },
      laps: [
        { name: "Run 1", kind: "run", durationS: 242, distanceM: 1000, avgPaceSPerKm: 242, plannedDurationS: 245 },
        { name: "SkiErg", kind: "station", durationS: 258, distanceM: 1000, avgPaceSPerKm: null, plannedLabel: "1 000 m", plannedDurationS: 250 },
        { name: "Roxzone", kind: "transition", durationS: 72, distanceM: null, avgPaceSPerKm: null },
      ],
    }), DEFAULT_SHARE_OPTIONS);
    expect(c.kicker).toBe("Faite · ven. 27 nov.");
    expect(c.hero?.value).toBe("33:56");
    expect(c.stats.map((s) => s.label)).toEqual(["Courses", "Stations", "RPE"]);
    const rows = (c.sections[0] as Extract<ShareCard["sections"][number], { type: "rows" }>).rows;
    expect(rows.map((r) => r.rightSub)).toEqual(["−3 s", "+8 s"]);
    expect(c.footerRight).toBe("Roxzone 1:12");
    fits(c);
  });

  it("classique prévue puis faite sans montre (bloc non fait grisé)", () => {
    const session = {
      name: "Force athlétique", intervals: [], total_duration_s: 3600, total_distance_m: null, format: "classique",
      classique_structure: { blocks: [
        { id: "b1", title: "Sprint", items: [{ id: "i1", name: "Départ 3 appuis", prescription: "6 × 30 m", rest: "2'" }] },
        { id: "b2", title: "Bondissements", items: [{ id: "i2", name: "Haies basses", prescription: "4 × 8" }] },
      ] },
    };
    const planned = buildEnergyShare(energy({ kind: "specifique", session }), DEFAULT_SHARE_OPTIONS);
    expect(planned.sections.map((s) => (s as { label?: string }).label)).toEqual(["Sprint", "Bondissements"]);
    const done = buildEnergyShare(energy({ kind: "specifique", session, done: true, blockLogs: { b2: { done: false } } as never }), DEFAULT_SHARE_OPTIONS);
    const second = (done.sections[1] as Extract<ShareCard["sections"][number], { type: "rows" }>).rows[0];
    expect(second).toMatchObject({ dim: true, badge: { shape: "miss" } });
    fits(done);
  });
});

describe("sessionRecords", () => {
  const sets = { a: [{ kg: "120", reps: "3", done: true }, { kg: "125", reps: "3", done: true }], b: [{ kg: "80", reps: "5", done: false }] };
  const refs = { a: "Squat", b: "Bench" };
  it("record du jour lié à une série faite", () => {
    const logs = [{ exercise_ref: "Squat", source: "computed", date: "2026-11-25", source_kg: 125, source_reps: 3 }];
    expect(sessionRecords(logs, refs, sets, ["2026-11-25"])).toEqual({ a: { kg: 125, reps: 3 } });
  });
  it("ignore autre jour, record manuel, série non faite ou sans correspondance", () => {
    const logs = [
      { exercise_ref: "Squat", source: "computed", date: "2026-11-20", source_kg: 125, source_reps: 3 },
      { exercise_ref: "Squat", source: "manual", date: "2026-11-25", source_kg: 125, source_reps: 3 },
      { exercise_ref: "Squat", source: "computed", date: "2026-11-25", source_kg: 130, source_reps: 3 },
      { exercise_ref: "Bench", source: "computed", date: "2026-11-25", source_kg: 80, source_reps: 5 },
    ];
    expect(sessionRecords(logs, refs, sets, ["2026-11-25", null])).toEqual({});
    expect(sessionRecords(null, refs, sets, ["2026-11-25"])).toEqual({});
  });
});

describe("objectif (compétition visée)", () => {
  const comps = [
    { id: "old", name: "Cross", date: "2026-11-01", priority: "A" },
    { id: "c", name: "Trail", date: "2027-03-01", priority: "C" },
    { id: "x", name: "Annulée", date: "2026-12-01", priority: "A", cancelled_at: "2026-11-02" },
    { id: "a", name: "HYROX Paris", date: "2027-05-24", priority: "A" },
    { id: "multi", name: "Stage", date: "2026-11-24", date_end: "2026-11-26", priority: "B" },
  ];
  it("choix : maintenues, pas terminées le jour de la séance, par date ; A proposée d'office", () => {
    const ch = objectiveChoices(comps, "2026-11-25");
    expect(ch.map((c) => c.id)).toEqual(["multi", "c", "a"]);
    expect(defaultObjectiveId(ch)).toBe("a");
    expect(defaultObjectiveId(ch.filter((c) => c.id !== "a"))).toBe("multi");
    expect(objectiveChoices(comps, null)).toEqual([]);
    expect(defaultObjectiveId([])).toBeNull();
  });
  it("compte à rebours depuis le jour de la séance", () => {
    expect(shareObjective(comps[3], "2026-11-25")).toEqual({ countdown: "J-180", name: "HYROX Paris", date: "lun. 24 mai 2027" });
    expect(shareObjective({ id: "t", name: "Test", date: "2026-11-26" }, "2026-11-25")?.countdown).toBe("J-1");
    expect(shareObjective(comps[4], "2026-11-25")?.countdown).toBe("Jour J");
    expect(shareObjective({ id: "t", name: "  ", date: "2026-12-24" }, "2026-11-25")).toEqual({ countdown: "J-29", name: "Compétition", date: "jeu. 24 déc." });
    expect(shareObjective(comps[0], "2026-11-25")).toBeNull();
  });
});
