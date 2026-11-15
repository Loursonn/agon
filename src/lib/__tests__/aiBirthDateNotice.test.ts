import { describe, expect, it } from "vitest";
import {
  AI_BIRTH_DATE_DEADLINE,
  aiBirthDateDeadlineLabel,
  aiBirthDateNotice,
  coachBirthDateHint,
} from "../aiBirthDateNotice";

describe("préavis IA sans date de naissance (décision du 2026-11-14)", () => {
  it("date limite : 21 novembre 2026, 7 jours après la décision", () => {
    expect(AI_BIRTH_DATE_DEADLINE).toBe("2026-11-21");
    expect(aiBirthDateDeadlineLabel()).toBe("21 novembre");
  });

  it("accord IA donné : message jusqu'à la date limite incluse", () => {
    const msg = "Renseigne ta date de naissance d’ici le 21 novembre pour garder les analyses de l’IA.";
    expect(aiBirthDateNotice(true, "2026-11-14")).toBe(msg);
    expect(aiBirthDateNotice(true, "2026-11-21")).toBe(msg);
  });

  it("après la date limite, ou sans accord IA : pas de message", () => {
    expect(aiBirthDateNotice(true, "2026-11-22")).toBeNull();
    expect(aiBirthDateNotice(false, "2026-11-15")).toBeNull();
  });

  it("coach : mention seulement pour un athlète actif sans date", () => {
    expect(coachBirthDateHint({ birth_date: null, is_pending: false })).toMatch(/prochaine connexion/);
    expect(coachBirthDateHint({ birth_date: "1990-04-12" })).toBeNull();
    expect(coachBirthDateHint({ birth_date: null, is_pending: true })).toBeNull();
    expect(coachBirthDateHint(null)).toBeNull();
  });
});
