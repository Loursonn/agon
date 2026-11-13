/**
 * Palette de l'app (mode sombre fixe) — Agon "Tranchant B".
 *
 * Les valeurs viennent de src/styles/tokens.css (seule source, docs/DESIGN_TOKENS.md).
 * `C` garde des chaînes `#RRGGBB` concrètes, pas des `var(--…)`, parce que le code
 * existant ajoute l'opacité par concaténation (`C.r + "30"`, `${C.ac}40`) et passe ces
 * couleurs à Recharts, au canvas, à `hexToRgba`… Nouveau code : classes Tailwind
 * `*-agon-*` ; si un style inline est inévitable, `alpha(C.r, 0.2)`.
 */
import tokensCss from "@/styles/tokens.css?raw";
import { parseTokens, resolveToken } from "@/styles/parseTokens";

export const TOKENS = parseTokens(tokensCss);

/** Valeur finale d'un token de tokens.css, ex. `token("--agon-accent")` → "#FFC933". */
export const token = (name: string): string => resolveToken(TOKENS, name);
const t = token;

export const C = {
  // ── Fond & surfaces ──────────────────────────────────────────────────────────
  bg:  t("--agon-bg"),           // obsidienne profond
  s1:  t("--agon-s1"),           // basalte (cards, drawers)
  s2:  t("--agon-s2"),           // basalte 2 (inputs, skeletons)

  // ── Bordures ─────────────────────────────────────────────────────────────────
  brd:  t("--agon-brd"),
  brdL: t("--agon-brd-l"),

  // ── Texte ────────────────────────────────────────────────────────────────────
  tx:  t("--agon-tx"),           // blanc pur
  tx2: t("--agon-tx2"),          // secondaire / sable muted
  tx3: t("--agon-tx3"),          // muted / placeholder

  // ── Accents principaux ───────────────────────────────────────────────────────
  ac:   t("--agon-accent"),      // PRIMARY — or vif
  acS:  t("--agon-accent-doux"),

  // ── Sémantique ───────────────────────────────────────────────────────────────
  g:  t("--agon-succes"),  gS: t("--agon-succes-doux"),   // success / vert vif
  gV: t("--agon-succes-vif"),  gP: t("--agon-succes-profond"),
  o:  t("--agon-alerte"),  oS: t("--agon-alerte-doux"),   // alerte / ocre vif
  oV: t("--agon-alerte-vif"),  oP: t("--agon-alerte-profond"),
  y:  t("--agon-or-clair"), yS: t("--agon-or-clair-doux"), // or clair (alias)
  r:  t("--agon-erreur"),  rS: t("--agon-erreur-doux"),   // danger / terracotta vif
  rV: t("--agon-erreur-vif"),  rP: t("--agon-erreur-profond"),
  b:  t("--agon-info"),    bS: t("--agon-info-doux"),     // info / ardoise vif
  bV: t("--agon-info-vif"),    bP: t("--agon-info-profond"),

  // ── Accent — niveaux de contraste ───────────────────────────────────────────
  acV: t("--agon-or-vif"),  acP: t("--agon-or-profond"),

  // ── Couleurs étendues — niveaux de contraste ────────────────────────────────
  pat:  t("--agon-patine"),
  patV: t("--agon-patine-vif"),  patP: t("--agon-patine-profond"),
  ame:  t("--agon-amethyste"),
  ameV: t("--agon-amethyste-vif"),  ameP: t("--agon-amethyste-profond"),

  // ── Coach / secondaire ───────────────────────────────────────────────────────
  coach:  t("--agon-coach"),     // SECONDARY — or vif (coach = or)
  coachS: t("--agon-coach-doux"),

  // ── Autres couleurs de la charte utilisées par les écrans ───────────────────
  ink:   t("--agon-ink"),          // texte posé sur un aplat or / clair
  rouge: t("--agon-rouge"),        // rouge vif : compétition, Z3, danger
  pierre: t("--agon-pierre"),
  sable: t("--agon-sable"),
  bronze: t("--agon-bronze"),
  cadence: t("--agon-cadence"),
  blocCore: t("--agon-bloc-core"),
  hyroxCourse: t("--agon-hyrox-course"),
} as const;

/**
 * Couleurs héritées (anciennes palettes par défaut) encore utilisées par des écrans :
 * --agon-h-* de tokens.css, valeurs d'origine. À remplacer par la charte, pas à étendre.
 */
export const H = {
  grisFonce: t("--agon-h-gris-fonce"),
  grisPlomb: t("--agon-h-gris-plomb"),
  ambre: t("--agon-h-ambre"),
  miel: t("--agon-h-miel"),
  rougeVif: t("--agon-h-rouge-vif"),
  gris: t("--agon-h-gris"),
  vert: t("--agon-h-vert"),
  grisClair: t("--agon-h-gris-clair"),
  encreOr: t("--agon-h-encre-or"),
  orange: t("--agon-h-orange"),
  anthracite: t("--agon-h-anthracite"),
  emeraude: t("--agon-h-emeraude"),
  noir: t("--agon-h-noir"),
  rougeDoux: t("--agon-h-rouge-doux"),
  citron: t("--agon-h-citron"),
  jaune: t("--agon-h-jaune"),
  jauneFonce: t("--agon-h-jaune-fonce"),
  carte: t("--agon-h-carte"),
  blancCasse: t("--agon-h-blanc-casse"),
  bleu: t("--agon-h-bleu"),
  rose: t("--agon-h-rose"),
  violet: t("--agon-h-violet"),
  orangeDoux: t("--agon-h-orange-doux"),
  grisPerle: t("--agon-h-gris-perle"),
  vertAcide: t("--agon-h-vert-acide"),
  grisBleu: t("--agon-h-gris-bleu"),
  bleuRoi: t("--agon-h-bleu-roi"),
  vertSapin: t("--agon-h-vert-sapin"),
  sarcelle: t("--agon-h-sarcelle"),
  orangeVif: t("--agon-h-orange-vif"),
  roseVif: t("--agon-h-rose-vif"),
  orangeFeu: t("--agon-h-orange-feu"),
  creme: t("--agon-h-creme"),
  creme2: t("--agon-h-creme-2"),
  sableClair: t("--agon-h-sable-clair"),
  orangeBrule: t("--agon-h-orange-brule"),
  orMat: t("--agon-h-or-mat"),
  grisArgent: t("--agon-h-gris-argent"),
  rougeFonce: t("--agon-h-rouge-fonce"),
  rougeBrique: t("--agon-h-rouge-brique"),
  lin: t("--agon-h-lin"),
  caramel: t("--agon-h-caramel"),
  cuivre: t("--agon-h-cuivre"),
  grege: t("--agon-h-grege"),
  vertLime: t("--agon-h-vert-lime"),
  vertPomme: t("--agon-h-vert-pomme"),
  grisMoyen: t("--agon-h-gris-moyen"),
  vertHerbe: t("--agon-h-vert-herbe"),
  bordeaux: t("--agon-h-bordeaux"),
  taupe: t("--agon-h-taupe"),
  bleuCiel: t("--agon-h-bleu-ciel"),
  taupeFonce: t("--agon-h-taupe-fonce"),
  vertMenthe: t("--agon-h-vert-menthe"),
  brunGris: t("--agon-h-brun-gris"),
  bleuVif: t("--agon-h-bleu-vif"),
  grisArdoise: t("--agon-h-gris-ardoise"),
  bleuAzur: t("--agon-h-bleu-azur"),
  brun: t("--agon-h-brun"),
  basalte3: t("--agon-h-basalte-3"),
  basalte4: t("--agon-h-basalte-4"),
  basalte5: t("--agon-h-basalte-5"),
  turquoise: t("--agon-h-turquoise"),
  cyan: t("--agon-h-cyan"),
  vertNuit: t("--agon-h-vert-nuit"),
} as const;

/**
 * Ajoute une opacité (0-1) à une couleur. Même résultat que `C.r + "33"` pour un hex,
 * et fonctionne aussi pour une couleur `rgba()`/`var()` (via `color-mix`).
 */
export function alpha(color: string, opacity: number): string {
  const a = Math.min(1, Math.max(0, opacity));
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
  }
  return `color-mix(in srgb, ${color} ${Math.round(a * 1000) / 10}%, transparent)`;
}

// ── Raccourcis sémantiques (même valeur, alias lisibles) ──────────────────────
export const PRIMARY   = C.ac;       // or vif
export const SECONDARY = C.coach;    // or vif
export const TERTIARY  = C.o;        // ocre
export const NEUTRAL   = C.tx3;      // pierre
export const SUCCESS   = C.g;        // vert vif

const cat = (n: number) => t(`--agon-cat-${n}`);

/** Types de bloc d'une séance (direction « peps », 12/11) : --agon-bloc-* de tokens.css. */
export const BT = {
  PERF:   { c: t("--agon-bloc-perf"),   l: "Mvt principal" },   // or
  ESTH:   { c: t("--agon-bloc-esth"),   l: "Hypertrophie"  },   // rose
  BESOIN: { c: t("--agon-bloc-besoin"), l: "Besoin indiv."  },  // bleu
  ASSOC:  { c: t("--agon-bloc-assoc"),  l: "Muscles assoc." },  // turquoise
  CORE:   { c: t("--agon-bloc-core"),   l: "Core"           },  // orange
} as const;

/** Couleurs de blocs : --agon-cat-1 … --agon-cat-10, dans l'ordre. */
export const BLOC_COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cat);

/** Couleurs proposées pour une habitude (enregistrées telles quelles en base). */
export const HABIT_COLORS = [1, 3, 4, 2, 8, 6, 7, 9].map(cat);

export const HABIT_ICONS = [
  "musculation","course","wellness","hydratation","clipboard","sommeil",
  "nutrition","objectif","intensite","flamme","coeur","tempo",
  "crayon","endurance","habitude","cerveau","performance","progression",
  "repos","lune","refresh","stress","drapeau","balance",
] as const;
