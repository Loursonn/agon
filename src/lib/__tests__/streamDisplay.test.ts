import { describe, expect, it } from "vitest";
import { emptyStream } from "@shared/activityFiles/stream";
import { downsampleStream } from "@/lib/streamDisplay";

function stream(n: number) {
  const s = emptyStream();
  s.t = Array.from({ length: n }, (_, i) => i);
  s.timer = s.t.slice();
  s.hr = s.t.map((i) => 120 + (i % 7));
  s.dist = s.t.map((i) => i * 3);
  return s;
}

describe("série allégée pour l'affichage", () => {
  it("courte : rendue telle quelle", () => {
    const s = stream(100);
    expect(downsampleStream(s, 3000)).toBe(s);
  });

  it("longue : au plus le plafond, pics gardés, colonnes absentes restent null", () => {
    const s = stream(10_000);
    s.hr![4321] = 199;
    s.hr![8000] = 60;
    s.hr![50] = null;
    const d = downsampleStream(s, 3000);
    expect(d.t.length).toBeLessThanOrEqual(3000);
    expect(d.hr!.length).toBe(d.t.length);
    expect(Math.max(...(d.hr as number[]))).toBe(199);
    expect(Math.min(...(d.hr as number[]))).toBe(60);
    expect(d.speed).toBeNull();
    expect(d.t[0]).toBe(0);
    expect(d.t[d.t.length - 1]).toBe(9999);
    // Distance cumulée : points réels, toujours croissante.
    expect(d.dist!.every((v, i) => i === 0 || (v as number) >= (d.dist![i - 1] as number))).toBe(true);
  });

  it("seau sans aucune valeur → null, pas 0", () => {
    const s = stream(10);
    s.hr = s.t.map(() => null);
    const d = downsampleStream(s, 4);
    expect(d.hr!.every((v) => v === null)).toBe(true);
  });
});
