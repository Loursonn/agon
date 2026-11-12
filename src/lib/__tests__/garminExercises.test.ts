import { describe, expect, it } from "vitest";
import { garminLabel, garminQueryFor, isGarminExercise, searchGarminExercises, suggestGarminExercise } from "../garminExercises";

describe("catalogue d'exercices Garmin", () => {
  it("nom lisible", () => {
    expect(garminLabel("BARBELL_BACK_SQUAT")).toBe("Barbell back squat");
  });

  it("recherche par mots, nom exact en premier", () => {
    const r = searchGarminExercises("bench press");
    expect(r[0].category).toBe("BENCH_PRESS");
    expect(searchGarminExercises("barbell back squat")[0]).toMatchObject({ category: "SQUAT", name: "BARBELL_BACK_SQUAT" });
    expect(r.every((o) => o.label.toLowerCase().includes("bench") || o.category.includes("BENCH"))).toBe(true);
  });

  it("vide → rien", () => {
    expect(searchGarminExercises("  ")).toEqual([]);
  });

  it("validité d'un couple catégorie / exercice", () => {
    expect(isGarminExercise("SLED", "PUSH")).toBe(true);
    expect(isGarminExercise("SLED", "BENCH_PRESS")).toBe(false);
    expect(isGarminExercise(null, "PUSH")).toBe(false);
  });
});

describe("proposition depuis le nom français", () => {
  const sug = (n: string) => {
    const s = suggestGarminExercise(n);
    return s ? `${s.category}/${s.name}` : null;
  };

  it("mouvements courants, matériel pris en compte", () => {
    expect(sug("Développé couché")).toBe("BENCH_PRESS/BARBELL_BENCH_PRESS");
    expect(sug("Développé couché haltères")).toBe("BENCH_PRESS/DUMBBELL_BENCH_PRESS");
    expect(sug("Soulevé de terre roumain")).toBe("DEADLIFT/ROMANIAN_DEADLIFT");
    expect(sug("Tractions")).toBe("PULL_UP/PULL_UP");
    expect(sug("Squat")).toBe("SQUAT/SQUAT");
    expect(sug("Rowing barre")).toBe("ROW/BARBELL_ROW");
    expect(sug("Mollets debout")).toBe("CALF_RAISE/STANDING_CALF_RAISE");
  });

  it("noms déjà en anglais, HYROX", () => {
    expect(sug("Wall balls")).toBe("SQUAT/WALL_BALL");
    expect(sug("Sled push")).toBe("SLED/PUSH");
    expect(sug("Farmer walk")).toBe("CARRY/FARMERS_WALK");
  });

  it("catégories matériel (élastique, sandbag) écartées si le nom n'en parle pas", () => {
    expect(sug("Gainage")).toBe("PLANK/PLANK");
    expect(sug("Back squat")).toMatch(/^SQUAT\//);
  });

  it("nom pas compris → pas de proposition plutôt qu'une mauvaise", () => {
    expect(sug("Nordic curl")).toBeNull();
    expect(sug("Ski erg")).toBeNull();
    expect(sug("Exercice maison")).toBeNull();
  });

  it("pas d'équivalent Garmin connu : rameur, SkiErg, leg extension machine", () => {
    expect(sug("Rameur")).toBeNull();
    expect(sug("SkiErg")).toBeNull();
    expect(sug("Leg extension")).toBeNull();
  });

  it("abréviations et précisions de la banque", () => {
    expect(sug("Dev. incline halt.")).toBe("BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS");
    expect(sug("Soulevé de Terre")).toBe("DEADLIFT/BARBELL_DEADLIFT");
    expect(sug("Leg curl assis")).toBe("LEG_CURL/LEG_CURL");
    expect(sug("Triceps extension corde poulie haute")).toBe("TRICEPS_EXTENSION/ROPE_PRESSDOWN");
    expect(sug("RDL")).toBe("DEADLIFT/ROMANIAN_DEADLIFT");
  });

  it("recherche pré-remplie en anglais", () => {
    expect(garminQueryFor("Fentes bulgares haltères")).toBe("dumbbell bulgarian split squat");
  });
});
