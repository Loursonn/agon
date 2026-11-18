import { describe, expect, it } from "vitest";
import { compareDone } from "@/lib/compareDone";

describe("compareDone", () => {
  it("reps et kg : plus que prévu = plus dur (vert), moins = plus facile (rouge)", () => {
    expect(compareDone(82.5, 80)).toBe("plus");
    expect(compareDone(9, 10)).toBe("moins");
    expect(compareDone(5, 5)).toBe("egal");
  });
  it("RIR : la logique s'inverse (plus de RIR = plus facile)", () => {
    expect(compareDone(3, 2, false)).toBe("moins");
    expect(compareDone(0, 2, false)).toBe("plus");
  });
  it("sans valeur prévue ou réalisée : pas de comparaison", () => {
    expect(compareDone(null, 2)).toBe("neutre");
    expect(compareDone(5, undefined)).toBe("neutre");
  });
});
