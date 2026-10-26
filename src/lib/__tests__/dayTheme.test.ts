import { describe, it, expect } from "vitest";
import {
  DAY_THEME_DEFAULT_COLOR,
  DAY_THEME_DOMINANTES,
  DAY_THEME_DOMINANTE_LABEL,
  DAY_THEME_INTENSITIES,
  DAY_THEME_INTENSITY_COLOR,
  DAY_THEME_INTENSITY_LABEL,
  DAY_THEME_LABEL_MAX,
  DAY_THEME_PALETTE,
  DAY_THEME_TEXT_DARK,
  DAY_THEME_TEXT_LIGHT,
  dayThemeChipLabel,
  dayThemeColors,
  dayThemeFullLabel,
  contrastRatio,
  indexDayThemesByDate,
  isDayThemeDominante,
  isDayThemeEmpty,
  isDayThemeIntensity,
  isHexColor,
  normalizeDayThemeLabel,
  normalizeHexColor,
  relativeLuminance,
  safeThemeColor,
  textColorOn,
} from "../dayTheme";

describe("listes de raccourcis", () => {
  it("libelle chaque intensité et chaque dominante", () => {
    for (const k of DAY_THEME_INTENSITIES) {
      expect(DAY_THEME_INTENSITY_LABEL[k]).toBeTruthy();
      expect(DAY_THEME_INTENSITY_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const k of DAY_THEME_DOMINANTES) {
      expect(DAY_THEME_DOMINANTE_LABEL[k]).toBeTruthy();
    }
  });

  it("expose exactement 5 intensités et 8 dominantes", () => {
    expect(DAY_THEME_INTENSITIES).toHaveLength(5);
    expect(DAY_THEME_DOMINANTES).toHaveLength(8);
  });

  it("propose 10 couleurs distinctes et normalisées", () => {
    expect(DAY_THEME_PALETTE).toHaveLength(10);
    expect(new Set(DAY_THEME_PALETTE).size).toBe(10);
    for (const c of DAY_THEME_PALETTE) expect(normalizeHexColor(c)).toBe(c);
    expect(DAY_THEME_PALETTE).toContain(DAY_THEME_DEFAULT_COLOR);
  });

  it("reconnaît les codes valides et rejette les autres", () => {
    expect(isDayThemeIntensity("hard")).toBe(true);
    expect(isDayThemeIntensity("tres_hard")).toBe(false);
    expect(isDayThemeIntensity(null)).toBe(false);
    expect(isDayThemeDominante("hyrox")).toBe(true);
    expect(isDayThemeDominante("cardio")).toBe(false);
    expect(isDayThemeDominante(undefined)).toBe(false);
  });
});

describe("isHexColor / normalizeHexColor", () => {
  it("accepte les formes courtes et longues", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
    expect(isHexColor("  #123456  ")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(isHexColor("abc")).toBe(false);
    expect(isHexColor("#abcd")).toBe(false);
    expect(isHexColor("#12345g")).toBe(false);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
    expect(isHexColor("")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(16711680)).toBe(false);
  });

  it("étend la forme courte et met en minuscules", () => {
    expect(normalizeHexColor("#ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("#EF4444")).toBe("#ef4444");
    expect(normalizeHexColor(" #fff ")).toBe("#ffffff");
  });

  it("renvoie null sur entrée invalide plutôt que de deviner", () => {
    expect(normalizeHexColor("bleu")).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });

  it("safeThemeColor retombe sur la couleur par défaut", () => {
    expect(safeThemeColor("#ABC")).toBe("#aabbcc");
    expect(safeThemeColor("nope")).toBe(DAY_THEME_DEFAULT_COLOR);
    expect(safeThemeColor(null)).toBe(DAY_THEME_DEFAULT_COLOR);
  });
});

describe("normalizeDayThemeLabel", () => {
  it("rogne et compacte les espaces", () => {
    expect(normalizeDayThemeLabel("  Jambes   lourdes \n")).toBe("Jambes lourdes");
  });

  it("coupe à la longueur max", () => {
    const long = "a".repeat(DAY_THEME_LABEL_MAX + 25);
    expect(normalizeDayThemeLabel(long)).toHaveLength(DAY_THEME_LABEL_MAX);
  });

  it("laisse intact un libellé exactement à la limite", () => {
    const exact = "b".repeat(DAY_THEME_LABEL_MAX);
    expect(normalizeDayThemeLabel(exact)).toBe(exact);
  });

  it("renvoie une chaîne vide pour tout ce qui n'est pas du texte", () => {
    expect(normalizeDayThemeLabel("   ")).toBe("");
    expect(normalizeDayThemeLabel(null)).toBe("");
    expect(normalizeDayThemeLabel(42)).toBe("");
  });
});

describe("contraste", () => {
  it("donne les luminances de référence", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
  });

  it("renvoie 0 sur une couleur illisible plutôt que NaN", () => {
    expect(relativeLuminance("pas-une-couleur")).toBe(0);
  });

  it("choisit un texte foncé sur fond clair, clair sur fond sombre", () => {
    expect(textColorOn("#ffffff")).toBe(DAY_THEME_TEXT_DARK);
    expect(textColorOn("#eab308")).toBe(DAY_THEME_TEXT_DARK); // jaune
    expect(textColorOn("#000000")).toBe(DAY_THEME_TEXT_LIGHT);
    expect(textColorOn("#1e3a8a")).toBe(DAY_THEME_TEXT_LIGHT); // bleu nuit
  });

  it("préfère le noir sur un bleu moyen, qui contraste mieux que le blanc", () => {
    // #3b82f6 : luminance ≈ 0.236 → noir 5.7:1 contre blanc 3.7:1.
    // La convention « blanc sur bleu » échouerait l'AA en texte 11 px.
    expect(textColorOn("#3b82f6")).toBe(DAY_THEME_TEXT_DARK);
  });

  it("est symétrique et vaut 1 sur deux fois la même couleur", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 5);
  });

  it("garde un ratio WCAG AA (≥ 4.5) sur toute la palette", () => {
    for (const bg of DAY_THEME_PALETTE) {
      expect(contrastRatio(bg, textColorOn(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("choisit toujours l'encre qui contraste le plus", () => {
    const probes = [...DAY_THEME_PALETTE, "#000000", "#ffffff", "#7f7f7f", "#808080", "#8b5cf6"];
    for (const bg of probes) {
      const chosen = textColorOn(bg);
      const other = chosen === DAY_THEME_TEXT_DARK ? DAY_THEME_TEXT_LIGHT : DAY_THEME_TEXT_DARK;
      expect(contrastRatio(bg, chosen)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
    }
  });

  it("retombe sur la couleur par défaut si le fond est illisible", () => {
    expect(textColorOn("pas-une-couleur")).toBe(textColorOn(DAY_THEME_DEFAULT_COLOR));
  });

  it("dayThemeColors fournit un couple fond/texte cohérent", () => {
    expect(dayThemeColors({ color: "#eab308" })).toEqual({ bg: "#eab308", fg: DAY_THEME_TEXT_DARK });
    expect(dayThemeColors({ color: "n'importe quoi" }).bg).toBe(DAY_THEME_DEFAULT_COLOR);
    expect(dayThemeColors(null).bg).toBe(DAY_THEME_DEFAULT_COLOR);
  });
});

describe("isDayThemeEmpty", () => {
  it("considère vide un thème sans texte ni code", () => {
    expect(isDayThemeEmpty(null)).toBe(true);
    expect(isDayThemeEmpty(undefined)).toBe(true);
    expect(isDayThemeEmpty({})).toBe(true);
    expect(isDayThemeEmpty({ label: "   ", color: "#ef4444" })).toBe(true);
    expect(isDayThemeEmpty({ intensity: "n'importe quoi" })).toBe(true);
  });

  it("une note seule ne suffit pas à rendre un thème visible", () => {
    expect(isDayThemeEmpty({ note: "pense à la mobilité" })).toBe(true);
  });

  it("n'est pas vide dès qu'un libellé, une intensité ou une dominante existe", () => {
    expect(isDayThemeEmpty({ label: "Seuil" })).toBe(false);
    expect(isDayThemeEmpty({ intensity: "hard" })).toBe(false);
    expect(isDayThemeEmpty({ dominante: "force" })).toBe(false);
  });
});

describe("dayThemeChipLabel", () => {
  it("préfère le libellé libre", () => {
    expect(dayThemeChipLabel({ label: "Jambes lourdes", intensity: "hard", dominante: "force" }))
      .toBe("Jambes lourdes");
  });

  it("retombe sur la dominante puis l'intensité", () => {
    expect(dayThemeChipLabel({ intensity: "hard", dominante: "hyrox" })).toBe("Spécifique HYROX");
    expect(dayThemeChipLabel({ intensity: "recup_active" })).toBe("Récup active");
  });

  it("renvoie une chaîne vide sur un thème vide", () => {
    expect(dayThemeChipLabel({})).toBe("");
    expect(dayThemeChipLabel(null)).toBe("");
  });

  it("normalise le libellé affiché", () => {
    expect(dayThemeChipLabel({ label: "  Seuil   long  " })).toBe("Seuil long");
  });
});

describe("dayThemeFullLabel", () => {
  it("concatène les parties présentes", () => {
    expect(dayThemeFullLabel({ label: "Jambes lourdes", intensity: "hard", dominante: "force" }))
      .toBe("Jambes lourdes · Hard · Force");
  });

  it("saute les parties absentes", () => {
    expect(dayThemeFullLabel({ dominante: "seuil" })).toBe("Seuil");
    expect(dayThemeFullLabel({ label: "Off", intensity: "repos" })).toBe("Off · Repos");
  });

  it("renvoie une chaîne vide sur un thème vide", () => {
    expect(dayThemeFullLabel({})).toBe("");
    expect(dayThemeFullLabel(undefined)).toBe("");
  });
});

describe("indexDayThemesByDate", () => {
  it("indexe par date ISO", () => {
    const idx = indexDayThemesByDate([
      { date: "2026-03-01", label: "A" },
      { date: "2026-03-02", label: "B" },
    ]);
    expect(idx["2026-03-01"].label).toBe("A");
    expect(idx["2026-03-03"]).toBeUndefined();
  });

  it("tolère null et garde la dernière occurrence d'une date", () => {
    expect(indexDayThemesByDate(null)).toEqual({});
    const idx = indexDayThemesByDate([
      { date: "2026-03-01", label: "ancien" },
      { date: "2026-03-01", label: "récent" },
    ]);
    expect(idx["2026-03-01"].label).toBe("récent");
  });
});
