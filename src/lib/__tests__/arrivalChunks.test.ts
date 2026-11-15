import { describe, expect, it } from "vitest";
import { arrivalChunks } from "../arrivalChunks";

describe("arrivalChunks", () => {
  it("racine : suit le rôle gardé sur l'appareil", () => {
    expect(arrivalChunks("/", "athlete", true)).toEqual(["AthleteApp", "TodayPage"]);
    expect(arrivalChunks("/", "coach", false)).toEqual(["CoachShell", "CoachHomePage"]);
    expect(arrivalChunks("/", "coach_athlete", true)).toEqual(["CoachShell", "CoachPhoneHome"]);
    expect(arrivalChunks("/", null, true)).toEqual([]);
    expect(arrivalChunks("/", "staff", false)).toEqual([]);
  });

  it("athlète : Aujourd'hui, sinon le layout seul", () => {
    expect(arrivalChunks("/athlete", "athlete", true)).toEqual(["AthleteApp", "TodayPage"]);
    expect(arrivalChunks("/athlete/", null, true)).toEqual(["AthleteApp", "TodayPage"]);
    expect(arrivalChunks("/athlete/program", "athlete", true)).toEqual(["AthleteApp"]);
  });

  it("coach : accueil, liste, fiche athlète (téléphone ou ordinateur)", () => {
    expect(arrivalChunks("/coach", "coach", false)).toEqual(["CoachShell", "CoachHomePage"]);
    expect(arrivalChunks("/coach/athletes", "coach", false)).toEqual(["CoachShell", "AthletesListPage"]);
    expect(arrivalChunks("/coach/athletes", "coach", true)).toEqual(["CoachShell", "CoachPhoneAthletes"]);
    expect(arrivalChunks("/coach/athletes/abc/planning", "coach", false)).toEqual(["CoachShell", "CoachAthleteArea", "PlanningPage"]);
    expect(arrivalChunks("/coach/athletes/abc", "coach", true)).toEqual(["CoachShell", "CoachAthleteArea", "CoachPhonePlanning"]);
    expect(arrivalChunks("/coach/athletes/abc/retours", "coach", false)).toEqual(["CoachShell", "CoachAthleteArea"]);
    expect(arrivalChunks("/coach/athletes/abc/energy/new", "coach", false)).toEqual(["CoachShell"]);
    expect(arrivalChunks("/coach/library", "coach", false)).toEqual(["CoachShell"]);
  });

  it("pages publiques : rien", () => {
    expect(arrivalChunks("/login", null, true)).toEqual([]);
    expect(arrivalChunks("/cgu", null, false)).toEqual([]);
  });
});
