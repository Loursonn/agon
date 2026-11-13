import { describe, expect, it } from "vitest";
import { initials } from "../initials";

describe("initials", () => {
  it("deux premières lettres", () => {
    expect(initials("Agon Démo")).toBe("AD");
    expect(initials("  léa ")).toBe("L");
    expect(initials("")).toBe("?");
  });
});
