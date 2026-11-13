import type { QueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { computeOccurrences } from "@/lib/sessionOccurrence";
import {
  toPermissions, type StaffPermissions, type StaffProfession,
} from "@/features/staff/lib/staffPermissions";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Staff autour des athlètes (`athlete_staff`, `staff_invitations`, RPC
 * `staff_*`) et lectures de l'espace professionnel (/staff).
 *
 * Droits : la base fait foi. Les triggers refusent toute modification de grille
 * qui ne vient pas du coach principal (staff_core.sql) ; côté pro, la RLS
 * (`staff_can`) filtre chaque domaine — un domaine fermé renvoie une liste
 * vide. Les lectures de l'espace pro gardent EXACTEMENT les colonnes d'avant :
 * ne rien exposer de plus au pro.
 *
 * Après toute écriture : `invalidateStaff`.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaffPerson {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  profession: string | null;
}

export interface StaffLink {
  id: string;
  athlete_id: string;
  staff_id: string;
  profession: StaffProfession;
  permissions: StaffPermissions;
  can_edit_coach_content: boolean;
  status: "active" | "revoked";
  added_by: string | null;
  added_by_role: "coach" | "athlete";
  athlete_notified_at: string | null;
  coach_notified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  staff: StaffPerson | null;
}

export interface StaffInvitation {
  id: string;
  athlete_id: string;
  profession: StaffProfession;
  permissions: StaffPermissions;
  can_edit_coach_content: boolean;
  invited_by: string;
  invited_by_role: "coach" | "athlete";
  token: string;
  expires_at: string;
  created_at: string;
}

export interface StaffInvitationPreview {
  athlete_name: string;
  coach_name: string | null;
  inviter_name: string | null;
  invited_by_role: "coach" | "athlete";
  profession: StaffProfession;
  status: "valid" | "used" | "expired";
  /** Droits de l'invitation (absents tant que la migration 20261113200000 n'est pas en prod). */
  permissions?: StaffPermissions | null;
  expires_at?: string | null;
}

/** Lien actif du pro connecté vers un athlète (colonnes lues par le pro). */
export interface MyStaffLinkRow {
  id: string;
  athlete_id: string;
  profession: StaffProfession;
  permissions: StaffPermissions;
  can_edit_coach_content: boolean;
  created_at: string;
}

/**
 * Profils des athlètes suivis, filtrés côté base par domaine (RPC
 * staff_athlete_profiles) : nom et coach toujours, le reste seulement si le
 * domaine est ouvert et que l'athlète a donné son accord staff.
 */
export type StaffAthleteProfile = Database["public"]["Functions"]["staff_athlete_profiles"]["Returns"][number];

export interface StaffWorkoutLog {
  id: string;
  scheduled_date: string;
  session_name: string;
  status: string;
  rpe_score: number | null;
  duration_s: number | null;
  notes: string | null;
  run_distance_km: number | null;
}

export interface StaffPlanItem {
  id: string;
  kind: "saison" | "macro" | "cycle" | "competition";
  name: string;
  start: string;
  end: string | null;
  detail: string | null;
}

export interface StaffWeeklyRetour {
  id: string;
  week_start: string;
  comment: string;
  athlete_reaction: string | null;
}

// ── Clés React Query ─────────────────────────────────────────────────────────
// Mêmes valeurs que `QK.staff*` et les anciennes clés en dur : `useConsent` et
// `invalidateWorkouts` (préfixe "staff") restent branchés dessus.

export const staffKeys = {
  all: ["staff"] as const,
  athlete: (athleteId: string) => ["staff", "athlete", athleteId] as const,
  invitations: (athleteId: string) => ["staff", "invitations", athleteId] as const,
  mine: (userId: string) => ["staff", "mine", userId] as const,
  invitation: (token: string) => ["staff", "invitation", token] as const,
  consent: (athleteId: string) => ["staff", "consent", athleteId] as const,
  logs: (athleteId: string) => ["staff", "logs", athleteId] as const,
  planning: (athleteId: string) => ["staff", "planning", athleteId] as const,
  retours: (athleteId: string) => ["staff", "retours", athleteId] as const,
  athleteProfile: (athleteId: string | undefined) => ["staff", "athlete-profile", athleteId] as const,
  occurrences: (athleteId: string) => ["staff", "occurrences", athleteId] as const,
};

/** Tout le staff (liens, invitations, vues pro) : un lien change ce que voit le pro partout. */
export function invalidateStaff(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: staffKeys.all });
}

// ── Coach / athlète : liens et invitations ───────────────────────────────────

type LinkRow = Omit<StaffLink, "permissions"> & { permissions: unknown };

/** Liens staff d'un athlète (actifs d'abord). */
export async function listAthleteStaff(athleteId: string): Promise<StaffLink[]> {
  const rows = unwrapRows(
    await db().from("athlete_staff")
      .select("*, staff:profiles!athlete_staff_staff_id_fkey(id, full_name, first_name, last_name, profession)")
      .eq("athlete_id", athleteId)
      .order("status", { ascending: true })
      .order("created_at", { ascending: true }),
    "Lecture du staff impossible",
  ) as unknown as LinkRow[];
  return rows.map((r) => ({ ...r, permissions: toPermissions(r.permissions) }));
}

/** Invitations en attente (non utilisées, non expirées) pour un athlète. */
export async function listStaffInvitations(athleteId: string, now = new Date()): Promise<StaffInvitation[]> {
  const rows = unwrapRows(
    await db().from("staff_invitations")
      .select("id, athlete_id, profession, permissions, can_edit_coach_content, invited_by, invited_by_role, token, expires_at, created_at")
      .eq("athlete_id", athleteId)
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false }),
    "Lecture des invitations impossible",
  ) as unknown as (Omit<StaffInvitation, "permissions"> & { permissions: unknown })[];
  return rows.map((r) => ({ ...r, permissions: toPermissions(r.permissions) }));
}

/** Accord de l'athlète au partage de ses données avec son staff (`staff_sharing`). */
export async function staffSharingConsented(athleteId: string): Promise<boolean> {
  return !!unwrap(
    await db().rpc("staff_sharing_consented", { athlete_uuid: athleteId }),
    "Lecture de l'accord staff impossible",
  );
}

/** Crée une invitation ; renvoie son jeton. */
export async function createStaffInvitation(input: {
  athleteId: string;
  profession: StaffProfession;
  permissions?: StaffPermissions;
  canEditCoachContent?: boolean;
}): Promise<string> {
  const { data: auth } = await db().auth.getUser();
  if (!auth.user) throw new Error("Non connecté");
  const row = unwrap(
    await db().from("staff_invitations").insert({
      athlete_id: input.athleteId,
      profession: input.profession,
      // Ignorés par la base si c'est l'athlète qui invite (grille par défaut).
      permissions: input.permissions ?? {},
      can_edit_coach_content: !!input.canEditCoachContent,
      invited_by: auth.user.id,
      invited_by_role: "coach", // recalculé par le trigger
    }).select("token").single(),
    "Création de l'invitation impossible",
  );
  return row!.token;
}

export async function cancelStaffInvitation(id: string): Promise<void> {
  check(await db().from("staff_invitations").delete().eq("id", id), "Annulation de l'invitation impossible");
}

/** Coach principal : met à jour la grille d'un lien. */
export async function updateStaffLink(id: string, p: { permissions?: StaffPermissions; canEditCoachContent?: boolean }): Promise<void> {
  const patch: { permissions?: StaffPermissions; can_edit_coach_content?: boolean } = {};
  if (p.permissions) patch.permissions = p.permissions;
  if (p.canEditCoachContent !== undefined) patch.can_edit_coach_content = p.canEditCoachContent;
  check(await db().from("athlete_staff").update(patch as never).eq("id", id), "Enregistrement des droits impossible");
}

/** Coach, athlète ou le pro lui-même : retire l'accès (effet immédiat). */
export async function revokeStaffLink(id: string): Promise<void> {
  check(await db().from("athlete_staff").update({ status: "revoked" }).eq("id", id), "Retrait de l'accès impossible");
}

/** Coach : copie la grille de ce lien sur tous ses athlètes suivis par ce pro ; renvoie le nombre d'athlètes. */
export async function applyStaffToAll(linkId: string): Promise<number> {
  const n = unwrap(await db().rpc("staff_apply_to_all", { p_link_id: linkId }), "Application des droits impossible");
  return (n as number | null) ?? 0;
}

/** Accusé de lecture (athlète : ajouts et changements de droits ; coach : ajouts par l'athlète). */
export async function markStaffSeen(ids: string[], as: "athlete" | "coach", now = new Date()): Promise<void> {
  if (ids.length === 0) return;
  const at = now.toISOString();
  const patch = as === "athlete" ? { athlete_notified_at: at } : { coach_notified_at: at };
  check(await db().from("athlete_staff").update(patch).in("id", ids), "Accusé de lecture non enregistré");
}

// ── Invitation (côté pro) ────────────────────────────────────────────────────

/** Lecture publique d'une invitation par son jeton (avant connexion). */
export async function getStaffInvitationPreview(token: string): Promise<StaffInvitationPreview | null> {
  const rows = unwrapRows(
    await db().rpc("get_staff_invitation", { p_token: token }),
    "Lecture de l'invitation impossible",
  );
  const row = rows[0] as unknown as (Omit<StaffInvitationPreview, "permissions"> & { permissions?: unknown }) | undefined;
  if (!row) return null;
  return { ...row, permissions: row.permissions == null ? null : toPermissions(row.permissions) };
}

/** Accepte une invitation ; renvoie l'id de l'athlète. Message de refus de la base tel quel. */
export async function acceptStaffInvitation(token: string): Promise<string> {
  const { data, error } = await db().rpc("accept_staff_invitation", { p_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Retire une invitation en attente par son jeton (coach-athlète qui ouvre sa propre invitation). */
export async function deleteOwnStaffInvitation(token: string, athleteId: string): Promise<void> {
  check(
    await db().from("staff_invitations").delete().eq("token", token).eq("athlete_id", athleteId),
    "Retrait de l'invitation impossible",
  );
}

// ── Espace pro ───────────────────────────────────────────────────────────────

/** Liens actifs du pro connecté. */
export async function listMyStaffLinks(staffId: string): Promise<MyStaffLinkRow[]> {
  const rows = unwrapRows(
    await db().from("athlete_staff")
      .select("id, athlete_id, profession, permissions, can_edit_coach_content, created_at")
      .eq("staff_id", staffId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    "Lecture de tes athlètes impossible",
  ) as unknown as (Omit<MyStaffLinkRow, "permissions"> & { permissions: unknown })[];
  return rows.map((r) => ({ ...r, permissions: toPermissions(r.permissions) }));
}

/** Le pro n'a pas de lecture directe de la ligne `profiles` de l'athlète : RPC filtrée. */
export async function listStaffAthleteProfiles(): Promise<StaffAthleteProfile[]> {
  return unwrapRows(await db().rpc("staff_athlete_profiles"), "Lecture des athlètes suivis impossible");
}

export async function listStaffWorkoutLogs(athleteId: string, today: string): Promise<StaffWorkoutLog[]> {
  const rows = unwrapRows(
    await db().from("workout_logs")
      .select("id, scheduled_date, session_name, status, rpe_score, duration_s, notes, run_distance_km")
      .eq("athlete_id", athleteId)
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: false })
      .limit(60),
    "Lecture des séances impossible",
  );
  return rows as unknown as StaffWorkoutLog[];
}

export async function listStaffPlanning(athleteId: string): Promise<StaffPlanItem[]> {
  const [seasons, macros, cycles, comps] = await Promise.all([
    db().from("seasons").select("id, name, start_date, end_date").eq("athlete_id", athleteId),
    db().from("macrocycles").select("id, name, start_date, end_date, objective").eq("athlete_id", athleteId),
    db().from("cycles").select("id, name, start_date, end_date, objective").eq("athlete_id", athleteId),
    db().from("competitions").select("id, name, date, location, priority, type").eq("athlete_id", athleteId),
  ]);
  const what = "Lecture du planning impossible";
  const items: StaffPlanItem[] = [
    ...unwrapRows(seasons, what).map((s) => ({ id: s.id, kind: "saison" as const, name: s.name, start: s.start_date, end: s.end_date, detail: null })),
    ...unwrapRows(macros, what).map((m) => ({ id: m.id, kind: "macro" as const, name: m.name, start: m.start_date, end: m.end_date, detail: m.objective })),
    ...unwrapRows(cycles, what).map((c) => ({ id: c.id, kind: "cycle" as const, name: c.name, start: c.start_date, end: c.end_date, detail: c.objective })),
    ...unwrapRows(comps, what).map((c) => ({
      id: c.id, kind: "competition" as const, name: c.name, start: c.date, end: null,
      detail: [c.priority, c.type, c.location].filter(Boolean).join(" · ") || null,
    })),
  ];
  return items.sort((a, b) => b.start.localeCompare(a.start));
}

export async function listStaffWeeklyRetours(athleteId: string): Promise<StaffWeeklyRetour[]> {
  const rows = unwrapRows(
    await db().from("weekly_retours")
      .select("id, week_start, comment, athlete_reaction")
      .eq("athlete_id", athleteId)
      .order("week_start", { ascending: false })
      .limit(20),
    "Lecture des retours impossible",
  );
  return rows as unknown as StaffWeeklyRetour[];
}

/** Rang (1-based) de chaque workout_log dans sa séance, tous cycles confondus. */
export async function getStaffOccurrences(athleteId: string): Promise<Map<string, number>> {
  const rows = unwrapRows(
    await db().from("workout_logs")
      .select("id, session_id, scheduled_date, status")
      .eq("athlete_id", athleteId)
      .neq("status", "skipped")
      .limit(2000),
    "Lecture des séances impossible",
  );
  return computeOccurrences(rows);
}
