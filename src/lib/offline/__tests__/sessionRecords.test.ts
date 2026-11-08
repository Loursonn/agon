import { describe, it, expect } from "vitest";
import { collectRecordSets, newRecordsMessage } from "../sessionRecords";

describe("collectRecordSets", () => {
  it("séries faites des exercices rattachés à un record seulement", () => {
    const sets = collectRecordSets(
      {
        squat: [{ done: true, kg: 100, reps: 5 }, { done: false, kg: 110, reps: 3 }, { done: true, skipped: true, kg: 120, reps: 1 }],
        gainage: [{ done: true, kg: null, reps: 1 }],
        dc: [null, { done: true, kg: 80, reps: 8 }],
      },
      { squat: "Squat", gainage: null, dc: "Développé couché" },
    );
    expect(sets).toEqual([
      { ref: "Squat", kg: 100, reps: 5 },
      { ref: "Développé couché", kg: 80, reps: 8 },
    ]);
  });
});

describe("newRecordsMessage", () => {
  it("virgule décimale, liste", () => {
    expect(newRecordsMessage([{ ref: "Squat", kg: 120.5 }, { ref: "DC", kg: 90 }])).toBe("Nouveau record : Squat 120,5 kg, DC 90 kg");
  });
});
