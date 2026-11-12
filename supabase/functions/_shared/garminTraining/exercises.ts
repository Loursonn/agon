/**
 * Catalogue d'exercices Garmin (Training API) : recherche pour relier un
 * exercice de la banque Agon à son équivalent sur la montre, et proposition
 * automatique depuis le nom français. Pur : utilisé par l'écran coach et par
 * l'envoi serveur (proposition quand l'exercice n'a pas d'équivalent choisi).
 */
import { GARMIN_EXERCISES } from "./exerciseCatalog.ts";

export interface GarminExerciseOption {
  category: string;
  name: string;
  /** « Barbell back squat » — le nom Garmin lisible. */
  label: string;
}

/** `BARBELL_BACK_SQUAT` → « Barbell back squat ». */
export function garminLabel(code: string): string {
  const t = code.toLowerCase().replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

let all: GarminExerciseOption[] | null = null;

export function garminExerciseOptions(): GarminExerciseOption[] {
  if (!all) {
    all = Object.entries(GARMIN_EXERCISES).flatMap(([category, names]) =>
      names.map((name) => ({ category, name, label: garminLabel(name) })),
    );
  }
  return all;
}

export function isGarminExercise(category: string | null | undefined, name: string | null | undefined): boolean {
  return !!category && !!name && (GARMIN_EXERCISES[category] ?? []).includes(name);
}

/**
 * Exercices Garmin dont le nom ou la catégorie contient tous les mots tapés
 * (en anglais : « back squat », « bench »). Les noms exacts d'abord, 30 au plus.
 */
export function searchGarminExercises(query: string, limit = 30): GarminExerciseOption[] {
  const words = query.toLowerCase().replace(/[_-]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits = garminExerciseOptions().filter((o) => {
    const hay = `${o.label.toLowerCase()} ${o.category.toLowerCase().replace(/_/g, " ")}`;
    return words.every((w) => hay.includes(w));
  });
  const q = words.join(" ");
  const rank = (o: GarminExerciseOption) => (o.label.toLowerCase() === q ? 0 : o.label.toLowerCase().startsWith(q) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || a.label.length - b.label.length).slice(0, limit);
}

// ── Proposition automatique depuis le nom français ──────────────────────────

/** Minuscules, sans accents ni ponctuation. */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Mot comparé au singulier (« ups » / « up », « flyes » / « flye »). */
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/**
 * Mouvements : expression française (normalisée) → mots Garmin. Les plus
 * longues d'abord, pour que « souleve de terre roumain » passe avant
 * « souleve de terre ».
 */
const MOVES: ReadonlyArray<readonly [string, string]> = [
  // Pas d'équivalent Garmin en musculation : l'étape garde son nom Agon.
  ["rameur", ""],
  ["skierg", ""],
  ["ski erg", ""],
  ["nordic", ""],
  ["course", ""],
  ["velo", ""],
  ["leg extension", ""],
  ["oblique", ""],
  // Abréviations courantes de la banque.
  ["dev couche", "bench press"],
  ["dev incline", "incline bench press"],
  ["dev militaire", "military press"],
  ["elev lat", "lateral raise"],
  ["rdl", "romanian deadlift"],
  // Mouvements.
  ["presse epaule", "shoulder press"],
  ["presse militaire", "military press"],
  ["chest press", "bench press"],
  ["biceps", "biceps curl"],
  ["triceps", "triceps pressdown"],
  ["triceps poulie", "triceps pressdown"],
  ["triceps corde", "rope pressdown"],
  ["triceps extension corde", "rope pressdown"],
  ["extension triceps corde", "rope pressdown"],
  ["triceps extension", "triceps extension"],
  ["dips triceps", "body weight dip"],
  ["farmer walk", "farmers walk"],
  ["farmer carry", "farmers carry"],
  ["roulette", "kneeling ab wheel"],
  ["abwheel", "kneeling ab wheel"],
  ["ab wheel", "kneeling ab wheel"],
  ["pec deck", "flye"],
  ["pec fly", "flye"],
  ["pull over", "pullover"],
  ["marche de l ours", "bear crawl"],
  ["inch worm", "inchworm"],
  ["v up", "v up"],
  ["turkish get up", "turkish get up"],
  ["wallball", "wall ball"],
  ["sled pull", "sled backward drag"],
  ["tirage menton", "upright row"],
  ["tirage planche", "chest supported dumbbell row"],
  ["seal row", "chest supported dumbbell row"],
  ["adducteur", "adduction"],
  ["abducteur", "abduction"],
  ["releve de genou", "hanging knee raise"],
  ["gobelet", "goblet"],
  ["hip trust", "hip thrust"],
  ["corde a saut", "jump rope"],
  ["developpe couche halteres", "dumbbell bench press"],
  ["developpe couche prise serree", "close grip bench press"],
  ["developpe couche", "bench press"],
  ["developpe incline", "incline bench press"],
  ["developpe decline", "decline bench press"],
  ["developpe militaire", "military press"],
  ["developpe arnold", "arnold press"],
  ["developpe epaule", "shoulder press"],
  ["developpe assis", "shoulder press"],
  ["developpe", "press"],
  ["souleve de terre roumain", "romanian deadlift"],
  ["souleve de terre jambes tendues", "stiff leg deadlift"],
  ["souleve de terre sumo", "sumo deadlift"],
  ["souleve de terre", "deadlift"],
  ["sdt roumain", "romanian deadlift"],
  ["sdt", "deadlift"],
  ["squat bulgare", "bulgarian split squat"],
  ["squat avant", "front squat"],
  ["squat goblet", "goblet squat"],
  ["squat saute", "jump squat"],
  ["fente bulgare", "bulgarian split squat"],
  ["fente", "lunge"],
  ["traction", "pull up"],
  ["tirage vertical", "lat pulldown"],
  ["tirage poitrine", "lat pulldown"],
  ["tirage horizontal", "seated cable row"],
  ["tirage visage", "face pull"],
  ["rowing", "row"],
  ["rameur", "row"],
  ["pompe", "push up"],
  ["gainage lateral", "side plank"],
  ["gainage", "plank"],
  ["planche", "plank"],
  ["releve de jambe", "leg raise"],
  ["elevation laterale", "lateral raise"],
  ["elevation frontale", "front raise"],
  ["oiseau", "reverse flye"],
  ["ecarte", "flye"],
  ["leg curl", "leg curl"],
  ["curl ischio", "leg curl"],
  ["curl marteau", "hammer curl"],
  ["extension triceps", "triceps extension"],
  ["extension mollet", "standing calf raise"],
  ["mollet", "standing calf raise"],
  ["extension lombaire", "back extension"],
  ["presse a cuisse", "leg press"],
  ["presse", "leg press"],
  ["pont fessier", "glute bridge"],
  ["haussement d epaule", "shrug"],
  ["marche du fermier", "farmers walk"],
  ["farmer", "farmers carry"],
  ["saut sur box", "box jump"],
  ["montee sur banc", "step up"],
  ["montee sur box", "step up"],
  ["arrache", "snatch"],
  ["epaule jete", "clean and jerk"],
  ["traineau pousse", "sled push"],
  ["traineau tire", "sled backward drag"],
  ["poussee traineau", "sled push"],
  ["corde a sauter", "jump rope"],
  ["abdo", "crunch"],
  ["dips", "body weight dip"],
];

/** Positions et variantes : mot français → mot Garmin. */
const QUALIFIERS: ReadonlyArray<readonly [string, string]> = [
  ["debout", "standing"], ["assis", "seated"], ["allonge", "lying"], ["unilateral", "single arm"],
  ["un bras", "one arm"], ["une jambe", "single leg"], ["prise serree", "close grip"], ["prise large", "wide grip"],
];

/** Mots sans contenu, ignorés pour juger si le nom a été compris. */
const STOP = new Set(["de", "du", "des", "la", "le", "les", "a", "au", "aux", "en", "sur", "avec", "et", "d", "l"]);

/** Positions que Garmin précise : pénalisées si le nom Agon ne les demande pas. */
const POSITIONS = new Set(["seated", "standing", "lying", "kneeling", "single", "one", "alternating", "weighted", "reverse", "floor"]);

/** Catégories « matériel » de Garmin : seulement si l'exercice Agon en parle. */
const GEAR_CATEGORIES: Record<string, string> = {
  BANDED_EXERCISES: "band", SANDBAG: "sandbag", SUSPENSION: "suspension", SLED: "sled",
};

/** Étirements d'échauffement : jamais proposés pour un exercice de musculation. */
const EXCLUDED_CATEGORIES = new Set(["WARM_UP"]);

const EQUIPMENT: ReadonlyArray<readonly [string, string]> = [
  ["halteres", "dumbbell"], ["haltere", "dumbbell"], ["barre", "barbell"], ["kettlebell", "kettlebell"],
  ["kb", "kettlebell"], ["poulie", "cable"], ["cable", "cable"], ["elastique", "band"], ["smith", "smith machine"],
  ["halt", "dumbbell"], ["corde", "rope"],
  ["machine", "machine"],
];

let vocab: Set<string> | null = null;
function garminVocab(): Set<string> {
  if (!vocab) {
    vocab = new Set(
      garminExerciseOptions().flatMap((o) => `${o.name}_${o.category}`.toLowerCase().split("_")).map(stem),
    );
  }
  return vocab;
}

/** Remplace la première expression trouvée (mot entier) ; renvoie le reste et les mots Garmin. */
function take(text: string, table: ReadonlyArray<readonly [string, string]>, sort = false): { rest: string; words: string[]; matched: boolean } {
  const rows = sort ? [...table].sort((a, b) => b[0].length - a[0].length) : table;
  // Comparaison au singulier : « fentes » → « fente », « pompes » → « pompe ».
  const t = ` ${text.split(" ").map(stem).join(" ")} `;
  for (const [fr, en] of rows) {
    const key = ` ${fr.split(" ").map(stem).join(" ")} `;
    const i = t.indexOf(key);
    if (i >= 0) {
      return { rest: (t.slice(0, i) + " " + t.slice(i + key.length)).trim(), words: en ? en.split(" ").map(stem) : [], matched: true };
    }
  }
  return { rest: text, words: [], matched: false };
}

/**
 * Mots Garmin tirés d'un nom d'exercice Agon : le mouvement (traduit, ou les
 * mots déjà anglais qui existent chez Garmin) et le matériel.
 */
export function garminWordsFor(name: string): { core: string[]; equipment: string[]; qualifiers: string[]; understood: boolean } {
  const n = norm(name);
  const move = take(n, MOVES, true);
  // Expression connue sans équivalent Garmin (« rameur », « SkiErg »…).
  if (move.matched && move.words.length === 0) return { core: [], equipment: [], qualifiers: [], understood: false };
  let rest = move.rest;
  const equipment: string[] = [];
  const qualifiers: string[] = [];
  for (const [table, out] of [[EQUIPMENT, equipment], [QUALIFIERS, qualifiers]] as const) {
    for (let r = take(rest, table); r.words.length; r = take(rest, table)) {
      out.push(...r.words);
      rest = r.rest;
    }
  }
  const left = rest.split(" ").map(stem).filter((w) => w && !STOP.has(w));
  const known = left.filter((w) => w.length > 1 && garminVocab().has(w));
  const core = [...new Set([...move.words, ...known])].filter((w) => !equipment.includes(w));
  // Compris : un mouvement traduit, ou tous les mots reconnus chez Garmin.
  const understood = core.length > 0 && (move.words.length > 0 || known.length === left.length);
  return { core, equipment, qualifiers, understood };
}

/** Texte de recherche pré-rempli (en anglais) pour un nom d'exercice Agon. */
export function garminQueryFor(name: string): string {
  const { core, equipment, qualifiers } = garminWordsFor(name);
  return [...qualifiers, ...equipment, ...core].join(" ");
}

/**
 * Équivalent Garmin le plus probable d'un exercice Agon, ou `null`. Tous les
 * mots du mouvement doivent se retrouver dans le nom ou la catégorie Garmin ;
 * le matériel départage, puis le nom le plus court (le plus générique).
 * Une proposition : le coach la corrige si besoin.
 */
export function suggestGarminExercise(name: string): GarminExerciseOption | null {
  const { core, equipment, qualifiers, understood } = garminWordsFor(name);
  if (!understood) return null;
  const asked = [...core, ...equipment, ...qualifiers];
  let best: { o: GarminExerciseOption; score: number } | null = null;
  for (const o of garminExerciseOptions()) {
    if (EXCLUDED_CATEGORIES.has(o.category)) continue;
    const nameWords = o.name.toLowerCase().split("_").map(stem);
    const words = new Set([...nameWords, ...o.category.toLowerCase().split("_").map(stem)]);
    if (!core.every((w) => words.has(w))) continue;
    const coreInName = core.filter((w) => nameWords.includes(w)).length;
    const eqHits = equipment.filter((w) => words.has(w)).length;
    const qualHits = qualifiers.filter((w) => nameWords.includes(w)).length;
    const extraWords = nameWords.filter((w) => !asked.includes(w));
    // Sans matériel précisé, la barre est la version par défaut (squat, développé, soulevé…).
    const extra = extraWords.reduce((n, w) => n + (POSITIONS.has(w) ? 2 : w === "barbell" && equipment.length === 0 ? 0.5 : 1), 0);
    const gear = GEAR_CATEGORIES[o.category];
    const catBonus = o.category.toLowerCase().split("_").map(stem).some((w) => core.includes(w)) ? 1 : 0;
    const score = coreInName * 3 + eqHits * 2 + qualHits * 2 - extra + catBonus - (gear && !asked.includes(gear) ? 3 : 0);
    if (!best || score > best.score || (score === best.score && o.name.length < best.o.name.length)) best = { o, score };
  }
  return best?.o ?? null;
}
