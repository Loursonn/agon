import { describe, expect, it } from "vitest";
import { latestValues } from "@/lib/biometry";
import { BIOMETRY_FIELDS, MYJUMP_FIELDS, type MeasurementLog } from "@/features/shared/types/measurements";

const log = (p: Partial<MeasurementLog>): MeasurementLog => ({
  id: p.id ?? "x", athlete_id: "a", date: "2026-11-01", created_at: "2026-11-01T10:00:00Z", photos: {},
  weight_kg: null, bras: null, bras_g: null, bras_d: null, epaules: null, poitrine: null, taille: null, hanche: null,
  cuisse: null, cuisse_g: null, cuisse_d: null, mollet: null, mollet_g: null, mollet_d: null,
  height_cm: null, wingspan_cm: null, leg_length_cm: null, jump_start_height_cm: null,
  thigh_length_cm: null, shank_length_cm: null, arm_length_cm: null, forearm_length_cm: null, leg_standing_cm: null, ...p,
});

describe("latestValues", () => {
  it("prend la dernière valeur de chaque champ, même si la saisie la plus récente l'a laissé vide", () => {
    const logs = [
      log({ id: "old", date: "2026-09-01", height_cm: 178, leg_length_cm: 96 }),
      log({ id: "new", date: "2026-11-10", height_cm: 179, wingspan_cm: null }),
      log({ id: "mid", date: "2026-10-01", wingspan_cm: 182 }),
    ];
    expect(latestValues(logs, BIOMETRY_FIELDS)).toEqual([
      { key: "height_cm", label: "Taille (debout)", value: 179, date: "2026-11-10" },
      { key: "wingspan_cm", label: "Envergure", value: 182, date: "2026-10-01" },
    ]);
    expect(latestValues(logs, MYJUMP_FIELDS).map((v) => [v.key, v.value, v.date])).toEqual([
      ["leg_length_cm", 96, "2026-09-01"],
      ["jump_start_height_cm", null, null],
    ]);
  });

  it("même jour : la saisie créée en dernier gagne ; numeric renvoyé en texte accepté", () => {
    const logs = [
      log({ id: "a", date: "2026-11-10", created_at: "2026-11-10T08:00:00Z", jump_start_height_cm: 50 }),
      log({ id: "b", date: "2026-11-10", created_at: "2026-11-10T09:00:00Z", jump_start_height_cm: "52.5" as unknown as number }),
    ];
    expect(latestValues(logs, MYJUMP_FIELDS)[1]).toMatchObject({ value: 52.5, date: "2026-11-10" });
  });

  it("aucune saisie : tout à null", () => {
    expect(latestValues([], MYJUMP_FIELDS).every((v) => v.value === null && v.date === null)).toBe(true);
  });
});
