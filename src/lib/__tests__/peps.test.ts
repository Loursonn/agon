import { describe, expect, it } from "vitest";
import { BLOC_PALETTE, DOMINANTE_COLOR, MACRO_COLOR, ROUGE, TYPE_COLOR, blocColor, typeOfEvent } from "@/lib/peps";

describe("peps : couleurs fixes par type (canvas 12/11)", () => {
  it("types de séance", () => {
    expect(TYPE_COLOR).toEqual({
      muscu: "#FFC933", energie: "#33B5FF", hyrox: "#FF9500", test: "#F060C0",
      competition: "#FF3B1F", fait: "#66F03C", libre: "#1FF0B0",
    });
    expect(ROUGE).toBe("#FF3B1F");
  });

  it("macros et dominantes", () => {
    expect(MACRO_COLOR).toEqual({ g: "#33B5FF", l: "#FFC933", p: "#FF5A33" });
    expect(DOMINANTE_COLOR).toEqual({ hyrox: "#F060C0", bio: "#33B5FF" });
  });

  it("palette de blocs : les 5 types d'abord", () => {
    expect(BLOC_PALETTE.slice(0, 5)).toEqual(["#FFC933", "#F060C0", "#33B5FF", "#2EE6C5", "#FF7A45"]);
    for (const c of BLOC_PALETTE) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("blocColor convertit l'ancienne palette et garde une couleur choisie", () => {
    expect(blocColor("#F97316", 0)).toBe("#FF7A45");
    expect(blocColor("#ec4899", 0)).toBe("#F060C0");
    expect(blocColor("#123456", 0)).toBe("#123456");
    expect(blocColor(null, 1)).toBe("#F060C0");
    expect(blocColor(undefined, 9)).toBe(BLOC_PALETTE[1]);
  });

  it("typeOfEvent", () => {
    expect(typeOfEvent("workout")).toBe("muscu");
    expect(typeOfEvent("energy")).toBe("energie");
    expect(typeOfEvent("energy", { hyrox: true })).toBe("hyrox");
    expect(typeOfEvent("test")).toBe("test");
    expect(typeOfEvent("competition")).toBe("competition");
    expect(typeOfEvent("free_activity")).toBe("libre");
  });
});

describe("dayTint", () => {
  it("prend la couleur de l'intensité, sinon celle du coach, sinon rien", async () => {
    const { dayTint, INTENSITY_COLOR } = await import("@/lib/peps");
    expect(dayTint({ intensity: "hard", color: "#123456" })).toBe(INTENSITY_COLOR.hard);
    expect(dayTint({ label: "Jambes", color: "#123456" })).toBe("#123456");
    expect(dayTint({ color: "#123456" })).toBeNull();
    expect(dayTint(null)).toBeNull();
  });
});
