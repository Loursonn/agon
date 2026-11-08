import { describe, expect, it } from "vitest";
import { applyEnergyCompletion, applyEnergyRpe, isPartialBlockLogs } from "../completion";

const row = {
  id: "a1",
  status: "planned",
  block_logs: { b1: { done: true, note: "ok" } },
  notes: "note coach",
  actual_duration_min: 40,
  activity_url: "https://strava/1",
  activity_type: "course",
  distance_km: 8,
  rpe_score: null as number | null,
};

describe("applyEnergyCompletion (mêmes règles que la RPC)", () => {
  it("valide, fusionne les blocs bloc par bloc et garde les champs absents", () => {
    const out = applyEnergyCompletion(row, { block_logs: { b2: { done: false } } });
    expect(out.status).toBe("completed");
    expect(out.block_logs).toEqual({ b1: { done: true, note: "ok" }, b2: { done: false } });
    expect(out.notes).toBe("note coach");
    expect(out.actual_duration_min).toBe(40);
    expect(out.activity_url).toBe("https://strava/1");
    expect(out.activity_type).toBe("course");
    expect(out.distance_km).toBe(8);
  });

  it("remplace les champs donnés ; texte vide = inchangé, texte rogné", () => {
    const out = applyEnergyCompletion(row, {
      notes: "  bien  ", activity_url: "   ", actual_duration_min: 35, rpe_score: 7,
    });
    expect(out.notes).toBe("bien");
    expect(out.activity_url).toBe("https://strava/1");
    expect(out.actual_duration_min).toBe(35);
    expect(out.rpe_score).toBe(7);
  });

  it("une activité donnée remplace aussi la distance (null = aucune)", () => {
    expect(applyEnergyCompletion(row, { activity_type: "velo", distance_km: null }).distance_km).toBeNull();
    expect(applyEnergyCompletion(row, { activity_type: "course", distance_km: 10 }).distance_km).toBe(10);
    // Sans activité : distance donnée ou gardée.
    expect(applyEnergyCompletion(row, { distance_km: 5 }).distance_km).toBe(5);
  });

  it("ne modifie pas la ligne d'origine", () => {
    applyEnergyCompletion(row, { block_logs: { b3: { done: true } } });
    expect(row.status).toBe("planned");
    expect(Object.keys(row.block_logs)).toEqual(["b1"]);
  });
});

describe("applyEnergyRpe / isPartialBlockLogs", () => {
  it("pose ou retire le RPE", () => {
    expect(applyEnergyRpe(row, 6).rpe_score).toBe(6);
    expect(applyEnergyRpe({ ...row, rpe_score: 6 }, null).rpe_score).toBeNull();
  });

  it("partiel = des blocs faits et d'autres non", () => {
    expect(isPartialBlockLogs(null)).toBe(false);
    expect(isPartialBlockLogs({ a: { done: true } })).toBe(false);
    expect(isPartialBlockLogs({ a: { done: true }, b: { done: false } })).toBe(true);
  });
});
