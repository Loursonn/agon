/**
 * Forme commune à tous les fichiers d'activité, quel que soit le format.
 *
 * Ce type existe pour que l'insertion en base ne connaisse qu'une structure.
 * FIT, TCX et GPX décrivent la même sortie avec des conventions différentes
 * (unités, noms, présence ou absence d'agrégats) : la réconciliation se fait
 * dans chaque décodeur, pas dans l'appelant.
 *
 * Partagé entre le navigateur (import manuel par l'athlète) et les Edge
 * Functions (synchronisation COROS, qui lit des FIT). Une seule implémentation,
 * parce que deux parseurs du même format divergent toujours — et que c'est
 * alors l'écart entre un import manuel et une synchronisation automatique du
 * même fichier qui devient impossible à expliquer.
 */

/** Champs qui alimentent directement `provider_activities`. */
export interface ParsedActivity {
  /**
   * Clé de déduplication. Pour un fichier, l'empreinte SHA-256 de son contenu :
   * réimporter deux fois le même fichier doit être sans effet, et l'athlète
   * qui glisse son dossier entier s'y attend.
   */
  externalId: string;

  startedAt: string;
  /**
   * Jour *local* de l'activité. Une sortie à 23 h le lundi appartient au lundi,
   * pas au mardi UTC — c'est ce jour-là qu'elle s'aligne sur la séance
   * programmée.
   */
  localDate: string;

  /** Slug anglais canonique (`running`, `cycling`…), stable d'un format à l'autre. */
  sport: string | null;

  durationS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPaceSPerKm: number | null;
  calories: number | null;

  /** Tours, et tout ce qui est structuré mais trop variable pour une colonne. */
  details: Record<string, unknown> | null;
  /** Ce que le fichier disait, avant normalisation. */
  raw: Record<string, unknown> | null;
}

/** Ce qu'un décodeur rend : des activités, et ce qu'il n'a pas su lire. */
export interface ParseResult {
  activities: ParsedActivity[];
  /**
   * Fichiers ou enregistrements écartés, avec la raison.
   *
   * Remontés plutôt qu'avalés : sur une archive de plusieurs centaines de
   * fichiers, « 312 importés » sans mention des 8 refusés laisse croire à un
   * succès complet, et l'athlète cherche ensuite pourquoi une sortie manque.
   */
  rejected: Array<{ name: string; reason: string }>;
}

/** Empreinte stable d'un contenu de fichier, utilisée comme `external_id`. */
export async function contentFingerprint(
  bytes: Uint8Array,
  prefix: string,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  // Tronqué à 32 caractères hexadécimaux, soit 128 bits : largement assez pour
  // qu'une collision soit hors de portée, et lisible dans une requête SQL.
  return `${prefix}:${hex.slice(0, 32)}`;
}

/** Jour ISO d'un instant, décalé du fuseau local de l'activité. */
export function localDateOf(startedAtMs: number, utcOffsetS: number): string {
  return new Date(startedAtMs + utcOffsetS * 1000).toISOString().slice(0, 10);
}

/**
 * Allure moyenne, en secondes par kilomètre.
 *
 * `null` plutôt que `0` ou `Infinity` quand elle n'a pas de sens : sans
 * distance (renforcement, natation en bassin mal mesurée) une allure est une
 * information inventée, et l'afficher à côté de vraies mesures lui donnerait le
 * même poids.
 */
export function paceFrom(distanceM: number | null, durationS: number | null): number | null {
  if (!distanceM || !durationS || distanceM < 100) return null;
  return Math.round((durationS / (distanceM / 1000)) * 100) / 100;
}
