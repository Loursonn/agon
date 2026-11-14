import { describe, it, expect } from "vitest";
import {
  ageOn, isOldEnough, signupBirthDateError,
  INVALID_BIRTH_DATE_MESSAGE, MIN_AGE_MESSAGE, MISSING_BIRTH_DATE_MESSAGE,
} from "../age";

describe("ageOn", () => {
  it("années révolues : l'anniversaire pas encore passé enlève un an", () => {
    expect(ageOn("2000-06-15", "2026-06-14")).toBe(25);
    expect(ageOn("2000-06-15", "2026-06-15")).toBe(26);
    expect(ageOn("2000-06-15", "2026-12-31")).toBe(26);
  });
  it("null pour une date invalide ou future", () => {
    expect(ageOn("2010-02-30", "2026-01-01")).toBeNull();
    expect(ageOn("15/06/2000", "2026-01-01")).toBeNull();
    expect(ageOn("2027-01-01", "2026-01-01")).toBeNull();
    expect(ageOn("2000-01-01", "pas une date")).toBeNull();
  });
});

describe("isOldEnough (15 ans par défaut)", () => {
  it("15 ans le jour même de l'anniversaire", () => {
    expect(isOldEnough("2011-11-08", "2026-11-08")).toBe(true);
    expect(isOldEnough("2011-11-09", "2026-11-08")).toBe(false);
    expect(isOldEnough("2011-11-07", "2026-11-08")).toBe(true);
  });
  it("né un 29 février : 15 ans le 1er mars d'une année non bissextile", () => {
    expect(isOldEnough("2012-02-29", "2027-02-28")).toBe(false);
    expect(isOldEnough("2012-02-29", "2027-03-01")).toBe(true);
  });
  it("né un 29 février : le 29 février d'une année bissextile", () => {
    expect(isOldEnough("2016-02-29", "2031-02-28")).toBe(false); // 2031 non bissextile
    expect(isOldEnough("2000-02-29", "2016-02-29")).toBe(true);
  });
  it("date future ou invalide : refusée", () => {
    expect(isOldEnough("2030-01-01", "2026-11-08")).toBe(false);
    expect(isOldEnough("2000-13-01", "2026-11-08")).toBe(false);
    expect(isOldEnough("", "2026-11-08")).toBe(false);
  });
  it("seuil réglable", () => {
    expect(isOldEnough("2008-11-08", "2026-11-08", 18)).toBe(true);
    expect(isOldEnough("2008-11-09", "2026-11-08", 18)).toBe(false);
  });
});

describe("signupBirthDateError", () => {
  const today = "2026-11-08";
  it("accepte 15 ans et plus", () => {
    expect(signupBirthDateError("2011-11-08", today)).toBeNull();
    expect(signupBirthDateError("1980-01-01", today)).toBeNull();
    expect(signupBirthDateError(" 1980-01-01 ", today)).toBeNull();
  });
  it("moins de 15 ans : message clair", () => {
    expect(signupBirthDateError("2011-11-09", today)).toBe(MIN_AGE_MESSAGE);
    expect(MIN_AGE_MESSAGE).toBe("Tu dois avoir au moins 15 ans pour utiliser Agon.");
  });
  it("absente", () => {
    expect(signupBirthDateError("", today)).toBe(MISSING_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError(null, today)).toBe(MISSING_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError(undefined, today)).toBe(MISSING_BIRTH_DATE_MESSAGE);
  });
  it("invalide, future ou avant 1900", () => {
    expect(signupBirthDateError("2010-02-30", today)).toBe(INVALID_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError("08/11/2000", today)).toBe(INVALID_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError("2027-01-01", today)).toBe(INVALID_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError("1899-12-31", today)).toBe(INVALID_BIRTH_DATE_MESSAGE);
    expect(signupBirthDateError(20001108, today)).toBe(INVALID_BIRTH_DATE_MESSAGE);
  });
});

describe("accord IA réservé aux 18 ans et plus (conditions Gemini et Claude)", () => {
  it("18 ans révolus le jour même : proposé", async () => {
    const { canOfferAiConsent, AI_MIN_AGE } = await import("@/lib/age");
    expect(AI_MIN_AGE).toBe(18);
    expect(canOfferAiConsent("2008-11-13", "2026-11-13")).toBe(true);
    expect(canOfferAiConsent("1990-01-01", "2026-11-13")).toBe(true);
  });
  it("15 à 17 ans : pas proposé", async () => {
    const { canOfferAiConsent } = await import("@/lib/age");
    expect(canOfferAiConsent("2008-11-14", "2026-11-13")).toBe(false);
    expect(canOfferAiConsent("2011-01-01", "2026-11-13")).toBe(false);
  });
  it("date inconnue (compte créé avant le contrôle d'âge) ou illisible : pas proposé (saisie de la date d'abord)", async () => {
    const { canOfferAiConsent } = await import("@/lib/age");
    expect(canOfferAiConsent(null, "2026-11-13")).toBe(false);
    expect(canOfferAiConsent(undefined, "2026-11-13")).toBe(false);
    expect(canOfferAiConsent("", "2026-11-13")).toBe(false);
    expect(canOfferAiConsent("pas une date", "2026-11-13")).toBe(false);
  });
});
