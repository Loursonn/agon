/**
 * Brouillons locaux (localStorage) des saisies athlète en cours.
 *
 * Filet de sécurité quand le réseau est mauvais à la salle : la saisie est
 * écrite ici de façon SYNCHRONE à chaque modification, avant tout envoi. Si
 * l'onglet est tué (iOS, batterie, appel entrant…) ou si l'envoi échoue, la
 * saisie est retrouvée à la réouverture.
 *
 * - Clés préfixées par l'id de l'athlète : deux comptes sur un même téléphone
 *   ne voient jamais les brouillons l'un de l'autre.
 * - Tout est en try/catch : localStorage peut lever (navigation privée Safari,
 *   quota plein, stockage bloqué). Un brouillon raté ne doit jamais casser la saisie.
 */

const PREFIX = "agon:draft:";
const DEFAULT_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

export interface Draft<T> {
  value: T;
  /** Date.now() de la dernière écriture locale. */
  updatedAt: number;
  /**
   * true quand le serveur a confirmé avoir reçu exactement cette valeur.
   * Un brouillon non synchronisé est, par définition, plus récent que la
   * version serveur : il doit être restauré et renvoyé.
   */
  synced: boolean;
}

/** `agon:draft:<athleteId>:<scope>:<id>` */
export function draftKey(athleteId: string, scope: string, id: string): string {
  return `${PREFIX}${athleteId}:${scope}:${id}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T, opts?: { synced?: boolean }): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    const d: Draft<T> = { value, updatedAt: Date.now(), synced: !!opts?.synced };
    ls.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T>(key: string, opts?: { maxAgeMs?: number }): Draft<T> | null {
  const ls = storage();
  if (!ls) return null;
  pruneOldDrafts();
  try {
    const raw = ls.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft<T>;
    if (!d || typeof d !== "object" || typeof d.updatedAt !== "number" || !("value" in d)) return null;
    const maxAge = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    if (Date.now() - d.updatedAt > maxAge) return null;
    return { value: d.value, updatedAt: d.updatedAt, synced: !!d.synced };
  } catch {
    return null;
  }
}

/**
 * Marque le brouillon comme reçu par le serveur, SEULEMENT s'il contient
 * encore exactement la valeur envoyée (sinon une saisie plus récente, faite
 * pendant l'envoi, reste à envoyer).
 */
export function markDraftSynced(key: string, sentValue: unknown): void {
  const ls = storage();
  if (!ls) return;
  try {
    const raw = ls.getItem(key);
    if (!raw) return;
    const d = JSON.parse(raw) as Draft<unknown>;
    if (!d || JSON.stringify(d.value) !== JSON.stringify(sentValue)) return;
    ls.setItem(key, JSON.stringify({ ...d, synced: true }));
  } catch {
    /* ignore */
  }
}

export function clearDraft(key: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {
    /* ignore */
  }
}

let pruned = false;
/** Supprime (une fois par session) les brouillons de plus de `maxAgeMs`. */
export function pruneOldDrafts(maxAgeMs = DEFAULT_MAX_AGE_MS, force = false): void {
  if (pruned && !force) return;
  pruned = true;
  const ls = storage();
  if (!ls) return;
  try {
    const now = Date.now();
    const stale: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const d = JSON.parse(ls.getItem(k) ?? "null") as Draft<unknown> | null;
        if (!d || typeof d.updatedAt !== "number" || now - d.updatedAt > maxAgeMs) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    stale.forEach((k) => ls.removeItem(k));
  } catch {
    /* ignore */
  }
}

// ── Clés des brouillons athlète ─────────────────────────────────────────────
/** Saisie des séries d'une séance muscu (workout_logs.id). */
export const workoutDraftKey = (athleteId: string, workoutLogId: string) =>
  draftKey(athleteId, "workout", workoutLogId);
/** Séance énergie en cours (energy assignment id = une séance d'un jour donné). */
export const energyDraftKey = (athleteId: string, assignmentId: string) =>
  draftKey(athleteId, "energy", assignmentId);
/** Formulaire wellness du jour (`day` = todayKey()). */
export const wellnessDraftKey = (athleteId: string, day: string) =>
  draftKey(athleteId, "wellness", day);
