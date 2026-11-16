import { describe, expect, it } from "vitest";
import { notedPainLevels, PAIN_ZONES, painList, painSummary, painWord } from "../painZones";

describe("carte douleur", () => {
  it("les zones tiennent dans la silhouette (viewBox 120 × 215)", () => {
    for (const z of PAIN_ZONES) for (const r of z.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(120);
      expect(r.y + r.h).toBeLessThanOrEqual(215);
    }
  });

  it("une zone vue de face et de dos ne compte qu'une fois", () => {
    expect(painList({ coude: 3, genou: 5 }).map((z) => z.id)).toEqual(["coude", "genou"]);
  });

  it("garde l'ordre de la carte et les zones pas encore notées", () => {
    expect(painList({ lombaires: null, genou: 6 })).toEqual([
      { id: "genou", label: "Genou", level: 6 },
      { id: "lombaires", label: "Lombaires", level: null },
    ]);
    expect(notedPainLevels({ lombaires: null, genou: 6 })).toEqual({ genou: 6 });
  });

  it("résumé pour le coach", () => {
    expect(painSummary({ lombaires: 3, genou: 6 })).toBe("Genou 6/10, lombaires 3/10");
    expect(painSummary({})).toBe("");
  });

  it("mots de l'échelle : 1 petite gêne, 2 gêne modérée, 3 douleur légère (Hugo, 15/11)", () => {
    expect([0, 1, 2, 3, 4, 6, 9, 10].map(painWord)).toEqual([
      "aucune douleur", "petite gêne", "gêne modérée", "douleur légère", "douleur modérée", "douleur forte", "douleur très forte", "douleur insupportable",
    ]);
  });
});

describe("painText", () => {
  it("zones si elles existent, sinon la note seule", async () => {
    const { painText } = await import("../painZones");
    expect(painText(6, { genou: 6, lombaires: 3 })).toBe("Douleur : genou 6/10, lombaires 3/10");
    expect(painText(5, {})).toBe("Douleur 5/10");
    expect(painText(null, undefined)).toBeNull();
  });
});
