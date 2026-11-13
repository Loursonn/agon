import { describe, it, expect } from "vitest";
import { feedbackPageLabel } from "../feedbackPage";

describe("feedbackPageLabel", () => {
  it("traduit les routes connues", () => {
    expect(feedbackPageLabel("/athlete/program")).toBe("Programme");
    expect(feedbackPageLabel("/athlete/program/workout/abc")).toBe("Séance en cours");
    expect(feedbackPageLabel("/athlete/test/")).toBe("Tests");
    expect(feedbackPageLabel("/athlete?x=1")).toBe("Aujourd'hui");
  });
  it("garde la valeur brute si inconnue, rien si vide", () => {
    expect(feedbackPageLabel("/autre")).toBe("/autre");
    expect(feedbackPageLabel(null)).toBeNull();
  });
});
