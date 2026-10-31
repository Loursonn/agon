/**
 * Volume de séries par muscle et par semaine.
 *
 * Règle : une série compte 1 pour chaque muscle principal (2 max par exercice)
 * et 0,5 pour chaque muscle secondaire — il faut donc 2 séries pour en
 * « faire » 1 sur un muscle secondaire.
 *
 * Les paramètres d'un exercice dépendent de l'occurrence de sa séance (la
 * n-ième fois qu'elle est planifiée), pas de la semaine civile. On part donc
 * des séances planifiées (workout_logs), on retrouve leur occurrence, puis on
 * range leurs séries dans la semaine civile (lundi) de leur date.
 */
import type { Exercice, ExerciceMuscles, ProgSession } from "@/features/coach/components/programmation/types";
import { computeOccurrences, resolveExerciceParams } from "@/lib/sessionOccurrence";
import { MTREE } from "@/lib/muscles";

export const SECONDARY_FACTOR = 0.5;
export const MAX_PRIMARY_MUSCLES = 2;

/** Muscles d'un exercice de la banque (colonnes target, target_2, secondary). */
export type BankMuscles = ExerciceMuscles;

export interface PlannedLog {
  id: string;
  session_id: string | null;
  scheduled_date: string; // YYYY-MM-DD
  status: string;
}

export interface MuscleCell {
  /** Séries prévues (pondérées : secondaire = 0,5) */
  planned: number;
  /** Séries des séances terminées */
  done: number;
}

export type WeekVolume = Record<string, MuscleCell>;

/** Muscles à utiliser pour un exercice : surcharge du programme, sinon banque. */
export function resolveMuscles(
  ex: Pick<Exercice, "muscles" | "exercise_id">,
  bank: ReadonlyMap<string, BankMuscles>,
): ExerciceMuscles {
  const raw = ex.muscles ?? bank.get(ex.exercise_id) ?? { primary: [], secondary: [] };
  const primary = [...new Set(raw.primary)].slice(0, MAX_PRIMARY_MUSCLES);
  const secondary = [...new Set(raw.secondary)].filter((m) => !primary.includes(m));
  return { primary, secondary };
}

/** Nombre de séries d'un exercice pour une occurrence (0 : note libre, sans params). */
export function exerciceSets(ex: Exercice, occurrence: number): number {
  if (ex.mode === "libre") return 0;
  const params = resolveExerciceParams(ex.params, occurrence);
  const n = params?.nb_series;
  return typeof n === "number" && n > 0 ? n : 0;
}

/** Lundi (YYYY-MM-DD) de la semaine civile contenant `iso`. */
export function weekStartISO(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - dow);
  return (
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
  );
}

/** Lundis consécutifs couvrant [startISO, endISO]. */
export function weekStartsBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = weekStartISO(startISO);
  const last = weekStartISO(endISO);
  while (cur <= last && out.length < 104) {
    out.push(cur);
    const d = new Date(cur + "T12:00:00");
    d.setDate(d.getDate() + 7);
    cur = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  return out;
}

/**
 * Volume par semaine civile et par muscle (ids de MTREE, sous-muscles inclus).
 * Les séances « skipped » sont ignorées ; `done` ne compte que les « completed ».
 */
export function computeWeeklyMuscleVolume(args: {
  sessions: ProgSession[];
  logs: PlannedLog[];
  bank: ReadonlyMap<string, BankMuscles>;
  /** Lundis à restituer (les semaines vides sont présentes, à vide). */
  weekStarts: string[];
}): Record<string, WeekVolume> {
  const { sessions, logs, bank, weekStarts } = args;
  const result: Record<string, WeekVolume> = Object.fromEntries(weekStarts.map((w) => [w, {}]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const live = logs.filter((l) => l.status !== "skipped");
  const occ = computeOccurrences(live.map((l) => ({ id: l.id, session_id: l.session_id, scheduled_date: l.scheduled_date })));

  for (const log of live) {
    const week = weekStartISO(log.scheduled_date);
    const bucket = result[week];
    if (!bucket || !log.session_id) continue;
    const session = sessionById.get(log.session_id);
    if (!session) continue;
    const occurrence = occ.get(log.id) ?? 1;
    const completed = log.status === "completed";

    for (const bloc of session.blocs) {
      for (const ex of bloc.exercices) {
        const sets = exerciceSets(ex, occurrence);
        if (!sets) continue;
        const { primary, secondary } = resolveMuscles(ex, bank);
        const add = (muscle: string, factor: number) => {
          const cell = (bucket[muscle] ??= { planned: 0, done: 0 });
          cell.planned += sets * factor;
          if (completed) cell.done += sets * factor;
        };
        primary.forEach((m) => add(m, 1));
        secondary.forEach((m) => add(m, SECONDARY_FACTOR));
      }
    }
  }
  return result;
}

/** Groupe parent d'un muscle (« Dos-GD » → « Dos »), ou lui-même. */
export function parentMuscle(id: string): string {
  const parent = MTREE.find((g) => g.s.some((s) => s.id === id));
  return parent ? parent.id : id;
}

/** Regroupe les sous-muscles sous leur groupe parent (Dos-GD + Dos-Trap → Dos). */
export function rollUpToGroups(week: WeekVolume): WeekVolume {
  const out: WeekVolume = {};
  for (const [id, cell] of Object.entries(week)) {
    const p = parentMuscle(id);
    const t = (out[p] ??= { planned: 0, done: 0 });
    t.planned += cell.planned;
    t.done += cell.done;
  }
  return out;
}

/** Affichage d'un volume : 12, 12,5 (jamais 12,0). */
export function formatSets(n: number): string {
  return (Math.round(n * 2) / 2).toString().replace(".", ",");
}
