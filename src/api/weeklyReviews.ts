import type { QueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import type { Light } from "@shared/domain/wellnessLight";
import { summarizeWeek, type ReviewAnswers, type WeekSummary, type WorkoutExtra } from "@/lib/weekly-review";
import type { Json } from "@/integrations/supabase/types";
import { db, unwrap, unwrapRows } from "./client";
import { getPlannedVsDone } from "./plannedVsDone";
import { getWellnessHistory } from "./wellness";
import { listWorkoutLogs } from "./workouts";

/**
 * Weekly review de l'athlète (`weekly_reviews`, P22-P23). Donnée de santé.
 *
 * Droits (RLS, migration 20261113180000) : l'athlète lit tout ce qui est à lui,
 * brouillons compris ; le coach, le co-coach (`is_coach_of`) et le staff qui a
 * « wellness » en lecture lisent les reviews ENVOYÉES. Seule écriture : la RPC
 * `save_weekly_review` (brouillon ou envoi), ouverte du dimanche au lundi soir.
 * La réponse du coach reste `weekly_retours.comment` (`src/api/coachRetours.ts`).
 * Après toute écriture : `invalidateWeeklyReviews`.
 */

export type ReviewStatus = "draft" | "submitted";

export interface WeeklyReview {
  id: string;
  athleteId: string;
  weekStart: IsoDay;
  status: ReviewStatus;
  answers: ReviewAnswers;
  /** Bilan figé à l'envoi, `null` en brouillon. */
  auto: WeekSummary | null;
  /** Feu au moment de l'envoi. */
  light: Light | null;
  submittedAt: string | null;
  updatedAt: string;
}

export const weeklyReviewKeys = {
  all: (aid: string) => ["weeklyReviews", aid] as const,
  week: (aid: string, week: IsoDay) => ["weeklyReviews", aid, "week", week] as const,
  list: (aid: string) => ["weeklyReviews", aid, "list"] as const,
  summary: (aid: string, week: IsoDay) => ["weeklyReviews", aid, "summary", week] as const,
  /** Liste du coach (plusieurs athlètes) : préfixe à part, invalidé avec le reste. */
  coachWeek: (week: IsoDay, ids: readonly string[]) => ["weeklyReviewsCoach", week, [...ids].sort().join(",")] as const,
};

export function invalidateWeeklyReviews(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: weeklyReviewKeys.all(athleteId) }),
    qc.invalidateQueries({ queryKey: ["weeklyReviewsCoach"] }),
  ]).then(() => undefined);
}

type Row = {
  id: string;
  athlete_id: string;
  week_start: string;
  status: string;
  answers: unknown;
  auto: unknown;
  light: string | null;
  submitted_at: string | null;
  updated_at: string;
};

const COLS = "id, athlete_id, week_start, status, answers, auto, light, submitted_at, updated_at";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function toReview(r: Row): WeeklyReview {
  return {
    id: r.id,
    athleteId: r.athlete_id,
    weekStart: r.week_start,
    status: r.status === "submitted" ? "submitted" : "draft",
    answers: isObj(r.answers) ? (r.answers as ReviewAnswers) : {},
    auto: isObj(r.auto) ? (r.auto as unknown as WeekSummary) : null,
    light: r.light === "green" || r.light === "orange" || r.light === "red" ? r.light : null,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  };
}

export async function getWeeklyReview(athleteId: string, weekStart: IsoDay): Promise<WeeklyReview | null> {
  const row = unwrap(
    await db().from("weekly_reviews").select(COLS).eq("athlete_id", athleteId).eq("week_start", weekStart).maybeSingle(),
    "Lecture de la weekly review impossible",
  );
  return row ? toReview(row as Row) : null;
}

/** Reviews de l'athlète, de la plus récente à la plus ancienne. */
export async function listWeeklyReviews(athleteId: string, limit = 26): Promise<WeeklyReview[]> {
  const rows = unwrapRows(
    await db().from("weekly_reviews").select(COLS).eq("athlete_id", athleteId)
      .order("week_start", { ascending: false }).limit(limit),
    "Lecture des weekly reviews impossible",
  );
  return (rows as Row[]).map(toReview);
}

/** Reviews envoyées d'une semaine pour plusieurs athlètes (liste du coach). */
export async function listReviewsForWeek(athleteIds: readonly string[], weekStart: IsoDay): Promise<WeeklyReview[]> {
  if (athleteIds.length === 0) return [];
  const rows = unwrapRows(
    await db().from("weekly_reviews").select(COLS).in("athlete_id", [...athleteIds]).eq("week_start", weekStart),
    "Lecture des weekly reviews impossible",
  );
  return (rows as Row[]).map(toReview);
}

/** Brouillon (à chaque champ) ou envoi. Refusé hors du dimanche-lundi, et après l'envoi. */
export async function saveWeeklyReview(
  weekStart: IsoDay,
  answers: ReviewAnswers,
  submit?: { auto: WeekSummary; light: Light | null },
): Promise<WeeklyReview> {
  const row = unwrap(
    await db().rpc("save_weekly_review", {
      p_week: weekStart,
      p_answers: answers as unknown as Json,
      p_submit: Boolean(submit),
      ...(submit ? { p_auto: submit.auto as unknown as Json } : {}),
      ...(submit?.light ? { p_light: submit.light } : {}),
    }),
    submit ? "Envoi de la weekly review impossible" : "Brouillon non enregistré",
  );
  if (!row) throw new Error("Weekly review non enregistrée");
  return toReview(row as unknown as Row);
}

/** Bilan automatique (bloc 1), recalculé tant que la review n'est pas envoyée. */
export async function getWeekSummary(athleteId: string, weekStart: IsoDay): Promise<WeekSummary> {
  const to = addDays(weekStart, 6);
  const [days, workouts, wellness] = await Promise.all([
    getPlannedVsDone(athleteId, weekStart, to),
    listWorkoutLogs({ athleteIds: [athleteId], from: weekStart, to, withMods: false }),
    getWellnessHistory(athleteId, { from: weekStart, to, includeArchived: false }),
  ]);
  const extras: Record<string, WorkoutExtra> = {};
  for (const w of workouts) extras[w.id] = { durationS: w.duration_s, notes: w.notes };
  return summarizeWeek({ weekStart, days, workouts: extras, wellness: Object.values(wellness) });
}

