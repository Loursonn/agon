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

export const BT = {
  PERF:   { c: cat(2),  l: "Mvt principal" },   // terracotta vif
  ESTH:   { c: cat(1),  l: "Hypertrophie"  },   // or vif
  BESOIN: { c: cat(4),  l: "Besoin indiv."  },  // ardoise vif
  ASSOC:  { c: cat(6),  l: "Muscles assoc." },  // patine vif
  CORE:   { c: cat(10), l: "Core"           },  // pierre
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
