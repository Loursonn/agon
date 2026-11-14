import { describe, expect, it } from "vitest";
import { BODY_ZONES, levelsList, setZoneLevel, touchZone } from "../bodyZones";

describe("bodyZones", () => {
  it("ids uniques", () => {
    expect(new Set(BODY_ZONES.map((z) => z.id)).size).toBe(BODY_ZONES.length);
  });
  it("toucher note légère, puis le niveau change ou la zone part", () => {
    let l = touchZone({}, "ischios");
    expect(l).toEqual({ ischios: 1 });
    expect(touchZone(l, "ischios")).toBe(l);
    l = setZoneLevel(l, "ischios", 2);
    expect(l).toEqual({ ischios: 2 });
    expect(setZoneLevel(l, "ischios", null)).toEqual({});
  });
  it("liste dans l'ordre de la carte, zones inconnues ignorées", () => {
    expect(levelsList({ ischios: 2, quadriceps: 1, zz: 3 })).toEqual([
      { id: "quadriceps", label: "Quadriceps", level: 1 },
      { id: "ischios", label: "Ischios", level: 2 },
    ]);
  });
});
