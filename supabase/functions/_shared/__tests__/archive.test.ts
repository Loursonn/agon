/**
 * La lecture d'archive et l'aiguillage par contenu.
 *
 * Les zips sont assemblés ici, octet par octet, somme de contrôle comprise —
 * même raison que pour le décodeur FIT : un fixture figé prouve seulement que
 * le lecteur n'a pas changé, un fichier écrit depuis la spécification prouve
 * qu'il lit le format. Et comme les en-têtes sont écrits ici, un décalage dans
 * le lecteur se voit immédiatement au lieu de produire un nom de fichier
 * tronqué plausible.
 */
// `Blob` de Node plutôt que celui de jsdom : ce dernier n'implémente pas
// `arrayBuffer()`, que tout navigateur réel fournit depuis 2020.
import { Blob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  bytesSource,
  blobSource,
  gunzip,
  listZipEntries,
  readZipEntry,
  ZipError,
} from "../activityFiles/archive";
import {
  looksLikeActivityName,
  parseActivityArchive,
  parseActivityFile,
} from "../activityFiles/index";

const utf8 = (s: string) => new TextEncoder().encode(s);
/*
  Les octets rendus par la décompression viennent du contexte Node et non de
  celui de jsdom : deux constructeurs `Uint8Array` distincts, que `toEqual`
  refuse de rapprocher (« Compared values have no visual difference »). On
  compare donc le texte, ce qui est de toute façon plus lisible en cas d'écart.
*/
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Table CRC-32 (polynôme inversé 0xEDB88320), comme l'exige le format zip. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Comprime avec la plateforme. `Blob.stream()` manque dans jsdom. */
async function compress(bytes: Uint8Array, format: "gzip" | "deflate-raw"): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new CompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new Uint8Array(value));
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const deflateRaw = (bytes: Uint8Array) => compress(bytes, "deflate-raw");
const gzipBytes = (bytes: Uint8Array) => compress(bytes, "gzip");

interface Member {
  name: string;
  bytes: Uint8Array;
  /** Méthode 8 plutôt que 0. C'est ce qu'écrit tout outil de compression réel. */
  deflate?: boolean;
}

/** Assemble un zip conforme : en-têtes locaux, répertoire central, fin. */
async function buildZip(members: Member[]): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const member of members) {
    const name = utf8(member.name);
    const data = member.deflate ? await deflateRaw(member.bytes) : member.bytes;

    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version nécessaire
    localView.setUint16(6, 0, true); // drapeaux
    localView.setUint16(8, member.deflate ? 8 : 0, true);
    localView.setUint32(14, crc32(member.bytes), true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, member.bytes.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // champ étendu
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, member.deflate ? 8 : 0, true);
    centralView.setUint32(16, crc32(member.bytes), true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, member.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, members.length, true);
  eocdView.setUint16(10, members.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of [...locals, ...centrals, eocd]) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** GPX minimal mais valide, pour servir de contenu d'activité. */
function gpxFile(startIso: string): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1">
  <trk><type>running</type><trkseg>
    <trkpt lat="45.1" lon="5.7"><ele>200</ele><time>${startIso}</time></trkpt>
    <trkpt lat="45.1009" lon="5.7"><ele>205</ele><time>${
      new Date(Date.parse(startIso) + 30_000).toISOString()
    }</time></trkpt>
  </trkseg></trk>
</gpx>`,
  );
}

/** TCX minimal mais valide. */
function tcxFile(startIso: string): Uint8Array {
  return utf8(
    `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Biking">
    <Id>${startIso}</Id>
    <Lap StartTime="${startIso}">
      <TotalTimeSeconds>3600</TotalTimeSeconds>
      <DistanceMeters>30000</DistanceMeters>
    </Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`,
  );
}

describe("listZipEntries", () => {
  it("lit l'index d'une archive", async () => {
    const zip = await buildZip([
      { name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") },
      { name: "activities.csv", bytes: utf8("id,name\n1,Sortie"), deflate: true },
    ]);

    const entries = await listZipEntries(bytesSource(zip));
    expect(entries.map((e) => e.name)).toEqual(["activities/1.gpx", "activities.csv"]);
    expect(entries[0].method).toBe(0);
    expect(entries[1].method).toBe(8);
  });

  it("lit l'index par tranches, sans charger l'archive entière", async () => {
    /*
      C'est ce qui permet de traiter un export de plusieurs centaines de
      mégaoctets sur un téléphone : le zip a son index à la fin, donc seules
      deux lectures ciblées sont nécessaires avant de savoir quoi ouvrir.
    */
    const zip = await buildZip([{ name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") }]);
    const blob = new Blob([zip]);
    const source = blobSource(blob as unknown as globalThis.Blob);
    const read = vi.spyOn(source, "read");

    const entries = await listZipEntries(source);
    expect(entries).toHaveLength(1);
    const totalRead = read.mock.calls.reduce((n, [, length]) => n + Math.min(length, zip.length), 0);
    expect(totalRead).toBeLessThan(zip.length * 2);
  });

  it("refuse un fichier qui n'est pas un zip", async () => {
    await expect(listZipEntries(bytesSource(utf8("ce n'est pas une archive"))))
      .rejects.toThrow(ZipError);
  });

  it("refuse une archive dont l'index sort du fichier", async () => {
    // Exactement ce que donne un téléchargement interrompu puis recollé.
    const zip = await buildZip([{ name: "a.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    view.setUint32(zip.length - 22 + 16, 999_999, true);
    await expect(listZipEntries(bytesSource(zip))).rejects.toThrow(/tronquée/);
  });
});

describe("readZipEntry", () => {
  it("rend un membre stocké tel quel", async () => {
    const content = gpxFile("2026-10-03T07:00:00Z");
    const zip = await buildZip([{ name: "a.gpx", bytes: content }]);
    const source = bytesSource(zip);
    const [entry] = await listZipEntries(source);
    expect(text(await readZipEntry(source, entry))).toBe(text(content));
  });

  it("décompresse un membre deflate", async () => {
    const content = gpxFile("2026-10-03T07:00:00Z");
    const zip = await buildZip([{ name: "a.gpx", bytes: content, deflate: true }]);
    const source = bytesSource(zip);
    const [entry] = await listZipEntries(source);
    expect(text(await readZipEntry(source, entry))).toBe(text(content));
  });

  it("refuse un membre annoncé plus gros que ce qu'un fichier d'activité peut peser", async () => {
    // Garde-fou contre les archives piégées : quelques kilooctets compressés
    // qui se déplient en plusieurs gigaoctets.
    const zip = await buildZip([{ name: "a.gpx", bytes: utf8("x") }]);
    const source = bytesSource(zip);
    const [entry] = await listZipEntries(source);
    await expect(readZipEntry(source, { ...entry, uncompressedSize: 500 * 1024 * 1024 }))
      .rejects.toThrow(/Mo décompressés/);
  });

  it("refuse une méthode de compression exotique", async () => {
    const zip = await buildZip([{ name: "a.gpx", bytes: utf8("x") }]);
    const source = bytesSource(zip);
    const [entry] = await listZipEntries(source);
    await expect(readZipEntry(source, { ...entry, method: 14 }))
      .rejects.toThrow(/méthode de compression 14/);
  });
});

describe("gunzip", () => {
  it("déplie un fichier gzip", async () => {
    const content = tcxFile("2026-10-03T07:00:00Z");
    expect(text(await gunzip(await gzipBytes(content)))).toBe(text(content));
  });

  it("dit clairement qu'un contenu compressé est abîmé", async () => {
    const broken = await gzipBytes(utf8("bonjour"));
    broken[12] = (broken[12] ?? 0) ^ 0xff;
    await expect(gunzip(broken, "1.fit.gz")).rejects.toThrow(/1\.fit\.gz/);
  });
});

describe("parseActivityFile — aiguillage", () => {
  it("lit un GPX", async () => {
    const { activities } = await parseActivityFile("1.gpx", gpxFile("2026-10-03T07:00:00Z"));
    expect(activities[0].sport).toBe("running");
  });

  it("lit un TCX", async () => {
    const { activities } = await parseActivityFile("1.tcx", tcxFile("2026-10-03T07:00:00Z"));
    expect(activities[0].sport).toBe("cycling");
  });

  it("déplie un .gz avant de décoder", async () => {
    // Strava compresse les TCX et les FIT de ses exports, mais pas les GPX, et
    // la règle n'est écrite nulle part.
    const gz = await gzipBytes(tcxFile("2026-10-03T07:00:00Z"));
    const { activities } = await parseActivityFile("1.tcx.gz", gz);
    expect(activities[0].distanceM).toBe(30000);
  });

  it("reconnaît un gzip dont le nom ne le dit pas", async () => {
    const gz = await gzipBytes(gpxFile("2026-10-03T07:00:00Z"));
    const { activities } = await parseActivityFile("1.gpx", gz);
    expect(activities).toHaveLength(1);
  });

  it("décide sur le contenu et non sur l'extension", async () => {
    /*
      Un athlète renomme, un exportateur se trompe, le système ajoute « (1) ».
      Décider sur l'extension donnerait ici une erreur de décodage
      incompréhensible au lieu d'une lecture réussie.
    */
    const { activities } = await parseActivityFile("sortie.gpx", tcxFile("2026-10-03T07:00:00Z"));
    expect(activities[0].sport).toBe("cycling");
  });

  it("route vers le décodeur FIT un contenu qui porte sa signature", async () => {
    const fake = new Uint8Array(20);
    fake[0] = 12;
    fake.set(utf8(".FIT"), 8);
    const { activities, rejected } = await parseActivityFile("1.fit", fake);
    expect(activities).toEqual([]);
    // Le refus doit venir du décodeur FIT, pas de l'aiguillage.
    expect(rejected[0].reason).not.toMatch(/format non reconnu/);
  });

  it("refuse clairement un format inconnu", async () => {
    const { rejected } = await parseActivityFile("notes.txt", utf8("compte rendu de séance"));
    expect(rejected[0].reason).toMatch(/format non reconnu/);
  });
});

describe("parseActivityArchive", () => {
  it("lit toutes les activités d'un export et ignore ses métadonnées", async () => {
    const zip = await buildZip([
      { name: "activities/", bytes: new Uint8Array(0) },
      { name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z"), deflate: true },
      { name: "activities/2.tcx.gz", bytes: await gzipBytes(tcxFile("2026-10-04T07:00:00Z")) },
      { name: "activities.csv", bytes: utf8("id,name\n1,Sortie"), deflate: true },
      { name: "profile.csv", bytes: utf8("nom\nAthlète") },
      { name: "__MACOSX/._1.gpx", bytes: utf8("métadonnées macOS") },
    ]);

    const seen: string[] = [];
    const result = await parseActivityArchive(bytesSource(zip), {
      onProgress: (p) => void seen.push(`${p.done}/${p.total} ${p.current}`),
    });

    expect(result.files).toBe(2);
    expect(result.activities).toHaveLength(2);
    expect(result.activities.map((a) => a.sport)).toEqual(["running", "cycling"]);
    /*
      Les métadonnées sont comptées, pas rejetées : un export Strava en contient
      une vingtaine, et les lister comme « refusées » noierait les vrais refus,
      ceux dont l'athlète doit s'inquiéter.
    */
    expect(result.rejected).toEqual([]);
    expect(result.ignored).toBe(4);
    expect(seen).toEqual(["1/2 1.gpx", "2/2 2.tcx.gz"]);
  });

  it("garde les activités valides quand un membre est abîmé", async () => {
    /*
      Sur quatre cents sorties, une seule abîmée ne doit pas annuler l'import :
      l'athlète n'aurait aucun moyen de savoir laquelle retirer.
    */
    const zip = await buildZip([
      { name: "activities/1.gpx", bytes: gpxFile("2026-10-03T07:00:00Z") },
      { name: "activities/2.gpx", bytes: utf8("<gpx><trk><trkseg><trkpt lat=") },
      { name: "activities/3.tcx", bytes: tcxFile("2026-10-05T07:00:00Z") },
    ]);

    const result = await parseActivityArchive(bytesSource(zip));
    expect(result.activities).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].name).toBe("2.gpx");
  });

  it("rejette l'archive entière quand ce n'est pas un zip", async () => {
    const result = await parseActivityArchive(bytesSource(utf8("pas une archive")));
    expect(result.activities).toEqual([]);
    expect(result.files).toBe(0);
    expect(result.rejected[0].name).toBe("archive");
  });

  it("rend une archive sans activité sans faire croire à une erreur", async () => {
    const zip = await buildZip([{ name: "profile.csv", bytes: utf8("nom\nAthlète") }]);
    const result = await parseActivityArchive(bytesSource(zip));
    expect(result.files).toBe(0);
    expect(result.ignored).toBe(1);
    expect(result.rejected).toEqual([]);
  });
});

describe("looksLikeActivityName", () => {
  it("reconnaît les extensions attendues, compressées ou non", () => {
    for (const name of ["1.fit", "1.FIT", "1.tcx", "1.gpx", "1.fit.gz", "1.tcx.gz"]) {
      expect(looksLikeActivityName(name)).toBe(true);
    }
  });

  it("écarte le reste", () => {
    for (const name of ["activities.csv", "photo.jpg", "notes.txt", "1.gpx.bak"]) {
      expect(looksLikeActivityName(name)).toBe(false);
    }
  });
});
