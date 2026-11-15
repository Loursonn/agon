import { describe, expect, it } from "vitest";
import { athleteIdsExceptSelf } from "../coachRoster";

describe("athleteIdsExceptSelf", () => {
  it("retire le coach quand il est dans son propre roster (coach_athlete)", () => {
    expect(athleteIdsExceptSelf([{ id: "a" }, { id: "coach" }, { id: "b" }], "coach")).toEqual(["a", "b"]);
  });
  it("garde tout le roster d'un coach qui n'y figure pas", () => {
    expect(athleteIdsExceptSelf([{ id: "a" }, { id: "b" }], "coach")).toEqual(["a", "b"]);
  });
  it("sans utilisateur connu, ne retire rien", () => {
    expect(athleteIdsExceptSelf([{ id: "a" }], undefined)).toEqual(["a"]);
  });
  it("dédoublonne un athlète présent deux fois (référent et co-coach)", () => {
    expect(athleteIdsExceptSelf([{ id: "a" }, { id: "a" }], "coach")).toEqual(["a"]);
  });
});
