import { describe, expect, it } from "vitest";
import { legalSlug } from "../legalSlug";

describe("legalSlug", () => {
  it("retire le numéro, les accents et la ponctuation", () => {
    expect(legalSlug("3. Vos engagements")).toBe("vos-engagements");
    expect(legalSlug("5. Génération assistée par intelligence artificielle")).toBe("generation-assistee-par-intelligence-artificielle");
    expect(legalSlug("Relation coach / athlète")).toBe("relation-coach-athlete");
  });
});
