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
 * Ce qui est décodé ici : les messages `file_id` (0), `session` (18) et
 * `activity` (34), pour le résumé de séance. La série seconde par seconde, les
 * tours et les séries de muscu sont lus par `decodeFitDetail` (fitDetail.ts),
 * sur le même lecteur binaire (fitReader.ts).
 */
import { sportFromFitCode } from "./sports.ts";
import { FIT_EPOCH_MS, walkFit } from "./fitReader.ts";
import {
  contentFingerprint,
  localDateOf,
  paceFrom,
  type ParsedActivity,
  type ParseResult,
} from "./types.ts";

type Fields = Map<number, number | null>;

/**
 * Parcourt un FIT et rend les messages qui nous intéressent (premier élément
 * de chaque champ). Le format binaire est lu par `walkFit`, seule
 * implémentation partagée avec `decodeFitDetail`.
 */
function decodeMessages(bytes: Uint8Array): Map<number, Fields[]> {
  const collected = new Map<number, Fields[]>();
  // Seuls ces messages nous servent. Collecter le reste ferait exploser la
  // mémoire sur un fichier d'ultra-trail de plusieurs mégaoctets.
  const wanted = new Set([0, 18, 34]);
  walkFit(bytes, (n) => wanted.has(n), (msg) => {
    const list = collected.get(msg.globalNum) ?? [];
    list.push(new Map(msg.entries()));
    collected.set(msg.globalNum, list);
  });
  return collected;
}

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
      sport: sportFromFitCode(sportCode),
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
