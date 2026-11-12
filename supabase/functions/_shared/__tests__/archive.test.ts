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

import { buildZip, gzipBytes, gpxFile, tcxFile, utf8 } from "./zipFixture";

/*
  Les octets rendus par la décompression viennent du contexte Node et non de
  celui de jsdom : deux constructeurs `Uint8Array` distincts, que `toEqual`
  refuse de rapprocher (« Compared values have no visual difference »). On
  compare donc le texte, ce qui est de toute façon plus lisible en cas d'écart.
*/
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
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
