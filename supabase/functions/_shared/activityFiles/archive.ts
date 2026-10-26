/**
 * Lecture d'une archive d'export, sans dépendance.
 *
 * C'est la forme sous laquelle Strava rend ses données : un zip contenant un
 * dossier `activities/` où chaque sortie est un `.gpx`, un `.tcx.gz` ou un
 * `.fit.gz`, plus une dizaine de fichiers de métadonnées dont nous ne faisons
 * rien. C'est aussi le seul chemin par lequel l'historique antérieur à
 * l'autorisation Garmin peut entrer : leur programme développeur ne donne accès
 * qu'aux activités postérieures.
 *
 * Pourquoi aucune bibliothèque : `DecompressionStream` est dans la plateforme,
 * côté navigateur comme côté Deno, et sait déjà faire `gzip` et `deflate-raw`.
 * Il ne reste qu'à lire la structure du zip — quelques dizaines d'octets par
 * entrée — là où ajouter JSZip coûterait 100 ko au bundle pour la même chose.
 *
 * Pourquoi une source d'octets abstraite et non un `Uint8Array` : l'export
 * d'un athlète assidu pèse plusieurs centaines de mégaoctets. Le charger
 * entièrement en mémoire avant de le lire fait tomber l'onglet sur un
 * téléphone, alors qu'un zip se lit par morceaux — son index est à la fin, et
 * chaque fichier se récupère par une lecture ciblée.
 */

/**
 * Accès en lecture aléatoire à un contenu, quelle qu'en soit l'origine.
 *
 * `Blob.slice()` ne lit réellement du disque que la tranche demandée : c'est ce
 * qui permet de traiter une archive plus grosse que la mémoire disponible.
 */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Source adossée à un tampon déjà en mémoire (tests, petits fichiers). */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: (offset, length) =>
      Promise.resolve(bytes.subarray(offset, Math.min(offset + length, bytes.length))),
  };
}

/** Source adossée à un `File` ou un `Blob`, lue par tranches. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => {
      const slice = blob.slice(offset, Math.min(offset + length, blob.size));
      return new Uint8Array(await slice.arrayBuffer());
    },
  };
}

/**
 * Taille maximale acceptée pour un fichier décompressé.
 *
 * Aucun fichier d'activité n'atteint cette taille : le plus gros FIT d'un
 * ultra de cent heures tient en quelques mégaoctets. La borne existe contre
 * les archives piégées, où quelques kilooctets compressés se déplient en
 * plusieurs gigaoctets et épuisent la mémoire de l'onglet.
 */
const MAX_MEMBER_BYTES = 64 * 1024 * 1024;

/** Signatures de la structure zip. */
const SIG = {
  localHeader: 0x04034b50,
  centralHeader: 0x02014b50,
  endOfCentralDir: 0x06054b50,
  zip64EndOfCentralDir: 0x06064b50,
  zip64Locator: 0x07064b50,
} as const;

/** Sentinelles qui renvoient vers un champ ZIP64. */
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

export interface ZipEntry {
  /** Chemin tel qu'écrit dans l'archive, séparateurs `/` compris. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stocké, 8 = deflate. Les autres méthodes sont refusées à la lecture. */
  method: number;
  /** Position de l'en-tête local, d'où partent les données. */
  headerOffset: number;
}

export class ZipError extends Error {}

const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Index d'une archive.
 *
 * Lu depuis le répertoire central, à la fin du fichier, et non en suivant les
 * en-têtes locaux depuis le début : c'est le répertoire central qui fait
 * autorité, et lui seul donne les tailles quand une entrée a été écrite en
 * flux (descripteur de données différé, tailles à zéro dans l'en-tête local).
 */
export async function listZipEntries(source: ByteSource): Promise<ZipEntry[]> {
  if (source.size < 22) throw new ZipError("fichier trop court pour être un zip");

  // Le commentaire d'archive peut faire 64 ko : la fin du répertoire central
  // est donc quelque part dans les 64 ko + 22 derniers octets.
  const tailLength = Math.min(source.size, 65_557);
  const tail = await source.read(source.size - tailLength, tailLength);
  const tailView = view(tail);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === SIG.endOfCentralDir) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipError(
      "fin de répertoire central introuvable — ce n'est pas un zip, ou il est tronqué",
    );
  }

  let entryCount = tailView.getUint16(eocd + 10, true);
  let centralSize = tailView.getUint32(eocd + 12, true);
  let centralOffset = tailView.getUint32(eocd + 16, true);

  if (entryCount === U16_MAX || centralSize === U32_MAX || centralOffset === U32_MAX) {
    /*
      Archive ZIP64 : au-delà de 4 Go ou de 65 535 fichiers, les vrais chiffres
      sont dans un second bloc de fin, repéré par un localisateur placé juste
      avant celui-ci. Ce cas est improbable pour un export d'activités, mais le
      deviner de travers donnerait des décalages absurdes plutôt qu'une erreur.
    */
    const zip64 = await readZip64End(source, tail, tailView, eocd);
    entryCount = zip64.entryCount;
    centralSize = zip64.centralSize;
    centralOffset = zip64.centralOffset;
  }

  if (centralOffset + centralSize > source.size) {
    throw new ZipError("répertoire central hors du fichier — archive tronquée");
  }

  const central = await source.read(centralOffset, centralSize);
  const centralView = view(central);
  const names = new TextDecoder("utf-8");

  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > central.length) {
      throw new ZipError(`répertoire central incomplet (entrée ${i + 1} sur ${entryCount})`);
    }
    if (centralView.getUint32(cursor, true) !== SIG.centralHeader) {
      throw new ZipError(`en-tête de répertoire central attendu à l'entrée ${i + 1}`);
    }

    const method = centralView.getUint16(cursor + 10, true);
    let compressedSize = centralView.getUint32(cursor + 20, true);
    let uncompressedSize = centralView.getUint32(cursor + 24, true);
    const nameLength = centralView.getUint16(cursor + 28, true);
    const extraLength = centralView.getUint16(cursor + 30, true);
    const commentLength = centralView.getUint16(cursor + 32, true);
    let headerOffset = centralView.getUint32(cursor + 42, true);

    const name = names.decode(central.subarray(cursor + 46, cursor + 46 + nameLength));

    if (
      compressedSize === U32_MAX || uncompressedSize === U32_MAX || headerOffset === U32_MAX
    ) {
      const extra = central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
      const zip64 = readZip64Extra(extra, {
        uncompressedSize: uncompressedSize === U32_MAX,
        compressedSize: compressedSize === U32_MAX,
        headerOffset: headerOffset === U32_MAX,
      });
      if (!zip64) throw new ZipError(`entrée ZIP64 sans champ étendu : ${name}`);
      uncompressedSize = zip64.uncompressedSize ?? uncompressedSize;
      compressedSize = zip64.compressedSize ?? compressedSize;
      headerOffset = zip64.headerOffset ?? headerOffset;
    }

    entries.push({ name, method, compressedSize, uncompressedSize, headerOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZip64End(
  source: ByteSource,
  tail: Uint8Array,
  tailView: DataView,
  eocd: number,
): Promise<{ entryCount: number; centralSize: number; centralOffset: number }> {
  let locator = -1;
  for (let i = eocd - 20; i >= 0; i--) {
    if (tailView.getUint32(i, true) === SIG.zip64Locator) {
      locator = i;
      break;
    }
  }
  if (locator < 0) throw new ZipError("archive ZIP64 sans localisateur de fin");

  const endOffset = Number(tailView.getBigUint64(locator + 8, true));
  if (!Number.isSafeInteger(endOffset) || endOffset + 56 > source.size) {
    throw new ZipError("localisateur ZIP64 hors du fichier");
  }

  const block = await source.read(endOffset, 56);
  const blockView = view(block);
  if (blockView.getUint32(0, true) !== SIG.zip64EndOfCentralDir) {
    throw new ZipError("bloc de fin ZIP64 introuvable à la position annoncée");
  }

  const entryCount = Number(blockView.getBigUint64(32, true));
  const centralSize = Number(blockView.getBigUint64(40, true));
  const centralOffset = Number(blockView.getBigUint64(48, true));
  if (
    !Number.isSafeInteger(entryCount) || !Number.isSafeInteger(centralSize) ||
    !Number.isSafeInteger(centralOffset)
  ) {
    throw new ZipError("archive ZIP64 trop grande pour être lue ici");
  }
  return { entryCount, centralSize, centralOffset };
}

/** Champ étendu ZIP64 (identifiant 0x0001) d'une entrée. */
function readZip64Extra(
  extra: Uint8Array,
  wanted: { uncompressedSize: boolean; compressedSize: boolean; headerOffset: boolean },
): { uncompressedSize?: number; compressedSize?: number; headerOffset?: number } | null {
  const extraView = view(extra);
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extraView.getUint16(cursor, true);
    const size = extraView.getUint16(cursor + 2, true);
    if (id !== 0x0001) {
      cursor += 4 + size;
      continue;
    }
    /*
      Les champs présents dépendent de ceux qui valaient 0xFFFFFFFF, et dans
      cet ordre : taille décompressée, taille compressée, position de l'en-tête.
      Lire les trois inconditionnellement décalerait tout.
    */
    let at = cursor + 4;
    const out: { uncompressedSize?: number; compressedSize?: number; headerOffset?: number } = {};
    const next = (): number | undefined => {
      if (at + 8 > extra.length) return undefined;
      const value = Number(extraView.getBigUint64(at, true));
      at += 8;
      return Number.isSafeInteger(value) ? value : undefined;
    };
    if (wanted.uncompressedSize) out.uncompressedSize = next();
    if (wanted.compressedSize) out.compressedSize = next();
    if (wanted.headerOffset) out.headerOffset = next();
    return out;
  }
  return null;
}

/** Contenu décompressé d'une entrée. */
export async function readZipEntry(source: ByteSource, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_MEMBER_BYTES) {
    throw new ZipError(
      `${entry.name} : ${Math.round(entry.uncompressedSize / 1_048_576)} Mo décompressés, ` +
        "au-delà de ce qu'un fichier d'activité peut peser",
    );
  }

  const header = await source.read(entry.headerOffset, 30);
  const headerView = view(header);
  if (header.length < 30 || headerView.getUint32(0, true) !== SIG.localHeader) {
    throw new ZipError(`${entry.name} : en-tête local introuvable`);
  }
  // La longueur du nom et celle du champ étendu diffèrent souvent de celles du
  // répertoire central : c'est l'en-tête local qui dit où commencent les données.
  const dataStart = entry.headerOffset + 30 +
    headerView.getUint16(26, true) + headerView.getUint16(28, true);

  const raw = await source.read(dataStart, entry.compressedSize);
  if (raw.length < entry.compressedSize) {
    throw new ZipError(`${entry.name} : données tronquées`);
  }

  if (entry.method === 0) return raw;
  if (entry.method === 8) return decompress(raw, "deflate-raw", entry.name);
  throw new ZipError(
    `${entry.name} : méthode de compression ${entry.method} non prise en charge`,
  );
}

/** Contenu d'un fichier `.gz`. */
export function gunzip(bytes: Uint8Array, name = "fichier.gz"): Promise<Uint8Array> {
  return decompress(bytes, "gzip", name);
}

/**
 * Décompression bornée.
 *
 * La borne est vérifiée pendant la lecture et non après : un flux piégé ne
 * déclare pas sa taille, et attendre la fin pour s'apercevoir qu'elle dépasse
 * la mémoire disponible revient à ne pas la vérifier.
 */
async function decompress(
  bytes: Uint8Array,
  format: "gzip" | "deflate-raw",
  name: string,
): Promise<Uint8Array> {
  /*
    Flux construit à la main plutôt que `new Blob([bytes]).stream()` : `Blob`
    existe partout, mais `.stream()` manque encore dans certains
    environnements (jsdom, où tournent nos tests). `ReadableStream` est le
    dénominateur commun du navigateur, de Deno et de Node.
  */
  /*
    Typé `BufferSource`, et non `Uint8Array`, parce que c'est ce qu'attend
    l'entrée de `DecompressionStream`. La conversion explicite est là pour les
    types de Deno, qui exigent un `Uint8Array` adossé à un `ArrayBuffer` et non
    au `ArrayBufferLike` d'une tranche quelconque ; la valeur transmise, elle,
    est la même dans les deux cas.
  */
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as BufferSource);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream(format)).getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MEMBER_BYTES) {
        await reader.cancel();
        throw new ZipError(
          `${name} : décompression au-delà de ${MAX_MEMBER_BYTES / 1_048_576} Mo, interrompue`,
        );
      }
      chunks.push(new Uint8Array(value));
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    // Un flux invalide signifie une archive abîmée : le dire ainsi plutôt que
    // de laisser remonter « incorrect header check ».
    throw new ZipError(
      `${name} : contenu compressé illisible (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
