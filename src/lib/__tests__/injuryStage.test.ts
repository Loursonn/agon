import { describe, expect, it } from "vitest";
import { fmtStageDay, fmtStageDuration, stageIndex, stageOf, stagePassages } from "../injuryStage";
import type { InjuryStageEvent } from "@/features/shared/types/medical";

const ev = (stage: InjuryStageEvent["stage"], changed_at: string, entry_id = "e1"): InjuryStageEvent =>
  ({ id: changed_at, entry_id, stage, changed_at, changed_by: null });

describe("stageOf", () => {
  it("lit l'étape enregistrée", () => {
    expect(stageOf({ status: "en_cours", recovery_stage: "reathletisation" })).toBe("reathletisation");
  });
  it("se replie sur le statut sans étape", () => {
    expect(stageOf({ status: "en_cours" })).toBe("blesse");
    expect(stageOf({ status: "gueri", recovery_stage: null })).toBe("gueri");
  });
  it("range les étapes dans l'ordre de la guérison", () => {
    expect(stageIndex("blesse")).toBe(0);
    expect(stageIndex("gueri")).toBe(4);
  });
});

describe("stagePassages", () => {
  const today = new Date("2026-11-20T12:00:00");
  it("date chaque étape et compte ses jours", () => {
    const out = stagePassages([
      ev("rehabilitation", "2026-11-08T09:00:00"),
      ev("blesse", "2026-11-02T10:00:00"),
      ev("blesse", "2026-11-01T10:00:00", "autre"),
    ], "e1", today);
    expect(out).toEqual([
      { stage: "blesse", day: "2026-11-02", days: 6 },
      { stage: "rehabilitation", day: "2026-11-08", days: 12 },
    ]);
  });
  it("fusionne une étape notée deux fois de suite", () => {
    const out = stagePassages([ev("blesse", "2026-11-02T10:00:00"), ev("blesse", "2026-11-03T10:00:00")], "e1", today);
    expect(out).toHaveLength(1);
  });
  it("sans historique : rien", () => {
    expect(stagePassages([], "e1", today)).toEqual([]);
  });
});

describe("formats", () => {
  it("durées et jours", () => {
    expect(fmtStageDuration(0)).toBe("aujourd'hui");
    expect(fmtStageDuration(5)).toBe("5 j");
    expect(fmtStageDuration(21)).toBe("3 sem");
    expect(fmtStageDay("2026-11-08")).toBe("08/11");
  });
});
