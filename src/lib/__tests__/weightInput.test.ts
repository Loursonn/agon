import { describe, expect, it } from "vitest";
import { cleanWeightText, parseWeightText, weightToText } from "../weightInput";

describe("saisie du poids à virgule", () => {
  it("garde la virgule et transforme le point en virgule", () => {
    expect(cleanWeightText("72,4")).toBe("72,4");
    expect(cleanWeightText("72.4")).toBe("72,4");
    expect(cleanWeightText("72,")).toBe("72,");
  });

  it("une seule virgule, une décimale, pas de lettres", () => {
    expect(cleanWeightText("72,45")).toBe("72,4");
    expect(cleanWeightText("72,4,5")).toBe("72,4");
    expect(cleanWeightText("7a2 kg")).toBe("72");
    expect(cleanWeightText("12345")).toBe("123");
  });

  it("convertit en nombre pour le stockage", () => {
    expect(parseWeightText("72,4")).toBe(72.4);
    expect(parseWeightText("72.4")).toBe(72.4);
    expect(parseWeightText("72,")).toBe(72);
    expect(parseWeightText("72")).toBe(72);
    expect(parseWeightText(81.25)).toBe(81.3);
  });

  it("vide, illisible ou hors bornes → null (jamais 0)", () => {
    expect(parseWeightText("")).toBeNull();
    expect(parseWeightText(",")).toBeNull();
    expect(parseWeightText(null)).toBeNull();
    expect(parseWeightText("7")).toBeNull();
    expect(parseWeightText("999")).toBeNull();
  });

  it("affiche un poids enregistré avec une virgule", () => {
    expect(weightToText(72.4)).toBe("72,4");
    expect(weightToText("68.0")).toBe("68,0");
    expect(weightToText(null)).toBe("");
    expect(weightToText("")).toBe("");
  });
});
