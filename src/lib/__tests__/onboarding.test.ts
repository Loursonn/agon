import { beforeEach, describe, expect, it } from "vitest";
import { TIPS, finishLocally, pendingTip, saveStep, savedStep, setTip, shouldShowOnboarding, tipPlacement } from "../onboarding";

beforeEach(() => localStorage.clear());

describe("shouldShowOnboarding", () => {
  const base = { role: "athlete", onboardedAt: null, viewOnly: false, uid: "u1" };
  it("nouvel athlète seulement", () => {
    expect(shouldShowOnboarding(base)).toBe(true);
    expect(shouldShowOnboarding({ ...base, role: "coach_athlete" })).toBe(true);
    expect(shouldShowOnboarding({ ...base, role: "coach" })).toBe(false);
    expect(shouldShowOnboarding({ ...base, onboardedAt: "2026-11-13T00:00:00Z" })).toBe(false);
    expect(shouldShowOnboarding({ ...base, viewOnly: true })).toBe(false);
    expect(shouldShowOnboarding({ ...base, uid: null })).toBe(false);
  });
  it("fini sur l'appareil : plus montré même si le profil n'est pas relu", () => {
    finishLocally("u1", false);
    expect(shouldShowOnboarding(base)).toBe(false);
  });
});

describe("étapes et bulles", () => {
  it("reprend l'étape enregistrée", () => {
    expect(savedStep("u1")).toBe(0);
    saveStep("u1", 2);
    expect(savedStep("u1")).toBe(2);
    saveStep("u1", 7);
    expect(savedStep("u1")).toBe(0);
  });
  it("bulles après le parcours, jusqu'à la dernière", () => {
    expect(pendingTip("u1")).toBeNull();
    finishLocally("u1", true);
    expect(pendingTip("u1")).toBe(0);
    setTip("u1", 1);
    expect(pendingTip("u1")).toBe(1);
    setTip("u1", TIPS.length);
    expect(pendingTip("u1")).toBeNull();
    finishLocally("u2", false);
    expect(pendingTip("u2")).toBeNull();
  });
});

describe("tipPlacement", () => {
  it("cible en haut : bulle dessous, flèche sur le centre de la cible", () => {
    const p = tipPlacement({ top: 100, bottom: 200, left: 40, width: 200 }, 400, 800);
    expect(p.below).toBe(true);
    expect(p.y).toBe(212);
    expect(p.width).toBe(360);
    expect(p.left).toBe(16); // centrée sur la cible, elle sortirait à gauche
    expect(p.arrowX).toBe(124);
  });
  it("onglet en bas d'écran : bulle au-dessus, collée aux marges", () => {
    const p = tipPlacement({ top: 760, bottom: 800, left: 330, width: 60 }, 400, 812);
    expect(p.below).toBe(false);
    expect(p.y).toBe(812 - 760 + 12);
    expect(p.left).toBe(24); // 400 - 16 - 360
    expect(p.arrowX).toBe(336); // centre de l’onglet (360) moins le bord (24)
  });
});
