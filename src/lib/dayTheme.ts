/**
 * « Thème du jour » — l'intention que le coach pose sur une date.
 *
 * Un thème n'est pas une séance : c'est la phrase que l'athlète lit en ouvrant
 * sa journée (« Jambes lourdes », « Seuil », « Repos complet »). Tout est
 * facultatif sauf la couleur, parce qu'un thème vide ne doit jamais s'afficher
 * comme une pastille sans texte.
 *
 * Deux listes de raccourcis évitent au coach de retaper les mêmes mots :
 * l'intensité (combien ça coûte) et la dominante (de quoi c'est fait). Elles
 * sont indépendantes : un jour peut être « Easy / Technique » comme
 * « Hard / Spécifique HYROX ».
 *
 * Les composants n'inventent jamais la couleur du texte : `textColorOn` la
 * déduit de la luminance du fond, sinon un thème jaune en texte blanc devient
 * illisible.
 */

// ── Intensité ────────────────────────────────────────────────────────────────

export const DAY_THEME_INTENSITIES = [
  "hard",
  "moyen",
  "easy",
  "recup_active",
  "repos",
] as const;

export type DayThemeIntensity = (typeof DAY_THEME_INTENSITIES)[number];

export const DAY_THEME_INTENSITY_LABEL: Record<DayThemeIntensity, string> = {
  hard: "Hard",
  moyen: "Moyen",
  easy: "Easy",
  recup_active: "Récup active",
  repos: "Repos",
};

/** Couleur proposée quand le coach clique sur un raccourci d'intensité. */
export const DAY_THEME_INTENSITY_COLOR: Record<DayThemeIntensity, string> = {
  hard: "#ef4444",
  moyen: "#f59e0b",
  easy: "#22c55e",
  recup_active: "#06b6d4",
  repos: "#94a3b8",
};

// ── Dominante ────────────────────────────────────────────────────────────────

export const DAY_THEME_DOMINANTES = [
  "force",
  "puissance_vitesse",
  "volume",
  "aerobie",
  "seuil",
  "hyrox",
  "technique",
  "mixte",
] as const;

export type DayThemeDominante = (typeof DAY_THEME_DOMINANTES)[number];

export const DAY_THEME_DOMINANTE_LABEL: Record<DayThemeDominante, string> = {
  force: "Force",
  puissance_vitesse: "Puissance-vitesse",
  volume: "Volume",
  aerobie: "Aérobie",
  seuil: "Seuil",
  hyrox: "Spécifique HYROX",
  technique: "Technique",
  mixte: "Mixte",
};

// ── Palette ──────────────────────────────────────────────────────────────────

/**
 * Dix couleurs, pas plus : au-delà le coach ne distingue plus ses propres
 * codes, et une pastille qu'on ne sait pas lire ne sert à rien.
 */
export const DAY_THEME_PALETTE = [
  "#ef4444", // rouge
  "#f97316", // orange
  "#f59e0b", // ambre
  "#eab308", // jaune
  "#22c55e", // vert
  "#06b6d4", // cyan
  "#3b82f6", // bleu
  "#7c3aed", // violet
  "#ec4899", // rose
  "#94a3b8", // gris
] as const;

export const DAY_THEME_DEFAULT_COLOR: string = DAY_THEME_PALETTE[6];

/** Un libellé plus long ne tient dans aucune case de calendrier. */
export const DAY_THEME_LABEL_MAX = 40;

// ── Couleurs : validation et normalisation ───────────────────────────────────

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Accepte `#abc` comme `#aabbcc`, rien d'autre. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

/**
 * Ramène une couleur à la forme canonique `#rrggbb` en minuscules.
 * Renvoie `null` si l'entrée n'est pas une couleur hex — au composant de
 * retomber sur `DAY_THEME_DEFAULT_COLOR`, pas à cette fonction de mentir.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (!isHexColor(value)) return null;
  const hex = value.trim().toLowerCase().slice(1);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return "#" + full;
}

/** Comme `normalizeHexColor`, mais garantit une couleur affichable. */
export function safeThemeColor(value: unknown): string {
  return normalizeHexColor(value) ?? DAY_THEME_DEFAULT_COLOR;
}

// ── Libellé ──────────────────────────────────────────────────────────────────

/**
 * Espaces compactés, bords rognés, coupe à {@link DAY_THEME_LABEL_MAX}.
 * Une chaîne vide reste vide : c'est ce qui rend le thème « vide » et donc
 * invisible côté athlète.
 */
export function normalizeDayThemeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, DAY_THEME_LABEL_MAX);
}

// ── Contraste ────────────────────────────────────────────────────────────────

/** Luminance relative WCAG d'une couleur hex (0 = noir, 1 = blanc). */
export function relativeLuminance(color: string): number {
  const hex = normalizeHexColor(color);
  if (!hex) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DAY_THEME_TEXT_LIGHT = "#ffffff";
export const DAY_THEME_TEXT_DARK = "#111111";

/** Ratio de contraste WCAG entre deux couleurs hex. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Texte clair ou foncé selon le fond, en maximisant le ratio de contraste.
 *
 * Le seuil n'est pas écrit en dur : on compare les deux ratios réels. Le
 * fameux « 0.179 » ne vaut que pour du noir pur ; nos deux encres sont
 * `#ffffff` et `#111111`, ce qui déplace le point d'équilibre à ≈ 0.192. Un
 * seuil recopié d'ailleurs renverrait la mauvaise encre sur la bande de
 * couleurs qui tombe entre les deux valeurs — exactement là où vivent les
 * violets de la palette.
 *
 * Conséquence assumée : la plupart des couleurs saturées (rouge, bleu)
 * reçoivent du texte **foncé**, contre la convention « blanc sur bleu ». Sur un
 * bleu 500, le blanc plafonne à 3.7:1 et échoue l'AA pour du texte de 11 px
 * dans une case de calendrier, là où le foncé monte à 5.1:1. On lit la
 * pastille avant de la trouver jolie.
 */
export function textColorOn(background: string): string {
  const bg = safeThemeColor(background);
  return contrastRatio(bg, DAY_THEME_TEXT_DARK) >= contrastRatio(bg, DAY_THEME_TEXT_LIGHT)
    ? DAY_THEME_TEXT_DARK
    : DAY_THEME_TEXT_LIGHT;
}

// ── Lecture d'un thème ───────────────────────────────────────────────────────

/** Sous-ensemble d'une ligne `day_themes` suffisant pour afficher. */
export interface DayThemeLike {
  label?: string | null;
  intensity?: DayThemeIntensity | string | null;
  dominante?: DayThemeDominante | string | null;
  color?: string | null;
  note?: string | null;
}

export function isDayThemeIntensity(v: unknown): v is DayThemeIntensity {
  return typeof v === "string" && (DAY_THEME_INTENSITIES as readonly string[]).includes(v);
}

export function isDayThemeDominante(v: unknown): v is DayThemeDominante {
  return typeof v === "string" && (DAY_THEME_DOMINANTES as readonly string[]).includes(v);
}

/**
 * Un thème sans libellé, sans intensité et sans dominante n'a rien à dire :
 * on ne l'affiche pas, même s'il porte une couleur.
 */
export function isDayThemeEmpty(theme: DayThemeLike | null | undefined): boolean {
  if (!theme) return true;
  return (
    normalizeDayThemeLabel(theme.label) === "" &&
    !isDayThemeIntensity(theme.intensity) &&
    !isDayThemeDominante(theme.dominante)
  );
}

/**
 * Texte de la pastille : le libellé libre s'il existe, sinon la dominante,
 * sinon l'intensité. Jamais de concaténation ici — la case du calendrier fait
 * une ligne, et les deux badges détaillés vivent dans le drawer.
 */
export function dayThemeChipLabel(theme: DayThemeLike | null | undefined): string {
  if (!theme) return "";
  const label = normalizeDayThemeLabel(theme.label);
  if (label) return label;
  if (isDayThemeDominante(theme.dominante)) return DAY_THEME_DOMINANTE_LABEL[theme.dominante];
  if (isDayThemeIntensity(theme.intensity)) return DAY_THEME_INTENSITY_LABEL[theme.intensity];
  return "";
}

/**
 * Phrase complète pour les écrans qui ont de la place (bandeau du jour,
 * drawer) : « Jambes lourdes · Hard · Force ». Les parties absentes sautent.
 */
export function dayThemeFullLabel(theme: DayThemeLike | null | undefined): string {
  if (!theme) return "";
  const parts: string[] = [];
  const label = normalizeDayThemeLabel(theme.label);
  if (label) parts.push(label);
  if (isDayThemeIntensity(theme.intensity)) parts.push(DAY_THEME_INTENSITY_LABEL[theme.intensity]);
  if (isDayThemeDominante(theme.dominante)) parts.push(DAY_THEME_DOMINANTE_LABEL[theme.dominante]);
  return parts.join(" · ");
}

/** Couleur de fond et couleur de texte prêtes à poser dans un `style`. */
export function dayThemeColors(theme: DayThemeLike | null | undefined): {
  bg: string;
  fg: string;
} {
  const bg = safeThemeColor(theme?.color);
  return { bg, fg: textColorOn(bg) };
}

/**
 * Indexe des thèmes par date ISO pour que les vues calendrier fassent un
 * lookup O(1) au lieu d'un `find` par case.
 */
export function indexDayThemesByDate<T extends { date: string }>(
  themes: T[] | null | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const t of themes ?? []) out[t.date] = t;
  return out;
}
