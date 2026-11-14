import { describe, expect, it } from "vitest";

/**
 * Phase 6 (audit 2026-11, §10) : plus aucune couleur hex en dur dans les écrans.
 * Toute couleur passe par src/styles/tokens.css : `C` / `H` de src/lib/theme.ts,
 * ou les classes Tailwind `*-agon-*`. Couleur sans token → ajouter le token.
 */
const files = {
  ...import.meta.glob("/src/features/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("/src/pages/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_])/g;

/** Retire les commentaires `// …` et `/* … *\/` (assez fin pour ces fichiers : une URL `https://` n'est pas un commentaire). */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("couleurs des écrans", () => {
  it("aucune couleur hex en dur dans src/features et src/pages", () => {
    const offenders: string[] = [];
    for (const [path, code] of Object.entries(files)) {
      if (path.includes("/__tests__/")) continue;
      stripComments(code).split("\n").forEach((line, i) => {
        const m = line.match(HEX);
        if (m) offenders.push(`${path}:${i + 1} ${m.join(" ")}`);
      });
    }
    expect(Object.keys(files).length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
