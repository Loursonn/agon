import { describe, expect, it } from "vitest";
import {
  countResult,
  emptyReport,
  mergePayload,
  parseMergeResult,
  reportSummary,
  streamQualityRank,
  wantsDetail,
} from "@/lib/activityImport";
import type { ImportActivity, NormalizedActivity } from "@shared/activityFiles/index.ts";

const act = (o: Partial<ImportActivity> = {}): ImportActivity => ({
  externalId: "strava:1",
  startedAt: "2026-10-03T07:00:00.000Z",
  localDate: "2026-10-03",
  sport: "running",
  durationS: 3600,
  distanceM: 10000,
  elevationGainM: null,
  avgHr: 150,
  maxHr: 170,
  avgPaceSPerKm: 360,
  calories: null,
  details: null,
  raw: { format: "gpx" },
  quality: "gpx",
  extras: { title: "Footing", description: null, rpe: 5, gear: "A", commute: false, stravaActivityId: "1" },
  ...o,
});

const detail = (source: NormalizedActivity["source"]) => ({ source }) as NormalizedActivity;

describe("mergePayload", () => {
  it("envoie mesures, qualité et texte Strava, jamais ai_allowed", () => {
    const p = mergePayload(act());
    expect(p).toMatchObject({
      external_id: "strava:1", origin_quality: "gpx", title: "Footing", rpe: 5, gear: "A",
      strava_activity_id: "1", commute: false, calories: null,
    });
    expect(p).not.toHaveProperty("ai_allowed");
  });

  it("sans ligne CSV : champs Strava à null", () => {
    expect(mergePayload(act({ extras: null }))).toMatchObject({ title: null, rpe: null, strava_activity_id: null });
  });
});

describe("parseMergeResult / wantsDetail", () => {
  it("lit la réponse de la base", () => {
    expect(parseMergeResult({ id: "x", status: "merged", stream_rank: 3 })).toEqual({
      id: "x", status: "merged", streamRank: 3, error: undefined,
    });
    expect(parseMergeResult({ status: "error", error: "hors bornes" }).status).toBe("error");
    expect(parseMergeResult(null).status).toBe("error");
  });

  it("n'envoie la courbe que si elle est meilleure que celle en base", () => {
    const merged = (rank: number) => parseMergeResult({ id: "x", status: "merged", stream_rank: rank });
    expect(wantsDetail(detail("fit"), merged(0))).toBe(true);
    expect(wantsDetail(detail("fit"), merged(2))).toBe(true);
    expect(wantsDetail(detail("gpx"), merged(3))).toBe(false);
    expect(wantsDetail(detail("fit"), merged(3))).toBe(false);
    expect(wantsDetail(null, merged(0))).toBe(false);
    expect(wantsDetail(detail("fit"), parseMergeResult({ status: "error" }))).toBe(false);
  });

  it("ordre des qualités identique à la base", () => {
    expect(["gpx", "tcx", "garmin_json", "fit"].map(streamQualityRank)).toEqual([1, 2, 2, 3]);
  });
});

describe("compte rendu", () => {
  it("« X nouvelles · Y complétées · Z déjà complètes · N erreurs »", () => {
    const r = emptyReport();
    countResult(r, "a", parseMergeResult({ id: "1", status: "created" }));
    countResult(r, "b", parseMergeResult({ id: "2", status: "created" }));
    countResult(r, "c", parseMergeResult({ id: "3", status: "merged" }));
    countResult(r, "d", parseMergeResult({ status: "error", error: "FC hors bornes" }));
    expect(reportSummary(r)).toBe("2 nouvelles · 1 complétée · 0 déjà complète · 1 erreur");
    expect(r.rejected).toEqual([{ name: "d", reason: "FC hors bornes" }]);
  });
});
