/**
 * Briques communes aux parseurs du « format YOXX » (import de séances par
 * copier-coller, sans IA). Fonctions pures, sans dépendance React/Supabase.
 *
 * Référence du format : docs/format-seance-yoxx.md
 */

// ── Rapport d'import ─────────────────────────────────────────────────────────

/**
 * - error   : la ligne (ou une partie) n'a pas pu être importée → zone « À SAISIR »
 * - warning : importé, mais interprété (valeur par défaut, texte libre…) → à vérifier
 * - info    : transformation automatique sans perte (ex. RPE déplacé en consigne)
 */
export type ImportIssueLevel = "error" | "warning" | "info";

export interface ImportIssue {
  /** Numéro de ligne dans le texte collé (1 = première ligne) ; 0 = séance entière */
  line: number;
  /** Contenu de la ligne tel que collé */
  raw: string;
  level: ImportIssueLevel;
  /** Explication en français : ce qui ne va pas + comment l'écrire */
  message: string;
  /** Id de l'étape créée pour cette ligne (lien cliquable dans l'éditeur) */
  stepId?: string;
}

/** Préfixe des valeurs à compléter à la main après import */
export const A_SAISIR = "⚠ À SAISIR";

// ── Normalisation ────────────────────────────────────────────────────────────

/** Minuscules, sans accents, espaces compactés. Pour comparer des mots-clés. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uniformise les caractères que les copier-coller (Notes, Word, Claude…)
 * remplacent : apostrophes et guillemets typographiques, tirets longs, ×.
 * Les guillemets « » (texte libre) sont convertis en ".
 */
export function cleanTypography(s: string): string {
  return s
    .replace(/[’‘′´`]/g, "'")
    .replace(/[“”″«»]/g, '"')
    .replace(/''/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/×/g, "x")
    .replace(/\u00A0/g, " ");
}

/** Nombre décimal FR ou EN (« 1,5 » ou « 1.5 »). null si invalide. */
export function parseNum(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

// ── Temps ────────────────────────────────────────────────────────────────────

/**
 * Durée → secondes. Formats acceptés :
 *   10'  ·  1'30  ·  1'30"  ·  30"  ·  30s  ·  10min  ·  1h  ·  1h20  ·  1h20'
 *   10:00  ·  1:30:00
 * null si non reconnu.
 */
export function parseTime(raw: string): number | null {
  const s = cleanTypography(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // 1h, 1h20, 1h20', 1h20min
  let m = s.match(/^(\d+)h(?:(\d{1,2})(?:'|min)?)?$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2] ?? 0) * 60;

  // 10', 1'30, 1'30", 10min, 10mn
  m = s.match(/^(\d+)(?:'|min|mn)(?:(\d{1,2})"?)?$/);
  if (m) {
    const sec = Number(m[2] ?? 0);
    return sec < 60 ? Number(m[1]) * 60 + sec : null;
  }

  // 30", 30s, 30sec
  m = s.match(/^(\d+)(?:"|s|sec)$/);
  if (m) return Number(m[1]);

  // 10:00, 1:30:00
  m = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    if (m[3] !== undefined) {
      if (Number(m[2]) >= 60 || Number(m[3]) >= 60) return null;
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    if (Number(m[2]) >= 60) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  return null;
}

/**
 * Valeur seule ou fourchette « a-b » (aussi « a à b »).
 * Retourne les deux bornes dans l'ordre écrit ; min = max si valeur seule.
 */
export function splitRange(raw: string): [string, string] {
  const parts = raw.split(/\s*(?:-|\bà\b|\ba\b)\s*/).filter((p) => p !== "");
  if (parts.length === 2) return [parts[0], parts[1]];
  return [raw.trim(), raw.trim()];
}

export function parseNumRange(raw: string): { min: number; max: number } | null {
  const [a, b] = splitRange(raw);
  const min = parseNum(a);
  const max = parseNum(b);
  return min !== null && max !== null ? { min, max } : null;
}

export function parseTimeRange(raw: string): { min: number; max: number } | null {
  const [a, b] = splitRange(raw);
  const min = parseTime(a);
  const max = parseTime(b);
  return min !== null && max !== null ? { min, max } : null;
}
