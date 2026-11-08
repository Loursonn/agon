import type { QueryClient, Query } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import { expandIntervals, computeTotals } from "@/lib/energy";
import type {
  AssignmentStatus,
  BlockLogs,
  CreateAssignmentInput,
  CreateEnergySessionInput,
  EnergyGroup,
  EnergySessionAssignmentRow,
  EnergySessionRow,
  EnergyStep,
} from "@/types/energy";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Séances énergie : bibliothèque du coach (`energy_sessions`) et séances
 * programmées chez un athlète (`energy_session_assignments`).
 *
 * - Lectures : lèvent en cas d'erreur, jamais de liste vide par défaut.
 * - Validation / réouverture / RPE de l'athlète : RPC atomiques
 *   (migration 20261109130000_energy_rpcs.sql) — une séance disparue ou
 *   interdite LÈVE au lieu d'afficher « Séance validée ! » sans rien écrire.
 * - Après toute écriture : `invalidateEnergy`, et rien d'autre.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type EnergyActivityType = "course" | "velo" | "rameur" | "natation" | "autre";

/** Séance programmée, telle que lue en base (numeric convertis, jour ISO). */
export type EnergyAssignment = EnergySessionAssignmentRow & {
  activity_type?: EnergyActivityType | null;
  distance_km?: number | null;
};

/**
 * Jointure de la séance de la bibliothèque :
 * - `full` : toute la séance (exécution, aperçu) ;
 * - `summary` : ce que lisent les Retours / le calendrier (nom, type, totaux, intervalles) ;
 * - `none` : pas de jointure.
 */
export type EnergySessionJoin = "full" | "summary" | "none";

const SESSION_SUMMARY_COLS = "id, name, session_kind, total_duration_s, total_distance_m, intervals";
const assignmentSelect = (join: EnergySessionJoin) =>
  join === "none" ? "*" : join === "summary" ? `*, energy_sessions(${SESSION_SUMMARY_COLS})` : "*, energy_sessions(*)";

type RawRow = Record<string, unknown>;

/** `numeric` arrive en chaîne via PostgREST. */
const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toEnergyAssignment(r: RawRow): EnergyAssignment {
  const out: RawRow = {
    ...r,
    scheduled_date: String(r.scheduled_date ?? "").slice(0, 10),
    status: ((r.status as AssignmentStatus) ?? "planned"),
    rpe_score: toNum(r.rpe_score),
    actual_duration_min: toNum(r.actual_duration_min),
    distance_km: toNum(r.distance_km),
    block_logs: (r.block_logs && typeof r.block_logs === "object" && !Array.isArray(r.block_logs)
      ? r.block_logs
      : {}) as BlockLogs,
  };
  if (out.energy_sessions == null) delete out.energy_sessions;
  return out as unknown as EnergyAssignment;
}

// ── Clés React Query ──────────────────────────────────────────────────────────

export interface DateRange {
  from: IsoDay;
  to: IsoDay;
}

export interface EnergyAssignmentListParams {
  athleteIds: string[];
  from?: IsoDay | null;
  to?: IsoDay | null;
  statuses?: AssignmentStatus[];
  energySessionId?: string;
  join?: EnergySessionJoin;
  ascending?: boolean;
}

export interface EnergySessionFilters {
  session_kind?: string;
  is_verified?: boolean;
  created_by?: string;
  athlete_id?: string | null;
  search?: string;
  /** Exclut les copies propres à un athlète (banques). */
  bank_only?: boolean;
}

const sorted = (ids: readonly string[]) => [...ids].sort();

/**
 * Préfixe `['energy', athleteId | coachId, …]` ; `_many` pour les vues
 * multi-athlètes. La bibliothèque est rangée sous l'utilisateur qui la lit
 * (coach, ou athlète qui ouvre une séance qu'on lui a programmée).
 */
export const energyKeys = {
  all: ["energy"] as const,
  owner: (id: string) => ["energy", id] as const,
  assignments: (aid: string, range?: DateRange | null) =>
    range ? (["energy", aid, "assignments", range] as const) : (["energy", aid, "assignments"] as const),
  list: (p: EnergyAssignmentListParams) =>
    p.athleteIds.length === 1
      ? (["energy", p.athleteIds[0], "list", { ...p, athleteIds: undefined }] as const)
      : (["energy", "_many", sorted(p.athleteIds), "list", { ...p, athleteIds: undefined }] as const),
  library: (ownerId: string, filters?: EnergySessionFilters) => ["energy", ownerId, "library", filters ?? {}] as const,
  libraryAll: (ownerId: string) => ["energy", ownerId, "library"] as const,
  session: (ownerId: string, id: string) => ["energy", ownerId, "session", id] as const,
};

// ── Lectures : séances programmées ────────────────────────────────────────────

export async function listEnergyAssignments(p: EnergyAssignmentListParams): Promise<EnergyAssignment[]> {
  if (p.athleteIds.length === 0) return [];
  let q = db().from("energy_session_assignments").select(assignmentSelect(p.join ?? "full"));
  q = p.athleteIds.length === 1 ? q.eq("athlete_id", p.athleteIds[0]) : q.in("athlete_id", p.athleteIds);
  if (p.energySessionId) q = q.eq("energy_session_id", p.energySessionId);
  if (p.from) q = q.gte("scheduled_date", p.from);
  if (p.to) q = q.lte("scheduled_date", p.to);
  if (p.statuses?.length) q = q.in("status", p.statuses);
  const rows = unwrapRows<RawRow>(
    (await q.order("scheduled_date", { ascending: p.ascending !== false })) as never,
    "Lecture des séances énergie impossible",
  );
  return rows.map(toEnergyAssignment);
}

/** Séances énergie d'un athlète (avec la séance complète), sur une plage ou toutes. */
export function listAthleteEnergyAssignments(athleteId: string, range?: DateRange | null): Promise<EnergyAssignment[]> {
  return listEnergyAssignments({ athleteIds: [athleteId], from: range?.from, to: range?.to, join: "full" });
}

export async function getEnergyAssignment(id: string): Promise<EnergyAssignment | null> {
  const row = unwrap<RawRow>(
    (await db().from("energy_session_assignments").select(assignmentSelect("full")).eq("id", id).maybeSingle()) as never,
    "Lecture de la séance énergie impossible",
  );
  return row ? toEnergyAssignment(row) : null;
}

// ── Écritures : planification (coach) ─────────────────────────────────────────

export async function assignEnergySession(input: CreateAssignmentInput): Promise<EnergyAssignment> {
  const row = unwrap<RawRow>(
    (await db().from("energy_session_assignments").insert(input as never).select(assignmentSelect("full")).single()) as never,
    "Programmation de la séance impossible",
  );
  return toEnergyAssignment(row!);
}

/** Champs de planification modifiables directement (pas la saisie de l'athlète). */
export type EnergyAssignmentPatch = Partial<
  Pick<EnergySessionAssignmentRow, "scheduled_date" | "status" | "notes" | "microcycle_id" | "coach_id" | "energy_session_id">
> & Partial<Pick<EnergySessionAssignmentRow, "block_logs" | "rpe_score">>;

/** Lève si la séance n'existe plus (ou n'est plus visible) : jamais de faux succès. */
export async function updateEnergyAssignment(id: string, patch: EnergyAssignmentPatch): Promise<EnergyAssignment> {
  const row = unwrap<RawRow>(
    (await db().from("energy_session_assignments")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id).select(assignmentSelect("full")).maybeSingle()) as never,
    "Mise à jour de la séance énergie impossible",
  );
  if (!row) throw new ApiError("Mise à jour de la séance énergie impossible", { message: "séance introuvable", code: ENERGY_NOT_FOUND });
  return toEnergyAssignment(row);
}

export function moveEnergyAssignment(id: string, date: IsoDay): Promise<EnergyAssignment> {
  return updateEnergyAssignment(id, { scheduled_date: date });
}

/** Suppression définitive (une séance déjà supprimée n'est pas une erreur). */
export async function deleteEnergyAssignment(id: string): Promise<void> {
  check(await db().from("energy_session_assignments").delete().eq("id", id), "Suppression de la séance énergie impossible");
}

// ── Écritures : saisie de l'athlète (RPC) ─────────────────────────────────────

type RpcRes = { data: unknown; error: { message: string; code?: string } | null };
type RpcDb = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcRes> };
const rpc = async (fn: string, args: Record<string, unknown>) => (db() as unknown as RpcDb).rpc(fn, args);

async function rpcAssignment(fn: string, args: Record<string, unknown>, what: string): Promise<EnergyAssignment> {
  const row = unwrap<RawRow>((await rpc(fn, args)) as never, what);
  if (!row || !row.id) throw new ApiError(what, { message: "réponse vide", code: ENERGY_NOT_FOUND });
  return toEnergyAssignment(row);
}

/** Code SQL levé par les RPC quand la séance n'existe plus. */
export const ENERGY_NOT_FOUND = "P0002";
export const isEnergyNotFound = (e: unknown) => e instanceof ApiError && e.code === ENERGY_NOT_FOUND;

export interface CompleteEnergyInput {
  block_logs?: BlockLogs | null;
  notes?: string | null;
  actual_duration_min?: number | null;
  activity_url?: string | null;
  /** Activité réellement faite ; donnée avec `distance_km` (distance comptée si « course »). */
  activity_type?: EnergyActivityType | null;
  distance_km?: number | null;
  rpe_score?: number | null;
}

/**
 * Valide la séance : statut + blocs cochés + durée / lien / activité / RPE en
 * une écriture. Les blocs sont fusionnés par bloc (un 2ᵉ appareil qui valide
 * sans saisie n'efface pas les blocs cochés) ; un champ absent garde sa
 * valeur. Rejouer l'appel ne change rien (idempotent).
 */
export function completeEnergyAssignment(id: string, input: CompleteEnergyInput = {}): Promise<EnergyAssignment> {
  const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v);
  return rpcAssignment("complete_energy_assignment", {
    p_assignment: id,
    p_block_logs: input.block_logs ?? null,
    p_notes: blank(input.notes),
    p_duration_min: input.actual_duration_min ?? null,
    p_activity_url: blank(input.activity_url),
    p_activity_type: input.activity_type ?? null,
    p_distance_km: input.distance_km ?? null,
    p_rpe: input.rpe_score ?? null,
  }, "Validation de la séance impossible");
}

/**
 * Annule la validation : séance de nouveau prévue, blocs, RPE, durée,
 * activité et distance effacés (la distance ne compte plus dans le volume de
 * course). Les notes et le lien d'activité sont gardés.
 */
export function reopenEnergyAssignment(id: string): Promise<EnergyAssignment> {
  return rpcAssignment("reopen_energy_assignment", { p_assignment: id }, "Annulation de la validation impossible");
}

/** RPE Foster 1-10 ; `null` = retirer. */
export function setEnergyRpe(id: string, rpe: number | null): Promise<EnergyAssignment> {
  return rpcAssignment("set_energy_rpe", { p_assignment: id, p_rpe: rpe }, "Enregistrement du RPE impossible");
}

// ── Bibliothèque (energy_sessions) ────────────────────────────────────────────

/** Durée / distance totales d'une liste d'étapes (calcul pur de `@/lib/energy`). */
export function energyStepsTotals(steps: EnergyStep[]) {
  const root: EnergyGroup = { type: "group", id: "__root__", role: "open", repeat: 1, children: steps };
  return computeTotals(expandIntervals(root));
}

export async function listEnergySessions(filters?: EnergySessionFilters): Promise<EnergySessionRow[]> {
  let q = db().from("energy_sessions").select("*").is("archived_at", null);
  if (filters?.session_kind) q = q.eq("session_kind", filters.session_kind);
  if (filters?.is_verified !== undefined) q = q.eq("is_verified", filters.is_verified);
  if (filters?.created_by) q = q.eq("created_by", filters.created_by);
  if (filters?.athlete_id !== undefined) {
    q = filters.athlete_id === null ? q.is("athlete_id", null) : q.eq("athlete_id", filters.athlete_id);
  }
  if (filters?.bank_only) q = q.is("athlete_id", null);
  if (filters?.search) q = q.ilike("name", `%${filters.search}%`);
  return unwrapRows<EnergySessionRow>(
    (await q.order("created_at", { ascending: false })) as never,
    "Lecture des séances énergie impossible",
  );
}

/** `null` si la séance n'existe pas ou n'est pas visible. */
export async function getEnergySession(id: string): Promise<EnergySessionRow | null> {
  return unwrap<EnergySessionRow>(
    (await db().from("energy_sessions").select("*").eq("id", id).maybeSingle()) as never,
    "Lecture de la séance énergie impossible",
  );
}

export async function createEnergySession(input: CreateEnergySessionInput): Promise<EnergySessionRow> {
  const totals = energyStepsTotals(input.intervals ?? []);
  return unwrap<EnergySessionRow>(
    (await db().from("energy_sessions")
      .insert({ ...input, total_duration_s: totals.durationS, total_distance_m: totals.distanceM } as never)
      .select().single()) as never,
    "Création de la séance impossible",
  )!;
}

async function patchEnergySession(id: string, patch: Record<string, unknown>, what: string): Promise<EnergySessionRow> {
  const row = unwrap<EnergySessionRow>(
    (await db().from("energy_sessions")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id).select().maybeSingle()) as never,
    what,
  );
  if (!row) throw new ApiError(what, { message: "séance introuvable", code: ENERGY_NOT_FOUND });
  return row;
}

/** Recalcule les totaux quand les intervalles changent. */
export function updateEnergySession(id: string, patch: Partial<EnergySessionRow>): Promise<EnergySessionRow> {
  const { id: _id, ...rest } = patch;
  const totals = rest.intervals ? energyStepsTotals(rest.intervals) : null;
  return patchEnergySession(id, {
    ...rest,
    ...(totals ? { total_duration_s: totals.durationS, total_distance_m: totals.distanceM } : {}),
  }, "Mise à jour de la séance impossible");
}

export function setEnergySessionPublished(id: string, publish: boolean): Promise<EnergySessionRow> {
  return patchEnergySession(id, { is_public: publish }, "Publication de la séance impossible");
}

export function setEnergySessionVerified(id: string, verify: boolean): Promise<EnergySessionRow> {
  return patchEnergySession(id, {
    is_verified: verify,
    verified_at: verify ? new Date().toISOString() : null,
  }, "Vérification de la séance impossible");
}

export type DeleteEnergySessionResult = "deleted" | "archived" | "not_found";

/**
 * Jamais programmée → supprimée ; déjà programmée chez un athlète → archivée
 * (masquée des banques, les séances programmées et leur historique restent).
 */
export async function deleteEnergySession(id: string): Promise<DeleteEnergySessionResult> {
  return unwrap<DeleteEnergySessionResult>(
    (await rpc("delete_energy_session", { p_session_id: id })) as never,
    "Suppression de la séance impossible",
  ) ?? "not_found";
}

/** Image d'une séance (bucket `test-media`, dossier du coach) ; renvoie l'URL publique. */
export async function uploadEnergySessionImage(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/sessions/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bucket = db().storage.from("test-media");
  check(await bucket.upload(path, file, { contentType: file.type }), "Envoi de l'image impossible");
  return bucket.getPublicUrl(path).data.publicUrl;
}

/**
 * Vidéo YouTube d'un exercice de la banque, posée depuis l'éditeur d'étape.
 * (À déplacer dans un futur `src/api/exercises.ts`.)
 */
export async function saveExerciseYoutubeId(exerciseId: string, youtubeId: string): Promise<void> {
  check(
    await db().from("exercises").update({ youtube_id: youtubeId } as never).eq("id", exerciseId),
    "Enregistrement de la vidéo de l'exercice impossible",
  );
}

// ── Invalidation : LA seule liste ─────────────────────────────────────────────

function keyHas(key: unknown, needle: string): boolean {
  if (key === needle) return true;
  if (Array.isArray(key)) return key.some((k) => keyHas(k, needle));
  return false;
}

/**
 * Préfixes des requêtes qui lisent `energy_session_assignments` (ou la séance
 * jointe) pour un athlète — son id apparaît dans la clé. À compléter ici, et
 * nulle part ailleurs, quand un écran lit les séances énergie.
 */
const ATHLETE_SCOPED = new Set<string>([
  "energy",                   // ce module
  "energy-assignments",       // ancienne clé (QK.energyAssignments)
  "cal",                      // calendrier unifié / planning coach / vue staff
  "calendar-events", "week-schedule",
  "activePlan",               // plan actif (accueil / programme athlète)
  "weeklyRetours", "monthlyRetours",
  "micro-stats",              // RPE moyen du microcycle (planning)
  "runningVolume",            // volume de course (distance des séances énergie)
  "athlete-trend-sessions",   // tendances athlète
  "coach-api-draft-target",   // propositions de l'assistant (état courant)
]);

/**
 * Rafraîchit tout ce qui affiche les séances énergie d'un athlète après une
 * écriture. Sans `athleteId` (bibliothèque modifiée : nom, intervalles…),
 * invalide la bibliothèque et toutes les séances énergie de tous les athlètes.
 */
export function invalidateEnergy(qc: QueryClient, athleteId?: string | null): Promise<void> {
  return qc.invalidateQueries({
    predicate: (q: Query) => {
      const k = q.queryKey;
      const head = k[0];
      if (typeof head !== "string") return false;
      if (head === "energy-sessions") return !athleteId; // ancienne clé (QK.energySessions)
      if (!ATHLETE_SCOPED.has(head)) return false;
      return !athleteId || keyHas(k, athleteId);
    },
  });
}
