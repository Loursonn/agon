import { describe, expect, it } from "vitest";
import {
  divisionFor,
  durationPhrase,
  findDuplicateRace,
  genderFromRaces,
  matchCompetition,
  parseResultPage,
  segmentsSum,
  sumMismatch,
  toRaceImport,
  type ParsedHyroxPage,
} from "../resultImport";
import { RACE_ORDER, type SegmentKey } from "@/features/shared/types/hyrox";

// Résultat FABRIQUÉ (athlète de démo, temps inventés), même mise en page que results.hyrox.com.
const SEGS: [string, string, SegmentKey, number][] = [
  ["Running 1", "00:04:28", "run_1", 268],
  ["1000m SkiErg", "00:04:22", "ski", 262],
  ["Running 2", "00:04:52", "run_2", 292],
  ["50m Sled Push", "00:03:35", "sled_push", 215],
  ["Running 3", "00:05:00", "run_3", 300],
  ["50m Sled Pull", "00:04:22", "sled_pull", 262],
  ["Running 4", "00:04:58", "run_4", 298],
  ["80m Burpee Broad Jump", "00:05:00", "bbj", 300],
  ["Running 5", "00:05:05", "run_5", 305],
  ["1000m Row", "00:04:30", "row", 270],
  ["Running 6", "00:05:10", "run_6", 310],
  ["200m Farmers Carry", "00:02:18", "farmers", 138],
  ["Running 7", "00:05:12", "run_7", 312],
  ["100m Sandbag Lunges", "00:04:10", "lunges", 250],
  ["Running 8", "00:05:05", "run_8", 305],
  ["Wall Balls", "00:05:55", "wall_balls", 355],
  ["Roxzone Time", "00:03:36", "roxzone_total", 216],
];
const SUM = SEGS.reduce((a, s) => a + s[3], 0); // 4658 s
const OFFICIAL = SUM - 7; // les arrondis : quelques secondes d'écart, normal
const OFFICIAL_STR = "01:17:31";

const DESKTOP = [
  "Results & Rankings",
  "Individual's Details",
  "Participant",
  "FRA",
  "Athlete\tDémo, Léa (FRA)",
  "Bib Number\t123456",
  "Age Group\t30-34",
  "Race Details",
  "Race\t2026 Bordeaux",
  "Division\tHYROX - Saturday",
  "Judging Decision",
  "*Bonus\t–",
  "*Penalty\t–",
  "Disqual Reason\t–",
  "Info\t–",
  "Overall Time",
  "Rank (M/W)\t412",
  "Rank (AG)\t61",
  `Overall Time\t${OFFICIAL_STR}`,
  "Workout summary",
  "This is a summarised view of the race.",
  "Split\tTime\tPlace",
  ...SEGS.map(([l, t], i) => `${l}\t${t}\t${l.startsWith("Running") || i === 16 ? "–" : String(100 + i)}`),
  "Run Total\t00:40:30\t380",
  "Best Run Lap\t00:04:28\t300",
  "Race replay",
  "This is a step by step walkthrough of your race.",
  "Split\tTime\tDiff",
  "Rox In\t00:04:28\t04:28",
  "1000m SkiErg In\t00:04:40\t00:12",
  "1000m SkiErg Out\t00:09:02\t04:22",
  "1000m Row In\t00:45:00\t00:10",
  "1000m Row Out\t00:49:30\t04:30",
  `Total\t${OFFICIAL_STR}\t05:55`,
].join("\n");

const expectAllSegments = (p: ParsedHyroxPage | null) => {
  expect(p).not.toBeNull();
  for (const [, , key, s] of SEGS) expect(p!.segments[key]).toBe(s);
};

describe("parseResultPage", () => {
  it("lit toute la page copiée sur ordinateur (libellé ⇥ valeur)", () => {
    const p = parseResultPage(DESKTOP)!;
    expectAllSegments(p);
    expect(p.officialTotalS).toBe(OFFICIAL);
    expect(p.eventName).toBe("HYROX Bordeaux");
    expect(p.venue).toBe("Bordeaux");
    expect(p.year).toBe(2026);
    expect(p.weekday).toBe(6);
    expect(p.format).toBe("solo");
    expect(p.pro).toBe(false);
    expect(p.gender).toBeNull();
    expect(p.ageGroup).toBe("30-34");
    expect(p.rankOverall).toBe(412);
    expect(p.rankAgeGroup).toBe(61);
    expect(p.penaltiesS).toBe(0);
    expect(p.status).toBeNull();
  });

  it("ignore le tableau « Race replay » (les « In » / « Out » n'écrasent pas les temps)", () => {
    const p = parseResultPage(DESKTOP)!;
    expect(p.segments.row).toBe(270);
    expect(p.segments.ski).toBe(262);
  });

  it("lit la copie de téléphone (libellé puis valeur à la ligne)", () => {
    const phone = DESKTOP.split("\n").flatMap((l) => l.split("\t")).join("\n");
    const p = parseResultPage(phone)!;
    expectAllSegments(p);
    expect(p.officialTotalS).toBe(OFFICIAL);
    expect(p.eventName).toBe("HYROX Bordeaux");
    expect(p.ageGroup).toBe("30-34");
    expect(p.rankOverall).toBe(412);
    expect(p.rankAgeGroup).toBe(61);
  });

  it("lit des espaces simples à la place des tabulations", () => {
    const p = parseResultPage(SEGS.map(([l, t]) => `${l} ${t} –`).join("\n"))!;
    expectAllSegments(p);
    expect(p.officialTotalS).toBeNull();
  });

  it("lit le texte d'une capture en colonnes (libellés puis temps)", () => {
    const cols = ["Split", ...SEGS.map((s) => s[0]), "Time", ...SEGS.map((s) => s[1]), "Place", "–", "100"].join("\n");
    expectAllSegments(parseResultPage(cols));
  });

  it("garde un résultat partiel et dit ce qui manque", () => {
    const p = parseResultPage("Running 1\t00:04:28\n1000m SkiErg\t00:04:22")!;
    expect(p.segments).toEqual({ run_1: 268, ski: 262 });
    const imp = toRaceImport(p, { fallbackGender: "women", match: null });
    expect(imp.totalS).toBeNull();
    expect(imp.missing).toEqual(["Date", "Événement", "Division", "Temps total", "15 temps de segment"]);
  });

  it("renvoie null quand rien n'est reconnu", () => {
    expect(parseResultPage("")).toBeNull();
    expect(parseResultPage("Bonjour coach, voici ma course")).toBeNull();
  });

  it("lit pénalités, disqualification et abandon", () => {
    expect(parseResultPage(`*Penalty\t00:01:00\nOverall Time\t${OFFICIAL_STR}`)!.penaltiesS).toBe(60);
    expect(parseResultPage(`Disqual Reason\tMissed wall balls\nOverall Time\t${OFFICIAL_STR}`)!.status).toBe("dq");
    expect(parseResultPage("Overall Time\tDNF\nRunning 1\t00:04:28")!.status).toBe("dnf");
  });

  it("reconnaît pro, duo, relais, adaptive et le nom d'un événement à tiret", () => {
    const pro = parseResultPage("Race\t2026 Birmingham - Youngstars\nDivision\tHYROX PRO DOUBLES - Friday\nOverall Time\t01:02:03")!;
    expect(pro.eventName).toBe("HYROX Birmingham - Youngstars");
    expect(pro.venue).toBe("Birmingham");
    expect(pro).toMatchObject({ format: "doubles", pro: true, weekday: 5 });
    expect(parseResultPage("Division\tHYROX TEAM RELAY - Sunday\nOverall Time\t01:02:03")!.format).toBe("relay");
    expect(parseResultPage("Division\tHYROX ADAPTIVE - Overall\nOverall Time\t01:02:03")!).toMatchObject({ adaptive: true, weekday: null });
  });
});

describe("division", () => {
  const solo = { format: "solo" as const, pro: false, adaptive: false, gender: null };
  it("prend le genre des courses précédentes pour le solo", () => {
    expect(divisionFor(solo, "women")).toEqual({ division: "women", guessed: false });
    expect(divisionFor({ ...solo, pro: true }, "men")).toEqual({ division: "men_pro", guessed: false });
  });
  it("signale la division à vérifier sans genre connu, ou pour un duo", () => {
    expect(divisionFor(solo, null)).toEqual({ division: "men", guessed: true });
    expect(divisionFor({ ...solo, format: "doubles" }, "women")).toEqual({ division: "doubles_women", guessed: true });
    expect(divisionFor({ ...solo, format: "doubles", gender: "mixed" }, null)).toEqual({ division: "doubles_mixed", guessed: false });
    expect(divisionFor({ ...solo, adaptive: true }, null)).toEqual({ division: "adaptive", guessed: false });
  });
  it("lit le genre des courses précédentes", () => {
    expect(genderFromRaces([{ division: "doubles_women_pro" }, { division: "men" }])).toBe("women");
    expect(genderFromRaces([{ division: "relay_mixed" }, { division: "men_pro" }])).toBe("men");
    expect(genderFromRaces([])).toBeNull();
  });
});

describe("somme des temps", () => {
  const segs = Object.fromEntries(SEGS.map((s) => [s[2], s[3]]));
  it("additionne les 17 temps, ou null s'il en manque", () => {
    expect(segmentsSum(segs)).toBe(SUM);
    expect(segmentsSum({ ...segs, roxzone_total: null })).toBeNull();
  });
  it("tolère les arrondis, alerte au-delà", () => {
    expect(sumMismatch(segs, OFFICIAL)).toBeNull();
    expect(sumMismatch(segs, SUM - 60)).toBe(60);
    expect(sumMismatch({ ...segs, row: 270 + 60 }, OFFICIAL)).toBe(67);
    expect(sumMismatch(segs, SUM + 60, 60)).toBeNull();
    expect(sumMismatch({ run_1: 268 }, OFFICIAL)).toBeNull();
  });
});

describe("calendrier et doublons", () => {
  const comps = [
    { id: "c-bdx", name: "HYROX Bordeaux", location: null, date: "2026-03-13", date_end: "2026-03-15", cancelled_at: null },
    { id: "c-nice", name: "Hyrox", location: "Nice", date: "2026-10-03", date_end: null, cancelled_at: null },
    { id: "c-old", name: "HYROX Bordeaux", location: null, date: "2025-03-14", date_end: null, cancelled_at: null },
    { id: "c-cancel", name: "HYROX Paris", location: null, date: "2026-02-01", date_end: null, cancelled_at: "2026-01-20T10:00:00Z" },
  ];
  it("retrouve la compétition et le jour de la vague", () => {
    expect(matchCompetition(comps, { venue: "Bordeaux", year: 2026, weekday: 6 }, "2026-11-14"))
      .toEqual({ competitionId: "c-bdx", date: "2026-03-14" });
    expect(matchCompetition(comps, { venue: "Bordeaux", year: 2026, weekday: null }, "2026-11-14"))
      .toEqual({ competitionId: "c-bdx", date: "2026-03-13" });
    expect(matchCompetition(comps, { venue: "Nice", year: 2026, weekday: 6 }, "2026-11-14"))
      .toEqual({ competitionId: "c-nice", date: "2026-10-03" });
  });
  it("ignore une compétition annulée, future ou d'une autre année", () => {
    expect(matchCompetition(comps, { venue: "Paris", year: 2026, weekday: null }, "2026-11-14")).toBeNull();
    expect(matchCompetition(comps, { venue: "Nice", year: 2026, weekday: null }, "2026-09-01")).toBeNull();
    expect(matchCompetition(comps, { venue: "Bordeaux", year: 2024, weekday: null }, "2026-11-14")).toBeNull();
    expect(matchCompetition(comps, { venue: null, year: 2026, weekday: null }, "2026-11-14")).toBeNull();
  });
  it("repère une course déjà enregistrée", () => {
    const races = [
      { id: "r1", date: "2026-03-14", event_name: "HYROX Bordeaux", total_s: OFFICIAL + 1 },
      { id: "r2", date: "2025-10-04", event_name: "HYROX Nice", total_s: 4200 },
    ];
    const p = { officialTotalS: OFFICIAL, eventName: "HYROX Bordeaux", year: 2026 };
    expect(findDuplicateRace(races, p, null)?.id).toBe("r1");
    expect(findDuplicateRace(races, p, "2026-03-14")?.id).toBe("r1");
    expect(findDuplicateRace(races, { ...p, year: 2025 }, null)).toBeNull();
    expect(findDuplicateRace(races, { ...p, officialTotalS: OFFICIAL + 30 }, null)).toBeNull();
    expect(findDuplicateRace(races, { ...p, officialTotalS: null }, null)).toBeNull();
  });
});

describe("toRaceImport", () => {
  it("prépare la fiche complète : chrono officiel, date du calendrier, rien à compléter", () => {
    const p = parseResultPage(DESKTOP)!;
    const imp = toRaceImport(p, { fallbackGender: "women", match: { competitionId: "c-bdx", date: "2026-03-14" } });
    expect(imp).toMatchObject({
      date: "2026-03-14", competitionId: "c-bdx", eventName: "HYROX Bordeaux", venue: "Bordeaux",
      format: "solo", division: "women", divisionFound: true, divisionGuessed: false, ageGroup: "30-34", status: "finished",
      totalS: OFFICIAL, penaltiesS: 0, rankOverall: 412, rankAgeGroup: 61, missing: [],
    });
    expect(Object.keys(imp.segments)).toHaveLength(RACE_ORDER.length + 1);
  });
  it("prend la somme des temps quand le chrono officiel manque", () => {
    const p = parseResultPage(SEGS.map(([l, t]) => `${l}\t${t}`).join("\n"))!;
    expect(toRaceImport(p, { fallbackGender: null, match: null }).totalS).toBe(SUM);
  });
});

describe("durationPhrase", () => {
  it("écrit les écarts en toutes lettres", () => {
    expect(durationPhrase(9)).toBe("9 s");
    expect(durationPhrase(-67)).toBe("1 min 07 s");
  });
});
