import { describe, it, expect } from "vitest";
import { droppedMessage, logoutWarning, mergeWriteArgs, writeKey } from "../writes";
import { ApiError } from "@/api/client";

describe("writeKey", () => {
  it("une clé par séance, par jour, et par type de saisie", () => {
    expect(writeKey("workout.complete", { athleteId: "a", logId: "L1" })).toBe("workout.complete:L1");
    expect(writeKey("workout.rpe", { athleteId: "a", logId: "L1", rpe: 7 })).not.toBe(
      writeKey("workout.complete", { athleteId: "a", logId: "L1" }),
    );
    expect(writeKey("energy.rpe", { athleteId: "a", id: "E1", rpe: 5 })).toBe("energy.rpe:E1");
    expect(writeKey("wellness.day", { athleteId: "a", day: "2026-11-08", form: {} })).toBe("wellness.day:a:2026-11-08");
    expect(writeKey("weight.day", { athleteId: "a", day: "2026-11-08", kg: 70 })).not.toBe(
      writeKey("weight.day", { athleteId: "a", day: "2026-11-09", kg: 70 }),
    );
  });
});

describe("droppedMessage", () => {
  const gone = new ApiError("x", { message: "Séance introuvable", code: "P0002" });
  it("séance retirée par le coach", () => {
    expect(droppedMessage("workout.complete", gone)).toBe("Fin de séance non enregistrée : la séance n'existe plus (ton coach l'a retirée).");
    expect(droppedMessage("energy.complete", gone)).toContain("n'existe plus");
  });
  it("autre refus", () => {
    expect(droppedMessage("wellness.day", new ApiError("x", { message: "non", code: "22023" }))).toBe("Wellness non enregistré : le serveur l'a refusé.");
    expect(droppedMessage("inconnu", null)).toBe("Une saisie non enregistrée : envoi impossible après plusieurs essais.");
  });
});

describe("logoutWarning", () => {
  it("rien en attente : pas de question", () => {
    expect(logoutWarning(0)).toBeNull();
  });
  it("singulier / pluriel", () => {
    expect(logoutWarning(1)).toBe("1 saisie pas encore envoyée sera perdue. Se déconnecter quand même ?");
    expect(logoutWarning(3)).toBe("3 saisies pas encore envoyées seront perdues. Se déconnecter quand même ?");
  });
});

describe("mergeWriteArgs", () => {
  it("2ᵉ validation énergie de la même séance : les champs vides gardent la 1ʳᵉ, blocs fusionnés", () => {
    const first = { athleteId: "a", id: "E1", input: { block_logs: { b1: { done: true } }, actual_duration_min: 40, rpe_score: 7, notes: "dur" } };
    const second = { athleteId: "a", id: "E1", input: { notes: "", block_logs: { b2: { done: true } }, distance_km: 5 } };
    expect(mergeWriteArgs("energy.complete", first, second)).toEqual({
      athleteId: "a", id: "E1",
      input: { block_logs: { b1: { done: true }, b2: { done: true } }, actual_duration_min: 40, rpe_score: 7, notes: "dur", distance_km: 5 },
    });
  });
  it("les autres saisies sont complètes : la plus récente remplace", () => {
    expect(mergeWriteArgs("wellness.day", { form: 1 }, { form: 2 })).toEqual({ form: 2 });
  });
});
