import type { QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Retours écrits du coach : retour hebdo (`weekly_retours`, un par athlète et
 * par semaine, réaction de l'athlète = « vu ») et commentaires du coach sur un
 * exercice d'une séance (`workout_exercise_comments`).
 *
 * Droits : RLS (coach via `is_coach_of`, athlète en lecture, réaction par la
 * RPC `react_weekly_retour` — seule écriture de l'athlète).
 *
 * Le bilan de compétition de l'athlète vit dans `src/api/competitions.ts`.
 * Après toute écriture : `invalidateCoachRetours`.
 */

export type RetourReaction = "like" | "strong" | "fire" | "heart";

export interface WeeklyRetour {
  id: string;
  athlete_id: string;
  coach_id: string;
  week_start: string;
  comment: string;
  created_at: string;
  updated_at: string;
  /** Réaction de l'athlète = retour vu. Remise à null quand le coach modifie son retour. */
  athlete_reaction: RetourReaction | null;
  reacted_at: string | null;
}

export interface ExerciseComment {
  id: string;
  workout_log_id: string;
  exercise_id: string | null;
  exercise_name: string;
  comment: string;
}

// ── Clés React Query ─────────────────────────────────────────────────────────
// Mêmes valeurs qu'avant la migration (écrans pas encore migrés).

export const coachRetourKeys = {
  week: (athleteId: string | undefined, weekStart: string | undefined) => ["weekly-retour", athleteId, weekStart] as const,
  weekPrefix: (athleteId: string) => ["weekly-retour", athleteId] as const,
  list: (athleteId: string | undefined) => ["weekly-retours", athleteId] as const,
};

/**
 * Tout ce qui affiche un retour du coach : la semaine, la liste de l'athlète,
 * la vue staff et la page Retours (commentaires d'exercice).
 */
export function invalidateCoachRetours(qc: QueryClient, athleteId?: string | null): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: athleteId ? coachRetourKeys.weekPrefix(athleteId) : ["weekly-retour"] }),
    qc.invalidateQueries({ queryKey: athleteId ? coachRetourKeys.list(athleteId) : ["weekly-retours"] }),
    qc.invalidateQueries({ queryKey: athleteId ? ["staff", "retours", athleteId] : ["staff", "retours"] }),
    qc.invalidateQueries({ queryKey: QK.weeklyRetours() }),
  ]).then(() => undefined);
}

// ── Retour hebdo ─────────────────────────────────────────────────────────────

export async function getWeeklyRetour(athleteId: string, weekStart: string): Promise<WeeklyRetour | null> {
  const row = unwrap(
    await db().from("weekly_retours").select("*").eq("athlete_id", athleteId).eq("week_start", weekStart).maybeSingle(),
    "Lecture du retour impossible",
  );
  return (row as unknown as WeeklyRetour | null) ?? null;
}

/** Retours non vides de l'athlète, du plus récent au plus ancien (20 max). */
export async function listAthleteRetours(athleteId: string): Promise<WeeklyRetour[]> {
  const rows = unwrapRows(
    await db().from("weekly_retours").select("*")
      .eq("athlete_id", athleteId)
      .neq("comment", "")
      .order("week_start", { ascending: false })
      .limit(20),
    "Lecture des retours impossible",
  );
  return rows as unknown as WeeklyRetour[];
}

/** Athlète : réagit à un retour (RPC). */
export async function reactToRetour(retourId: string, reaction: RetourReaction): Promise<void> {
  check(
    await db().rpc("react_weekly_retour", { p_retour_id: retourId, p_reaction: reaction }),
    "Réaction non enregistrée",
  );
}

/** Coach : écrit ou modifie le retour de la semaine ; l'athlète doit le revoir (réaction remise à zéro). */
export async function upsertWeeklyRetour(p: {
  athleteId: string; coachId: string; weekStart: string; comment: string;
}): Promise<WeeklyRetour> {
  const row = unwrap(
    await db().from("weekly_retours").upsert(
      {
        athlete_id: p.athleteId,
        coach_id: p.coachId,
        week_start: p.weekStart,
        comment: p.comment,
        updated_at: new Date().toISOString(),
        athlete_reaction: null,
        reacted_at: null,
      },
      { onConflict: "athlete_id,week_start" },
    ).select().single(),
    "Retour non enregistré",
  );
  return row as unknown as WeeklyRetour;
}

// ── Commentaires d'exercice ──────────────────────────────────────────────────

export async function upsertExerciseComment(p: {
  workoutLogId: string; exerciseId: string | null; exerciseName: string; comment: string;
}): Promise<ExerciseComment> {
  const row = unwrap(
    await db().from("workout_exercise_comments").upsert({
      workout_log_id: p.workoutLogId,
      exercise_id: p.exerciseId,
      exercise_name: p.exerciseName,
      comment: p.comment,
    }).select().single(),
    "Commentaire non enregistré",
  );
  return row as unknown as ExerciseComment;
}

export async function deleteExerciseComment(commentId: string): Promise<void> {
  check(await db().from("workout_exercise_comments").delete().eq("id", commentId), "Commentaire non supprimé");
}

/** Commentaires d'exercice de plusieurs séances (Retours). Lève en cas d'erreur. */
export async function listExerciseComments(workoutLogIds: readonly string[]): Promise<(ExerciseComment & { created_at: string; updated_at: string })[]> {
  if (workoutLogIds.length === 0) return [];
  return unwrapRows(
    (await db().from("workout_exercise_comments")
      .select("id, workout_log_id, exercise_id, exercise_name, comment, created_at, updated_at")
      .in("workout_log_id", [...workoutLogIds])) as never,
    "Commentaires d'exercice non chargés",
  );
}
