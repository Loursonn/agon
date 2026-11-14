import type { QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import type { Competition, CompetitionInsert } from "@/types/planning";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { CompetitionLinks } from "@shared/domain/competitions";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Compétitions d'un athlète (`competitions`) : liste, prochaine compétition,
 * compétitions à venir des athlètes d'un coach, création / modification /
 * suppression.
 *
 * - Lectures : lèvent en cas d'erreur (jamais `[]` silencieux).
 * - Après toute écriture : `invalidateCompetitions(qc, athleteId)`, qui
 *   rafraîchit aussi le planning (calendrier, frise, plan actif) — une
 *   compétition est un jour du planning.
 * - Le commentaire de l'athlète (`athlete_comment`) est écrit par les Retours
 *   (hors de ce module pour l'instant).
 * - Annulée (`cancelled_at`) : reste dans `listCompetitions` (affichée barrée),
 *   sort de la prochaine compétition, des compétitions à venir et des retours
 *   (`@shared/domain/competitions`).
 */

export type { Competition, CompetitionInsert };

export interface UpcomingCompetitionRow extends Competition {
  /** Jours jusqu'à la compétition (0 = aujourd'hui). */
  daysUntil: number;
}

// ── Clés React Query ─────────────────────────────────────────────────────────

const sorted = (ids: readonly string[]) => [...ids].sort().join(",");

export const competitionKeys = {
  athlete: (athleteId: string) => ["competitions", athleteId] as const,
  list: (athleteId: string) => ["competitions", athleteId, "list"] as const,
  next: (athleteId: string) => ["competitions", athleteId, "next"] as const,
  /** Ce qui est rattaché à une compétition (confirmation de suppression). */
  links: (athleteId: string, id: string) => ["competitions", athleteId, "links", id] as const,
  /** Vue multi-athlètes (accueil coach) ; invalidée par toute écriture. */
  upcoming: (athleteIds: readonly string[], from: IsoDay, to: IsoDay) =>
    ["competitions", "_many", sorted(athleteIds), "upcoming", from, to] as const,
};

/**
 * Tout ce qui affiche les compétitions d'un athlète : ses listes, sa
 * prochaine compétition, les vues multi-athlètes du coach, le calendrier
 * unifié, la frise du planning et le plan actif (semaine athlète).
 */
export function invalidateCompetitions(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: competitionKeys.athlete(athleteId) }),
    qc.invalidateQueries({ queryKey: ["competitions", "_many"] }),
    qc.invalidateQueries({ queryKey: QK.cal(athleteId) }),
    qc.invalidateQueries({ queryKey: ["timeline-data", athleteId] }),
    qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) }),
    // Anciennes clés (écrans pas encore migrés)
    qc.invalidateQueries({ queryKey: ["athlete_next_competition", athleteId] }),
    qc.invalidateQueries({ queryKey: ["coach_competitions"] }),
  ]);
}

// ── Utilitaire pur ───────────────────────────────────────────────────────────

/**
 * Jours entre aujourd'hui et une date "YYYY-MM-DD" (jamais négatif).
 * Calcul en jours calendaires locaux : une compétition demain = 1, quelle que
 * soit l'heure.
 */
export function daysUntil(date: string, today: IsoDay = localIsoDay()): number {
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  if (!Number.isFinite(d) || !Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((d - t) / 86_400_000));
}

// ── Lectures ─────────────────────────────────────────────────────────────────

/** Toutes les compétitions d'un athlète (toutes saisons), annulées comprises, par date croissante. */
export async function listCompetitions(athleteId: string): Promise<Competition[]> {
  const rows = unwrapRows(
    await db().from("competitions").select("*").eq("athlete_id", athleteId).order("date", { ascending: true }),
    "Compétitions non chargées",
  );
  return rows as unknown as Competition[];
}

/** Prochaine compétition maintenue (aujourd'hui compris), ou `null`. */
export async function getNextCompetition(
  athleteId: string,
  today: IsoDay = localIsoDay(),
): Promise<UpcomingCompetitionRow | null> {
  const row = unwrap(
    await db()
      .from("competitions")
      .select("*")
      .eq("athlete_id", athleteId)
      .gte("date", today)
      .is("cancelled_at", null)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    "Prochaine compétition non chargée",
  );
  if (!row) return null;
  const comp = row as unknown as Competition;
  return { ...comp, daysUntil: daysUntil(comp.date, today) };
}

/** Compétitions maintenues de plusieurs athlètes entre deux jours inclus, par date croissante. */
export async function listUpcomingCompetitions(
  athleteIds: readonly string[],
  from: IsoDay,
  to: IsoDay,
): Promise<UpcomingCompetitionRow[]> {
  if (athleteIds.length === 0) return [];
  const rows = unwrapRows(
    await db()
      .from("competitions")
      .select("*")
      .in("athlete_id", [...athleteIds])
      .gte("date", from)
      .lte("date", to)
      .is("cancelled_at", null)
      .order("date", { ascending: true }),
    "Compétitions à venir non chargées",
  );
  return (rows as unknown as Competition[]).map((c) => ({ ...c, daysUntil: daysUntil(c.date, from) }));
}

// ── Écritures ────────────────────────────────────────────────────────────────

export async function createCompetition(comp: CompetitionInsert): Promise<Competition> {
  const row = unwrap(
    await db().from("competitions").insert(comp as never).select().single(),
    "Compétition non enregistrée",
  );
  if (!row) throw new Error("Compétition non enregistrée");
  return row as unknown as Competition;
}

export type CompetitionPatch = Partial<Omit<Competition, "id" | "created_at" | "athlete_id">>;

export async function updateCompetition(id: string, updates: CompetitionPatch): Promise<Competition> {
  const row = unwrap(
    await db().from("competitions").update(updates as never).eq("id", id).select().single(),
    "Compétition non modifiée",
  );
  if (!row) throw new Error("Compétition non modifiée");
  return row as unknown as Competition;
}

/**
 * Annule (`true`) ou rétablit (`false`) une compétition. La date et l'auteur
 * de l'annulation sont posés par le serveur (trigger `competitions_stamp_cancel`).
 */
export async function setCompetitionCancelled(id: string, cancelled: boolean): Promise<Competition> {
  const row = unwrap(
    await db().from("competitions")
      .update({ cancelled_at: cancelled ? new Date().toISOString() : null } as never)
      .eq("id", id).select().single(),
    cancelled ? "Compétition non annulée" : "Compétition non rétablie",
  );
  if (!row) throw new Error(cancelled ? "Compétition non annulée" : "Compétition non rétablie");
  return row as unknown as Competition;
}

/** Ce qui est rattaché à une compétition (avant suppression) : résultats et plans HYROX, bilan. */
export async function getCompetitionLinks(id: string): Promise<CompetitionLinks> {
  const [results, plans, comp] = await Promise.all([
    db().from("hyrox_results").select("id").eq("competition_id", id),
    db().from("hyrox_race_plans").select("id").eq("competition_id", id),
    db().from("competitions").select("athlete_comment").eq("id", id).maybeSingle(),
  ]);
  const r = unwrapRows(results, "Résultats liés non chargés");
  const p = unwrapRows(plans, "Plans liés non chargés");
  const c = unwrap(comp, "Compétition non chargée") as { athlete_comment?: string | null } | null;
  return { results: r.length, plans: p.length, hasComment: !!c?.athlete_comment?.trim() };
}

/** Supprime la compétition. Résultats et plans HYROX restent, détachés (`ON DELETE SET NULL`). */
export async function deleteCompetition(id: string): Promise<void> {
  check(await db().from("competitions").delete().eq("id", id), "Compétition non supprimée");
}

/** Bilan de l'athlète sur une compétition (Retours, jour de compétition). */
export async function setCompetitionComment(id: string, athleteComment: string): Promise<Competition> {
  const row = unwrap(
    await db().from("competitions").update({ athlete_comment: athleteComment } as never).eq("id", id).select().single(),
    "Bilan non enregistré",
  );
  if (!row) throw new Error("Bilan non enregistré");
  return row as unknown as Competition;
}

/** Compétitions maintenues d'une période (bornes incluses), par date : retours. Lève en cas d'erreur. */
export async function listCompetitionsBetween(athleteId: string, from: string, to: string): Promise<Competition[]> {
  const rows = unwrapRows(
    await db().from("competitions").select("*").eq("athlete_id", athleteId)
      .gte("date", from).lte("date", to).is("cancelled_at", null).order("date", { ascending: true }),
    "Compétitions non chargées",
  );
  return rows as unknown as Competition[];
}
