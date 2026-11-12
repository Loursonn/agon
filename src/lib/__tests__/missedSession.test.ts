import { describe, expect, it } from "vitest";
import { isMissedSession, isUntouchedSession } from "../missedSession";

describe("isUntouchedSession", () => {
  it("prévue ou manquée sans saisie : déplaçable", () => {
    expect(isUntouchedSession({ status: "planned" })).toBe(true);
    expect(isUntouchedSession({ status: "missed", notes: "  " })).toBe(true);
  });
  it("réalisée, commencée ou notée : jamais", () => {
    expect(isUntouchedSession({ status: "completed" })).toBe(false);
    expect(isUntouchedSession({ status: "in_progress" })).toBe(false);
    expect(isUntouchedSession({ status: "planned", started_at: "2026-11-10T08:00:00Z" })).toBe(false);
    expect(isUntouchedSession({ status: "missed", rpe_score: 6 })).toBe(false);
    expect(isUntouchedSession({ status: "planned", notes: "genou" })).toBe(false);
  });
});

describe("isMissedSession", () => {
  const today = "2026-11-12";
  it("passée et intacte, ou marquée manquée", () => {
    expect(isMissedSession({ status: "planned", scheduled_date: "2026-11-10" }, today)).toBe(true);
    expect(isMissedSession({ status: "missed", scheduled_date: "2026-11-10" }, today)).toBe(true);
  });
  it("à venir ou aujourd'hui : pas ratée", () => {
    expect(isMissedSession({ status: "planned", scheduled_date: today }, today)).toBe(false);
  });
});
