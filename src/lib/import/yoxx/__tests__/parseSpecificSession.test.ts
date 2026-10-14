import { describe, it, expect } from "vitest";
import { parseSpecificSession } from "../parseSpecificSession";
import type { ClassiqueBlock, WodBlock } from "@/types/specific";
import type { EnergyGroup, ExerciseInterval } from "@/types/energy";

function ids() {
  let i = 0;
  return () => `id${++i}`;
}
const parse = (t: string) => parseSpecificSession(t, { genId: ids() });

const COMPROMISED = `
SÉANCE SPÉCIFIQUE : Compromised Run
SPORT : Hyrox
QUALITÉ : Compromised
CONSIGNE : Wall balls toujours avec une box dessous.

BLOC CLASSIQUE : Échauffement en autonomie | Mobilisation + Run + Force progressive + stimulation cardiaque
- Mobilisation + Run + Force progressive : 4x30m, 5x8, 3' | repos 1' | à ton rythme

BLOC WOD : Compromised SPush + Run + WB | décrément < 1'15
GROUPE x6
  EXO Sled Push 15m @110kg | Buste un peu plus haut
  EFFORT 600m [Course] @ 4'45/km
  EXO Wall Ball Shot 10 reps @6kg
  RÉCUP 2' [Course] | Footing léger permet de récup
FIN
`;

describe("parseSpecificSession — Compromised (capture)", () => {
  const { session, wodExercises, classiqueItems, issues } = parse(COMPROMISED);

  it("aucune erreur", () => expect(issues).toEqual([]));

  it("en-têtes", () => {
    expect(session).toMatchObject({ name: "Compromised Run", sportName: "Hyrox", qualityName: "Compromised", notes: "Wall balls toujours avec une box dessous." });
  });

  it("bloc classique : consigne + item (prescription, repos, notes)", () => {
    const b = session.blocks[0] as ClassiqueBlock;
    expect(b).toMatchObject({ kind: "classique", title: "Échauffement en autonomie", instructions: "Mobilisation + Run + Force progressive + stimulation cardiaque" });
    expect(b.items[0]).toMatchObject({ name: "Mobilisation + Run + Force progressive", prescription: "4x30m, 5x8, 3'", rest: "1'", notes: "à ton rythme" });
    expect(classiqueItems).toHaveLength(1);
  });

  it("bloc WOD : groupe, exercices avec distance / reps / charge, intervalles", () => {
    const b = session.blocks[1] as WodBlock;
    expect(b).toMatchObject({ kind: "wod", title: "Compromised SPush + Run + WB", instructions: "décrément < 1'15" });
    const g = b.steps[0] as EnergyGroup;
    expect(g.repeat).toBe(6);
    expect(g.children.map((c) => c.type)).toEqual(["exercise", "interval", "exercise", "interval"]);
    expect(g.children[0]).toMatchObject({ exercise_name: "Sled Push", duration: { kind: "distance", value: 15 }, weight_kg: 110, weight_unit: "kg", notes: "Buste un peu plus haut" });
    expect((g.children[0] as ExerciseInterval).reps_min).toBeUndefined();
    expect(g.children[1]).toMatchObject({ role: "work", equipment: "course", duration: { kind: "distance", value: 600 }, target: { kind: "pace", min_s_per_unit: 285 } });
    expect(g.children[2]).toMatchObject({ exercise_name: "Wall Ball Shot", reps_min: 10, weight_kg: 6 });
    expect(wodExercises.map((e) => e.name)).toEqual(["Sled Push", "Wall Ball Shot"]);
  });
});

describe("parseSpecificSession — variantes EXO", () => {
  const ex = (line: string) => {
    const r = parse(`SÉANCE SPÉCIFIQUE : T\nSPORT : Hyrox\nBLOC WOD : W\n${line}`);
    return { ex: (r.session.blocks[0] as WodBlock).steps[0] as ExerciseInterval, issues: r.issues };
  };
  it("formes acceptées", () => {
    expect(ex("EXO Burpee broad jump : 20m").ex).toMatchObject({ exercise_name: "Burpee broad jump", duration: { kind: "distance", value: 20 } });
    expect(ex("EXO Wall ball : 15").ex).toMatchObject({ reps_min: 15 });
    expect(ex("EXO Pull-up 8-10 reps @PDC").ex).toMatchObject({ reps_min: 8, reps_max: 10, weight_unit: "bw" });
    expect(ex("EXO Gainage 45\"").ex).toMatchObject({ duration: { kind: "time", value: 45 } });
    expect(ex("EXO SkiErg 15cal").ex).toMatchObject({ duration: { kind: "calories", value: 15 } });
    expect(ex("EXO Squat 10 reps @75%").ex).toMatchObject({ weight_kg: 75, weight_unit: "pct_rm" });
    expect(ex("EXO Dips 10 reps @PDC+10kg").ex).toMatchObject({ weight_kg: 10, weight_unit: "bw" });
  });
  it("charge inconnue → consigne + avertissement ; quantité absente → avertissement", () => {
    const a = ex("EXO Farmers carry 200m @2x24kg");
    expect(a.ex.notes).toBe("Charge : 2x24kg");
    expect(a.issues.some((i) => i.level === "warning" && i.line === 4)).toBe(true);
    expect(ex("EXO Burpees").issues.some((i) => i.level === "warning")).toBe(true);
  });
});

describe("parseSpecificSession — robustesse", () => {
  it("lignes avant tout BLOC → bloc créé automatiquement", () => {
    const r = parse("SÉANCE SPÉCIFIQUE : T\nEFFORT 400m @ Z4\nBLOC CLASSIQUE : C\nMobilité 5'");
    expect(r.session.blocks.map((b) => b.kind)).toEqual(["wod", "classique"]);
    expect((r.session.blocks[1] as ClassiqueBlock).items[0]).toMatchObject({ name: "Mobilité 5'" });
    expect(r.issues.some((i) => i.level === "warning" && i.line === 2)).toBe(true);
  });
  it("groupe non fermé dans un bloc WOD → fermé à la fin du bloc", () => {
    const r = parse("SÉANCE SPÉCIFIQUE : T\nSPORT : X\nBLOC WOD : A\nGROUPE x3\nEFFORT 1'\nBLOC WOD : B\nEFFORT 2'");
    expect((r.session.blocks[0] as WodBlock).steps).toHaveLength(1);
    expect((r.session.blocks[1] as WodBlock).steps).toHaveLength(1);
    expect(r.issues.some((i) => i.message.includes("jamais fermé"))).toBe(true);
  });
  it("refuse une séance muscu", () => {
    const r = parse("SÉANCE MUSCU : FB1\nA1 Squat : 3×5");
    expect(r.session.blocks).toEqual([]);
    expect(r.issues[0].message).toContain("MUSCU");
  });
});
