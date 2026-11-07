import { describe, it, expect } from "vitest";
import {
  FC_ZONE_KEYS,
  REFERENCE_KEYS,
  estimateOneRm,
  isFcZoneKey,
  loadFromPctRm,
  newRecordsFromSets,
  normalizeMetricName,
  recordRefOf,
  roundLoad,
} from "../performance";

describe("normalizeMetricName", () => {
  it("ramène les saisies de l'athlète aux noms lus par le module énergie", () => {
    expect(normalizeMetricName("FC Max")).toBe("FCmax");
    expect(normalizeMetricName("FC Repos")).toBe("FCrepos");
    expect(normalizeMetricName("Vitesse Critique")).toBe("VC");
    expect(normalizeMetricName("fc max")).toBe("FCmax");
    expect(normalizeMetricName("  vma ")).toBe("VMA");
    expect(normalizeMetricName("VO₂max")).toBe("VO2max");
    expect(normalizeMetricName("vitesse critique")).toBe("VC");
    expect(normalizeMetricName("FC-seuil")).toBe("FCseuil");
    expect(normalizeMetricName("fczone z1 max")).toBe("FCzone_Z1_max");
  });
  it("laisse les noms canoniques inchangés", () => {
    for (const k of [...REFERENCE_KEYS, ...FC_ZONE_KEYS]) expect(normalizeMetricName(k)).toBe(k);
  });
  it("garde tel quel un nom inconnu (sans espaces autour)", () => {
    expect(normalizeMetricName("Semi Bilbao")).toBe("Semi Bilbao");
    expect(normalizeMetricName(" Lactatémie ")).toBe("Lactatémie");
    expect(normalizeMetricName("Puissance")).toBe("Puissance");
  });
  it("reconnaît les zones FC", () => {
    expect(isFcZoneKey("FCzone_Z3_max")).toBe(true);
    expect(isFcZoneKey("FCmax")).toBe(false);
  });
});

describe("charges", () => {
  it("roundLoad arrondit au pas de 0,5 kg", () => {
    expect(roundLoad(116.67)).toBe(116.5);
    expect(roundLoad(116.8)).toBe(117);
    expect(roundLoad(101.24)).toBe(101);
    expect(roundLoad(101.25)).toBe(101.5);
    expect(roundLoad(63, 2.5)).toBe(62.5);
  });
  it("estimateOneRm : Epley, 1 rép. = la charge, arrondi 0,5 kg", () => {
    expect(estimateOneRm(100, 1)).toBe(100);
    expect(estimateOneRm(100, 5)).toBe(116.5);
    expect(estimateOneRm(80, 8)).toBe(101.5);
    expect(estimateOneRm(0, 5)).toBe(0);
    expect(estimateOneRm(100, 0)).toBe(0);
    expect(estimateOneRm(Number.NaN, 3)).toBe(0);
  });
  it("loadFromPctRm : % du 1RM en kg, arrondi 0,5 kg ; sans 1RM → null", () => {
    expect(loadFromPctRm(120, 75)).toBe(90);
    expect(loadFromPctRm(117, 72.5)).toBe(85);
    expect(loadFromPctRm(null, 75)).toBeNull();
    expect(loadFromPctRm(120, null)).toBeNull();
    expect(loadFromPctRm(0, 75)).toBeNull();
  });
});

describe("records", () => {
  it("recordRefOf : rm_ref, sinon le nom ; pas de record hors force", () => {
    expect(recordRefOf({ name: "DC haltères", rm_ref: "Développé couché" })).toBe("Développé couché");
    expect(recordRefOf({ name: "Squat" })).toBe("Squat");
    expect(recordRefOf({ exercise_name: "Squat", exType: "muscu" })).toBe("Squat");
    expect(recordRefOf({ name: "Étirement", isFlexibility: true })).toBeNull();
    expect(recordRefOf({ name: "Box jump", exType: "plio" })).toBeNull();
    expect(recordRefOf({ name: "  " })).toBeNull();
  });
  it("newRecordsFromSets : meilleure série par référence, seulement si elle bat le record", () => {
    const out = newRecordsFromSets(
      [
        { ref: "Squat", kg: 100, reps: 5 },
        { ref: "Squat", kg: 110, reps: 3 },
        { ref: "Squat", kg: 140, reps: 1, done: false },
        { ref: "DC", kg: 80, reps: 5 },
        { ref: "Tirage", kg: null, reps: 8 },
      ],
      { Squat: 115, DC: 100 },
    );
    expect(out).toEqual([{ ref: "Squat", kg: 121, sourceKg: 110, sourceReps: 3 }]);
  });
});
