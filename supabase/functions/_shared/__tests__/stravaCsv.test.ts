/**
 * `activities.csv` de l'archive Strava : lecteur CSV, en-têtes anglais et
 * français, en-têtes en double, nombres et dates. Données fictives.
 */
import { describe, expect, it } from "vitest";
import {
  mapHeader,
  parseCsv,
  parseNumber,
  parseStravaCsv,
  parseStravaDate,
  sportFromStravaType,
  StravaCsvError,
} from "../activityFiles/stravaCsv";

/** En-tête réel d'un export en anglais (extrait), doublons compris. */
const EN_HEADER = [
  "Activity ID", "Activity Date", "Activity Name", "Activity Type", "Activity Description",
  "Elapsed Time", "Distance", "Max Heart Rate", "Relative Effort", "Commute", "Activity Private Note",
  "Activity Gear", "Filename", "Athlete Weight", "Elapsed Time", "Moving Time", "Distance", "Max Speed",
  "Average Speed", "Elevation Gain", "Elevation Loss", "Max Cadence", "Average Cadence", "Max Heart Rate",
  "Average Heart Rate", "Max Watts", "Average Watts", "Calories", "Perceived Exertion", "Commute",
];

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

function enRow(o: Partial<Record<string, string>>): string {
  const v = (k: string, d = "") => o[k] ?? d;
  return [
    v("id", "1001"), q(v("date", "Oct 3, 2026, 7:00:00 AM")), q(v("name", "Sortie longue")), v("type", "Run"),
    q(v("desc")), v("elapsed", "3700"), v("distKm", "10.02"), v("maxHr", "176"), "45", "false",
    q(v("private", "ne jamais lire")), q(v("gear", "Pegasus 40")), v("file", "activities/1001.fit.gz"), "62",
    v("elapsed", "3700"), v("moving", "3600"), v("distM", "10020.0"), "4.8", "2.78", v("gain", "120.5"),
    "118.0", "92", "84", v("maxHr", "176"), v("avgHr", "148"), "", "", v("cal", "712"), v("rpe", "7"),
    v("commute", "0.0"),
  ].join(",");
}

const enCsv = (...rows: string[]) => [EN_HEADER.map(q).join(","), ...rows].join("\n");

describe("parseCsv", () => {
  it("gère guillemets doublés, virgules et retours à la ligne dans un champ", () => {
    const rows = parseCsv('a,b\r\n"x, ""y""","ligne 1\nligne 2"\n');
    expect(rows).toEqual([["a", "b"], ['x, "y"', "ligne 1\nligne 2"]]);
  });

  it("devine le point-virgule d'un fichier passé par Excel et ignore le BOM", () => {
    expect(parseCsv("﻿a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });

  it("refuse un CSV démesuré", () => {
    const big = ["h", ...Array.from({ length: 20 }, (_, i) => String(i))].join("\n");
    expect(() => parseCsv(big, 10)).toThrow(StravaCsvError);
  });
});

describe("parseNumber", () => {
  it("lit l'anglais et le français", () => {
    expect(parseNumber("10020.5")).toBe(10020.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("10,02")).toBe(10.02);
    expect(parseNumber("1 234,5")).toBe(1234.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("parseStravaDate", () => {
  it("lit l'anglais, le français et l'ISO, en UTC", () => {
    expect(parseStravaDate("Oct 3, 2026, 7:05:09 PM")).toBe("2026-10-03T19:05:09.000Z");
    expect(parseStravaDate("Jan 1, 2026, 12:10:00 AM")).toBe("2026-01-01T00:10:00.000Z");
    expect(parseStravaDate("3 oct. 2026, 19:05:09")).toBe("2026-10-03T19:05:09.000Z");
    expect(parseStravaDate("14 févr. 2026 à 07:00:00")).toBe("2026-02-14T07:00:00.000Z");
    expect(parseStravaDate("1 août 2026, 06:30:00")).toBe("2026-08-01T06:30:00.000Z");
    expect(parseStravaDate("2026-10-03 07:00:00")).toBe("2026-10-03T07:00:00.000Z");
  });

  it("rend null pour une date impossible ou illisible", () => {
    expect(parseStravaDate("Feb 30, 2026, 7:00:00 AM")).toBeNull();
    expect(parseStravaDate("hier matin")).toBeNull();
    expect(parseStravaDate("")).toBeNull();
  });
});

describe("mapHeader", () => {
  it("prend la dernière occurrence d'un en-tête en double (unités brutes)", () => {
    const { columns, language } = mapHeader(EN_HEADER);
    expect(language).toBe("en");
    expect(columns.distance).toBe(EN_HEADER.lastIndexOf("Distance"));
    expect(columns.maxHr).toBe(EN_HEADER.lastIndexOf("Max Heart Rate"));
  });

  it("ne lit pas une « Distance » seule (unité d'affichage inconnue)", () => {
    const { columns } = mapHeader(["Activity ID", "Activity Date", "Distance"]);
    expect(columns.distance).toBeUndefined();
  });

  it("reconnaît des en-têtes français, accents et casse compris", () => {
    const { columns, language } = mapHeader([
      "ID de l'activité", "Date de l'activité", "Nom de l'activité", "Type d'activité", "Nom du fichier",
      "Effort perçu", "Équipement de l'activité",
    ]);
    expect(language).toBe("fr");
    expect(columns.filename).toBe(4);
    expect(columns.rpe).toBe(5);
    expect(columns.gear).toBe(6);
  });

  it("refuse clairement des en-têtes inconnus", () => {
    expect(() => mapHeader(["foo", "bar"])).toThrow(/en-têtes non reconnus/);
  });
});

describe("sportFromStravaType", () => {
  it("traduit les types courants, anglais et français", () => {
    expect(sportFromStravaType("Run")).toBe("running");
    expect(sportFromStravaType("Trail Run")).toBe("running");
    expect(sportFromStravaType("Weight Training")).toBe("training");
    expect(sportFromStravaType("Course à pied")).toBe("running");
    expect(sportFromStravaType("Vélo")).toBe("cycling");
    expect(sportFromStravaType("Musculation")).toBe("training");
  });

  it("rend null pour un type inconnu, sans erreur", () => {
    expect(sportFromStravaType("Curling sur glace")).toBeNull();
    expect(sportFromStravaType(null)).toBeNull();
  });
});

describe("parseStravaCsv", () => {
  it("lit une ligne complète en unités brutes, sans la note privée", () => {
    const { activities, rejected } = parseStravaCsv(enCsv(enRow({ desc: "Belle sortie, \"facile\"\nRAS" })));
    expect(rejected).toEqual([]);
    const a = activities[0];
    expect(a).toMatchObject({
      stravaId: "1001",
      startedAt: "2026-10-03T07:00:00.000Z",
      name: "Sortie longue",
      sport: "running",
      description: 'Belle sortie, "facile"\nRAS',
      elapsedS: 3700,
      movingS: 3600,
      distanceM: 10020,
      elevationGainM: 120.5,
      elevationLossM: 118,
      avgHr: 148,
      maxHr: 176,
      maxSpeedMps: 4.8,
      avgCadence: 84,
      avgPowerW: null,
      calories: 712,
      rpe: 7,
      gear: "Pegasus 40",
      filename: "activities/1001.fit.gz",
      commute: false,
    });
    expect(JSON.stringify(a)).not.toContain("ne jamais lire");
  });

  it("garde une sortie sans fichier, ignore un RPE hors 1-10, lit Commute", () => {
    const { activities } = parseStravaCsv(enCsv(
      enRow({ id: "2002", file: "", type: "Weight Training", rpe: "11", commute: "1.0" }),
    ));
    expect(activities[0]).toMatchObject({ filename: null, sport: "training", rpe: null, commute: true });
  });

  it("écarte les lignes sans identifiant ou sans date, dédoublonne", () => {
    const { activities, rejected } = parseStravaCsv(enCsv(
      enRow({ id: "" }),
      enRow({ id: "3003", date: "n'importe quand" }),
      enRow({ id: "4004" }),
      enRow({ id: "4004" }),
    ));
    expect(activities.map((a) => a.stravaId)).toEqual(["4004"]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "identifiant d'activité Strava absent",
      "date de l'activité illisible",
    ]);
  });

  it("lit un export français (virgules décimales)", () => {
    const csv = [
      ["ID de l'activité", "Date de l'activité", "Nom de l'activité", "Type d'activité", "Distance",
        "Distance", "Temps écoulé", "Nom du fichier", "Effort perçu"].map(q).join(","),
      ['5005', q("3 oct. 2026, 07:00:00"), q("Footing"), q("Course à pied"), q("8,01"), q("8010,0"), "2900",
        "activities/5005.gpx", q("4,0")].join(","),
    ].join("\n");
    const { activities, language } = parseStravaCsv(csv);
    expect(language).toBe("fr");
    expect(activities[0]).toMatchObject({ distanceM: 8010, elapsedS: 2900, rpe: 4, sport: "running" });
  });
});
