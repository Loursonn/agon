import type { QueryClient } from "@tanstack/react-query";
import type {
  RoadmapItem, RoadmapPhase,
} from "@/features/coach/types/roadmap";
import type { AppFeedbackEntry, CoachFeedbacks } from "@/features/shared/types/athlete";
import { check, db, unwrap, unwrapRows } from "./client";
import { readAppData, writeAppData } from "./appData";

/**
 * Contenu de l'app autour du coach et de l'athlète :
 * - Nouveautés : accusés de lecture (`app_update_reads`) ; le contenu est dans
 *   src/data/releaseNotes.ts.
 * - Roadmap (`roadmap_phases`, `roadmap_items`, `roadmap_votes`) : coachs
 *   certifiés et admin (RLS) ; phases réservées à l'admin.
 * - Citation du jour : likes (`citation_likes`) et compteur (`citation_stats`,
 *   tenu par la base, suivi en temps réel).
 * - Retours sur l'app (`app_feedback`) : l'athlète envoie, admin / coach
 *   certifié trient.
 * - Anciens retours en `app_data` (`asp:coach_feedback`, `app:user_feedback`).
 * - Sections de l'accueil athlète masquées par le coach
 *   (`profiles.home_hidden_sections`).
 * - Activité récente des athlètes (accueil coach).
 *
 * Lectures : lèvent en cas d'erreur.
 */

// ── Clés React Query ─────────────────────────────────────────────────────────
// Mêmes valeurs qu'avant la migration (`QK.*`, clés en dur).

export const appContentKeys = {
  updateReads: (userId: string) => ["app-update-reads", userId] as const,
  updateStats: ["app-update-stats"] as const,
  roadmapPhases: ["roadmap-phases"] as const,
  roadmapItems: ["roadmap-items"] as const,
  roadmapVotes: (userId: string) => ["roadmap-votes", userId] as const,
  roadmapVoteCounts: ["roadmap-vote-counts"] as const,
  appFeedbackList: ["app-feedback"] as const,
  coachFeedback: (athleteId: string) => ["coachFeedback", athleteId] as const,
  userFeedback: (athleteId: string) => ["appFeedback", athleteId] as const,
  homeHidden: (athleteId: string) => ["homeHiddenSections", athleteId] as const,
  /** Préfixe "coachDashboard" : rafraîchi par `invalidateWorkouts` quand une séance change. */
  recentActivity: (userId: string | undefined, limit: number) => ["coachDashboard", "activity", userId, limit] as const,
};

export function invalidateAppUpdates(qc: QueryClient, userId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: appContentKeys.updateReads(userId) }),
    qc.invalidateQueries({ queryKey: appContentKeys.updateStats }),
  ]).then(() => undefined);
}

/** Phases, items, votes et compteurs (un vote change le compteur affiché). */
export function invalidateRoadmap(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: appContentKeys.roadmapPhases }),
    qc.invalidateQueries({ queryKey: appContentKeys.roadmapItems }),
    qc.invalidateQueries({ queryKey: ["roadmap-votes"] }),
    qc.invalidateQueries({ queryKey: appContentKeys.roadmapVoteCounts }),
  ]).then(() => undefined);
}

export function invalidateAppFeedback(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: appContentKeys.appFeedbackList });
}

export function invalidateHomeSections(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: appContentKeys.homeHidden(athleteId) });
}

// ── Nouveautés ───────────────────────────────────────────────────────────────

/** Nouveautés vues par l'utilisateur : id → date de lecture. */
export async function listAppUpdateReads(userId: string): Promise<Record<string, string>> {
  const rows = unwrapRows(
    await db().from("app_update_reads").select("update_id, seen_at").eq("user_id", userId),
    "Lecture des nouveautés vues impossible",
  );
  return Object.fromEntries(rows.map((r) => [r.update_id, r.seen_at]));
}

export async function markAppUpdatesSeen(userId: string, updateIds: string[]): Promise<void> {
  if (updateIds.length === 0) return;
  check(
    await db().from("app_update_reads").upsert(
      updateIds.map((id) => ({ user_id: userId, update_id: id })),
      { onConflict: "user_id,update_id", ignoreDuplicates: true },
    ),
    "Lecture des nouveautés non enregistrée",
  );
}

export interface AppUpdateRead {
  update_id: string;
  user_id: string;
  full_name: string;
  seen_at: string;
  total_coaches: number;
}

/** Admin : qui a vu chaque nouveauté. */
export async function listAppUpdateStats(): Promise<AppUpdateRead[]> {
  return unwrapRows(await db().rpc("get_app_update_reads"), "Lecture des statistiques impossible") as unknown as AppUpdateRead[];
}

// ── Roadmap ──────────────────────────────────────────────────────────────────

export async function listRoadmapPhases(): Promise<RoadmapPhase[]> {
  const rows = unwrapRows(
    await db().from("roadmap_phases").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    "Lecture de la roadmap impossible",
  );
  return rows as unknown as RoadmapPhase[];
}

export async function listRoadmapItems(): Promise<RoadmapItem[]> {
  const rows = unwrapRows(
    await db().from("roadmap_items").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    "Lecture de la roadmap impossible",
  );
  return rows as unknown as RoadmapItem[];
}

/** Items votés par l'utilisateur. */
export async function listMyRoadmapVotes(userId: string): Promise<string[]> {
  const rows = unwrapRows(
    await db().from("roadmap_votes").select("item_id").eq("user_id", userId),
    "Lecture des votes impossible",
  );
  return rows.map((r) => r.item_id);
}

/** Votes par item (agrégés côté client). */
export async function roadmapVoteCounts(): Promise<Record<string, number>> {
  const rows = unwrapRows(await db().from("roadmap_votes").select("item_id"), "Lecture des votes impossible");
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.item_id] = (counts[r.item_id] ?? 0) + 1;
  return counts;
}

/** `voted` = état actuel : vrai → retire le vote, faux → vote. */
export async function toggleRoadmapVote(userId: string, itemId: string, voted: boolean): Promise<void> {
  if (voted) {
    check(await db().from("roadmap_votes").delete().eq("item_id", itemId).eq("user_id", userId), "Vote non retiré");
  } else {
    check(await db().from("roadmap_votes").insert({ item_id: itemId, user_id: userId }), "Vote non enregistré");
  }
}

export type CreatePhaseInput = Pick<RoadmapPhase, "name" | "quarter" | "status" | "sort_order"> & {
  description?: string | null;
};
export type UpdatePhaseInput = Partial<Omit<RoadmapPhase, "id" | "created_at" | "updated_at">> & { id: string };

export async function createRoadmapPhase(input: CreatePhaseInput): Promise<RoadmapPhase> {
  const row = unwrap(await db().from("roadmap_phases").insert(input).select().single(), "Phase non créée");
  return row as unknown as RoadmapPhase;
}

export async function updateRoadmapPhase({ id, ...updates }: UpdatePhaseInput): Promise<RoadmapPhase> {
  const row = unwrap(await db().from("roadmap_phases").update(updates).eq("id", id).select().single(), "Phase non modifiée");
  return row as unknown as RoadmapPhase;
}

export async function deleteRoadmapPhase(id: string): Promise<void> {
  check(await db().from("roadmap_phases").delete().eq("id", id), "Phase non supprimée");
}

export type CreateItemInput = {
  phase_id?: string | null;
  title: string;
  description?: string | null;
  category: RoadmapItem["category"];
  priority: RoadmapItem["priority"];
  status: RoadmapItem["status"];
  sort_order?: number;
};
export type UpdateItemInput =
  Partial<Omit<RoadmapItem, "id" | "created_at" | "updated_at" | "vote_count" | "user_voted">> & { id: string };

export async function createRoadmapItem(input: CreateItemInput): Promise<RoadmapItem> {
  const row = unwrap(
    await db().from("roadmap_items").insert({ ...input, sort_order: input.sort_order ?? 0 }).select().single(),
    "Item non créé",
  );
  return row as unknown as RoadmapItem;
}

export async function updateRoadmapItem({ id, ...updates }: UpdateItemInput): Promise<RoadmapItem> {
  const row = unwrap(await db().from("roadmap_items").update(updates).eq("id", id).select().single(), "Item non modifié");
  return row as unknown as RoadmapItem;
}

export async function deleteRoadmapItem(id: string): Promise<void> {
  check(await db().from("roadmap_items").delete().eq("id", id), "Item non supprimé");
}

// ── Citation du jour ─────────────────────────────────────────────────────────

/** Like de l'utilisateur et nombre de likes de la citation. */
export async function getCitationState(userId: string, quoteId: number): Promise<{ liked: boolean; count: number }> {
  const [likeRes, statsRes] = await Promise.all([
    db().from("citation_likes").select("quote_id").eq("user_id", userId).eq("quote_id", quoteId).maybeSingle(),
    db().from("citation_stats").select("likes").eq("quote_id", quoteId).maybeSingle(),
  ]);
  const like = unwrap(likeRes, "Lecture du like impossible");
  const stats = unwrap(statsRes, "Lecture des likes impossible");
  return { liked: !!like, count: stats?.likes ?? 0 };
}

export async function setCitationLiked(userId: string, quoteId: number, liked: boolean): Promise<void> {
  if (liked) {
    check(await db().from("citation_likes").insert({ user_id: userId, quote_id: quoteId }), "Like non enregistré");
  } else {
    check(await db().from("citation_likes").delete().eq("user_id", userId).eq("quote_id", quoteId), "Like non retiré");
  }
}

/** Suit le compteur de likes en temps réel ; renvoie la fonction d'arrêt. */
export function subscribeCitationLikes(quoteId: number, onLikes: (likes: number) => void): () => void {
  const channel = db()
    .channel(`citation-stats-${quoteId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "citation_stats", filter: `quote_id=eq.${quoteId}` },
      (payload) => {
        const likes = (payload.new as { likes?: number } | null)?.likes;
        if (typeof likes === "number") onLikes(likes);
      },
    )
    .subscribe();
  return () => { void db().removeChannel(channel); };
}

// ── Retours sur l'app (table app_feedback) ───────────────────────────────────

export type AppFeedbackKind = "bug" | "idea" | "other";
export type AppFeedbackStatus = "new" | "in_progress" | "done";

export interface AppFeedbackRow {
  id: string;
  author_id: string;
  kind: AppFeedbackKind;
  content: string;
  page: string | null;
  user_agent: string | null;
  status: AppFeedbackStatus;
  created_at: string;
  author?: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

export async function listAppFeedback(): Promise<AppFeedbackRow[]> {
  const rows = unwrapRows(
    await db().from("app_feedback")
      .select("*, author:profiles!app_feedback_author_id_fkey(full_name, first_name, last_name)")
      .order("created_at", { ascending: false }),
    "Lecture des retours impossible",
  );
  return rows as unknown as AppFeedbackRow[];
}

export async function sendAppFeedback(input: {
  authorId: string; kind: AppFeedbackKind; content: string; page?: string; userAgent?: string | null;
}): Promise<void> {
  check(
    await db().from("app_feedback").insert({
      author_id: input.authorId,
      kind: input.kind,
      content: input.content,
      page: input.page ?? null,
      user_agent: input.userAgent ?? null,
    }),
    "Retour non envoyé",
  );
}

export async function setAppFeedbackStatus(id: string, status: AppFeedbackStatus): Promise<void> {
  check(
    await db().from("app_feedback").update({ status, updated_at: new Date().toISOString() }).eq("id", id),
    "Statut non enregistré",
  );
}

export async function deleteAppFeedback(id: string): Promise<void> {
  check(await db().from("app_feedback").delete().eq("id", id), "Retour non supprimé");
}

// ── Anciens retours (app_data) ───────────────────────────────────────────────

/** Notes du coach par semaine (`asp:coach_feedback`). */
export async function getCoachFeedbacks(athleteId: string): Promise<CoachFeedbacks> {
  return (await readAppData<CoachFeedbacks>(athleteId, "asp:coach_feedback")).value || {};
}

/** Avis de l'athlète sur l'app (`app:user_feedback`). */
export async function listUserFeedback(athleteId: string): Promise<AppFeedbackEntry[]> {
  return (await readAppData<{ entries?: AppFeedbackEntry[] }>(athleteId, "app:user_feedback")).value?.entries || [];
}

/**
 * Ajoute un avis. La liste est relue en base juste avant (jamais la copie en
 * mémoire de l'écran : une lecture ratée effaçait tout l'historique).
 * Renvoie la nouvelle liste.
 */
export async function appendUserFeedback(athleteId: string, entry: AppFeedbackEntry): Promise<AppFeedbackEntry[]> {
  const entries = [...(await listUserFeedback(athleteId)), entry];
  await writeAppData(athleteId, "app:user_feedback", { entries });
  return entries;
}

// ── Accueil athlète : sections masquées par le coach ─────────────────────────

/** `null` = jamais réglé (l'écran applique ses valeurs par défaut). */
export async function getHomeHiddenSections(athleteId: string): Promise<string[] | null> {
  const row = unwrap(
    await db().from("profiles").select("home_hidden_sections").eq("id", athleteId).single(),
    "Lecture des réglages de l'accueil impossible",
  );
  return (row?.home_hidden_sections as string[] | null) ?? null;
}

export async function setHomeHiddenSections(athleteId: string, hidden: string[]): Promise<void> {
  check(
    await db().from("profiles").update({ home_hidden_sections: hidden }).eq("id", athleteId),
    "Réglage de l'accueil non enregistré",
  );
}

// ── Accueil coach : activité récente ─────────────────────────────────────────

export type ActivityType = "session" | "wellness";

export interface ActivityRow {
  athleteId: string;
  type: ActivityType;
  at: string;
}

/**
 * Derniers événements (un par athlète et par type, le plus récent) :
 * séance validée (`workout_logs.completed_at`) et wellness rempli
 * (`app_data` `asp:wh`, mis à jour par la RPC `wellness_set_day`).
 *
 * Avant : les séances étaient lues dans `asp:sessionlogs`, que plus rien
 * n'écrit (0 ligne en base) → « a enregistré une séance » n'apparaissait jamais.
 */
export async function listRecentActivity(athleteIds: string[], limit: number): Promise<ActivityRow[]> {
  if (athleteIds.length === 0) return [];
  const [logs, well] = await Promise.all([
    db().from("workout_logs").select("athlete_id, completed_at")
      .in("athlete_id", athleteIds)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(limit * 3),
    db().from("app_data").select("athlete_id, updated_at")
      .in("athlete_id", athleteIds)
      .eq("key", "asp:wh")
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  const rows: ActivityRow[] = [
    ...unwrapRows(logs, "Lecture de l'activité impossible")
      .map((r) => ({ athleteId: r.athlete_id, type: "session" as const, at: r.completed_at as string })),
    ...unwrapRows(well, "Lecture de l'activité impossible")
      .map((r) => ({ athleteId: r.athlete_id, type: "wellness" as const, at: r.updated_at as string })),
  ];
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.athleteId}:${r.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}
