/** Zips et fichiers d'activité écrits octet par octet, pour les tests (sans fixture figé). */

export const utf8 = (s: string) => new TextEncoder().encode(s);

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

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Comprime avec la plateforme. `Blob.stream()` manque dans jsdom. */
export async function compress(bytes: Uint8Array, format: "gzip" | "deflate-raw"): Promise<Uint8Array> {
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

export const deflateRaw = (bytes: Uint8Array) => compress(bytes, "deflate-raw");
export const gzipBytes = (bytes: Uint8Array) => compress(bytes, "gzip");

export interface Member {
  name: string;
  bytes: Uint8Array;
  /** Méthode 8 plutôt que 0. C'est ce qu'écrit tout outil de compression réel. */
  deflate?: boolean;
}

/** Assemble un zip conforme : en-têtes locaux, répertoire central, fin. */
export async function buildZip(members: Member[]): Promise<Uint8Array> {
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
export function gpxFile(startIso: string): Uint8Array {
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
export function tcxFile(startIso: string): Uint8Array {
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

