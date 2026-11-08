import type { QueryClient } from "@tanstack/react-query";
import { normalizeBookingUrl } from "@/lib/booking";
import { generateApiKey, keyPrefix, sha256Hex } from "@/lib/coachApiKey";
import type { DraftKind, DraftOp } from "@shared/coachApiOps.ts";
import { check, db, unwrap, unwrapRows } from "./client";
import { readAppData } from "./appData";

/**
 * Vie du coach : double coach (co-coach), rattachement d'athlètes, liste des
 * coachs (admin), lien de réservation, clés et propositions de l'assistant IA
 * (`coach-api`), tests à venir de l'accueil.
 *
 * Droits : la base fait foi (`is_coach_of` couvre référent ET co-coach ; RPC
 * `add_co_coach` / `remove_co_coach` / `unlink_athlete` ; admin via
 * `current_user_is_admin`). Ce module n'ajoute ni ne retire aucun droit.
 *
 * Lectures : lèvent en cas d'erreur. Clés : mêmes valeurs que les anciennes
 * (`QK.*`, src/lib/queryKeys.ts) pour que les écrans pas encore migrés
 * restent synchronisés.
 */

// ── Clés React Query ─────────────────────────────────────────────────────────

export const coachKeys = {
  athleteCoaches: (athleteId: string) => ["athlete-coaches", athleteId] as const,
  list: ["coaches_list"] as const,
  booking: (coachId: string) => ["coach-booking", coachId] as const,
  apiKeys: (coachId: string) => ["coach-api-keys", coachId] as const,
  apiDrafts: (athleteId: string) => ["coach-api-drafts", athleteId] as const,
  apiHistory: (athleteId: string) => ["coach-api-drafts", athleteId, "history"] as const,
  draftTarget: (athleteId: string | undefined, key: string) => ["coach-api-draft-target", athleteId, key] as const,
  /** Accueil coach : préfixe "coachDashboard", rafraîchi par `invalidateWorkouts`. */
  dashboardToday: (coachId: string, day: string) => ["coachDashboard", "today", coachId, day] as const,
  dashboardMissed: (coachId: string, day: string) => ["coachDashboard", "missed", coachId, day] as const,
  dashboardUpcomingTests: (coachId: string, day: string) => ["coachDashboard", "upcomingTests", coachId, day] as const,
};

/** Référent et co-coach d'un athlète. */
export function invalidateAthleteCoaches(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: coachKeys.athleteCoaches(athleteId) });
}

export function invalidateCoachesList(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: coachKeys.list });
}

export function invalidateCoachApiKeys(qc: QueryClient, coachId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: coachKeys.apiKeys(coachId) });
}

/** Propositions en attente, historique et empreinte de la cible. */
export function invalidateCoachApiDrafts(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: coachKeys.apiDrafts(athleteId) }),
    qc.invalidateQueries({ queryKey: ["coach-api-draft-target", athleteId] }),
  ]).then(() => undefined);
}

// ── Double coach ─────────────────────────────────────────────────────────────

export interface CoachPerson {
  id: string;
  full_name: string;
}

export interface AthleteCoaches {
  referent: CoachPerson | null;
  coCoach: (CoachPerson & { added_by_role: "coach" | "athlete"; created_at: string }) | null;
}

/** Messages lisibles pour les refus des RPC (RAISE côté base). */
function cleanError(e: { message?: string } | null): Error {
  const m = e?.message ?? "Erreur";
  return new Error(m.replace(/^.*?ERROR:\s*/, ""));
}

/** Coach référent (profiles.coach_id) + co-coach éventuel (athlete_co_coaches, 1 max). */
export async function getAthleteCoaches(athleteId: string): Promise<AthleteCoaches> {
  const [athleteRes, linkRes] = await Promise.all([
    db().from("profiles").select("coach_id").eq("id", athleteId).maybeSingle(),
    db().from("athlete_co_coaches").select("co_coach_id, added_by_role, created_at").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const athlete = unwrap(athleteRes, "Lecture du coach impossible");
  const link = unwrap(linkRes, "Lecture du co-coach impossible");
  const referentId = athlete?.coach_id ?? null;
  const coId = link?.co_coach_id ?? null;
  const ids = [referentId, coId].filter((x): x is string => !!x);
  const names = new Map<string, string>();
  if (ids.length) {
    const rows = unwrapRows(
      await db().from("profiles").select("id, full_name").in("id", ids),
      "Lecture des noms des coachs impossible",
    );
    for (const p of rows) names.set(p.id, p.full_name ?? "Coach");
  }
  return {
    referent: referentId ? { id: referentId, full_name: names.get(referentId) ?? "Coach" } : null,
    coCoach: coId && link
      ? {
        id: coId,
        full_name: names.get(coId) ?? "Coach",
        added_by_role: link.added_by_role as "coach" | "athlete",
        created_at: link.created_at,
      }
      : null,
  };
}

/** Ajout par le coach référent ou par l'athlète, avec le code coach du 2ᵉ coach. */
export async function addCoCoach(athleteId: string, coachCode: string): Promise<{ co_coach_id: string; full_name: string }> {
  const { data, error } = await db().rpc("add_co_coach", { p_athlete: athleteId, p_coach_code: coachCode.trim() });
  if (error) throw cleanError(error);
  return data as unknown as { co_coach_id: string; full_name: string };
}

/** Retrait : coach référent, athlète, ou le co-coach lui-même. */
export async function removeCoCoach(athleteId: string): Promise<void> {
  const { error } = await db().rpc("remove_co_coach", { p_athlete: athleteId });
  if (error) throw cleanError(error);
}

/**
 * Coach-athlète suivi par un autre coach : se déclare co-coach de lui-même.
 * Utilisé quand il ouvre sa propre invitation staff (il ne peut pas être son
 * propre staff) : l'invitation en attente est retirée au passage.
 */
export async function addSelfAsCoCoach(userId: string, ownCoachCode: string, staffInviteToken?: string): Promise<void> {
  // Déjà co-coach de soi-même (2e clic, ancienne invitation) : rien à refaire.
  const { data: link, error: e1 } = await db().from("athlete_co_coaches")
    .select("co_coach_id").eq("athlete_id", userId).maybeSingle();
  if (e1) throw cleanError(e1);
  if (link?.co_coach_id !== userId) await addCoCoach(userId, ownCoachCode);
  if (staffInviteToken) {
    // Nettoyage : le co-coaching est fait, une invitation restante est inoffensive.
    const res = await db().from("staff_invitations").delete().eq("token", staffInviteToken).eq("athlete_id", userId);
    if (res.error) console.warn("[co-coach] invitation staff non retirée", res.error.message);
  }
}

/** Coach référent : détache un athlète (RPC, seule voie pour changer profiles.coach_id). */
export async function unlinkAthlete(athleteId: string): Promise<void> {
  check(await db().rpc("unlink_athlete", { athlete_id: athleteId }), "Retrait de l'athlète impossible");
}

// ── Liste des coachs (admin) ─────────────────────────────────────────────────

export interface CoachRow {
  id: string;
  full_name: string;
  coach_code: string | null;
  created_at: string;
  is_admin: boolean;
  is_certified_coach: boolean;
  athlete_count: number;
}

export async function listCoaches(): Promise<CoachRow[]> {
  return unwrapRows(await db().rpc("get_coaches_list"), "Lecture des coachs impossible") as unknown as CoachRow[];
}

export async function setCoachCertified(targetId: string, certified: boolean): Promise<void> {
  check(
    await db().rpc("toggle_coach_certification", { p_target_id: targetId, p_certified: certified }),
    "Certification non enregistrée",
  );
}

// ── Lien de réservation ──────────────────────────────────────────────────────

/**
 * Lien de réservation du point hebdo du coach de l'athlète. Lecture autorisée
 * par la policy `profiles_select_coaches`. L'URL est re-validée : une ligne
 * a pu être écrite avant la contrainte SQL, et elle finit dans un iframe.
 */
export async function getCoachBooking(coachId: string): Promise<{ bookingUrl: string | null; coachName: string }> {
  const row = unwrap(
    await db().from("profiles").select("full_name, first_name, last_name, booking_url").eq("id", coachId).maybeSingle(),
    "Lecture du lien de réservation impossible",
  );
  if (!row) return { bookingUrl: null, coachName: "Coach" };
  return {
    bookingUrl: normalizeBookingUrl(row.booking_url),
    coachName: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.full_name || "Coach",
  };
}

/** `null` retire le lien (la contrainte SQL refuse ''). */
export async function setBookingUrl(coachId: string, url: string | null): Promise<void> {
  check(await db().from("profiles").update({ booking_url: url }).eq("id", coachId), "Lien de réservation non enregistré");
}

// ── Accueil coach : tests à venir ────────────────────────────────────────────

export interface UpcomingTestSession {
  id: string;
  athlete_id: string;
  title: string;
  date: string;
}

export async function listUpcomingTestSessions(athleteIds: string[], from: string): Promise<UpcomingTestSession[]> {
  if (athleteIds.length === 0) return [];
  const rows = unwrapRows(
    await db().from("test_sessions").select("id, athlete_id, title, date")
      .in("athlete_id", athleteIds)
      .gte("date", from)
      .eq("completed", false)
      .order("date", { ascending: true }),
    "Lecture des tests à venir impossible",
  );
  return rows as UpcomingTestSession[];
}

// ── Assistant IA : clés API ──────────────────────────────────────────────────

export interface CoachApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Clés API du coach connecté (RLS), révoquées comprises (le journal y renvoie). */
export async function listCoachApiKeys(): Promise<CoachApiKey[]> {
  return unwrapRows(
    await db().from("coach_api_keys").select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false }),
    "Lecture des clés impossible",
  );
}

/** Crée une clé et la renvoie en clair : seule fois où elle existe hors de la mémoire de l'appelant. */
export async function createCoachApiKey(coachId: string, name: string): Promise<string> {
  const key = generateApiKey();
  check(
    await db().from("coach_api_keys").insert({
      coach_id: coachId,
      name: name.trim().slice(0, 60),
      key_prefix: keyPrefix(key),
      key_hash: await sha256Hex(key),
    }),
    "Création de la clé impossible",
  );
  return key;
}

export async function revokeCoachApiKey(id: string): Promise<void> {
  check(
    await db().from("coach_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null),
    "Révocation de la clé impossible",
  );
}

// ── Assistant IA : propositions ──────────────────────────────────────────────

export interface CoachApiDraft {
  id: string;
  kind: DraftKind;
  title: string;
  body: string;
  ops: DraftOp[];
  base_hash: string | null;
  status: "pending" | "applied" | "rejected" | "undone";
  applied_via: "app" | "api" | null;
  created_at: string;
  decided_at: string | null;
  undone_at: string | null;
}

const DRAFT_COLUMNS = "id, kind, title, body, ops, base_hash, status, applied_via, created_at, decided_at, undone_at";

/** Propositions en attente de l'assistant IA du coach, pour un athlète. */
export async function listPendingDrafts(athleteId: string): Promise<CoachApiDraft[]> {
  const rows = unwrapRows(
    await db().from("coach_api_drafts").select(DRAFT_COLUMNS)
      .eq("athlete_id", athleteId).eq("status", "pending")
      .order("created_at", { ascending: false }),
    "Lecture des propositions impossible",
  );
  return rows as unknown as CoachApiDraft[];
}

/** Propositions appliquées ou annulées les 30 derniers jours (hors axes de travail). */
export async function listDraftHistory(athleteId: string, now = Date.now()): Promise<CoachApiDraft[]> {
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const rows = unwrapRows(
    await db().from("coach_api_drafts").select(DRAFT_COLUMNS)
      .eq("athlete_id", athleteId)
      .in("status", ["applied", "undone"])
      .neq("kind", "axe")
      .gte("decided_at", since)
      .order("decided_at", { ascending: false })
      .limit(30),
    "Lecture de l'historique impossible",
  );
  return rows as unknown as CoachApiDraft[];
}

/**
 * Empreinte actuelle de la clé visée, calculée comme l'Edge Function (SHA-256
 * du JSON renvoyé par la base). Différente de `base_hash` : la cible a changé.
 */
export async function draftTargetHash(athleteId: string, key: "asp:prog" | "asp:goals"): Promise<string> {
  const { value } = await readAppData<unknown>(athleteId, key);
  return sha256Hex(JSON.stringify(value ?? null));
}

export class DraftAlreadyDecided extends Error {}

/** Écarte une proposition en attente ; déjà décidée ailleurs → `DraftAlreadyDecided`. */
export async function rejectDraft(id: string): Promise<void> {
  const rows = unwrapRows(
    await db().from("coach_api_drafts")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .select("id"),
    "La proposition n'a pas pu être écartée",
  );
  if (rows.length === 0) throw new DraftAlreadyDecided();
}

/** Erreur renvoyée par l'Edge Function : un code stable et une phrase. */
export class CoachApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Appelle `coach-api` avec la session du coach. Appliquer et annuler se font
 * côté serveur : c'est lui qui tient le journal qui permet de revenir en arrière.
 */
export async function callCoachApi<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await db().functions.invoke<T>(`coach-api/${path}`, {
    method: "POST",
    body: (body ?? {}) as Record<string, unknown>,
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; message?: string } | null = null;
    try {
      payload = ctx ? await ctx.json() : null;
    } catch {
      payload = null;
    }
    throw new CoachApiError(payload?.error ?? "erreur", payload?.message ?? "La requête a échoué.");
  }
  return data as T;
}
