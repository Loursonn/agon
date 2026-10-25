import { describe, it, expect } from "vitest";
import {
  meanSd,
  zScore,
  shiftIso,
  daysBetween,
  assessWellness,
  fmtFr,
  formatDeviation,
  formatAssessment,
  SD_FLOOR_ITEM,
} from "@/lib/wellnessBaseline";
import type { WellnessData } from "@/features/shared/types/athlete";

/** Saisie où tous les items valent la même note. */
const V = (v: number): WellnessData => ({
  fatigue: v, sommeil: v, stress: v, energie: v, doms: v,
});

/**
 * Base alternée 5 / 3 sur `n` jours, le dernier étant `endIso`.
 * Moyenne des items = 4, écart-type ≈ 1,04 (au-dessus du plancher) : une base
 * réaliste, où un item ne déclenche pas d'alerte au moindre point perdu.
 */
function alternating(endIso: string, n = 14): Record<string, WellnessData> {
  const h: Record<string, WellnessData> = {};
  for (let i = 0; i < n; i++) {
    h[shiftIso(endIso, -(n - 1 - i))] = V(i % 2 === 0 ? 5 : 3);
  }
  return h;
}

/** Base plate : même note tous les jours, donc écart-type nul. */
function flat(endIso: string, n: number, value: number): Record<string, WellnessData> {
  const h: Record<string, WellnessData> = {};
  for (let i = 0; i < n; i++) h[shiftIso(endIso, -i)] = V(value);
  return h;
}

describe("statistiques", () => {
  it("moyenne et écart-type d'échantillon (n−1)", () => {
    expect(meanSd([])).toEqual({ mean: 0, sd: 0, n: 0 });
    expect(meanSd([4])).toEqual({ mean: 4, sd: 0, n: 1 });
    const { mean, sd, n } = meanSd([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBe(5);
    expect(n).toBe(8);
    // Écart-type d'échantillon = 2,138 (celui de population vaudrait 2).
    expect(sd).toBeCloseTo(2.1381, 3);
  });

  it("le plancher d'écart-type borne la sensibilité", () => {
    // Sans plancher, un écart-type nul donnerait un z infini.
    expect(zScore(3, 4, 0, SD_FLOOR_ITEM)).toBe(-2);
    // Au-dessus du plancher, c'est l'écart-type réel qui compte.
    expect(zScore(3, 4, 1, SD_FLOOR_ITEM)).toBe(-1);
  });
});

describe("dates", () => {
  it("décale sans dériver avec le fuseau", () => {
    expect(shiftIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIso("2024-02-28", 1)).toBe("2024-02-29"); // année bissextile
    expect(shiftIso("2026-03-01", -28)).toBe("2026-02-01");
  });

  it("compte les jours entre deux dates", () => {
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(0);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-02-28")).toBe(-1);
    // Passage à l'heure d'été : toujours 1 jour, pas 0,96.
    expect(daysBetween("2026-03-28", "2026-03-29")).toBe(1);
  });
});

describe("assessWellness", () => {
  const today = "2026-03-01";

  it("sans historique, aucune alerte", () => {
    expect(assessWellness(null, today)).toMatchObject({ level: "none", date: null });
    expect(assessWellness({}, today)).toMatchObject({ level: "none", date: null });
  });

  it("moins de 7 saisies : habitude en construction, aucune alerte", () => {
    const history = { ...flat("2026-02-28", 6, 5), [today]: V(1) };
    const a = assessWellness(history, today);
    expect(a.baselineBuilding).toBe(true);
    expect(a.baselineCount).toBe(6);
    expect(a.level).toBe("none"); // 1/5 partout, mais rien pour comparer
    expect(a.deviations).toEqual([]);
    expect(formatAssessment(a)).toBe("Habitude en construction");
  });

  it("7 saisies suffisent à juger", () => {
    const history = { ...flat("2026-02-28", 7, 4), [today]: V(4) };
    const a = assessWellness(history, today);
    expect(a.baselineBuilding).toBe(false);
    expect(a.baselineCount).toBe(7);
    expect(a.level).toBe("none"); // identique à l'habitude
  });

  it("écart-type nul : le plancher évite le z infini et une chute d'un point alerte", () => {
    // 14 jours à 4/5 partout : l'athlète ne varie jamais.
    const history = { ...flat("2026-02-28", 14, 4), [today]: { ...V(4), doms: 3 } };
    const a = assessWellness(history, today);
    expect(a.level).toBe("alerte");
    expect(a.deviations).toHaveLength(1);
    expect(a.deviations[0]).toMatchObject({
      item: "doms", label: "Fraîcheur musculaire", value: 3, mean: 4, sd: 0, z: -2,
      level: "alerte",
    });
    // Score 76 contre 80 d'habitude : −0,8 avec le plancher de 5 points, sous le seuil.
    expect(a.deviations.some((d) => d.item === "score")).toBe(false);
  });

  it("chute d'un item sur une base variable : vigilance avant alerte", () => {
    const history = { ...alternating("2026-02-28"), [today]: { ...V(4), doms: 2 } };
    const a = assessWellness(history, today);
    // Habitude de l'item = 4 ± 1,04 → z = −1,93 : moins bien que d'habitude,
    // mais pas au point de l'alerte.
    expect(a.level).toBe("vigilance");
    const dev = a.deviations.find((d) => d.item === "doms");
    expect(dev?.level).toBe("vigilance");
    expect(dev?.z).toBeCloseTo(-1.926, 2);
    expect(formatDeviation(dev!)).toBe("Fraîcheur musculaire 2/5 (habitude 4)");
  });

  it("baisse diffuse du score global, sans item en cause", () => {
    const history = {
      ...alternating("2026-02-27"),
      "2026-02-28": V(5),
      [today]: V(3),
    };
    const a = assessWellness(history, today);
    expect(a.level).toBe("vigilance");
    expect(a.deviations).toHaveLength(1);
    expect(a.deviations[0]).toMatchObject({ item: "score", label: "Score global", value: 60 });
    expect(a.deviations[0].z).toBeCloseTo(-1.033, 2);
    expect(a.twoConsecutive).toBe(false);
    expect(formatAssessment(a)).toBe("Score global 60/100 (habitude 81,3)");
  });

  it("deux saisies de suite sous le seuil global : la vigilance passe en alerte", () => {
    const low: WellnessData = { ...V(3), doms: 2 }; // score 56
    const history = {
      ...alternating("2026-02-27"),
      "2026-02-28": low,
      [today]: low,
    };
    const a = assessWellness(history, today);
    expect(a.twoConsecutive).toBe(true);
    expect(a.level).toBe("alerte");
    // Aucun écart n'atteint seul le niveau d'alerte : c'est la répétition qui l'impose.
    expect(a.deviations.every((d) => d.level === "vigilance")).toBe(true);
    // Le plus grave d'abord.
    expect(a.deviations.map((d) => d.item)).toEqual(["doms", "score"]);
  });

  it("une seule saisie basse ne suffit pas à la répétition", () => {
    const history = {
      ...alternating("2026-02-27"),
      "2026-02-28": V(5), // la veille était bonne
      [today]: { ...V(3), doms: 2 },
    };
    expect(assessWellness(history, today).twoConsecutive).toBe(false);
  });

  it("saisie trop ancienne : on ne l'interprète pas", () => {
    const history = { ...flat("2026-02-20", 14, 4), "2026-02-20": { ...V(4), doms: 1 } };
    const a = assessWellness(history, today);
    expect(a.level).toBe("none");
    expect(a.date).toBe("2026-02-20"); // la date reste visible côté coach
    expect(a.baselineCount).toBe(0);
    expect(a.deviations).toEqual([]);
  });

  it("la saisie de la veille compte encore", () => {
    const yesterday = "2026-02-28";
    const history = { ...flat("2026-02-27", 14, 4), [yesterday]: { ...V(4), doms: 3 } };
    const a = assessWellness(history, today);
    expect(a.date).toBe(yesterday);
    expect(a.level).toBe("alerte");
  });

  it("une saisie dans le futur est ignorée", () => {
    const history = { ...flat("2026-03-01", 14, 4), "2026-03-05": { ...V(4), doms: 1 } };
    const a = assessWellness(history, today);
    expect(a.level).toBe("none");
    expect(a.date).toBe("2026-03-05");
  });

  it("la saisie évaluée n'entre pas dans sa propre habitude", () => {
    // 14 jours à 5, puis une chute à 2. Si la saisie comptait dans sa base, elle
    // tirerait la moyenne vers elle et minorerait l'écart.
    const history = { ...flat("2026-02-28", 14, 5), [today]: V(2) };
    const a = assessWellness(history, today);
    const dev = a.deviations.find((d) => d.item === "fatigue");
    expect(dev?.mean).toBe(5);
    expect(dev?.z).toBe(-6); // (2 − 5) / 0,5
  });

  it("les saisies hors fenêtre de 28 jours ne comptent pas", () => {
    const history = {
      ...flat("2026-01-10", 20, 5), // bien avant la fenêtre
      ...flat("2026-02-28", 7, 4),
      [today]: V(4),
    };
    expect(assessWellness(history, today).baselineCount).toBe(7);
  });

  it("ignore les clés qui ne sont pas des dates", () => {
    const history = { ...flat("2026-02-28", 7, 4), [today]: V(4), nope: V(1) } as Record<
      string,
      WellnessData
    >;
    const a = assessWellness(history, today);
    expect(a.date).toBe(today);
    expect(a.baselineCount).toBe(7);
  });
});

describe("formatage", () => {
  it("virgule française, sans décimale inutile", () => {
    expect(fmtFr(4)).toBe("4");
    expect(fmtFr(4.06)).toBe("4,1");
    expect(fmtFr(72.04)).toBe("72");
    expect(fmtFr(-1.25)).toBe("-1,2");
  });

  it("un écart en une ligne lisible", () => {
    expect(formatDeviation({
      item: "doms", label: "Fraîcheur musculaire", value: 2, mean: 4.14, sd: 0.6,
      z: -2.1, level: "alerte",
    })).toBe("Fraîcheur musculaire 2/5 (habitude 4,1)");
    expect(formatDeviation({
      item: "score", label: "Score global", value: 48, mean: 72, sd: 8,
      z: -3, level: "alerte",
    })).toBe("Score global 48/100 (habitude 72)");
  });
});
