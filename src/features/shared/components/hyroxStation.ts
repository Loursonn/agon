import { token } from "@/lib/theme";


/**
 * Pictos HYROX (canvas « À valider · boutons et pictos », validé le 12/11) :
 * les 8 stations, la course, la transition (Roxzone) et « autre exercice ».
 * Grille 24 px, dessin plein en `currentColor`.
 */
export type HyroxStation =
  | "skierg" | "sled_push" | "sled_pull" | "burpee_broad_jump" | "rameur"
  | "farmers_carry" | "sandbag_lunges" | "wall_balls" | "course" | "roxzone" | "autre";

export const HYROX_STATION_LABEL: Record<HyroxStation, string> = {
  skierg: "SkiErg",
  sled_push: "Sled push",
  sled_pull: "Sled pull",
  burpee_broad_jump: "Burpee broad jump",
  rameur: "Rameur",
  farmers_carry: "Farmers carry",
  sandbag_lunges: "Sandbag lunges",
  wall_balls: "Wall balls",
  course: "Course",
  roxzone: "Transition (Roxzone)",
  autre: "Autre exercice",
};

/** Couleur du picto : stations en orange HYROX, course en orange clair, le reste en neutre. */
export function hyroxPictoColor(station: HyroxStation): string {
  if (station === "course") return token("--agon-hyrox-course");
  if (station === "roxzone" || station === "autre") return token("--agon-hyrox-neutre");
  return token("--agon-hyrox-station");
}

const RULES: Array<[RegExp, HyroxStation]> = [
  [/transition|roxzone/i, "roxzone"],
  [/ski ?erg/i, "skierg"],
  [/sled ?push/i, "sled_push"],
  [/sled ?pull/i, "sled_pull"],
  [/burpee/i, "burpee_broad_jump"],
  [/rameur|row/i, "rameur"],
  [/farmer/i, "farmers_carry"],
  [/lunge|fente/i, "sandbag_lunges"],
  [/wall ?ball/i, "wall_balls"],
  [/course|run|footing|jog/i, "course"],
];

/** Station HYROX d'après un nom de tour ou d'exercice (« Sled Push 25 m 1 » → sled_push). */
export function hyroxStationOf(name: string | null | undefined): HyroxStation {
  const n = name ?? "";
  return RULES.find(([re]) => re.test(n))?.[1] ?? "autre";
}
