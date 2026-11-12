import { describe, it, expect } from "vitest";
import { localISO, normalizeDayKey, normalizeDayMap, todayKey } from "@/lib/date";

describe("localISO", () => {
  it("rend le jour calendaire LOCAL, pas le jour UTC", () => {
    // 17 août, 00h30 heure locale. En UTC+1/+2, `toISOString()` renverrait le
    // 16 : c'est exactement le décalage qui faisait enregistrer une habitude
    // ou un wellness sur la veille quand l'athlète saisissait après minuit.
    const justAfterMidnight = new Date(2026, 7, 17, 0, 30);
    expect(localISO(justAfterMidnight)).toBe("2026-08-17");
  });

  it("rend le même jour en fin de journée", () => {
    expect(localISO(new Date(2026, 7, 17, 23, 45))).toBe("2026-08-17");
  });

  it("pade mois et jour sur deux chiffres", () => {
    expect(localISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("sans argument, correspond aux composantes locales de maintenant", () => {
    const now = new Date();
    const expected =
      `${now.getFullYear()}-` +
      `${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;
    expect(localISO()).toBe(expected);
  });

  it("est cohérent avec todayKey(), au format près", () => {
    expect(normalizeDayKey(todayKey())).toBe(localISO());
  });
});

describe("normalizeDayKey", () => {
  it("convertit la clé compacte de todayKey() en ISO", () => {
    expect(normalizeDayKey("20260817")).toBe("2026-08-17");
  });

  it("laisse une clé déjà ISO intacte", () => {
    expect(normalizeDayKey("2026-08-17")).toBe("2026-08-17");
  });

  it("ne touche pas à ce qui n'est pas une date compacte", () => {
    expect(normalizeDayKey("3")).toBe("3");
    expect(normalizeDayKey("")).toBe("");
  });
});

describe("normalizeDayMap", () => {
  it("réindexe un historique mixte en clés ISO", () => {
    // wellnessHistory contient les deux formats : écrit par saveWellness en
    // "YYYYMMDD", lu partout ailleurs en "YYYY-MM-DD".
    const wh = {
      "20260816": { score: 70 },
      "2026-08-17": { score: 80 },
    };
    expect(normalizeDayMap(wh)).toEqual({
      "2026-08-16": { score: 70 },
      "2026-08-17": { score: 80 },
    });
  });

  it("tolère null et undefined", () => {
    expect(normalizeDayMap(null)).toEqual({});
    expect(normalizeDayMap(undefined)).toEqual({});
  });
});

describe("headerDate", () => {
  it("formate court et long", async () => {
    const { headerDate } = await import("../date");
    const d = new Date(2026, 10, 8, 12);
    expect(headerDate(d)).toBe("Dim. 8 nov.");
    expect(headerDate(d, "long")).toBe("Dimanche 8 novembre");
  });
});
