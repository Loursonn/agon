import { describe, expect, it } from "vitest";
import {
  EMPTY_SESSION_PAIN, sessionPainByLabel, sessionPainBySession, sessionPainIncomplete, sessionPainKey, sessionPainPayload, sessionPainText,
} from "../sessionPain";

describe("douleur de séance (fin de séance, 15/11)", () => {
  it("Non ou pas de réponse : rien à écrire", () => {
    expect(sessionPainPayload(EMPTY_SESSION_PAIN)).toBeNull();
    expect(sessionPainPayload({ has: false, levels: { genou: 6 }, note: "x" })).toBeNull();
  });

  it("Oui : zones notées au-dessus de 0, commentaire nettoyé", () => {
    expect(sessionPainPayload({ has: true, levels: { genou: 6, cou: 0, mollet: null }, note: "  au squat " }))
      .toEqual({ levels: { genou: 6 }, note: "au squat" });
    expect(sessionPainPayload({ has: true, levels: { genou: 3 }, note: "   " })).toEqual({ levels: { genou: 3 }, note: null });
  });

  it("Oui sans zone notée : rien à écrire, signalé comme incomplet", () => {
    const a = { has: true, levels: { genou: null }, note: "" };
    expect(sessionPainPayload(a)).toBeNull();
    expect(sessionPainIncomplete(a)).toBe(true);
    expect(sessionPainIncomplete({ has: true, levels: { genou: 4 }, note: "" })).toBe(false);
  });

  it("texte pour le coach", () => {
    expect(sessionPainText({ genou: 6, lombaires: 3 })).toBe("Genou 6/10, lombaires 3/10");
    expect(sessionPainText({})).toBeNull();
    expect(sessionPainText(null)).toBeNull();
  });

  it("blessure déclarée : les zones partent par leur libellé", () => {
    expect(sessionPainByLabel({ genou: 6, cheville_pied: 4, cou: 0 })).toEqual({ Genou: 6, "Cheville / pied": 4 });
  });

  it("suivis regroupés par séance, pour le coach", () => {
    const f = (p: Partial<Parameters<typeof sessionPainBySession>[0][number]>) => ({
      zone: "Genou", pain_level: 6, note: null, workout_log_id: null, energy_assignment_id: null, ...p,
    });
    const m = sessionPainBySession([
      f({ workout_log_id: "L1", note: " au squat " }),
      f({ workout_log_id: "L1", zone: "Lombaires", pain_level: 3, note: "au squat" }),
      f({ energy_assignment_id: "E1", zone: "Mollet", pain_level: 4 }),
      f({ zone: "Cou" }), // séance supprimée
    ]);
    expect(m.get(sessionPainKey.workout("L1"))).toEqual({ levels: { Genou: 6, Lombaires: 3 }, note: "au squat" });
    expect(m.get(sessionPainKey.energy("E1"))).toEqual({ levels: { Mollet: 4 }, note: null });
    expect(m.size).toBe(2);
    expect(sessionPainText(m.get(sessionPainKey.workout("L1"))!.levels)).toBe("Genou 6/10, lombaires 3/10");
  });
});
