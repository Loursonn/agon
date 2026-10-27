import { formatMmSs } from "@/lib/time";

/**
 * Mise en forme des sorties venues d'une montre ou d'un fichier importé.
 *
 * Tout est en français et aux unités du terrain : un athlète lit « 12,4 km » et
 * « 5:12 /km », pas « 12400 » et « 312 ». Les valeurs absentes rendent « — » et
 * jamais zéro — une allure à 0:00 affichée à côté de vraies mesures aurait le
 * même poids visuel qu'elles, alors qu'elle ne mesure rien.
 */

/**
 * Sports connus, du slug canonique vers son nom français.
 *
 * Les slugs viennent des décodeurs (`sports.ts`), qui ramènent au même mot le
 * code FIT 1, le `Sport="Running"` d'un TCX et le `<type>running</type>` d'un
 * GPX. Un sport absent de cette table s'affiche quand même, dérivé de son slug :
 * mieux vaut « Via ferrata » qu'« Autre », qui perdrait l'information.
 */
const SPORT_LABELS: Record<string, string> = {
  running: "Course à pied",
  trail_running: "Trail",
  treadmill_running: "Tapis de course",
  track_running: "Piste",
  cycling: "Vélo",
  road_cycling: "Vélo de route",
  mountain_biking: "VTT",
  gravel_cycling: "Gravel",
  indoor_cycling: "Home-trainer",
  e_biking: "Vélo à assistance",
  swimming: "Natation",
  open_water_swimming: "Nage en eau libre",
  pool_swimming: "Natation en bassin",
  walking: "Marche",
  hiking: "Randonnée",
  mountaineering: "Alpinisme",
  rowing: "Aviron",
  indoor_rowing: "Rameur",
  kayaking: "Kayak",
  paddling: "Paddle",
  strength_training: "Renforcement",
  weight_training: "Musculation",
  cardio_training: "Cardio",
  hiit: "HIIT",
  crossfit: "CrossFit",
  elliptical: "Elliptique",
  stair_climbing: "Escalier",
  yoga: "Yoga",
  pilates: "Pilates",
  stretching: "Étirements",
  climbing: "Escalade",
  rock_climbing: "Escalade",
  skiing: "Ski",
  alpine_skiing: "Ski alpin",
  cross_country_skiing: "Ski de fond",
  ski_touring: "Ski de randonnée",
  snowboarding: "Snowboard",
  snowshoeing: "Raquettes",
  skating: "Patinage",
  inline_skating: "Roller",
  surfing: "Surf",
  triathlon: "Triathlon",
  transition: "Transition",
  multisport: "Multisport",
  soccer: "Football",
  basketball: "Basket",
  tennis: "Tennis",
  padel: "Padel",
  golf: "Golf",
  boxing: "Boxe",
};

/** Nom affichable d'un sport, `null` compris. */
export function sportLabel(sport: string | null | undefined): string {
  if (!sport) return "Activité";
  if (SPORT_LABELS[sport]) return SPORT_LABELS[sport];

  /*
    `sport_12` est ce que rend un décodeur face à un code qu'il ne connaît pas.
    Le montrer tel quel dirait « sport_12 » à l'athlète ; le remplacer par
    « Autre » effacerait le fait que la montre, elle, savait de quoi il
    s'agissait. « Sport 12 » garde la trace et reste lisible.
  */
  const inconnu = /^sport_(\d+)$/.exec(sport);
  if (inconnu) return `Sport ${inconnu[1]}`;

  const mots = sport.replace(/_/g, " ").trim();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** Distance, en kilomètres au dixième — ou en mètres en dessous d'un kilomètre. */
export function formatDistance(distanceM: number | null | undefined): string {
  if (distanceM === null || distanceM === undefined || !Number.isFinite(distanceM)) return "—";
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;

  const km = distanceM / 1000;
  // Un dixième jusqu'à 100 km, l'unité au-delà : sur un ultra, « 104,3 km » et
  // « 104 km » disent la même chose, et le chiffre après la virgule n'est de
  // toute façon pas fiable à cette distance.
  const texte = km >= 100 ? Math.round(km).toString() : km.toFixed(1);
  return `${texte.replace(".", ",")} km`;
}

/** Durée en heures et minutes, ou en minutes seules pour une courte séance. */
export function formatDuration(durationS: number | null | undefined): string {
  if (durationS === null || durationS === undefined || !Number.isFinite(durationS) || durationS <= 0) {
    return "—";
  }

  const total = Math.round(durationS);
  const h = Math.floor(total / 3600);
  const min = Math.round((total % 3600) / 60);

  if (h === 0) return `${min} min`;
  // Les minutes restent sur deux chiffres : « 1 h 05 » et non « 1 h 5 », qui se
  // lit mal et se confond avec « 1 h 50 » en balayant une liste.
  return `${h} h ${String(min).padStart(2, "0")}`;
}

/** Allure en minutes par kilomètre. */
export function formatPace(sPerKm: number | null | undefined): string {
  if (sPerKm === null || sPerKm === undefined || !Number.isFinite(sPerKm) || sPerKm <= 0) return "—";
  return `${formatMmSs(Math.round(sPerKm))} /km`;
}

/** Dénivelé positif, signé pour qu'il ne se confonde pas avec une altitude. */
export function formatElevation(gainM: number | null | undefined): string {
  if (gainM === null || gainM === undefined || !Number.isFinite(gainM)) return "—";
  return `+${Math.round(gainM)} m`;
}

/** Fréquence cardiaque moyenne, max entre parenthèses quand elle est connue. */
export function formatHr(avg: number | null | undefined, max: number | null | undefined): string {
  if (avg === null || avg === undefined) return max ? `max ${max}` : "—";
  return max ? `${avg} (max ${max})` : `${avg}`;
}

/** Jour d'une sortie, tel qu'il s'aligne sur la séance programmée. */
export function formatActivityDate(localDate: string): string {
  /*
    Midi, et non minuit : une date seule interprétée à minuit UTC puis affichée
    en heure locale recule d'un jour pour tout le fuseau occidental. Le bogue ne
    se voit pas depuis Paris en été et se voit tous les jours depuis Montréal.
  */
  const d = new Date(`${localDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return localDate;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** Provenance d'une donnée : d'où vient chaque source, et comment la nommer. */
const PROVENANCE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "distanceSource", label: "Distance" },
  { key: "durationSource", label: "Durée" },
  { key: "elevationSource", label: "Dénivelé" },
  { key: "avgHrSource", label: "Fréquence cardiaque" },
  { key: "localDateSource", label: "Jour" },
];

export interface ProvenanceLine {
  label: string;
  text: string;
}

/**
 * Ce que le fichier disait, et ce qui a été reconstruit.
 *
 * Les décodeurs écrivent ces mentions en français lisible, et elles sont
 * affichées telles quelles : les traduire ici créerait une deuxième version du
 * même texte, qui finirait par ne plus correspondre. Un GPX n'a ni durée de
 * mouvement ni dénivelé mesuré, donc l'écart avec l'application du fabricant est
 * normal — ce qui ne doit pas être normal, c'est qu'il soit inexplicable.
 */
export function provenanceOf(details: unknown): ProvenanceLine[] {
  if (!details || typeof details !== "object") return [];
  const d = details as Record<string, unknown>;

  const lignes: ProvenanceLine[] = [];
  for (const { key, label } of PROVENANCE_FIELDS) {
    const valeur = d[key];
    if (typeof valeur === "string" && valeur.trim() !== "") {
      lignes.push({ label, text: valeur });
    }
  }

  /*
    Les segments écartés comme sauts de GPS sont remontés avec les provenances
    parce qu'ils répondent à la même question : pourquoi ce chiffre diffère de
    celui affiché ailleurs.
  */
  const sauts = d.skippedLegs;
  if (typeof sauts === "number" && sauts > 0) {
    lignes.push({
      label: "Trace",
      text: `${sauts} saut${sauts > 1 ? "s" : ""} de GPS écarté${sauts > 1 ? "s" : ""} du calcul de distance`,
    });
  }

  return lignes;
}

/** Libellé d'une provenance de donnée, pour la pastille de source. */
export const SOURCE_LABELS: Record<string, string> = {
  garmin: "Garmin",
  coros: "COROS",
  file_import: "Fichier importé",
  manual: "Saisie manuelle",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
