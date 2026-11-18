import { describe, expect, it } from "vitest";
import { boneAnalysis, EMPTY_OBSERVATIONS, morphoRatios, musclePriorities, muscleSummary, programmingAdvice, type MorphoLengths } from "@/lib/morpho";

const titouan: MorphoLengths = { height: 176, wingspan: 182, humerus: 34, forearm: 28, leg: 90, tibia: 42 };

describe("morpho : ratios et analyse osseuse (seuils de Beck)", () => {
  it("calcule fémur = jambe − tibia et les ratios", () => {
    expect(morphoRatios(titouan)).toEqual({ femur: 48, legPct: 51.1, spanDiff: 6, tibiaFemurPct: 87.5, forearmHumerusPct: 82.4 });
  });

  it("donne les verdicts : jambes longues, buste court, fémurs longs, bras longs, humérus longs", () => {
    const v = Object.fromEntries(boneAnalysis(titouan, EMPTY_OBSERVATIONS).map((b) => [b.key, b.verdict]));
    expect(v).toMatchObject({
      jambes: "Jambes longues", buste: "Buste court", femurs: "Fémurs longs", tibias: "Tibias courts",
      bras: "Bras longs", humerus: "Humérus longs", avant_bras: "Avant-bras courts",
    });
  });

  it("bras très longs au-delà de taille + 8 cm, courts sous la taille", () => {
    const bras = (w: number) => boneAnalysis({ ...titouan, wingspan: w }, EMPTY_OBSERVATIONS).find((b) => b.key === "bras")!.verdict;
    expect(bras(184)).toBe("Bras très longs");
    expect(bras(170)).toBe("Bras courts");
  });

  it("sans mesure ni observation : pas de verdict, ce qui manque est dit", () => {
    const b = boneAnalysis({ height: 176, wingspan: null, humerus: null, forearm: null, leg: null, tibia: null }, EMPTY_OBSERVATIONS);
    expect(b.every((x) => x.verdict === null)).toBe(true);
    expect(b.find((x) => x.key === "abdomen")!.missing).toBe("observation à l'œil");
  });

  it("conseils de programmation : squat à adapter (fémurs longs), soulevé avantagé (bras longs)", () => {
    const obs = { ...EMPTY_OBSERVATIONS, cage: "etroite" as const, muscles: { ischios: "long" as const, mollets: "court" as const } };
    const a = Object.fromEntries(programmingAdvice(boneAnalysis(titouan, obs)).map((x) => [x.key, x]));
    expect(a.squat.status).toBe("adapter");
    expect(a.squat.because).toContain("fémurs longs");
    expect(a.souleve.status).toBe("avantage");
    expect(a.developpe.status).toBe("adapter");
    expect(a.elevations.status).toBe("adapter");
    expect(muscleSummary(obs).forts.map((m) => m.key)).toEqual(["ischios"]);
    expect(musclePriorities(obs).priorites.map((p) => p.muscle.key)).toEqual(["mollets"]);
  });
});
