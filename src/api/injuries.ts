import type { QueryClient } from "@tanstack/react-query";
import type { DeclaredBy, InjuryStageEvent, MedicalEntry, MedicalEntryInput, RecoveryStage } from "@/features/shared/types/medical";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Blessures sportives (`medical_entries`) : zone, type, mécanisme, contexte,
 * douleur, impact sur l'entraînement, jours d'arrêt, date de retour, statut et
 * notes de l'athlète.
 *
 * Rien de ce qui relève des soins n'est écrit ici (décision du 2026-11-13, hors
 * hébergement de données de santé) : ni diagnostic, ni traitement, ni « vu
 * par », ni antécédents, ni documents médicaux. Colonnes, tables et bucket
 * correspondants supprimés de la base le 2026-11-14 (P44).
 *
 * Les droits sont ceux de la RLS : l'athlète, ses coachs (`is_coach_of`, co-coach
 * compris) et le staff autorisé sur le domaine « medical ». Ce module ne les
 * élargit pas ; il pose seulement `declared_by` / `created_by` à la création.
 *
 * Ce que l'assistant IA du coach a le droit d'en lire : `@shared/domain/injuries`.
 */

export const medicalKeys = {
  all: (athleteId: string) => ["medical", athleteId] as const,
  entries: (athleteId: string) => ["medical", athleteId, "entries"] as const,
  followups: (athleteId: string, scope: string) => ["medical", athleteId, "followups", scope] as const,
  stages: (athleteId: string) => ["medical", athleteId, "stages"] as const,
};

async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getUser();
  return data.user?.id ?? null;
}

/** Blessures d'un athlète, en cours d'abord puis la plus récente. */
export async function listEntries(athleteId: string): Promise<MedicalEntry[]> {
  const rows = unwrapRows(
    await db().from("medical_entries").select("*")
      .eq("athlete_id", athleteId)
      .order("status", { ascending: false }) // en_cours avant gueri
      .order("date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    "Lecture des blessures impossible",
  );
  return rows as unknown as MedicalEntry[];
}

/**
 * Crée (sans `id`) ou modifie une blessure.
 * `declared_by` n'est pas un choix de formulaire : on sait qui saisit. Posé à la
 * création seulement, pour qu'une relecture du coach ne réécrive pas l'origine
 * d'une déclaration faite par l'athlète.
 */
export async function saveEntry(
  athleteId: string,
  { id, input }: { id?: string; input: MedicalEntryInput },
  opts: { asStaff?: boolean } = {},
): Promise<MedicalEntry> {
  const me = await currentUserId();
  const declared_by: DeclaredBy = me === athleteId ? "athlete" : opts.asStaff ? "staff" : "coach";
  const payload = { ...input, kind: "blessure" as const };
  const q = id
    ? db().from("medical_entries").update(payload).eq("id", id)
    : db().from("medical_entries").insert({ ...payload, athlete_id: athleteId, declared_by, created_by: me });
  const row = unwrap(await q.select("*").single(), "Enregistrement de la blessure impossible");
  return row as unknown as MedicalEntry;
}

export async function deleteEntry(entry: Pick<MedicalEntry, "id">): Promise<void> {
  check(await db().from("medical_entries").delete().eq("id", entry.id), "Suppression de la blessure impossible");
}

// ── Étape de résolution (15/11) ──────────────────────────────────────────────

/**
 * Change l'étape d'une blessure. La base met le statut d'accord (Guéri ⇔
 * guéri) et date l'étape dans `injury_stage_history` (déclencheurs).
 */
export async function setInjuryStage(entryId: string, stage: RecoveryStage): Promise<MedicalEntry> {
  const row = unwrap(
    await db().from("medical_entries").update({ recovery_stage: stage }).eq("id", entryId).select("*").single(),
    "Changement d'étape impossible",
  );
  return row as unknown as MedicalEntry;
}

/** Étapes datées des blessures d'un athlète, de la plus ancienne à la plus récente. */
export async function listStageHistory(athleteId: string): Promise<InjuryStageEvent[]> {
  const rows = unwrapRows(
    await db().from("injury_stage_history").select("id, entry_id, stage, changed_at, changed_by")
      .eq("athlete_id", athleteId).order("changed_at"),
    "Lecture des étapes de blessure impossible",
  );
  return rows as unknown as InjuryStageEvent[];
}

// ── Douleur de séance → blessure déclarée (15/11) ─────────────────────────────

/**
 * Suivi d'une blessure (`injury_followups`) : la douleur d'une fin de séance,
 * sur une blessure créée par cette séance ou déjà en cours sur la même zone.
 */
export interface InjuryFollowup {
  id: string;
  entry_id: string;
  athlete_id: string;
  /** Jour de la séance, "YYYY-MM-DD". */
  day: string;
  pain_level: number;
  note: string | null;
  workout_log_id: string | null;
  energy_assignment_id: string | null;
  /** Zone de la blessure suivie (libellé de la carte douleur, ou saisi à la main). */
  zone: string | null;
  /** Nom de la séance d'origine (null si elle a été supprimée). */
  session_name: string | null;
  created_at: string;
}

const FOLLOWUP_COLS =
  "id, entry_id, athlete_id, day, pain_level, note, workout_log_id, energy_assignment_id, created_at, "
  + "medical_entries(zone), workout_logs(session_name), energy_session_assignments(energy_sessions(name))";

type One<T> = T | T[] | null | undefined;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function toFollowup(r: Record<string, unknown>): InjuryFollowup {
  const entry = one(r.medical_entries as One<{ zone: string | null }>);
  const wl = one(r.workout_logs as One<{ session_name: string | null }>);
  const ea = one(r.energy_session_assignments as One<{ energy_sessions: One<{ name: string | null }> }>);
  const energyName = ea ? one(ea.energy_sessions)?.name ?? "Séance d'énergie" : null;
  return {
    id: r.id as string,
    entry_id: r.entry_id as string,
    athlete_id: r.athlete_id as string,
    day: String(r.day).slice(0, 10),
    pain_level: Number(r.pain_level),
    note: (r.note as string | null) ?? null,
    workout_log_id: (r.workout_log_id as string | null) ?? null,
    energy_assignment_id: (r.energy_assignment_id as string | null) ?? null,
    zone: entry?.zone ?? null,
    session_name: wl?.session_name ?? energyName,
    created_at: r.created_at as string,
  };
}

/** Suivis d'un athlète : jours `from` → `to` inclus, ou ceux de séances muscu données. */
export async function listInjuryFollowups(
  athleteId: string,
  opts: { from?: string; to?: string; workoutLogIds?: readonly string[] } = {},
): Promise<InjuryFollowup[]> {
  if (opts.workoutLogIds && opts.workoutLogIds.length === 0) return [];
  let q = db().from("injury_followups").select(FOLLOWUP_COLS).eq("athlete_id", athleteId);
  if (opts.from) q = q.gte("day", opts.from);
  if (opts.to) q = q.lte("day", opts.to);
  if (opts.workoutLogIds) q = q.in("workout_log_id", [...opts.workoutLogIds]);
  const rows = unwrapRows(await q.order("day").order("created_at"), "Lecture des suivis de blessure impossible");
  return (rows as unknown as Record<string, unknown>[]).map(toFollowup);
}

export type SessionPainSource = { workoutLogId: string } | { energyAssignmentId: string };

export interface SessionPainResult {
  zone: string;
  entry_id: string;
  /** true : nouvelle blessure ; false : suivi d'une blessure déjà en cours. */
  created: boolean;
}

/**
 * « Oui, douleur » en fin de séance (RPC atomique `report_session_pain`) :
 * par zone, la blessure en cours de cette zone est suivie, sinon une blessure
 * déclarée est créée (« Douleur en séance », en cours, datée du jour de la
 * séance). Rejouable sans doublon. `levels` : libellés de zone → note 1-10.
 */
export async function reportSessionPain(
  source: SessionPainSource,
  levels: Record<string, number>,
  note: string | null,
): Promise<SessionPainResult[]> {
  const res = await db().rpc("report_session_pain", {
    p_workout_log: "workoutLogId" in source ? source.workoutLogId : undefined,
    p_energy_assignment: "energyAssignmentId" in source ? source.energyAssignmentId : undefined,
    p_levels: levels,
    p_note: note ?? undefined,
  });
  return (unwrap(res, "Enregistrement de la douleur impossible") as unknown as SessionPainResult[] | null) ?? [];
}

/** Séance introuvable (retirée par le coach entre-temps). */
export function isSessionPainNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P0002";
}

/** Blessures et suivis d'un athlète (badges « blessure active », Retours, profil, weekly review). */
export function invalidateMedical(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: medicalKeys.all(athleteId) });
}
