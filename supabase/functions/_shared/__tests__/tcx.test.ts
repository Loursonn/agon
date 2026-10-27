/**
 * Le décodeur TCX, vérifié sur des fichiers assemblés ici.
 *
 * Les fichiers sont écrits dans le test, préfixes de namespace compris, plutôt
 * que posés en pièce jointe : un fixture opaque prouve seulement que le
 * décodeur n'a pas changé, alors qu'un document écrit depuis le schéma prouve
 * qu'il lit le format.
 *
 * Ce qui est surtout vérifié, c'est l'honnêteté des agrégats : ce que le
 * fichier porte doit être lu tel quel, ce qui est reconstitué doit être
 * annoncé comme tel dans `details`, et ce qui manque doit rester `null`.
 */
import { describe, expect, it } from "vitest";
import { looksLikeTcx, parseTcx } from "../activityFiles/tcx";

const bytes = (s: string) => new TextEncoder().encode(s);

interface PointSpec {
  time: string;
  alt?: number;
  distance?: number;
  hr?: number;
  lat?: number;
  lon?: number;
}

function trackpoint(p: PointSpec): string {
  const parts = [`        <Time>${p.time}</Time>`];
  if (p.lat !== undefined && p.lon !== undefined) {
    parts.push(
      `        <Position><LatitudeDegrees>${p.lat}</LatitudeDegrees>` +
        `<LongitudeDegrees>${p.lon}</LongitudeDegrees></Position>`,
    );
  }
  if (p.alt !== undefined) parts.push(`        <AltitudeMeters>${p.alt}</AltitudeMeters>`);
  if (p.distance !== undefined) parts.push(`        <DistanceMeters>${p.distance}</DistanceMeters>`);
  if (p.hr !== undefined) {
    parts.push(`        <HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>`);
  }
  return `      <Trackpoint>\n${parts.join("\n")}\n      </Trackpoint>`;
}

interface LapSpec {
  startTime: string;
  totalTimeS?: number;
  distanceM?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  points?: PointSpec[];
}

function lap(l: LapSpec): string {
  const parts: string[] = [];
  if (l.totalTimeS !== undefined) {
    parts.push(`    <TotalTimeSeconds>${l.totalTimeS}</TotalTimeSeconds>`);
  }
  if (l.distanceM !== undefined) parts.push(`    <DistanceMeters>${l.distanceM}</DistanceMeters>`);
  if (l.calories !== undefined) parts.push(`    <Calories>${l.calories}</Calories>`);
  if (l.avgHr !== undefined) {
    parts.push(`    <AverageHeartRateBpm><Value>${l.avgHr}</Value></AverageHeartRateBpm>`);
  }
  if (l.maxHr !== undefined) {
    parts.push(`    <MaximumHeartRateBpm><Value>${l.maxHr}</Value></MaximumHeartRateBpm>`);
  }
  parts.push("    <Intensity>Active</Intensity>");
  if (l.points?.length) {
    parts.push(`    <Track>\n${l.points.map(trackpoint).join("\n")}\n    </Track>`);
  }
  parts.push("    <TriggerMethod>Manual</TriggerMethod>");
  return `  <Lap StartTime="${l.startTime}">\n${parts.join("\n")}\n  </Lap>`;
}

interface ActivitySpec {
  sport?: string;
  id: string;
  laps: LapSpec[];
  creator?: string;
}

function activity(a: ActivitySpec): string {
  const creator = a.creator
    ? `  <Creator xsi:type="Device_t"><Name>${a.creator}</Name>` +
      `<UnitId>3900000000</UnitId><ProductID>3121</ProductID></Creator>`
    : "";
  return [
    `<Activity Sport="${a.sport ?? "Running"}">`,
    `  <Id>${a.id}</Id>`,
    ...a.laps.map(lap),
    creator,
    "</Activity>",
  ].filter(Boolean).join("\n");
}

/** Document complet, avec les namespaces que Garmin Connect écrit vraiment. */
function tcx(activities: string[]): Uint8Array {
  return bytes(
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<TrainingCenterDatabase
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 x.xsd"
  xmlns:ns5="http://www.garmin.com/xmlschemas/ActivityGoals/v1"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
${activities.join("\n")}
  </Activities>
  <Author xsi:type="Application_t"><Name>Garmin Connect</Name></Author>
</TrainingCenterDatabase>`,
  );
}

/** Points réguliers : un toutes les dix secondes, montant de 100 m. */
function regularPoints(count: number, startIso: string): PointSpec[] {
  const t0 = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(t0 + i * 10_000).toISOString(),
    alt: 100 + i * 5,
    distance: i * 40,
    hr: 140 + (i % 5),
    lat: 45.1 + i * 0.0005,
    lon: 5.7,
  }));
}

describe("parseTcx — cas nominal", () => {
  it("lit une sortie d'un seul tour", async () => {
    const file = tcx([
      activity({
        id: "2026-10-03T07:12:38Z",
        creator: "Forerunner 265",
        laps: [{
          startTime: "2026-10-03T07:12:38Z",
          totalTimeS: 3600,
          distanceM: 12030,
          calories: 742,
          avgHr: 148,
          maxHr: 176,
          points: regularPoints(6, "2026-10-03T07:12:38Z"),
        }],
      }),
    ]);

    const { activities, rejected } = await parseTcx(file, "course.tcx");
    expect(rejected).toEqual([]);
    expect(activities).toHaveLength(1);

    const a = activities[0];
    expect(a.sport).toBe("running");
    expect(a.startedAt).toBe("2026-10-03T07:12:38.000Z");
    expect(a.durationS).toBe(3600);
    expect(a.distanceM).toBe(12030);
    expect(a.calories).toBe(742);
    expect(a.avgHr).toBe(148);
    expect(a.maxHr).toBe(176);
    // 3600 s pour 12,03 km : 299,25 s/km.
    expect(a.avgPaceSPerKm).toBeCloseTo(299.25, 2);
    expect(a.externalId).toMatch(/^tcx:[0-9a-f]{32}$/);
    expect((a.raw as Record<string, unknown>).creator).toBe("Forerunner 265");
  });

  it("rend la même empreinte pour deux lectures du même fichier", async () => {
    // C'est la déduplication : l'athlète qui glisse son dossier entier deux
    // fois ne doit pas voir ses sorties en double.
    const file = tcx([
      activity({ id: "2026-10-03T07:12:38Z", laps: [{ startTime: "2026-10-03T07:12:38Z", totalTimeS: 60, distanceM: 200 }] }),
    ]);
    const first = await parseTcx(file);
    const second = await parseTcx(file);
    expect(first.activities[0].externalId).toBe(second.activities[0].externalId);
  });
});

describe("parseTcx — durée et distance", () => {
  it("additionne les tours et pondère la fréquence cardiaque par leur durée", async () => {
    /*
      Séance de fractionné : quarante minutes d'échauffement à 130, puis deux
      minutes à 180. La moyenne arithmétique donnerait 155 ; la moyenne
      pondérée, environ 132. C'est la seconde qui décrit la séance.
    */
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [
          { startTime: "2026-10-03T07:00:00Z", totalTimeS: 2400, distanceM: 8000, calories: 400, avgHr: 130, maxHr: 145 },
          { startTime: "2026-10-03T07:40:00Z", totalTimeS: 120, distanceM: 600, calories: 40, avgHr: 180, maxHr: 191 },
        ],
      }),
    ]);

    const { activities } = await parseTcx(file);
    const a = activities[0];
    expect(a.durationS).toBe(2520);
    expect(a.distanceM).toBe(8600);
    expect(a.calories).toBe(440);
    expect(a.avgHr).toBe(132);
    expect(a.maxHr).toBe(191);
    expect((a.details as Record<string, unknown>).avgHrSource)
      .toBe("moyenne des tours pondérée par leur durée");
    expect((a.details as Record<string, unknown>).durationSource)
      .toBe("somme des tours (hors pauses)");
  });

  it("retombe sur la distance cumulée des points quand les tours n'en portent pas", async () => {
    // C'est le cas des TCX produits par les simulateurs d'intérieur.
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{
          startTime: "2026-10-03T07:00:00Z",
          totalTimeS: 50,
          points: regularPoints(6, "2026-10-03T07:00:00Z"),
        }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].distanceM).toBe(200);
    expect((activities[0].details as Record<string, unknown>).distanceSource)
      .toBe("points cumulés");
  });

  it("calcule la distance depuis les positions en dernier recours", async () => {
    const points = regularPoints(6, "2026-10-03T07:00:00Z")
      .map(({ distance: _ignored, ...rest }) => rest);
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{ startTime: "2026-10-03T07:00:00Z", totalTimeS: 50, points }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    // Cinq pas de 0,0005° de latitude : environ 278 m.
    expect(activities[0].distanceM).toBeGreaterThan(250);
    expect(activities[0].distanceM).toBeLessThan(300);
    expect((activities[0].details as Record<string, unknown>).distanceSource)
      .toBe("calculée depuis les positions");
  });

  it("retombe sur le temps écoulé quand aucun tour ne porte de durée", async () => {
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{
          startTime: "2026-10-03T07:00:00Z",
          distanceM: 1000,
          points: regularPoints(7, "2026-10-03T07:00:00Z"),
        }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].durationS).toBe(60);
    expect((activities[0].details as Record<string, unknown>).durationSource)
      .toBe("temps écoulé");
  });
});

describe("parseTcx — dénivelé", () => {
  it("reconstitue le dénivelé et dit qu'il est calculé", async () => {
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{
          startTime: "2026-10-03T07:00:00Z",
          totalTimeS: 100,
          distanceM: 500,
          points: regularPoints(11, "2026-10-03T07:00:00Z"),
        }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    // Dix pas de cinq mètres.
    expect(activities[0].elevationGainM).toBe(50);
    expect((activities[0].details as Record<string, unknown>).elevationSource)
      .toBe("calculé depuis les altitudes");
  });

  it("laisse le dénivelé à null quand aucune altitude n'est écrite", async () => {
    // `null` et non `0` : un fichier sans altitude ne décrit pas un parcours
    // plat, il ne décrit rien.
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{ startTime: "2026-10-03T07:00:00Z", totalTimeS: 100, distanceM: 500 }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].elevationGainM).toBeNull();
    expect((activities[0].details as Record<string, unknown>).elevationSource).toBeNull();
  });

  it("ne compte pas la marche d'altitude entre deux pistes", async () => {
    const file = tcx([
      activity({
        id: "2026-10-03T07:00:00Z",
        laps: [{
          startTime: "2026-10-03T07:00:00Z",
          totalTimeS: 100,
          distanceM: 500,
          points: [
            { time: "2026-10-03T07:00:00Z", alt: 100 },
            { time: "2026-10-03T07:00:10Z", alt: 110 },
          ],
        }, {
          startTime: "2026-10-03T08:00:00Z",
          totalTimeS: 100,
          distanceM: 500,
          points: [
            // Cent mètres plus haut, mais rejoints en voiture.
            { time: "2026-10-03T08:00:00Z", alt: 210 },
            { time: "2026-10-03T08:00:10Z", alt: 220 },
          ],
        }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].elevationGainM).toBe(20);
  });
});

describe("parseTcx — fuseau horaire", () => {
  it("utilise le décalage que porte le fichier", async () => {
    /*
      23 h 30 locales le 3 octobre, soit 21 h 30 UTC : la sortie appartient au
      3, parce que c'est ce jour-là qu'elle s'aligne sur la séance programmée.
    */
    const file = tcx([
      activity({
        id: "2026-10-03T23:30:00+02:00",
        laps: [{ startTime: "2026-10-03T23:30:00+02:00", totalTimeS: 1800, distanceM: 5000 }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].startedAt).toBe("2026-10-03T21:30:00.000Z");
    expect(activities[0].localDate).toBe("2026-10-03");
    expect((activities[0].details as Record<string, unknown>).localDateSource)
      .toBe("décalage porté par le fichier");
  });

  it("retient UTC et le dit quand le fichier n'écrit que des Z", async () => {
    /*
      Le choix est délibéré : prendre le fuseau de l'appareil qui fait l'import
      serait faux en voyage, et surtout différent entre le navigateur et une
      Edge Function — soit deux jours locaux pour le même fichier.
    */
    const file = tcx([
      activity({
        id: "2026-10-03T23:30:00Z",
        laps: [{ startTime: "2026-10-03T23:30:00Z", totalTimeS: 1800, distanceM: 5000 }],
      }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities[0].localDate).toBe("2026-10-03");
    expect((activities[0].raw as Record<string, unknown>).utcOffsetS).toBeNull();
    expect((activities[0].details as Record<string, unknown>).localDateSource)
      .toBe("UTC, le fichier ne donne pas de fuseau");
  });
});

describe("parseTcx — plusieurs activités", () => {
  it("sépare un enchaînement multisport", async () => {
    // Fusionner une heure de vélo et vingt minutes de course donnerait une
    // allure moyenne qui ne décrit rien.
    const file = tcx([
      activity({ sport: "Biking", id: "2026-10-03T07:00:00Z", laps: [{ startTime: "2026-10-03T07:00:00Z", totalTimeS: 3600, distanceM: 30000 }] }),
      activity({ sport: "Running", id: "2026-10-03T08:05:00Z", laps: [{ startTime: "2026-10-03T08:05:00Z", totalTimeS: 1200, distanceM: 4000 }] }),
    ]);

    const { activities } = await parseTcx(file);
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a.sport)).toEqual(["cycling", "running"]);
    expect(activities[0].externalId).toMatch(/#1$/);
    expect(activities[1].externalId).toMatch(/#2$/);
    expect((activities[0].details as Record<string, unknown>).activityCount).toBe(2);
  });

  it("rejette l'activité sans horodatage sans perdre les autres", async () => {
    const file = tcx([
      `<Activity Sport="Running"><Lap StartTime=""><TotalTimeSeconds>60</TotalTimeSeconds></Lap></Activity>`,
      activity({ id: "2026-10-03T08:05:00Z", laps: [{ startTime: "2026-10-03T08:05:00Z", totalTimeS: 1200, distanceM: 4000 }] }),
    ]);

    const { activities, rejected } = await parseTcx(file, "melange.tcx");
    expect(activities).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/activité 1 sans horodatage/);
  });
});

describe("parseTcx — refus", () => {
  it("dit qu'un GPX est un GPX plutôt que « fichier vide »", async () => {
    const { activities, rejected } = await parseTcx(
      bytes(`<?xml version="1.0"?><gpx creator="StravaGPX"><trk/></gpx>`),
      "sortie.gpx",
    );
    expect(activities).toEqual([]);
    expect(rejected[0].reason).toMatch(/ce fichier est un GPX/);
  });

  it("rejette un XML tronqué au lieu d'importer une activité amputée", async () => {
    // Un téléchargement interrompu produit exactement ça.
    const complete = new TextDecoder().decode(
      tcx([activity({ id: "2026-10-03T07:00:00Z", laps: [{ startTime: "2026-10-03T07:00:00Z", totalTimeS: 3600, distanceM: 12030, points: regularPoints(20, "2026-10-03T07:00:00Z") }] })]),
    );
    const { activities, rejected } = await parseTcx(
      bytes(complete.slice(0, complete.length - 400)),
      "tronque.tcx",
    );
    expect(activities).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("rejette un document sans activité en nommant la racine", async () => {
    const { rejected } = await parseTcx(tcx([]), "vide.tcx");
    expect(rejected[0].reason).toMatch(/aucune <Activity>.*TrainingCenterDatabase/);
  });

  it("rejette un fichier qui n'est pas du XML", async () => {
    const { activities, rejected } = await parseTcx(bytes("ce n'est pas un fichier"), "note.txt");
    expect(activities).toEqual([]);
    expect(rejected).toHaveLength(1);
  });
});

describe("looksLikeTcx", () => {
  it("reconnaît un TCX sur sa racine, pas sur son extension", async () => {
    expect(looksLikeTcx(tcx([]))).toBe(true);
  });

  it("refuse un GPX et un contenu quelconque", () => {
    expect(looksLikeTcx(bytes(`<?xml version="1.0"?><gpx/>`))).toBe(false);
    expect(looksLikeTcx(bytes("bonjour"))).toBe(false);
  });
});
