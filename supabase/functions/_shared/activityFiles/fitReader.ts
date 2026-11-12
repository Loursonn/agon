/**
 * Lecture bas niveau d'un FIT : en-tête, définitions, messages de données.
 *
 * Un seul parcours pour deux usages : `parseFit` (résumé de séance, import
 * manuel et COROS) et `decodeFitDetail` (série seconde par seconde, tours,
 * séries de muscu). Deux parseurs du même format divergent toujours ; celui-ci
 * est donc la seule implémentation du format binaire.
 *
 * Lecture « en flux » : le message n'est pas copié dans un objet. Le visiteur
 * reçoit une vue (`FitMessage`) qui lit à la demande dans le tampon, valable
 * seulement pendant l'appel. Un fichier d'une heure contient ~3 600 `record` ;
 * les matérialiser en `Map` coûterait des dizaines de Mo dans une Edge
 * Function à mémoire limitée, pour des valeurs aussitôt recopiées en tableaux.
 */

/*
  Les horodatages FIT comptent les secondes depuis le 31 décembre 1989 à
  00:00:00 UTC, et non depuis l'époque Unix.
*/
export const FIT_EPOCH_MS = 631_065_600_000;

/** Types de base FIT : taille en octets et valeur signifiant « absent ». */
const BASE_TYPES: Record<number, { size: number; read: (v: DataView, o: number, le: boolean) => number | null }> = {
  0x00: { size: 1, read: (v, o) => nz(v.getUint8(o), 0xff) },               // enum
  0x01: { size: 1, read: (v, o) => nz(v.getInt8(o), 0x7f) },                // sint8
  0x02: { size: 1, read: (v, o) => nz(v.getUint8(o), 0xff) },               // uint8
  0x03: { size: 2, read: (v, o, le) => nz(v.getInt16(o, le), 0x7fff) },     // sint16
  0x04: { size: 2, read: (v, o, le) => nz(v.getUint16(o, le), 0xffff) },    // uint16
  0x05: { size: 4, read: (v, o, le) => nz(v.getInt32(o, le), 0x7fffffff) }, // sint32
  0x06: { size: 4, read: (v, o, le) => nz(v.getUint32(o, le), 0xffffffff) },// uint32
  0x07: { size: 1, read: (v, o) => nz(v.getUint8(o), 0x00) },               // string (traité à part)
  0x08: { size: 4, read: (v, o, le) => finite(v.getFloat32(o, le)) },       // float32
  0x09: { size: 8, read: (v, o, le) => finite(v.getFloat64(o, le)) },       // float64
  0x0a: { size: 1, read: (v, o) => nz(v.getUint8(o), 0x00) },               // uint8z
  0x0b: { size: 2, read: (v, o, le) => nz(v.getUint16(o, le), 0x0000) },    // uint16z
  0x0c: { size: 4, read: (v, o, le) => nz(v.getUint32(o, le), 0x00000000) },// uint32z
  0x0d: { size: 1, read: (v, o) => nz(v.getUint8(o), 0xff) },               // byte
  0x0e: { size: 8, read: (v, o, le) => big(v.getBigInt64(o, le)) },         // sint64
  0x0f: { size: 8, read: (v, o, le) => big(v.getBigUint64(o, le)) },        // uint64
  0x10: { size: 8, read: (v, o, le) => big(v.getBigUint64(o, le)) },        // uint64z
};

/** Valeur « absente » → `null`, pour ne jamais confondre avec un zéro mesuré. */
const nz = (value: number, invalid: number): number | null =>
  value === invalid ? null : value;

const finite = (value: number): number | null => (Number.isFinite(value) ? value : null);

const big = (value: bigint): number | null => {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
};

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
  /** Position du champ dans le corps du message. */
  at: number;
}

interface MessageDef {
  globalNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  /** Taille totale du message de données, pour pouvoir le sauter d'un bloc. */
  totalSize: number;
}

/** Vue sur un message de données, valable pendant l'appel du visiteur seulement. */
export interface FitMessage {
  readonly globalNum: number;
  /**
   * Horodatage FIT du message (secondes depuis 1989) : le champ 253 s'il est
   * présent, sinon celui reconstruit depuis un en-tête compressé. `null` si
   * le message n'en a pas.
   */
  readonly timestamp: number | null;
  /** Premier élément du champ, ou `null` (absent ou invalide). */
  get(fieldNum: number): number | null;
  /** Tous les éléments d'un champ tableau (éléments invalides → `null`). */
  getArray(fieldNum: number): Array<number | null> | null;
  /** Champ chaîne (UTF-8, terminée par 0). */
  getString(fieldNum: number): string | null;
  has(fieldNum: number): boolean;
  /** Tous les champs, premier élément seulement (archives `raw`). */
  entries(): Array<[number, number | null]>;
}

const UTF8 = new TextDecoder("utf-8");

/**
 * Parcourt un FIT et appelle `visit` pour chaque message de données.
 *
 * `wants(globalNum)` permet de sauter sans lecture les messages inutiles :
 * c'est ce qui garde `parseFit` aussi rapide qu'avant.
 *
 * Les messages inconnus sont sautés par leur taille déclarée dans leur
 * définition : c'est la seule façon d'avancer dans un flux où tout est
 * variable, et c'est aussi ce qui rend le décodeur insensible aux extensions
 * propriétaires des fabricants.
 */
export function walkFit(
  bytes: Uint8Array,
  wants: (globalNum: number) => boolean,
  visit: (msg: FitMessage) => void,
): void {
  if (bytes.length < 14) throw new Error("fichier trop court pour être un FIT");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const headerSize = view.getUint8(0);
  if (headerSize !== 12 && headerSize !== 14) {
    throw new Error(`en-tête FIT de taille inattendue (${headerSize})`);
  }
  const signature = String.fromCharCode(...bytes.subarray(8, 12));
  if (signature !== ".FIT") {
    throw new Error("signature .FIT absente — ce n'est pas un fichier FIT");
  }

  const dataSize = view.getUint32(4, true);
  /*
    Borne haute prise dans le fichier mais plafonnée à sa taille réelle. Un
    `data_size` corrompu ou tronqué (téléchargement interrompu) ferait sinon
    lire au-delà du tampon.
  */
  const end = Math.min(headerSize + dataSize, bytes.length);

  const defs = new Map<number, MessageDef>();

  /*
    Dernier horodatage complet vu, pour reconstruire les en-têtes compressés :
    ceux-ci ne portent que les 5 bits bas (0-31 s) d'un écart au précédent.
  */
  let lastTimestamp: number | null = null;

  // Une seule vue réutilisée : pas d'allocation par message.
  let curDef: MessageDef | null = null;
  let curBody = 0;
  let curTs: number | null = null;

  const fieldOf = (num: number): FieldDef | null => {
    if (!curDef) return null;
    for (const f of curDef.fields) if (f.num === num) return f;
    return null;
  };

  const msg: FitMessage = {
    get globalNum() {
      return curDef ? curDef.globalNum : -1;
    },
    get timestamp() {
      return curTs;
    },
    get(num) {
      const f = fieldOf(num);
      if (!f) return null;
      const base = BASE_TYPES[f.baseType];
      if (!base || f.baseType === 0x07 || f.size < base.size) return null;
      return base.read(view, curBody + f.at, curDef!.littleEndian);
    },
    getArray(num) {
      const f = fieldOf(num);
      if (!f) return null;
      const base = BASE_TYPES[f.baseType];
      if (!base || f.baseType === 0x07) return null;
      const out: Array<number | null> = [];
      for (let o = 0; o + base.size <= f.size; o += base.size) {
        out.push(base.read(view, curBody + f.at + o, curDef!.littleEndian));
      }
      return out;
    },
    getString(num) {
      const f = fieldOf(num);
      if (!f || f.baseType !== 0x07) return null;
      const raw = bytes.subarray(curBody + f.at, curBody + f.at + f.size);
      const zero = raw.indexOf(0);
      const text = UTF8.decode(zero >= 0 ? raw.subarray(0, zero) : raw).trim();
      return text === "" ? null : text;
    },
    has(num) {
      return fieldOf(num) !== null;
    },
    entries() {
      if (!curDef) return [];
      const out: Array<[number, number | null]> = [];
      for (const f of curDef.fields) {
        if (f.baseType === 0x07 || !BASE_TYPES[f.baseType]) continue;
        out.push([f.num, msg.get(f.num)]);
      }
      return out;
    },
  };

  let offset = headerSize;
  while (offset < end) {
    const header = view.getUint8(offset);
    offset += 1;

    // En-tête à horodatage compressé : pas de définition, message de données
    // d'un type local déjà connu (types 0 à 3 seulement).
    const compressed = (header & 0x80) !== 0;
    const isDefinition = !compressed && (header & 0x40) !== 0;
    const localType = compressed ? (header >> 5) & 0x03 : header & 0x0f;

    if (isDefinition) {
      const littleEndian = view.getUint8(offset + 1) === 0;
      const globalNum = view.getUint16(offset + 2, littleEndian);
      const fieldCount = view.getUint8(offset + 4);
      offset += 5;

      const fields: FieldDef[] = [];
      let totalSize = 0;
      for (let i = 0; i < fieldCount; i++) {
        const num = view.getUint8(offset);
        const size = view.getUint8(offset + 1);
        // Bits 0-4 : `& 0x1f`, sinon `uint64z` (0x10) se lit comme `enum`.
        const baseType = view.getUint8(offset + 2) & 0x1f;
        offset += 3;
        fields.push({ num, size, baseType, at: totalSize });
        totalSize += size;
      }

      /*
        Champs de développeur : taille à comptabiliser pour pouvoir sauter le
        message, contenu ignoré. Ce sont des extensions propres à une
        application (Stryd, Xert…) dont le sens n'est connu que de celle-ci.
      */
      if ((header & 0x20) !== 0) {
        const devCount = view.getUint8(offset);
        offset += 1;
        for (let i = 0; i < devCount; i++) {
          totalSize += view.getUint8(offset + 1);
          offset += 3;
        }
      }

      defs.set(localType, { globalNum, littleEndian, fields, totalSize });
      continue;
    }

    const def = defs.get(localType);
    /*
      Message de données sans définition préalable : le fichier est incohérent
      et toute lecture suivante serait du hasard. On s'arrête plutôt que
      d'inventer — un import partiel silencieux est plus nuisible qu'un refus.
    */
    if (!def) throw new Error(`message de type local ${localType} sans définition`);
    if (offset + def.totalSize > end) break; // message tronqué en fin de fichier

    curDef = def;
    curBody = offset;

    /*
      Horodatage : champ 253 s'il existe. Sinon, en-tête compressé : les 5 bits
      bas donnent la valeur modulo 32 ; on la recolle au dernier horodatage
      complet, en passant au cycle suivant si elle a « tourné ».
    */
    let ts: number | null = null;
    const tsField = fieldOf(253);
    if (tsField && tsField.size >= 4) {
      ts = BASE_TYPES[0x06].read(view, curBody + tsField.at, def.littleEndian);
    }
    if (ts !== null) {
      lastTimestamp = ts;
    } else if (compressed && lastTimestamp !== null) {
      const offset5 = header & 0x1f;
      let rebuilt = (lastTimestamp & ~0x1f) + offset5;
      if (offset5 < (lastTimestamp & 0x1f)) rebuilt += 0x20;
      ts = rebuilt;
      lastTimestamp = rebuilt;
    }
    curTs = ts;

    if (wants(def.globalNum)) visit(msg);

    offset += def.totalSize;
  }

  curDef = null;
}
