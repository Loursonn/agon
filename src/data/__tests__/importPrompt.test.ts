import { describe, it, expect } from "vitest";
import { IMPORT_PROMPT } from "../importPrompt";
import { parseEnergySession } from "@/lib/import/yoxx/parseEnergySession";
import { parseMuscuSession } from "@/lib/import/yoxx/parseMuscuSession";
import { parseSpecificSession } from "@/lib/import/yoxx/parseSpecificSession";

// Les exemples du prompt servent de modèle à l'IA : ils doivent être 100 % lisibles.
const blocks = [...IMPORT_PROMPT.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
const byType = (prefix: string) => blocks.find((b) => b.startsWith(prefix))!;

describe("exemples du prompt d'import", () => {
  it("contient un exemple par type", () => {
    expect(blocks).toHaveLength(3);
  });
  it("énergétique : aucune erreur ni avertissement", () => {
    const r = parseEnergySession(byType("SÉANCE ÉNERGÉTIQUE"));
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
    expect(r.session.intervals.length).toBeGreaterThan(0);
  });
  it("muscu : aucune erreur ni avertissement", () => {
    const r = parseMuscuSession(byType("SÉANCE MUSCU"));
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
  });
  it("spécifique : aucune erreur ni avertissement", () => {
    const r = parseSpecificSession(byType("SÉANCE SPÉCIFIQUE"));
    expect(r.issues.filter((i) => i.level !== "info")).toEqual([]);
  });
});
