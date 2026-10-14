import { describe, it, expect } from "vitest";
import { fitDimensions, formatFileSize } from "../compressImage";

describe("fitDimensions", () => {
  it("réduit le plus grand côté à maxDim en gardant le ratio", () => {
    expect(fitDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitDimensions(1170, 2532, 1600)).toEqual({ width: 739, height: 1600 });
  });
  it("n'agrandit jamais", () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("dimensions nulles", () => {
    expect(fitDimensions(0, 100, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe("formatFileSize", () => {
  it("formate en o / Ko / Mo", () => {
    expect(formatFileSize(512)).toBe("512 o");
    expect(formatFileSize(240 * 1024)).toBe("240 Ko");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1,3 Mo");
    expect(formatFileSize(null)).toBe("—");
  });
});
