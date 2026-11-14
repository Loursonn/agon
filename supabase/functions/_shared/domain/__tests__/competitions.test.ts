import { describe, it, expect } from "vitest";
import { activeCompetitions, cancelledByLabel, deleteWarnings, isCancelled } from "../competitions";

describe("isCancelled / activeCompetitions", () => {
  it("annulée = cancelled_at renseigné", () => {
    expect(isCancelled({ cancelled_at: "2026-11-14T10:00:00Z" })).toBe(true);
    expect(isCancelled({ cancelled_at: null })).toBe(false);
    expect(isCancelled({})).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });

  it("garde l'ordre et retire les annulées", () => {
    const list = [{ id: "1" }, { id: "2", cancelled_at: "2026-11-14" }, { id: "3", cancelled_at: null }];
    expect(activeCompetitions(list).map((c) => c.id)).toEqual(["1", "3"]);
  });
});

describe("cancelledByLabel", () => {
  const c = (by: string | null) => ({ cancelled_by: by, athlete_id: "ath" });

  it("vu par le coach", () => {
    expect(cancelledByLabel(c("coach"), "coach")).toBe("par toi");
    expect(cancelledByLabel(c("ath"), "coach", "Léa")).toBe("par Léa");
    expect(cancelledByLabel(c("ath"), "coach")).toBe("par l’athlète");
    expect(cancelledByLabel(c("cocoach"), "coach")).toBe("par un autre coach");
  });

  it("vu par l'athlète", () => {
    expect(cancelledByLabel(c("ath"), "ath", "Léa")).toBe("par toi");
    expect(cancelledByLabel(c("coach"), "ath")).toBe("par ton coach");
  });

  it("auteur inconnu : rien", () => {
    expect(cancelledByLabel(c(null), "coach")).toBe("");
  });
});

describe("deleteWarnings", () => {
  it("rien de rattaché : aucune phrase", () => {
    expect(deleteWarnings({ results: 0, plans: 0, hasComment: false })).toEqual([]);
  });

  it("singulier, pluriel et bilan", () => {
    expect(deleteWarnings({ results: 1, plans: 2, hasComment: true })).toEqual([
      "Le résultat HYROX est gardé mais ne sera plus rattaché à cette course.",
      "2 plans de course sont gardés mais ne seront plus rattachés à cette course.",
      "Le bilan écrit par l’athlète sera perdu.",
    ]);
  });
});
