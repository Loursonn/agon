/**
 * Rapprochement d'un nom d'exercice écrit dans le texte avec la bibliothèque.
 *
 * - nom identique (casse, accents, ponctuation et espaces ignorés) → lien direct
 * - sinon, noms proches (mots en commun, inclusion, fautes de frappe) → proposés au coach
 * - aucun nom proche → l'exercice sera créé
 */
import { norm } from "./common";

export interface LibraryExercise {
  id: string;
  name: string;
  youtube_id?: string | null;
}

export interface ExerciseMatch {
  exact: LibraryExercise | null;
  /** Meilleurs candidats (score décroissant), vide si exact */
  candidates: { exercise: LibraryExercise; score: number }[];
}

/** Clé de comparaison : minuscules, sans accents ni ponctuation, apostrophes supprimées. */
export function nameKey(s: string): string {
  return norm(s)
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["de", "du", "des", "la", "le", "les", "a", "au", "aux", "en", "et", "l", "d", "avec", "sur"]);

function tokens(key: string): string[] {
  return key
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similarité 0..1 entre deux noms d'exercice. */
export function similarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;

  const ta = tokens(ka);
  const tb = tokens(kb);
  // Mots en commun, avec tolérance aux fautes de frappe sur les mots longs
  let common = 0;
  for (const x of ta) {
    if (tb.some((y) => y === x || (x.length >= 5 && y.length >= 5 && levenshtein(x, y) <= 1))) common++;
  }
  const dice = ta.length + tb.length ? (2 * common) / (ta.length + tb.length) : 0;
  // Un nom entièrement contenu dans l'autre (« Copenhagen plank » ⊂ « Copenhagen plank levier court »)
  const inclusion = common > 0 && (common === ta.length || common === tb.length) ? 0.75 + 0.2 * dice : 0;
  const lev = 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
  return Math.max(dice, inclusion, lev);
}

export const CANDIDATE_THRESHOLD = 0.6;

export function matchExercise(name: string, library: LibraryExercise[], max = 4): ExerciseMatch {
  const key = nameKey(name);
  const exact = library.find((e) => nameKey(e.name) === key) ?? null;
  if (exact) return { exact, candidates: [] };
  const candidates = library
    .map((exercise) => ({ exercise, score: similarity(name, exercise.name) }))
    .filter((c) => c.score >= CANDIDATE_THRESHOLD)
    .sort((x, y) => y.score - x.score)
    .slice(0, max);
  return { exact: null, candidates };
}
