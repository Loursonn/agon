import { describe, expect, it } from "vitest";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import { blocLetter, prescriptionLine, prescriptionLoad } from "@/lib/todayPreview";

const params = (o: Partial<ExerciceParams> = {}): ExerciceParams => ({
  nb_series: 5,
  reps: { mode: "global", value: 3 },
  reps_mode: { mode: "global", value: "EC" },
  charge_unit: "kg",
  charge: { mode: "global", value: 120 },
  rir: { mode: "global", value: null },
  tempo: { mode: "global", value: "" },
  ...o,
});

describe("aperçu de séance (accueil athlète)", () => {
  it("séries × reps · charge en kg", () => {
    expect(prescriptionLine("classique", params())).toBe("5 × 3 · 120 kg");
  });

  it("charge décimale à la française, %RM", () => {
    expect(prescriptionLoad(params({ charge: { mode: "global", value: 117.5 } }))).toBe("117,5 kg");
    expect(prescriptionLoad(params({ charge_unit: "%RM", charge: { mode: "global", value: 75 } }))).toBe("75 %");
  });

  it("sans charge : le RIR visé, sinon rien", () => {
    const noLoad = params({ charge: { mode: "global", value: null }, rir: { mode: "global", value: 2 } });
    expect(prescriptionLine("classique", noLoad)).toBe("5 × 3 · RIR 2");
    expect(prescriptionLoad(params({ charge: { mode: "global", value: null } }))).toBeNull();
    expect(prescriptionLoad(params({ charge_unit: "PDC" }))).toBeNull();
  });

  it("charge par série : pas de charge unique affichée", () => {
    expect(prescriptionLoad(params({ charge: { mode: "par_serie", values: [100, 110, 120, 120, 120] } }))).toBeNull();
  });

  it("isométrie en secondes, mode libre", () => {
    const iso = params({ nb_series: 3, reps: { mode: "global", value: 45 }, reps_mode: { mode: "global", value: "iso" }, charge: { mode: "global", value: null } });
    expect(prescriptionLine("classique", iso)).toBe("3 × 45 s");
    expect(prescriptionLine("libre", null)).toBe("Libre");
  });

  it("lettres de bloc", () => {
    expect([0, 1, 2, 3].map(blocLetter)).toEqual(["A", "B", "C", "D"]);
  });
});
