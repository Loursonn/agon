/**
 * Décodeur FIT, sans dépendance.
 *
 * Pourquoi écrire ça plutôt que prendre une bibliothèque : le même code doit
 * tourner dans le navigateur (import manuel) et dans une Edge Function Deno
 * (synchronisation COROS, qui télécharge des FIT). Les paquets npm de décodage
 * FIT visent Node, embarquent le profil complet de Garmin — plusieurs
 * mégaoctets de tables générées — et nous n'avons besoin que de trois types de
 * messages. Le format binaire, lui, est stable et documenté depuis quinze ans.
 *
 * Pourquoi lire le binaire plutôt que les résumés en texte de COROS : ses
 * outils MCP répondent en prose (`Duration: 2:12:38 | Distance: 12.03 km`).
 * Parser cette phrase marche aujourd'hui et casse silencieusement le jour où
 * un séparateur, une unité ou une traduction change. Un FIT casse franchement
 * ou pas du tout.
 *
 * Ce qui est décodé : l'en-tête, les messages de définition, et les messages
 * de données `file_id` (0), `session` (18) et `activity` (34). Les autres sont
 * sautés en utilisant leur taille déclarée — c'est ce qui permet d'ignorer sans
 * risque les milliers de messages `record` par seconde dont nous ne faisons
 * rien.
 */
import {
  contentFingerprint,
  localDateOf,
  paceFrom,
  type ParsedActivity,
  type ParseResult,
} from "./types.ts";

/*
  Les horodatages FIT comptent les secondes depuis le 31 décembre 1989 à
  00:00:00 UTC, et non depuis l'époque Unix. Confondre les deux décale tout de
  vingt ans, ce qui donne des activités en 1970 — assez visible pour être
  repéré, contrairement à un décalage d'une heure.
*/
const FIT_EPOCH_MS = 631_065_600_000;

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
}

interface MessageDef {
  globalNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  /** Taille totale du message de données, pour pouvoir le sauter d'un bloc. */
  totalSize: number;
}

type Fields = Map<number, number | null>;

/**
 * Parcourt un FIT et rend les messages qui nous intéressent.
 *
 * Les messages inconnus sont sautés par leur taille déclarée dans leur
 * définition : c'est la seule façon d'avancer dans un flux où tout est
 * variable, et c'est aussi ce qui rend le décodeur insensible aux extensions
 * propriétaires des fabricants.
 */
function decodeMessages(bytes: Uint8Array): Map<number, Fields[]> {
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
  const collected = new Map<number, Fields[]>();
  // Seuls ces messages nous servent. Collecter le reste ferait exploser la
  // mémoire sur un fichier d'ultra-trail de plusieurs mégaoctets.
  const wanted = new Set([0, 18, 34]);

  let offset = headerSize;
  while (offset < end) {
    const header = view.getUint8(offset);
    offset += 1;

    // En-tête à horodatage compressé : pas de définition, message de données
    // d'un type local déjà connu.
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
        const baseType = view.getUint8(offset + 2) & 0x1f;
        offset += 3;
        fields.push({ num, size, baseType });
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

    // L'horodatage compressé occupe les 5 bits bas de l'en-tête, pas le corps.
    if (!wanted.has(def.globalNum)) {
      offset += def.totalSize;
      continue;
    }

    const fields: Fields = new Map();
    let cursor = offset;
    for (const f of def.fields) {
      const base = BASE_TYPES[f.baseType];
      if (!base) {
        cursor += f.size;
        continue;
      }
      if (f.baseType === 0x07) {
        // Chaîne : non conservée. Les seules qui nous intéresseraient
        // (nom d'activité) ne sont pas dans les messages lus ici.
        cursor += f.size;
        continue;
      }
      /*
        Un champ plus large que son type de base est un tableau. On ne garde
        que le premier élément : les champs tableau des messages `session` sont
        des découpages par zone (temps en zone de fréquence cardiaque) dont
        nous ne faisons rien, et en garder un élément vaut mieux que de rejeter
        le message entier.
      */
      fields.set(f.num, base.read(view, cursor, def.littleEndian));
      cursor += f.size;
    }
    offset += def.totalSize;

    const list = collected.get(def.globalNum) ?? [];
    list.push(fields);
    collected.set(def.globalNum, list);
  }

  return collected;
}

/*
  Sports FIT, limités à ce qu'un athlète en préparation physique est
  susceptible d'enregistrer. Les slugs sont en anglais et volontairement les
  mêmes que ceux des fournisseurs : une valeur inconnue passe en
  `sport_<n>` plutôt que de devenir `null`, parce que « sport non reconnu, code
  62 » se corrige en ajoutant une ligne ici, alors que `null` ne dit rien.
*/
const SPORTS: Record<number, string> = {
  0: "generic",
  1: "running",
  2: "cycling",
  4: "fitness_equipment",
  5: "swimming",
  10: "training",
  11: "walking",
  12: "cross_country_skiing",
  13: "alpine_skiing",
  15: "rowing",
  16: "mountaineering",
  17: "hiking",
  18: "multisport",
  19: "paddling",
  21: "e_biking",
  30: "inline_skating",
  31: "rock_climbing",
  35: "snowshoeing",
  37: "stand_up_paddleboarding",
  41: "kayaking",
  47: "boxing",
  48: "floor_climbing",
  53: "diving",
  62: "hiit",
  64: "racket",
  65: "wheelchair_push_walk",
  66: "wheelchair_push_run",
  67: "meditation",
};

/** Champs du message `session` (global 18) que nous lisons. */
const SESSION = {
  timestamp: 253,
  startTime: 2,
  sport: 5,
  totalElapsedTime: 7,
  totalTimerTime: 8,
  totalDistance: 9,
  totalCalories: 11,
  avgHeartRate: 16,
  maxHeartRate: 17,
  totalAscent: 22,
  totalDescent: 23,
} as const;

/** Fréquence cardiaque gardée seulement si elle est physiologiquement possible. */
function hr(value: number | null | undefined): number | null {
  return typeof value === "number" && value >= 20 && value <= 250 ? value : null;
}

/**
 * Normalise un FIT en activités.
 *
 * Un fichier contient en principe une `session`, mais un enchaînement
 * multisport en contient plusieurs : chacune devient une activité, parce que
 * fusionner une heure de vélo et vingt minutes de course en une seule ligne
 * produirait une allure moyenne qui ne décrit rien.
 */
export async function parseFit(bytes: Uint8Array, name = "activité.fit"): Promise<ParseResult> {
  const rejected: Array<{ name: string; reason: string }> = [];

  let messages: Map<number, Fields[]>;
  try {
    messages = decodeMessages(bytes);
  } catch (e) {
    return {
      activities: [],
      rejected: [{ name, reason: e instanceof Error ? e.message : String(e) }],
    };
  }

  const sessions = messages.get(18) ?? [];
  if (sessions.length === 0) {
    /*
      Pas de `session` : c'est le cas des FIT qui ne décrivent pas une
      activité — réglages d'appareil, plans d'entraînement, mesures de balance.
      Un athlète qui glisse l'intégralité de sa carte mémoire en déposera, et
      ce n'est pas une erreur de sa part.
    */
    return {
      activities: [],
      rejected: [{ name, reason: "aucune session dans le fichier (ce n'est pas un enregistrement d'activité)" }],
    };
  }

  /*
    Décalage horaire local, déduit du message `activity` : il porte à la fois
    `timestamp` (UTC) et `local_timestamp` (heure de l'appareil). Leur
    différence est le décalage au moment de l'activité, donc avec le bon
    changement d'heure — ce qu'aucun calcul à partir du fuseau actuel de
    l'athlète ne donnerait pour une course faite l'été précédent.
  */
  const activity = (messages.get(34) ?? [])[0];
  const utcTs = activity?.get(253) ?? null;
  const localTs = activity?.get(5) ?? null;
  const offsetS = utcTs !== null && localTs !== null ? localTs - utcTs : 0;

  const fileId = (messages.get(0) ?? [])[0];
  const externalId = await contentFingerprint(bytes, "fit");

  const activities: ParsedActivity[] = [];

  for (const [index, s] of sessions.entries()) {
    const start = s.get(SESSION.startTime) ?? s.get(SESSION.timestamp);
    if (start === null || start === undefined) {
      rejected.push({ name, reason: `session ${index + 1} sans horodatage` });
      continue;
    }

    const startedAtMs = FIT_EPOCH_MS + start * 1000;

    /*
      `total_timer_time` plutôt que `total_elapsed_time` : le premier exclut les
      pauses, le second les compte. Pour une séance fractionnée avec
      récupérations à l'arrêt, l'écart atteint facilement vingt minutes, et
      c'est le temps en mouvement qui a un sens pour l'allure.
    */
    const timer = s.get(SESSION.totalTimerTime);
    const elapsed = s.get(SESSION.totalElapsedTime);
    const durationRaw = timer ?? elapsed;
    const durationS = durationRaw !== null && durationRaw !== undefined
      ? Math.round(durationRaw / 1000)
      : null;

    const distanceRaw = s.get(SESSION.totalDistance);
    const distanceM = distanceRaw !== null && distanceRaw !== undefined
      ? Math.round(distanceRaw) / 100
      : null;

    const ascent = s.get(SESSION.totalAscent);
    const sportCode = s.get(SESSION.sport);

    activities.push({
      // Plusieurs sessions dans un même fichier partagent son empreinte : le
      // rang les distingue sans casser la déduplication par contenu.
      externalId: sessions.length > 1 ? `${externalId}#${index + 1}` : externalId,
      startedAt: new Date(startedAtMs).toISOString(),
      localDate: localDateOf(startedAtMs, offsetS),
      sport: sportCode === null || sportCode === undefined
        ? null
        : SPORTS[sportCode] ?? `sport_${sportCode}`,
      // La contrainte en base refuse une durée nulle ou négative : on écarte
      // ici plutôt que de laisser l'insertion échouer sur tout le lot.
      durationS: durationS !== null && durationS > 0 ? durationS : null,
      distanceM: distanceM !== null && distanceM >= 0 ? distanceM : null,
      elevationGainM: ascent ?? null,
      avgHr: hr(s.get(SESSION.avgHeartRate)),
      maxHr: hr(s.get(SESSION.maxHeartRate)),
      avgPaceSPerKm: paceFrom(distanceM, durationS),
      calories: s.get(SESSION.totalCalories) ?? null,
      details: {
        elapsedS: elapsed !== null && elapsed !== undefined ? Math.round(elapsed / 1000) : null,
        descentM: s.get(SESSION.totalDescent) ?? null,
        sessionIndex: index + 1,
        sessionCount: sessions.length,
      },
      /*
        Conservé tel que lu. Quand un chiffre affiché paraît faux, c'est la
        seule façon de savoir si l'erreur vient du fichier ou de notre
        normalisation — sans ça, la seule réponse possible est « réimporte
        pour voir ».
      */
      raw: {
        format: "fit",
        fileName: name,
        sportCode,
        manufacturer: fileId?.get(1) ?? null,
        product: fileId?.get(2) ?? null,
        utcOffsetS: offsetS,
        session: Object.fromEntries(s),
      },
    });
  }

  return { activities, rejected };
}

/** Vrai si le contenu commence par un en-tête FIT. */
export function looksLikeFit(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(8, 12)) === ".FIT";
}
