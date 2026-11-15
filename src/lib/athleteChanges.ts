/**
 * Modifications faites par l'athlète sur son planning (badge « N modifs » de
 * la barre coach, section « Modifications planning athlète » des Retours).
 *
 * Une modification, c'est :
 *   - une séance dont l'athlète a changé la date (`rescheduled_by_athlete`),
 *     sauf s'il l'a remise à sa date d'origine ;
 *   - des séries ou exercices ajoutés en plus du programme (`bonusSets`,
 *     `customExercises`, ancien format encore présent sur de vieilles séances).
 *
 * Saisir ses charges, noter sa forme ou commenter n'est PAS une modification :
 * c'est faire la séance (avant 2026-11-15 le badge comptait toutes ces
 * séances, depuis toujours : « 11 modifs » pour 11 séances faites).
 *
 * « Déjà vue » : le coach a ouvert la liste ; mémorisé sur son appareil
 * (clé = séance + date, donc un nouveau déplacement de la même séance revient).
 */

export interface AthleteChangeInput {
  id: string;
  sessionName: string;
  scheduledDate: string;          // "YYYY-MM-DD"
  /** Date d'origine enregistrée ; null = inconnue (jamais déplacée, ou déplacée sans la garder). */
  recordedOriginalDate: string | null;
  rescheduledByAthlete: boolean;
  coachAlert: boolean;
  athleteModifications: { bonusSets?: unknown; customExercises?: unknown } | null;
  /** Dernière écriture sur la séance (approxime le moment du changement). */
  updatedAt?: string | null;
}

export interface AthleteChange {
  key: string;
  id: string;
  sessionName: string;
  scheduledDate: string;
  /** Date d'avant le déplacement ; null si pas déplacée ou origine inconnue. */
  movedFrom: string | null;
  moved: boolean;
  addedSets: number;
  addedExercises: number;
  coachAlert: boolean;
  updatedAt: string | null;
}

/** Jours regardés en arrière par le badge (les séances à venir comptent toujours). */
export const CHANGES_WINDOW_DAYS = 28;

function countBonusSets(v: unknown): number {
  if (!Array.isArray(v)) return 0;
  return v.reduce((n: number, b) => {
    const sets = (b as { sets?: unknown } | null)?.sets;
    return n + (Array.isArray(sets) ? sets.length : 0);
  }, 0);
}

/** La séance porte-t-elle une vraie modification de l'athlète ? Sinon null. */
export function toAthleteChange(log: AthleteChangeInput): AthleteChange | null {
  const orig = log.recordedOriginalDate;
  // Remise à sa date d'origine : plus de changement. Origine inconnue
  // (`moveWorkoutToDayByAthlete` ne la garde pas) : déplacée quand même.
  const moved = log.rescheduledByAthlete && orig !== log.scheduledDate;
  const addedSets = countBonusSets(log.athleteModifications?.bonusSets);
  const ex = log.athleteModifications?.customExercises;
  const addedExercises = Array.isArray(ex) ? ex.length : 0;
  if (!moved && addedSets === 0 && addedExercises === 0) return null;
  return {
    key: `${log.id}@${log.scheduledDate}`,
    id: log.id,
    sessionName: log.sessionName,
    scheduledDate: log.scheduledDate,
    movedFrom: moved ? orig : null,
    moved,
    addedSets,
    addedExercises,
    coachAlert: log.coachAlert,
    updatedAt: log.updatedAt ?? null,
  };
}

/** Garde les vraies modifications, la plus récente (date de séance) d'abord. */
export function athleteChanges(logs: readonly AthleteChangeInput[]): AthleteChange[] {
  return logs
    .map(toAthleteChange)
    .filter((c): c is AthleteChange => c !== null)
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : a.scheduledDate > b.scheduledDate ? -1 : 0));
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Modifications récentes : séance (ou sa date d'origine) dans les `days` derniers jours, ou à venir. */
export function recentChanges(changes: readonly AthleteChange[], today: string, days = CHANGES_WINDOW_DAYS): AthleteChange[] {
  const from = shiftDay(today, -days);
  return changes.filter((c) => c.scheduledDate >= from || (c.movedFrom !== null && c.movedFrom >= from));
}

/** Celles que le coach n'a pas encore vues. */
export function unseenChanges(changes: readonly AthleteChange[], seen: ReadonlySet<string>): AthleteChange[] {
  return changes.filter((c) => !seen.has(c.key));
}

/** Ce qui a changé, en une phrase courte. */
export function describeChange(c: AthleteChange, fmtDay: (day: string) => string): string {
  const parts: string[] = [];
  if (c.moved) parts.push(c.movedFrom ? `déplacée du ${fmtDay(c.movedFrom)} au ${fmtDay(c.scheduledDate)}` : `déplacée au ${fmtDay(c.scheduledDate)}`);
  if (c.addedSets > 0) parts.push(`+${c.addedSets} série${c.addedSets > 1 ? "s" : ""} bonus`);
  if (c.addedExercises > 0) parts.push(`+${c.addedExercises} exercice${c.addedExercises > 1 ? "s" : ""} ajouté${c.addedExercises > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

// ── « Déjà vues » (appareil du coach) ─────────────────────────────────────────

const MAX_SEEN = 200;
const seenKey = (coachId: string, athleteId: string) => `agon:modifs-vues:${coachId}:${athleteId}`;

type Store = Pick<Storage, "getItem" | "setItem">;
function store(): Store | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function readSeenChanges(coachId: string, athleteId: string, s: Store | null = store()): Set<string> {
  try {
    const raw = s?.getItem(seenKey(coachId, athleteId));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function markChangesSeen(coachId: string, athleteId: string, keys: readonly string[], s: Store | null = store()): Set<string> {
  const seen = readSeenChanges(coachId, athleteId, s);
  for (const k of keys) seen.add(k);
  const kept = [...seen].slice(-MAX_SEEN);
  try { s?.setItem(seenKey(coachId, athleteId), JSON.stringify(kept)); } catch { /* stockage indisponible */ }
  return new Set(kept);
}
