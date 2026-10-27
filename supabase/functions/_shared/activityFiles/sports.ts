/**
 * Vocabulaire des sports, en un seul endroit.
 *
 * FIT donne un code numérique, TCX un attribut de trois valeurs possibles,
 * GPX un texte libre. Si chaque décodeur traduisait pour son compte, le même
 * entraînement importé en FIT puis en GPX finirait sous deux slugs différents —
 * et une statistique « par sport » compterait deux sports là où il y en a un.
 *
 * Les slugs sont en anglais, et volontairement les mêmes que ceux des
 * fournisseurs : ce sont eux qu'on retrouvera dans les futures
 * synchronisations Garmin.
 */

/** Codes `sport` du profil FIT, limités à ce qu'un athlète enregistre. */
export const FIT_SPORTS: Record<number, string> = {
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

/**
 * Slug d'un code FIT.
 *
 * Un code inconnu devient `sport_<n>` plutôt que `null` : « sport_62 » se
 * corrige en ajoutant une ligne au tableau ci-dessus, alors que `null` ne dit
 * pas qu'il manquait quelque chose.
 */
export function sportFromFitCode(code: number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  return FIT_SPORTS[code] ?? `sport_${code}`;
}

/*
  Étiquettes rencontrées dans les fichiers, réduites à leur forme canonique
  (minuscules, sans espace ni séparateur) : `Trail Running`, `trail_running` et
  `TrailRunning` ont la même clé. Les valeurs couvrent ce qu'écrivent Garmin
  Connect (TCX `Sport`), Strava (GPX `<type>`) et les exportateurs courants.
*/
const LABELS: Record<string, string> = {
  run: "running",
  running: "running",
  trailrun: "running",
  trailrunning: "running",
  virtualrun: "running",
  treadmill: "running",
  treadmillrunning: "running",
  ride: "cycling",
  bike: "cycling",
  biking: "cycling",
  cycling: "cycling",
  virtualride: "cycling",
  gravelride: "cycling",
  roadcycling: "cycling",
  mountainbikeride: "cycling",
  mountainbiking: "cycling",
  ebikeride: "e_biking",
  walk: "walking",
  walking: "walking",
  hike: "hiking",
  hiking: "hiking",
  swim: "swimming",
  swimming: "swimming",
  openwaterswim: "swimming",
  lapswimming: "swimming",
  rowing: "rowing",
  row: "rowing",
  kayaking: "kayaking",
  canoeing: "paddling",
  standuppaddling: "stand_up_paddleboarding",
  nordicski: "cross_country_skiing",
  crosscountryskiing: "cross_country_skiing",
  backcountryski: "alpine_skiing",
  alpineski: "alpine_skiing",
  snowboard: "alpine_skiing",
  snowshoe: "snowshoeing",
  snowshoeing: "snowshoeing",
  rockclimbing: "rock_climbing",
  climbing: "rock_climbing",
  workout: "training",
  weighttraining: "training",
  strengthtraining: "training",
  crossfit: "training",
  elliptical: "fitness_equipment",
  indoorcardio: "fitness_equipment",
  yoga: "meditation",
  boxing: "boxing",
  hiit: "hiit",
  multisport: "multisport",
  generic: "generic",
};

/**
 * Slug d'une étiquette textuelle.
 *
 * Trois cas, et chacun est un choix :
 *  - `Other` (seule valeur TCX pour « autre ») devient `null`. Le fichier dit
 *    explicitement qu'il ne sait pas : le répéter vaut mieux que d'inventer.
 *  - une étiquette purement numérique devient `sport_<n>`, comme pour FIT.
 *    Strava écrit parfois son identifiant interne dans `<type>`.
 *  - une étiquette inconnue est conservée, simplement normalisée en slug. Perdre
 *    « padel » pour un `null` effacerait la seule information disponible.
 */
export function sportFromLabel(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null;
  const trimmed = label.trim();
  if (trimmed === "") return null;

  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "" || key === "other" || key === "unknown" || key === "autre") return null;
  if (LABELS[key]) return LABELS[key];
  if (/^\d+$/.test(key)) return `sport_${key}`;

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
