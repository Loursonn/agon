import { describe, it, expect } from "vitest";
import {
  DAY_THEME_DEFAULT_COLOR,
  DAY_THEME_INTENSITY_COLOR,
  colorForIntensityPick,
} from "@/lib/dayTheme";

describe("colorForIntensityPick", () => {
  it("jour sans thème : couleur de l'intensité choisie", () => {
    expect(colorForIntensityPick(null, "hard")).toBe(DAY_THEME_INTENSITY_COLOR.hard);
    expect(colorForIntensityPick(undefined, "repos")).toBe(DAY_THEME_INTENSITY_COLOR.repos);
  });

  it("thème vide (note seule) : couleur de l'intensité", () => {
    expect(colorForIntensityPick({ note: "Arrivée tardive", color: "#3b82f6" }, "easy"))
      .toBe(DAY_THEME_INTENSITY_COLOR.easy);
  });

  it("couleur automatique de l'ancienne intensité : remplacée", () => {
    const theme = { intensity: "hard", color: DAY_THEME_INTENSITY_COLOR.hard };
    expect(colorForIntensityPick(theme, "easy")).toBe(DAY_THEME_INTENSITY_COLOR.easy);
  });

  it("couleur par défaut : remplacée", () => {
    const theme = { label: "Seuil", color: DAY_THEME_DEFAULT_COLOR };
    expect(colorForIntensityPick(theme, "moyen")).toBe(DAY_THEME_INTENSITY_COLOR.moyen);
  });

  it("couleur choisie à la main : gardée", () => {
    const theme = { intensity: "hard", color: "#ec4899" };
    expect(colorForIntensityPick(theme, "easy")).toBe("#ec4899");
  });

  it("couleur invalide : traitée comme la couleur par défaut", () => {
    const theme = { label: "Jambes", color: "rouge" };
    expect(colorForIntensityPick(theme, "hard")).toBe(DAY_THEME_INTENSITY_COLOR.hard);
  });
});
