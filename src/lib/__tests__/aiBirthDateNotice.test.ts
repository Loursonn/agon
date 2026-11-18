import { describe, expect, it } from "vitest";
import { coachBirthDateHint } from "../aiBirthDateNotice";

describe("date de naissance manquante", () => {
  it("coach : mention seulement pour un athlète actif sans date", () => {
    expect(coachBirthDateHint({ birth_date: null, is_pending: false })).toMatch(/prochaine connexion/);
    expect(coachBirthDateHint({ birth_date: "1990-04-12" })).toBeNull();
    expect(coachBirthDateHint({ birth_date: null, is_pending: true })).toBeNull();
    expect(coachBirthDateHint(null)).toBeNull();
  });
});
