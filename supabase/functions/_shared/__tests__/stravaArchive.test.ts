/**
 * Archive Strava fictive : fichiers + `activities.csv` joints par nom de
 * fichier, sorties sans fichier en résumé seul.
 */
import { describe, expect, it } from "vitest";
import { bytesSource } from "../activityFiles/archive";
import { openStravaArchive, summaryFromCsv, withCsv, type ArchiveItem } from "../activityFiles/stravaArchive";
import type { StravaCsvActivity } from "../activityFiles/stravaCsv";
import type { ParsedActivity } from "../activityFiles/types";
import { buildZip, gpxFile, gzipBytes, tcxFile, utf8 } from "./zipFixture";

const HEADER = ["Activity ID", "Activity Date", "Activity Name", "Activity Type", "Activity Description",
  "Activity Private Note", "Filename", "Distance", "Distance", "Elapsed Time", "Moving Time", "Calories",
  "Perceived Exertion", "Activity Gear"];

const csv = (rows: string[][]) =>
  utf8([HEADER, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"));

async function collect(it: () => AsyncGenerator<ArchiveItem>) {
  const out: ArchiveItem[] = [];
  for await (const x of it()) out.push(x);
  return out;
}

const csvRow = (o: Partial<StravaCsvActivity> = {}): StravaCsvActivity => ({
  stravaId: "1", startedAt: "2026-10-03T07:00:00.000Z", name: "Titre", type: "Run", sport: "running",
  description: null, elapsedS: 3700, movingS: 3600, distanceM: 10000, elevationGainM: 50, elevationLossM: 50,
  avgHr: null, maxHr: null, maxSpeedMps: null, avgCadence: null, avgPowerW: null, calories: 650, rpe: 6,
  gear: "Chaussures A", filename: null, commute: false, ...o,
});

describe("withCsv / summaryFromCsv", () => {
  it("le fichier fait foi, le CSV comble les vides et apporte le texte", () => {
    const act = {
      externalId: "file:x", startedAt: "2026-10-03T07:00:00.000Z", localDate: "2026-10-03", sport: "running",
      durationS: 3590, distanceM: 10050, elevationGainM: null, avgHr: 150, maxHr: 170, avgPaceSPerKm: 357,
      calories: null, details: null, raw: { format: "gpx" },
    } satisfies ParsedActivity;
    const out = withCsv(act, csvRow());
    expect(out).toMatchObject({
      durationS: 3590, distanceM: 10050, elevationGainM: 50, calories: 650, quality: "gpx",
      extras: { title: "Titre", rpe: 6, gear: "Chaussures A", stravaActivityId: "1", commute: false },
    });
  });

  it("une ligne sans fichier devient un résumé seul, jour local selon le fuseau donné", () => {
    const out = summaryFromCsv(csvRow({ startedAt: "2026-10-03T22:30:00.000Z" }), () => 7200);
    expect(out).toMatchObject({
      externalId: "strava:1", localDate: "2026-10-04", quality: "summary", durationS: 3600, avgPaceSPerKm: 360,
    });
  });
});

describe("openStravaArchive", () => {
  it("joint chaque fichier à sa ligne, puis rend les lignes sans fichier", async () => {
    const zip = await buildZip([
      { name: "activities/11.gpx", bytes: gpxFile("2026-10-03T07:00:00Z"), deflate: true },
      { name: "activities/12.tcx.gz", bytes: await gzipBytes(tcxFile("2026-10-04T07:00:00Z")) },
      { name: "activities/13.gpx", bytes: utf8("<gpx><trk><trkseg><trkpt lat=") },
      {
        name: "activities.csv",
        deflate: true,
        bytes: csv([
          ["11", "Oct 3, 2026, 7:00:00 AM", "Footing", "Run", "Facile", "secret", "activities/11.gpx", "10", "10000", "3700", "3600", "500", "4", "A"],
          ["12", "Oct 4, 2026, 7:00:00 AM", "Vélo", "Ride", "", "", "activities/12.tcx.gz", "30", "30000", "3600", "3600", "", "", ""],
          ["13", "Oct 5, 2026, 7:00:00 AM", "Cassé", "Run", "", "", "activities/13.gpx", "5", "5000", "1800", "1800", "", "", ""],
          ["14", "Oct 6, 2026, 6:00:00 PM", "Muscu", "Weight Training", "", "", "", "", "", "3600", "3600", "", "8", ""],
        ]),
      },
      { name: "profile.csv", bytes: utf8("x") },
    ]);

    const { scan, items } = await openStravaArchive(bytesSource(zip), { withDetail: true });
    expect(scan).toMatchObject({ files: 3, csvRows: 4, summaryOnly: 1, ignored: 1, csvLanguage: "en", csvError: null });

    const all = await collect(items);
    const acts = all.filter((x) => x.kind === "activity");
    const rejected = all.filter((x) => x.kind === "rejected");

    expect(acts.map((a) => a.kind === "activity" && [a.activity.extras?.stravaActivityId, a.activity.quality]))
      .toEqual([["11", "gpx"], ["12", "tcx"], ["13", "summary"], ["14", "summary"]]);
    const first = acts[0].kind === "activity" ? acts[0] : null;
    expect(first?.activity.extras?.title).toBe("Footing");
    expect(first?.detail).not.toBeNull();
    // Fichier 13 abîmé : refus nommé, mais la sortie entre en résumé seul.
    expect(rejected.map((r) => r.name)).toEqual(["13.gpx"]);
    // La note privée n'apparaît nulle part.
    expect(JSON.stringify(all)).not.toContain("secret");
  });

  it("lit une archive sans activities.csv comme avant", async () => {
    const zip = await buildZip([{ name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") }]);
    const { scan, items } = await openStravaArchive(bytesSource(zip));
    expect(scan).toMatchObject({ files: 1, csvRows: 0, csvLanguage: null });
    const all = await collect(items);
    expect(all).toHaveLength(1);
    expect(all[0].kind === "activity" && all[0].activity.extras).toBeNull();
  });

  it("garde les fichiers si le CSV est illisible, et le dit", async () => {
    const zip = await buildZip([
      { name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") },
      { name: "activities.csv", bytes: utf8("foo,bar\n1,2") },
    ]);
    const { scan, items } = await openStravaArchive(bytesSource(zip));
    expect(scan.csvError).toMatch(/en-têtes non reconnus/);
    expect((await collect(items)).filter((x) => x.kind === "activity")).toHaveLength(1);
  });
});

describe("openStravaArchive — zips imbriqués (export de compte Garmin)", () => {
  it("lit les fichiers d'activité des zips internes, compressés ou stockés", async () => {
    const part1 = await buildZip([
      { name: "a1.gpx", bytes: gpxFile("2025-03-01T07:00:00Z"), deflate: true },
      { name: "a2.tcx", bytes: tcxFile("2025-03-02T07:00:00Z") },
    ]);
    const part2 = await buildZip([{ name: "b1.gpx", bytes: gpxFile("2025-04-01T07:00:00Z") }]);
    const zip = await buildZip([
      { name: "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip", bytes: part1, deflate: true },
      { name: "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part2.zip", bytes: part2 },
      { name: "DI_CONNECT/DI-Connect-Wellness/sleepData.json", bytes: utf8("[]") },
      { name: "__MACOSX/._UploadedFiles_0-_Part1.zip", bytes: utf8("x") },
    ]);
    const { scan, items } = await openStravaArchive(bytesSource(zip));
    expect(scan).toMatchObject({ files: 3, nestedZips: 2, csvRows: 0, total: 3, origin: "garmin" });
    const out = await collect(items);
    const acts = out.filter((x) => x.kind === "activity");
    expect(acts.map((x) => x.name).sort()).toEqual(["a1.gpx", "a2.tcx", "b1.gpx"]);
    expect(out.filter((x) => x.kind === "rejected")).toHaveLength(0);
  });

  it("zip interne abîmé : refusé et nommé, le reste de l'archive est lu", async () => {
    const zip = await buildZip([
      { name: "UploadedFiles_0-_Part1.zip", bytes: utf8("pas un zip") },
      { name: "activities/11.gpx", bytes: gpxFile("2025-03-01T07:00:00Z") },
    ]);
    const { scan, items } = await openStravaArchive(bytesSource(zip));
    expect(scan).toMatchObject({ files: 1, nestedZips: 1, total: 2, origin: "zip" });
    const out = await collect(items);
    expect(out.map((x) => x.kind).sort()).toEqual(["activity", "rejected"]);
    expect(out.find((x) => x.kind === "rejected")!.name).toBe("UploadedFiles_0-_Part1.zip");
  });
});
