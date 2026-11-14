import type { QueryClient } from "@tanstack/react-query";
import type { DeclaredBy, MedicalEntry, MedicalEntryInput } from "@/features/shared/types/medical";
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

/** Blessures d'un athlète (badges « blessure active », Retours, profil). */
export function invalidateMedical(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: medicalKeys.entries(athleteId) });
}
