import { beforeEach, describe, expect, it } from "vitest";
import { TIPS, finishLocally, pendingTip, saveStep, savedStep, setTip, shouldShowOnboarding } from "../onboarding";

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
