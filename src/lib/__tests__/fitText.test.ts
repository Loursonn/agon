import { describe, expect, it } from "vitest";
import { fitFontSize } from "../fitText";

describe("fitFontSize", () => {
  it("garde la taille de base quand le texte tient", () => {
    expect(fitFontSize({ base: 78, min: 28, naturalWidth: 180, available: 186 })).toEqual({ size: 78, wrap: false });
  });

  it("réduit au prorata quand le texte déborde (« 1:20:00 » dans l'anneau)", () => {
    // 7 caractères mono à 78 px ≈ 328 px pour 186 px utiles → 44 px.
    expect(fitFontSize({ base: 78, min: 28, naturalWidth: 328, available: 186 })).toEqual({ size: 44, wrap: false });
  });

  it("arrondit au demi-pixel inférieur pour ne jamais dépasser", () => {
    const r = fitFontSize({ base: 22, min: 12, naturalWidth: 200, available: 150 });
    expect(r.size).toBe(16.5);
    expect((r.size / 22) * 200).toBeLessThanOrEqual(150);
  });

  it("s'arrête au plancher et autorise le retour à la ligne", () => {
    expect(fitFontSize({ base: 54, min: 20, naturalWidth: 900, available: 200 })).toEqual({ size: 20, wrap: true });
  });

  it("garde la base tant que rien n'est mesuré", () => {
    expect(fitFontSize({ base: 30, min: 12, naturalWidth: 0, available: 200 })).toEqual({ size: 30, wrap: false });
    expect(fitFontSize({ base: 30, min: 12, naturalWidth: 300, available: 0 })).toEqual({ size: 30, wrap: false });
    expect(fitFontSize({ base: 30, min: 12, naturalWidth: NaN, available: 200 })).toEqual({ size: 30, wrap: false });
  });

  it("un plancher plus grand que la base ne grossit jamais le texte", () => {
    expect(fitFontSize({ base: 14, min: 20, naturalWidth: 300, available: 100 })).toEqual({ size: 14, wrap: true });
  });
});
