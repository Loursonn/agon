import { describe, expect, it } from "vitest";
import { loadDelta } from "../loadDelta";

describe("loadDelta", () => {
  it("écart avec la dernière fois", () => {
    expect(loadDelta("120", "115 × 3", "kg")).toBe("+5 kg");
    expect(loadDelta("117,5", "120 × 3", "kg")).toBe("−2,5 kg");
    expect(loadDelta("120", "120×3", "kg")).toBe("=");
    expect(loadDelta("", "120 × 3", "kg")).toBeNull();
    expect(loadDelta("120", undefined, "kg")).toBeNull();
  });
});
