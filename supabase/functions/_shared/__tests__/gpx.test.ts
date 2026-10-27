/**
 * Le décodeur GPX, vérifié sur des traces assemblées ici.
 *
 * Un GPX ne porte aucun total : tout ce qu'on en affiche est calculé. Les tests
 * portent donc moins sur la lecture que sur la *fabrication* des agrégats — et
 * sur le fait que chacun annonce sa provenance, parce que les chiffres de la
 * montre pour la même sortie seront différents et que l'écart doit être
 * explicable.
 */
import { describe, expect, it } from "vitest";
import { looksLikeGpx, parseGpx } from "../activityFiles/gpx";

const bytes = (s: string) => new TextEncoder().encode(s);

interface PointSpec {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
  hr?: number;
  cad?: number;
  power?: number;
}

function trkpt(p: PointSpec): string {
  const parts: string[] = [];
  if (p.ele !== undefined) parts.push(`        <ele>${p.ele}</ele>`);
  if (p.time !== undefined) parts.push(`        <time>${p.time}</time>`);
  const ext: string[] = [];
  if (p.hr !== undefined) ext.push(`<gpxtpx:hr>${p.hr}</gpxtpx:hr>`);
  if (p.cad !== undefined) ext.push(`<gpxtpx:cad>${p.cad}</gpxtpx:cad>`);
  if (ext.length) {
    parts.push(
      `        <extensions><gpxtpx:TrackPointExtension>${ext.join("")}` +
        `</gpxtpx:TrackPointExtension></extensions>`,
    );
  } else if (p.power !== undefined) {
    parts.push(`        <extensions><power>${p.power}</power></extensions>`);
  }
  return `      <trkpt lat="${p.lat}" lon="${p.lon}">\n${parts.join("\n")}\n      </trkpt>`;
}

interface TrackSpec {
  name?: string;
  type?: string;
  /** Un tableau par `<trkseg>` : c'est ce qui matérialise les coupures. */
  segments: PointSpec[][];
}

function trk(t: TrackSpec): string {
  const head = [
    t.name !== undefined ? `    <name>${t.name}</name>` : "",
    t.type !== undefined ? `    <type>${t.type}</type>` : "",
  ].filter(Boolean);
  const segs = t.segments.map((points) =>
    `    <trkseg>\n${points.map(trkpt).join("\n")}\n    </trkseg>`
  );
  return `  <trk>\n${[...head, ...segs].join("\n")}\n  </trk>`;
}

/** Document complet, avec les namespaces que Strava écrit vraiment. */
function gpx(tracks: string[], metadataTime?: string): Uint8Array {
  const metadata = metadataTime ? `  <metadata><time>${metadataTime}</time></metadata>` : "";
  return bytes(
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${[metadata, ...tracks].filter(Boolean).join("\n")}
</gpx>`,
  );
}

/** Points espacés de dix secondes, cent mètres vers l'est, montant de 5 m. */
function regularPoints(count: number, startIso: string, opts: { hr?: boolean; ele?: boolean } = {}): PointSpec[] {
  const t0 = Date.parse(startIso);
  const lat = 45.1;
  return Array.from({ length: count }, (_, i) => ({
    lat,
    lon: 5.7 + (i * 100) / (111_320 * Math.cos((lat * Math.PI) / 180)),
    time: new Date(t0 + i * 10_000).toISOString(),
    ...(opts.ele === false ? {} : { ele: 200 + i * 5 }),
    ...(opts.hr === false ? {} : { hr: 140 + (i % 5) }),
  }));
}

describe("parseGpx — cas nominal", () => {
  it("lit une trace et calcule ses agrégats", async () => {
    const file = gpx([
      trk({
        name: "Sortie du matin",
        type: "running",
        segments: [regularPoints(11, "2026-10-03T07:12:38Z")],
      }),
    ]);

    const { activities, rejected } = await parseGpx(file, "sortie.gpx");
    expect(rejected).toEqual([]);
    expect(activities).toHaveLength(1);

    const a = activities[0];
    expect(a.sport).toBe("running");
    expect(a.startedAt).toBe("2026-10-03T07:12:38.000Z");
    // Dix segments de cent mètres, dix intervalles de dix secondes.
    expect(a.distanceM).toBeGreaterThan(995);
    expect(a.distanceM).toBeLessThan(1005);
    expect(a.durationS).toBe(100);
    expect(a.elevationGainM).toBe(50);
    expect(a.avgHr).toBe(142);
    expect(a.maxHr).toBe(144);
    expect(a.avgPaceSPerKm).toBeGreaterThan(99);
    expect(a.avgPaceSPerKm).toBeLessThan(101);
    expect(a.externalId).toMatch(/^gpx:[0-9a-f]{32}$/);
    expect((a.details as Record<string, unknown>).trackName).toBe("Sortie du matin");
    expect((a.raw as Record<string, unknown>).creator).toBe("StravaGPX");
  });

  it("laisse les calories à null plutôt que de les estimer", async () => {
    // Un chiffre calculé posé à côté de chiffres mesurés aurait le même poids
    // visuel sans avoir la même valeur.
    const file = gpx([trk({ type: "running", segments: [regularPoints(5, "2026-10-03T07:00:00Z")] })]);
    const { activities } = await parseGpx(file);
    expect(activities[0].calories).toBeNull();
  });

  it("annonce la provenance de chaque agrégat", async () => {
    const file = gpx([trk({ type: "running", segments: [regularPoints(5, "2026-10-03T07:00:00Z")] })]);
    const { activities } = await parseGpx(file);
    const details = activities[0].details as Record<string, unknown>;
    expect(details.distanceSource).toBe("calculée depuis les positions");
    expect(details.durationSource).toBe("temps écoulé, pauses comprises (le GPX ne les distingue pas)");
    expect(details.elevationSource).toBe("calculé depuis les altitudes");
    expect(details.avgHrSource).toBe("moyenne des points");
  });

  it("lit la cadence et la puissance des extensions", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [[
          { lat: 45.1, lon: 5.7, time: "2026-10-03T07:00:00Z", hr: 140, cad: 86 },
          { lat: 45.1005, lon: 5.7, time: "2026-10-03T07:00:10Z", hr: 142, cad: 88 },
        ]],
      }),
    ]);
    const { activities } = await parseGpx(file);
    expect((activities[0].details as Record<string, unknown>).avgCadence).toBe(87);
  });
});

describe("parseGpx — segments", () => {
  it("ne relie pas deux segments séparés", async () => {
    /*
      Un `<trkseg>` nouveau est une coupure. Relier son premier point au
      dernier du précédent ajouterait ici 100 km de corde droite — et ce serait
      la distance affichée à l'athlète.
    */
    const file = gpx([
      trk({
        type: "running",
        segments: [
          regularPoints(6, "2026-10-03T07:00:00Z"),
          // Même latitude pour que les pas gardent la même longueur, mais
          // cent cinquante kilomètres à l'est : la corde, si elle était
          // comptée, serait impossible à manquer.
          regularPoints(6, "2026-10-03T09:00:00Z").map((p) => ({ ...p, lon: p.lon + 2, ele: 400 })),
        ],
      }),
    ]);

    const { activities } = await parseGpx(file);
    // Deux fois cinq cents mètres, et rien entre les deux.
    expect(activities[0].distanceM).toBeGreaterThan(995);
    expect(activities[0].distanceM).toBeLessThan(1010);
    expect((activities[0].details as Record<string, unknown>).segmentCount).toBe(2);
  });

  it("ne compte pas la marche d'altitude entre deux segments", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [
          [
            { lat: 45.1, lon: 5.7, ele: 100, time: "2026-10-03T07:00:00Z" },
            { lat: 45.1005, lon: 5.7, ele: 110, time: "2026-10-03T07:00:10Z" },
          ],
          [
            // Deux cents mètres plus haut, mais rejoints en voiture.
            { lat: 45.5, lon: 5.9, ele: 310, time: "2026-10-03T08:00:00Z" },
            { lat: 45.5005, lon: 5.9, ele: 320, time: "2026-10-03T08:00:10Z" },
          ],
        ],
      }),
    ]);

    const { activities } = await parseGpx(file);
    expect(activities[0].elevationGainM).toBe(20);
  });
});

describe("parseGpx — points aberrants", () => {
  it("écarte un saut de GPS et le signale", async () => {
    const points = regularPoints(6, "2026-10-03T07:00:00Z");
    // Un point au large de l'Afrique, inséré au milieu de la trace.
    points.splice(3, 0, { lat: 12.3, lon: -40.5, time: "2026-10-03T07:00:25Z", ele: 215, hr: 141 });
    const file = gpx([trk({ type: "running", segments: [points] })]);

    const { activities } = await parseGpx(file);
    const a = activities[0];
    expect(a.distanceM).toBeLessThan(1000);
    expect((a.details as Record<string, unknown>).skippedLegs).toBe(2);
  });

  it("ignore un point sans fix à (0, 0)", async () => {
    const points = regularPoints(6, "2026-10-03T07:00:00Z");
    points.splice(3, 0, { lat: 0, lon: 0, time: "2026-10-03T07:00:25Z" });
    const file = gpx([trk({ type: "running", segments: [points] })]);

    const { activities } = await parseGpx(file);
    expect(activities[0].distanceM).toBeGreaterThan(495);
    expect(activities[0].distanceM).toBeLessThan(505);
    expect((activities[0].details as Record<string, unknown>).skippedLegs).toBe(0);
  });

  it("ne compte pas les points d'itinéraire ni les points d'intérêt", async () => {
    /*
      `wpt` et `rtept` portent les mêmes attributs `lat` et `lon` que `trkpt`.
      Les additionner mélangerait un parcours prévu avec une sortie faite.
    */
    const file = bytes(
      `<?xml version="1.0"?><gpx creator="Test" version="1.1">
  <wpt lat="48.85" lon="2.35"><name>Départ</name></wpt>
  <rte><rtept lat="40.0" lon="-3.7"/><rtept lat="41.0" lon="-3.7"/></rte>
  <trk><type>running</type><trkseg>
    <trkpt lat="45.1" lon="5.7"><time>2026-10-03T07:00:00Z</time></trkpt>
    <trkpt lat="45.1009" lon="5.7"><time>2026-10-03T07:00:30Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
    );

    const { activities } = await parseGpx(file);
    expect((activities[0].details as Record<string, unknown>).trackpointCount).toBe(2);
    expect(activities[0].distanceM).toBeGreaterThan(95);
    expect(activities[0].distanceM).toBeLessThan(105);
  });
});

describe("parseGpx — ce qui manque", () => {
  it("laisse le dénivelé à null sans altitude", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [regularPoints(6, "2026-10-03T07:00:00Z", { ele: false })],
      }),
    ]);
    const { activities } = await parseGpx(file);
    expect(activities[0].elevationGainM).toBeNull();
    expect((activities[0].details as Record<string, unknown>).elevationSource).toBeNull();
  });

  it("laisse la fréquence cardiaque à null quand l'appareil ne l'a pas écrite", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [regularPoints(6, "2026-10-03T07:00:00Z", { hr: false })],
      }),
    ]);
    const { activities } = await parseGpx(file);
    expect(activities[0].avgHr).toBeNull();
    expect(activities[0].maxHr).toBeNull();
  });

  it("laisse le sport à null quand la trace n'en déclare pas", async () => {
    const file = gpx([trk({ segments: [regularPoints(6, "2026-10-03T07:00:00Z")] })]);
    const { activities } = await parseGpx(file);
    expect(activities[0].sport).toBeNull();
  });

  it("se rabat sur l'heure des métadonnées si les points n'en portent pas", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [[
          { lat: 45.1, lon: 5.7, ele: 200 },
          { lat: 45.1009, lon: 5.7, ele: 205 },
        ]],
      }),
    ], "2026-10-03T07:12:38Z");

    const { activities } = await parseGpx(file);
    expect(activities[0].startedAt).toBe("2026-10-03T07:12:38.000Z");
    // Sans horodatage par point, aucune durée n'est connue — et donc aucune
    // allure, même si la distance l'est.
    expect(activities[0].durationS).toBeNull();
    expect(activities[0].avgPaceSPerKm).toBeNull();
  });

  it("refuse une trace sans aucun horodatage", async () => {
    // C'est un itinéraire tracé à la main, pas une sortie : l'accepter le
    // ferait entrer dans la charge d'entraînement réelle.
    const file = gpx([
      trk({ type: "running", segments: [[{ lat: 45.1, lon: 5.7 }, { lat: 45.2, lon: 5.7 }]] }),
    ]);

    const { activities, rejected } = await parseGpx(file, "parcours.gpx");
    expect(activities).toEqual([]);
    expect(rejected[0].reason).toMatch(/itinéraire, pas une sortie/);
  });
});

describe("parseGpx — fuseau horaire", () => {
  it("utilise le décalage que porte le fichier", async () => {
    const file = gpx([
      trk({
        type: "running",
        segments: [[
          { lat: 45.1, lon: 5.7, time: "2026-10-03T23:30:00+02:00" },
          { lat: 45.1009, lon: 5.7, time: "2026-10-03T23:30:30+02:00" },
        ]],
      }),
    ]);

    const { activities } = await parseGpx(file);
    expect(activities[0].localDate).toBe("2026-10-03");
    expect((activities[0].details as Record<string, unknown>).localDateSource)
      .toBe("décalage porté par le fichier");
  });

  it("retient UTC et le dit quand le fichier n'écrit que des Z", async () => {
    const file = gpx([trk({ type: "running", segments: [regularPoints(3, "2026-10-03T07:00:00Z")] })]);
    const { activities } = await parseGpx(file);
    expect((activities[0].raw as Record<string, unknown>).utcOffsetS).toBeNull();
    expect((activities[0].details as Record<string, unknown>).localDateSource)
      .toBe("UTC, le fichier ne donne pas de fuseau");
  });
});

describe("parseGpx — plusieurs traces et refus", () => {
  it("fait une activité par trace", async () => {
    const file = gpx([
      trk({ type: "running", segments: [regularPoints(6, "2026-10-03T07:00:00Z")] }),
      trk({ type: "ride", segments: [regularPoints(6, "2026-10-03T09:00:00Z")] }),
    ]);

    const { activities } = await parseGpx(file);
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a.sport)).toEqual(["running", "cycling"]);
    expect(activities[0].externalId).toMatch(/#1$/);
    expect(activities[1].externalId).toMatch(/#2$/);
  });

  it("garde la trace valide et rejette celle sans horodatage", async () => {
    const file = gpx([
      trk({ type: "running", segments: [[{ lat: 45.1, lon: 5.7 }, { lat: 45.2, lon: 5.7 }]] }),
      trk({ type: "running", segments: [regularPoints(6, "2026-10-03T09:00:00Z")] }),
    ]);

    const { activities, rejected } = await parseGpx(file, "melange.gpx");
    expect(activities).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/trace 1 sans horodatage/);
  });

  it("dit qu'un TCX est un TCX plutôt que « fichier vide »", async () => {
    const { rejected } = await parseGpx(
      bytes(`<?xml version="1.0"?><TrainingCenterDatabase><Activities/></TrainingCenterDatabase>`),
      "course.tcx",
    );
    expect(rejected[0].reason).toMatch(/ce fichier est un TCX/);
  });

  it("rejette un XML tronqué", async () => {
    const complete = new TextDecoder().decode(
      gpx([trk({ type: "running", segments: [regularPoints(30, "2026-10-03T07:00:00Z")] })]),
    );
    const { activities, rejected } = await parseGpx(
      bytes(complete.slice(0, complete.indexOf("<trkpt", 2000) + 14)),
      "tronque.gpx",
    );
    expect(activities).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("rejette un fichier qui n'est pas du XML", async () => {
    const { activities, rejected } = await parseGpx(bytes("salut"), "note.txt");
    expect(activities).toEqual([]);
    expect(rejected).toHaveLength(1);
  });
});

describe("looksLikeGpx", () => {
  it("reconnaît un GPX sur sa racine, pas sur son extension", () => {
    expect(looksLikeGpx(gpx([]))).toBe(true);
  });

  it("refuse un TCX et un contenu quelconque", () => {
    expect(looksLikeGpx(bytes(`<?xml version="1.0"?><TrainingCenterDatabase/>`))).toBe(false);
    expect(looksLikeGpx(bytes("bonjour"))).toBe(false);
  });
});
