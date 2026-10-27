import type { ParsedActivity } from "@shared/activityFiles/index.ts";

/**
 * Tri des activités décodées avant insertion : ce qui est nouveau, ce qui est
 * déjà là, et à quel titre.
 *
 * Séparé du hook qui fait les requêtes parce que c'est la partie où une erreur
 * se paie cher et ne se voit pas : une sortie avalée à tort disparaît du suivi
 * sans message, et personne ne va la chercher.
 */

/**
 * Fenêtre de rapprochement entre deux enregistrements d'une même sortie.
 *
 * `external_id` est l'empreinte du *contenu* du fichier : le FIT et le GPX
 * d'une même sortie ont des octets différents, donc des empreintes
 * différentes, et la contrainte d'unicité en base ne peut rien y voir. Or
 * Strava exporte parfois les deux, et un athlète qui dépose « tout » aurait
 * chaque sortie en double sans qu'aucun chiffre n'explique pourquoi.
 *
 * Deux minutes, et non dix : un export GPX perd les secondes antérieures à la
 * première position GPS, donc son début peut arriver après celui du FIT, mais
 * jamais de beaucoup.
 */
export const SAME_OUTING_MS = 120 * 1000;

/** Un départ déjà en base, pour le rapprochement de sortie. */
export interface KnownStart {
  ms: number;
  sport: string | null;
}

/**
 * Vrai si cette sortie est déjà présente sous une autre forme.
 *
 * Le sport doit correspondre quand les deux sont connus : sans cette
 * condition, la transition d'un triathlon — natation puis vélo démarrés à une
 * minute d'intervalle — ferait disparaître la seconde discipline. Deux sports
 * connus et différents sont deux activités, jamais un doublon.
 */
export function isSameOuting(act: ParsedActivity, known: KnownStart[]): boolean {
  const ms = Date.parse(act.startedAt);
  if (!Number.isFinite(ms)) return false;

  return known.some((k) => {
    if (!Number.isFinite(k.ms)) return false;
    if (Math.abs(k.ms - ms) > SAME_OUTING_MS) return false;
    if (k.sport && act.sport && k.sport !== act.sport) return false;
    return true;
  });
}

export interface ImportSplit {
  /** À insérer, dans l'ordre reçu. */
  toInsert: ParsedActivity[];
  /** Fichiers déjà importés auparavant, reconnus à l'empreinte. */
  duplicates: number;
  /** Sorties déjà présentes via une autre source ou un autre format. */
  alreadyKnown: number;
}

/**
 * Répartit les activités décodées face à ce que l'athlète a déjà.
 *
 * `knownIds` et `knownStarts` sont enrichis au fil du tri : l'athlète qui
 * dépose le FIT *et* le GPX de la même sortie dans le même geste serait sinon
 * le seul cas que le rapprochement ne verrait pas — les deux fichiers sont
 * nouveaux vis-à-vis de la base, et c'est l'un par rapport à l'autre qu'ils
 * font doublon.
 */
export function splitNewActivities(
  parsed: ParsedActivity[],
  knownIds: Set<string>,
  knownStarts: KnownStart[],
): ImportSplit {
  const split: ImportSplit = { toInsert: [], duplicates: 0, alreadyKnown: 0 };

  for (const act of parsed) {
    if (knownIds.has(act.externalId)) {
      split.duplicates++;
      continue;
    }
    if (isSameOuting(act, knownStarts)) {
      split.alreadyKnown++;
      continue;
    }
    knownIds.add(act.externalId);
    knownStarts.push({ ms: Date.parse(act.startedAt), sport: act.sport });
    split.toInsert.push(act);
  }

  return split;
}

/** Ligne `provider_activities` correspondant à une activité décodée. */
export function activityRow(athleteId: string, act: ParsedActivity) {
  return {
    athlete_id: athleteId,
    source: "file_import" as const,
    external_id: act.externalId,
    started_at: act.startedAt,
    local_date: act.localDate,
    sport: act.sport,
    duration_s: act.durationS,
    distance_m: act.distanceM,
    elevation_gain_m: act.elevationGainM,
    avg_hr: act.avgHr,
    max_hr: act.maxHr,
    avg_pace_s_per_km: act.avgPaceSPerKm,
    calories: act.calories,
    details: act.details,
    raw: act.raw,
    // `ai_allowed` est délibérément absent : un trigger le pose depuis
    // `data_source_policies`. L'envoyer d'ici serait au mieux ignoré.
  };
}
