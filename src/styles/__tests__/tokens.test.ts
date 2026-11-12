import { describe, expect, it } from "vitest";
import tokensCss from "@/styles/tokens.css?raw";
import indexCss from "@/index.css?raw";
import { colorTokenNames, parseTokens, resolveToken, scale } from "@/styles/parseTokens";
import { BLOC_COLORS, BT, C, HABIT_COLORS, PRIMARY, SECONDARY, SUCCESS, TERTIARY, NEUTRAL, TOKENS, alpha } from "@/lib/theme";

/*
 * Rendu historique (avant src/styles/tokens.css, 2026-11-08) : valeurs exactes de
 * l'ancien src/lib/theme.ts et des variables shadcn de src/index.css. Ces tests
 * prouvent que le passage aux tokens n'a rien changé.
 * Quand la charte finale est branchée, ces valeurs DOIVENT changer : mettre à jour
 * (ou supprimer) les blocs « rendu historique », garder les autres.
 */
const LEGACY_C = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(231,211,168,0.10)", brdL: "rgba(231,211,168,0.18)",
  tx: "#FFFFFF", tx2: "#B9AE9C", tx3: "#7D7468",
  ac: "#FFC933", acS: "rgba(255,201,51,0.12)",
  g: "#66F03C", gS: "rgba(102,240,60,0.1)", gV: "#66F03C", gP: "#3D6B24",
  o: "#FF9500", oS: "rgba(255,149,0,0.1)", oV: "#FF9500", oP: "#94560F",
  y: "#E6CB86", yS: "rgba(230,203,134,0.1)",
  r: "#FF5A33", rS: "rgba(255,90,51,0.1)", rV: "#FF5A33", rP: "#8E3220",
  b: "#33B5FF", bS: "rgba(51,181,255,0.1)", bV: "#33B5FF", bP: "#25506B",
  acV: "#FFC933", acP: "#8A6A2C",
  pat: "#1FF0B0", patV: "#1FF0B0", patP: "#1F5E47",
  ame: "#F060C0", ameV: "#F060C0", ameP: "#5E2A48",
  coach: "#FFC933", coachS: "rgba(255,201,51,0.12)",
};

const LEGACY_SHADCN: Record<string, string> = {
  "--background": "20 17% 3%", "--foreground": "0 0% 100%",
  "--card": "24 14% 10%", "--card-foreground": "0 0% 100%",
  "--popover": "24 12% 13%", "--popover-foreground": "0 0% 100%",
  "--primary": "43 100% 60%", "--primary-foreground": "24 28% 7%",
  "--secondary": "38 50% 78%", "--secondary-foreground": "24 28% 7%",
  "--muted": "24 12% 13%", "--muted-foreground": "27 8% 45%",
  "--accent": "43 100% 60%", "--accent-foreground": "24 28% 7%",
  "--destructive": "13 100% 60%", "--destructive-foreground": "0 0% 100%",
  "--border": "38 43% 78% / 0.12", "--input": "24 12% 13%", "--ring": "43 100% 60%",
  "--sidebar-background": "20 17% 3%", "--sidebar-foreground": "27 8% 45%",
  "--sidebar-primary": "43 100% 60%", "--sidebar-primary-foreground": "24 28% 7%",
  "--sidebar-accent": "43 100% 60% / 0.1", "--sidebar-accent-foreground": "43 100% 60%",
  "--sidebar-border": "38 43% 78% / 0.10", "--sidebar-ring": "43 100% 60%",
};
const LEGACY_OTHER: Record<string, string> = {
  "--radius": "0.375rem",
  "--font-display": '"Archivo", system-ui, sans-serif',
  "--font-ui": '"Geist", system-ui, sans-serif',
  "--font-data": '"Geist Mono", ui-monospace, monospace',
};

const norm = (v: string) => v.replace(/\s+/g, "").toUpperCase();

describe("tokens — rendu historique", () => {
  it("chaque C.x vaut exactement la couleur d'avant", () => {
    expect(Object.keys(C).sort()).toEqual(Object.keys(LEGACY_C).sort());
    for (const [k, v] of Object.entries(LEGACY_C)) expect(norm(C[k as keyof typeof C]), `C.${k}`).toBe(norm(v));
  });

  it("alias, blocs, habitudes et types de bloc inchangés", () => {
    expect([PRIMARY, SECONDARY, TERTIARY, NEUTRAL, SUCCESS]).toEqual(["#FFC933", "#FFC933", "#FF9500", "#7D7468", "#66F03C"]);
    expect(Object.fromEntries(Object.entries(BT).map(([k, v]) => [k, v.c]))).toEqual({
      // Direction « peps » (12/11) : Mvt principal or, Hypertrophie rose, Besoin bleu, Assoc. turquoise, Core orange.
      PERF: "#FFC933", ESTH: "#F060C0", BESOIN: "#33B5FF", ASSOC: "#2EE6C5", CORE: "#FF7A45",
    });
    expect(BLOC_COLORS).toEqual(["#FFC933", "#FF5A33", "#66F03C", "#33B5FF", "#A67C52", "#1FF0B0", "#F060C0", "#FF9500", "#E7D3A8", "#8E8780"]);
    expect(HABIT_COLORS).toEqual(["#FFC933", "#66F03C", "#33B5FF", "#FF5A33", "#FF9500", "#1FF0B0", "#F060C0", "#E7D3A8"]);
  });

  it("les variables shadcn de index.css résolvent vers les anciennes valeurs", () => {
    const all = { ...parseTokens(tokensCss), ...parseTokens(indexCss) };
    for (const [k, channels] of Object.entries(LEGACY_SHADCN)) expect(resolveToken(all, k), k).toBe(`hsl(${channels})`);
    for (const [k, v] of Object.entries(LEGACY_OTHER)) expect(resolveToken(all, k), k).toBe(v);
  });
});

describe("tokens — garde-fous (restent valables avec la charte finale)", () => {
  it("les couleurs de C concaténées avec une opacité (C.r + \"30\") restent en #RRGGBB", () => {
    const tinted = (k: string) => k === "brd" || k === "brdL" || k.endsWith("S");
    for (const [k, v] of Object.entries(C)) if (!tinted(k)) expect(v, `C.${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    for (const v of [...BLOC_COLORS, ...HABIT_COLORS]) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("index.css ne porte plus aucune valeur de couleur", () => {
    const code = indexCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "");
    expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|\b(rgba?|hsla?)\(|\b\d+ \d+% \d+%/);
  });

  it("échelle typo des composants : 11 px minimum", () => {
    const sizes = scale(TOKENS, "text");
    expect(sizes.length).toBeGreaterThan(3);
    for (const s of sizes) {
      const px = parseFloat(resolveToken(TOKENS, `--agon-text-${s}`));
      expect(px, s).toBeGreaterThanOrEqual(11);
    }
  });

  it("chaque token de couleur exposé à Tailwind se résout", () => {
    for (const k of colorTokenNames(TOKENS)) expect(resolveToken(TOKENS, `--agon-${k}`)).not.toMatch(/var\(/);
  });
});

describe("parseTokens / resolveToken", () => {
  it("ignore les commentaires, garde la dernière déclaration, résout les var()", () => {
    const t = parseTokens(":root { /* --x: #000; */ --a: #111111; --a: #222222; --b: var(--a); --c: 1px solid var(--b); }");
    expect(t["--x"]).toBeUndefined();
    expect(resolveToken(t, "--b")).toBe("#222222");
    expect(resolveToken(t, "--c")).toBe("1px solid #222222");
  });

  it("lève sur un token absent ou circulaire", () => {
    const t = parseTokens(":root { --a: var(--b); --b: var(--a); }");
    expect(() => resolveToken(t, "--zz")).toThrow(/absent/);
    expect(() => resolveToken(t, "--a")).toThrow(/circulaire/);
  });
});

describe("alpha()", () => {
  it("donne le même résultat que la concaténation hex", () => {
    expect(alpha(C.r, 0x30 / 255)).toBe(C.r + "30");
    expect(alpha("#FFC933", 0.25)).toBe("#FFC93340");
    expect(alpha("#FFC933", 2)).toBe("#FFC933FF");
  });
  it("passe par color-mix pour une couleur non hex", () => {
    expect(alpha("var(--agon-accent)", 0.2)).toBe("color-mix(in srgb, var(--agon-accent) 20%, transparent)");
  });
});
