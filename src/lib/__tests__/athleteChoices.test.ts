import { describe, it, expect } from "vitest";
import { formatChoiceSets, summarizeAthleteChoices } from "@/lib/athleteChoices";

describe("summarizeAthleteChoices", () => {
  it("rien → any=false", () => {
    expect(summarizeAthleteChoices({ mods: null }).any).toBe(false);
  });

  it("déplacement, exercices ajoutés, bonus, séries sautées, commentaires", () => {
    const r = summarizeAthleteChoices({
      mods: {
        customExercises: [{ tempId: "t1", name: "Gainage", sets: [{ duration_s: 30 }, { duration_s: 30 }] }],
        bonusSets: [{ exerciseId: "e1", exerciseName: "Squat", sets: [{ kg: 100, reps: 5 }] }],
        sessionSets: {
          ex1: [{ done: true, kg: 80, reps: 8 }, { done: false, skipped: true }],
          exX: [{ done: true, kg: 20, reps: 12 }],
        },
        sessionComment: "  Genou un peu sensible ",
        exerciceComments: { ex1: "lourd", ex2: " " },
      },
      plannedExerciceIds: ["ex1"],
      scheduledDate: "2026-10-21",
      originalScheduledDate: "2026-10-19",
      rescheduledByAthlete: true,
    });
    expect(r.moved).toEqual({ from: "2026-10-19", to: "2026-10-21" });
    expect(r.exercises.map((e) => e.kind)).toEqual(["custom", "bonus", "extra"]);
    expect(r.skippedSets).toBe(1);
    expect(r.sessionComment).toBe("Genou un peu sensible");
    expect(r.exerciceComments).toBe(1);
    expect(r.any).toBe(true);
  });

  it("pas de déplacement si la date d'origine est identique", () => {
    const r = summarizeAthleteChoices({ mods: {}, scheduledDate: "2026-10-21", originalScheduledDate: "2026-10-21", rescheduledByAthlete: true });
    expect(r.moved).toBeNull();
  });
});

describe("formatChoiceSets", () => {
  it("séries identiques", () => {
    expect(formatChoiceSets([{ reps: 8, kg: 60 }, { reps: 8, kg: 62.5 }])).toBe("2 × 8 @ 62.5 kg");
  });
  it("durées et séries différentes", () => {
    expect(formatChoiceSets([{ duration_s: 30 }, { duration_s: 30 }])).toBe("2 × 30 s");
    expect(formatChoiceSets([{ reps: 8 }, { reps: 6 }])).toBe("8 / 6");
  });
});

describe("athleteMoveTitle", () => {
  it("date d'origine différente", async () => {
    const { athleteMoveTitle } = await import("@/lib/athleteChoices");
    expect(athleteMoveTitle("2026-10-21", "2026-10-19")).toBe("Déplacé par l'athlète · prévu lun. 19 oct.");
    expect(athleteMoveTitle("2026-10-21", "2026-10-21")).toBe("Choix de l'athlète · séance ajoutée");
  });
});
