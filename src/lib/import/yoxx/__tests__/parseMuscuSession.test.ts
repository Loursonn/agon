import { describe, it, expect } from "vitest";
import { parseMuscuSession, parsePrescription, deriveShort } from "../parseMuscuSession";
import { matchExercise, similarity } from "../matchExercise";
import { resolveMuscuImport, type MethodRef } from "../resolveMuscuImport";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";

function ids() {
  let i = 0;
  return () => `id${++i}`;
}
const parse = (t: string) => parseMuscuSession(t, { genId: ids() });

describe("parsePrescription", () => {
  const p = (s: string) => parsePrescription(s);

  it("séries × reps, fourchette, par série", () => {
    expect(p("3×8").params).toMatchObject({ nb_series: 3, reps: { mode: "global", value: 8 } });
    expect(p("3x8-10").params).toMatchObject({ reps: { value: 8 }, reps_max: { value: 10 } });
    expect(p("4×10/8/6/6").params?.reps).toEqual({ mode: "par_serie", values: [10, 8, 6, 6] });
  });

  it("charges, RIR, tempo, ISO", () => {
    expect(p("3×8 @75%").params).toMatchObject({ charge_unit: "%RM", charge: { mode: "global", value: 75 } });
    expect(p("3×8 @ 80kg").params).toMatchObject({ charge_unit: "kg", charge: { value: 80 } });
    expect(p("3×8 @PDC").params).toMatchObject({ charge_unit: "PDC" });
    expect(p("3×8 @77,5%").params?.charge).toEqual({ mode: "global", value: 77.5 });
    expect(p("4×10/8/6/6 @70/75/80/80%").params?.charge).toEqual({ mode: "par_serie", values: [70, 75, 80, 80] });
    expect(p("3×8 RIR 2").params?.rir).toEqual({ mode: "global", value: 2 });
    expect(p("3×8 RIR 3/2/1").params?.rir).toEqual({ mode: "par_serie", values: [3, 2, 1] });
    expect(p("3×6 tempo 3-0-1").params?.tempo).toEqual({ mode: "global", value: "3-0-1" });
    expect(p("3×6 tempo 42x").params?.tempo).toEqual({ mode: "global", value: "42X" });
    expect(p("3×6 tempo 3010").params?.tempo).toEqual({ mode: "global", value: "3010" });
    expect(p("3×20\" ISO").params).toMatchObject({ reps: { value: 20 }, reps_mode: { value: "iso" } });
    expect(p("3×20\"").params?.reps_mode).toEqual({ mode: "global", value: "iso" });
  });

  it("RPE → RIR (RIR = 10 − RPE)", () => {
    const r = p("3×8 RPE 8");
    expect(r.params?.rir).toEqual({ mode: "global", value: 2 });
    expect(r.notes[0].level).toBe("info");
    expect(p("3×8 RPE 5-6").params?.rir).toEqual({ mode: "global", value: 4 });
  });

  it("cluster 3×(3+3) R15\"", () => {
    const r = p("3×(3+3) R15\" @PDC RIR 3");
    expect(r.params).toMatchObject({
      nb_series: 3, charge_unit: "PDC", rir: { value: 3 },
      cluster: { nb_clusters: 2, reps: [3, 3], recup_sec: 15 },
    });
    expect(r.notes).toEqual([]);
    expect(p("4×(2+2+2) R20s").params?.cluster).toEqual({ nb_clusters: 3, reps: [2, 2, 2], recup_sec: 20 });
  });

  it("méthode + séries concernées", () => {
    const r = p('3×6 @75% RIR 2 méthode "Double contraction" sur séries 2-3');
    expect(r.methodName).toBe("Double contraction");
    expect(r.methodSets).toEqual([2, 3]);
    expect(r.params?.nb_series).toBe(3);
    const only = p('méthode "5x5 -> 8x8"');
    expect(only.methodName).toBe("5x5 -> 8x8");
    expect(only.params).toBeNull();
    expect(p("4×AMRAP").methodName).toBe("AMRAP");
  });

  it("libre", () => {
    expect(p('libre "6\' RACs"').libre).toBe("6' RACs");
    expect(p("libre 4 fois 10m").libre).toBe("4 fois 10m");
  });

  it("texte non compris → gardé en commentaire avec avertissement", () => {
    const r = p("3×8 lentement");
    expect(r.extra).toBe("lentement");
    expect(r.notes[0].level).toBe("warning");
  });
});

const FB2 = `
SÉANCE MUSCU : Full body 2
ABRÉGÉ : FB2
JOUR : Vendredi
CONSIGNE : Easy day, lendemain du compromised.

BLOC Échauffement [Echauffement] repos libre
A1 RACs hanche, cheville, épaule : libre "6'"
A2 Mobilité thoracique : libre "4' — extension sur banc, rotations en quadrupédie"

BLOC A [Force] repos 2' | Amplitude sans douleur
A1.1 Split squat haltères | Par jambe.
  S1 : 3×8 RIR 3
  S2 : 4×8 RIR 3
  S3 : 4×8 RIR 2
A1.2 Développé militaire haltères : 3×8 RIR 4

BLOC B [Force] départ 2'30 3 séries
B1.1 Hip thrust : 3×10 RIR 4 | Pause 2" en haut.
B1.2 Rowing haltère : 3×10 RIR 4 | Par bras.

BLOC C [Mixte]
C1.1 Abduction de hanche élastique : 3×15 | Par côté.
C1.2 Copenhagen plank levier court : 3×20" ISO | Par côté.
C2 Extension lombaire banc 45° (ou GHD) : 3×12-15
`;

describe("parseMuscuSession — Full body 2 d'Eva", () => {
  const { session, refs, issues } = parse(FB2);

  it("aucune erreur", () => {
    expect(issues.filter((i) => i.level !== "info")).toEqual([]);
  });

  it("en-têtes", () => {
    expect(session).toMatchObject({ name: "Full body 2", short: "FB2", day_of_week: 4, recurrence: "weekly", multi_semaine: true, nb_semaines: 3 });
  });

  it("blocs : nom, catégorie, timing, séries, consignes", () => {
    expect(session.blocs.map((b) => b.name)).toEqual(["Échauffement", "A", "B", "C"]);
    expect(session.blocs[0]).toMatchObject({ category: "Echauffement", timing_mode: "libre", instructions: "Easy day, lendemain du compromised." });
    expect(session.blocs[1]).toMatchObject({ category: "Force", timing_mode: "repos", timing_repos_min: 2, timing_repos_sec: 0, instructions: "Amplitude sans douleur" });
    expect(session.blocs[2]).toMatchObject({ timing_mode: "depart", timing_depart_min: 2, timing_depart_sec: 30, series_mode: "fixe", series_count: 3 });
    expect(session.blocs[3]).toMatchObject({ category: "Mixte", timing_mode: "libre" });
  });

  it("exercices libres", () => {
    expect(session.blocs[0].exercices[0]).toMatchObject({ mode: "libre", libre_text: "6'", exercise_name: "RACs hanche, cheville, épaule" });
  });

  it("supersets A1.1/A1.2, C1.1/C1.2 mais pas C2", () => {
    const [a11, a12] = session.blocs[1].exercices;
    expect(a11.superset_with_next).toBe(true);
    expect(a12.superset_with_next).toBeUndefined();
    const c = session.blocs[3].exercices;
    expect(c.map((e) => !!e.superset_with_next)).toEqual([true, false, false]);
  });

  it("une ligne par semaine → params par semaine", () => {
    const a11 = session.blocs[1].exercices[0];
    const rec = a11.params as Record<string, ExerciceParams>;
    expect(Object.keys(rec)).toEqual(["1", "2", "3"]);
    expect(rec["1"]).toMatchObject({ nb_series: 3, rir: { value: 3 } });
    expect(rec["2"]).toMatchObject({ nb_series: 4, rir: { value: 3 } });
    expect(rec["3"]).toMatchObject({ nb_series: 4, rir: { value: 2 } });
    expect(a11.comment).toBe("Par jambe.");
    // exercice sans semaines → params simples
    expect((session.blocs[1].exercices[1].params as ExerciceParams).nb_series).toBe(3);
  });

  it("ISO, fourchette, commentaires", () => {
    const cop = session.blocs[3].exercices[1];
    expect(cop.params).toMatchObject({ reps: { value: 20 }, reps_mode: { value: "iso" } });
    expect(cop.comment).toBe("Par côté.");
    expect(session.blocs[3].exercices[2].params).toMatchObject({ reps: { value: 12 }, reps_max: { value: 15 } });
  });

  it("références à résoudre", () => {
    expect(refs).toHaveLength(9);
    expect(refs[0]).toMatchObject({ name: "RACs hanche, cheville, épaule", line: 8 });
  });
});

describe("parseMuscuSession — sans lignes BLOC : blocs déduits des lettres", () => {
  it("A1, A2, B1.1, B1.2 → blocs A et B", () => {
    const { session, issues } = parse("SÉANCE MUSCU : Test\nA1 Squat : 5×5 @80%\nA2 Gainage : 3×30\"\nB1.1 Dips : 3×8\nB1.2 Tractions : 3×6 @PDC");
    expect(issues).toEqual([]);
    expect(session.blocs.map((b) => [b.name, b.exercices.length])).toEqual([["A", 2], ["B", 2]]);
    expect(session.multi_semaine).toBe(false);
  });
});

describe("parseMuscuSession — erreurs : on importe tout ce qui est possible", () => {
  const { session, issues } = parse(`SÉANCE MUSCU : Erreurs
BLOC A [Musculation] repos vite
A1 Squat : beaucoup
A2 Fente :
A3 Curl : 3×10 @80kg lentement
n'importe quoi
S2 : 3×8`);
  const at = (l: number) => issues.filter((i) => i.line === l);

  it("catégorie / repos illisibles → valeurs par défaut", () => {
    expect(at(2).map((i) => i.level).sort()).toEqual(["error", "warning"]);
    expect(session.blocs[0]).toMatchObject({ category: "Mixte", timing_mode: "libre" });
  });
  it("prescription illisible → À SAISIR", () => {
    expect(at(3)[0].level).toBe("error");
    expect(session.blocs[0].exercices[0]).toMatchObject({ mode: "libre", libre_text: "⚠ À SAISIR : beaucoup" });
    expect(at(3)[0].stepId).toBe(session.blocs[0].exercices[0].id);
  });
  it("prescription vide → À SAISIR", () => {
    expect(at(4)[0].level).toBe("error");
    expect(session.blocs[0].exercices[1]).toMatchObject({ mode: "libre", libre_text: "⚠ À SAISIR" });
  });
  it("mot en trop → commentaire", () => {
    expect(at(5)[0].level).toBe("warning");
    expect(session.blocs[0].exercices[2].comment).toBe("lentement");
  });
  it("ligne inconnue → erreur", () => {
    expect(at(6)[0].level).toBe("error");
  });
  it("une semaine sous l'exercice précédent reste rattachée", () => {
    expect(session.multi_semaine).toBe(true);
    expect(session.nb_semaines).toBe(2);
  });
  it("refuse une séance énergétique", () => {
    const r = parse("SÉANCE ÉNERGÉTIQUE : VO2\nEFFORT 400m");
    expect(r.issues[0].message).toContain("ÉNERGÉTIQUE");
    expect(r.session.blocs).toEqual([]);
  });
});

describe("deriveShort", () => {
  it("abrège le titre", () => {
    expect(deriveShort("Full body 2")).toBe("FB2");
    expect(deriveShort("Upper 1")).toBe("U1");
  });
});

describe("matchExercise", () => {
  const lib = [
    { id: "1", name: "Copenhagen plank" },
    { id: "2", name: "Split squat" },
    { id: "3", name: "Hip thrust" },
    { id: "4", name: "Développé militaire haltères" },
    { id: "5", name: "Traction pronation" },
  ];
  it("nom identique (casse / accents / ponctuation ignorés)", () => {
    expect(matchExercise("developpe militaire  HALTERES", lib).exact?.id).toBe("4");
    expect(matchExercise("Hip-thrust", lib).exact?.id).toBe("3");
  });
  it("nom proche proposé", () => {
    const m = matchExercise("Copenhagen plank levier court", lib);
    expect(m.exact).toBeNull();
    expect(m.candidates[0].exercise.id).toBe("1");
    expect(matchExercise("Split squat haltères", lib).candidates[0].exercise.id).toBe("2");
    expect(matchExercise("Tractions pronations", lib).candidates[0].exercise.id).toBe("5");
  });
  it("aucun nom proche → rien", () => {
    expect(matchExercise("Wall ball", lib).candidates).toEqual([]);
  });
  it("similarité", () => {
    expect(similarity("Hip thrust", "hip thrust")).toBe(1);
    expect(similarity("Hip thrust", "Box squat")).toBeLessThan(0.6);
  });
});

describe("resolveMuscuImport", () => {
  const methods: MethodRef[] = [
    { id: "m-dc", name: "Double contraction", scope: "set", config: { scope: "set", sub_sets: { count: { type: "fixed", value: 3 }, reps: { type: "custom", pattern: [5, 5, 5] }, rest_intra: { type: "fixed", seconds: 15 } }, load: { type: "same" }, rir_required: false } },
    { id: "m-55", name: "5x5 -> 8x8", scope: "classic", config: { scope: "classic", sets: { count: 5 }, reps: { type: "fixed", value: 5 }, rest_between: { type: "free" }, load: { type: "same" }, rir_required: false } },
  ];
  const methodToParams = (): ExerciceParams => ({
    nb_series: 5, reps: { mode: "global", value: 5 }, reps_mode: { mode: "global", value: "EC" },
    charge_unit: "kg", charge: { mode: "global", value: null }, rir: { mode: "global", value: null }, tempo: { mode: "global", value: "" },
    cluster: { nb_clusters: 3, reps: [5, 5, 5], recup_sec: 15 },
  });
  const parsed = parse(`SÉANCE MUSCU : M
A1 Leg extension : 3×6 @75% RIR 2 méthode "double contraction" sur séries 2-3
A2 Squat : méthode "5x5 -> 8x8"
A3 Curl : 3×10 méthode "Inconnue"`);
  const { session, issues } = resolveMuscuImport(parsed, {
    exercises: { [parsed.refs[0].exoId]: { id: "ex-le", name: "Leg extension" } },
    methods, methodToParams,
  });
  const [a1, a2, a3] = session.blocs[0].exercices;

  it("lien bibliothèque", () => expect(a1.exercise_id).toBe("ex-le"));

  it("méthode set : params du texte + séries concernées + sous-séries de la méthode", () => {
    expect(a1).toMatchObject({ mode: "methode", methode_id: "m-dc", applied_to_sets: [2, 3] });
    expect(a1.params).toMatchObject({ nb_series: 3, charge: { value: 75 }, cluster: { nb_clusters: 3 } });
  });

  it("méthode seule → paramètres de la méthode", () => {
    expect(a2).toMatchObject({ mode: "methode", methode_id: "m-55", params: { nb_series: 5 } });
  });

  it("méthode introuvable → « méthode non importée » à l'endroit précis", () => {
    expect(a3.mode).toBe("classique");
    expect(a3.comment).toContain("Méthode non importée : Inconnue");
    const err = issues.find((i) => i.level === "error");
    expect(err?.line).toBe(4);
    expect(err?.stepId).toBe(a3.id);
  });
});
