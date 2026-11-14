import { describe, expect, it } from "vitest";
import { competitionCountdown } from "@/lib/competitionCountdown";

describe("competitionCountdown", () => {
  it("compte les jours calendaires jusqu'à la compétition", () => {
    expect(competitionCountdown("2026-12-05", "2026-11-14")).toBe("J-21");
    expect(competitionCountdown("2026-11-15", "2026-11-14")).toBe("J-1");
  });
  it("jour J et compétition passée", () => {
    expect(competitionCountdown("2026-11-14", "2026-11-14")).toBe("Jour J");
    expect(competitionCountdown("2026-11-10", "2026-11-14")).toBe("Passée");
  });
  it("ne dérive pas au changement d'heure", () => {
    expect(competitionCountdown("2027-04-03", "2027-03-20")).toBe("J-14");
  });
});
