import type { QueryClient } from "@tanstack/react-query";
import { check, db, unwrap, unwrapRows } from "./client";
import { localIsoDay } from "@shared/domain/dates";
import {
  estimateOneRm,
  newRecordsFromSets,
  parseRecordLinks,
  recordRefOf,
  resolveRecordRef,
  type RecordCandidate,
  type RecordLinks,
  type RecordRefSource,
  type RecordSet,
} from "@shared/domain/performance";

/**
 * Records / 1RM (`exercise_pr_logs`).
 *
 * - Un record est rangé sous une référence (`exercise_ref`) : le `rm_ref` de
 *   l'exercice s'il en a un (plusieurs exercices partagent un record), sinon
 *   son nom — `recordRefOf`.
 * - 1RM saisi par le coach OU par l'athlète : ici (source « manual »).
 *   Calculé depuis une séance : `computeRecordsFromSession` (source « computed »).
 * - Une formule (Epley, 1 rép. = la charge) et un arrondi (0,5 kg) partout :
 *   `@shared/domain/performance`.
 */

export interface PRLog {
  id: string;
  athlete_id: string;
  exercise_ref: string;
  kg: number;
  date: string;
  notes?: string | null;
  source: "manual" | "computed";
  source_reps?: number | null;
  source_kg?: number | null;
  created_at: string;
}

// ── Clés React Query ─────────────────────────────────────────────────────────

export const recordKeys = {
  all: (athleteId: string) => ["records", athleteId] as const,
  list: (athleteId: string) => ["records", athleteId, "list"] as const,
  links: (athleteId: string) => ["records", athleteId, "links"] as const,
};

export function invalidateRecords(qc: QueryClient, athleteId: string): Promise<unknown> {
  return qc.invalidateQueries({ queryKey: recordKeys.all(athleteId) });
}

// ── Lectures ─────────────────────────────────────────────────────────────────

function toRecord(r: Record<string, unknown>): PRLog {
  return {
    ...(r as unknown as PRLog),
    kg: Number(r.kg),
    source: r.source === "computed" ? "computed" : "manual",
    source_kg: r.source_kg == null ? null : Number(r.source_kg),
    source_reps: r.source_reps == null ? null : Number(r.source_reps),
  };
}

/** Tous les records d'un athlète, le plus récent d'abord. */
export async function getRecords(athleteId: string): Promise<PRLog[]> {
  const rows = unwrapRows(
    await db().from("exercise_pr_logs").select("*").eq("athlete_id", athleteId).order("date", { ascending: false }),
    "Records non chargés",
  );
  return rows.map((r) => toRecord(r as unknown as Record<string, unknown>));
}

/** Records par référence, et le meilleur de chacune (plus lourd ; à égalité, le plus récent). */
export function groupRecords(records: PRLog[]): { byRef: Record<string, PRLog[]>; bestByRef: Record<string, PRLog> } {
  const byRef: Record<string, PRLog[]> = {};
  for (const r of records) (byRef[r.exercise_ref] ??= []).push(r);
  const bestByRef: Record<string, PRLog> = {};
  for (const [ref, list] of Object.entries(byRef)) {
    bestByRef[ref] = list.reduce((m, p) => (p.kg > m.kg || (p.kg === m.kg && p.date > m.date) ? p : m), list[0]);
  }
  return { byRef, bestByRef };
}

export async function getBestByRef(athleteId: string): Promise<Record<string, PRLog>> {
  return groupRecords(await getRecords(athleteId)).bestByRef;
}

/**
 * Liens « exercice → record » posés par le coach (Profil sportif, `rm_ref`
 * sur les exercices de l'ancien programme `asp:exos`). Lecture ici, calcul
 * partagé (`parseRecordLinks`, aussi utilisé par l'envoi vers la montre).
 */
export type { RecordLinks };

export async function getRecordLinks(athleteId: string): Promise<RecordLinks> {
  const keys = unwrapRows(
    await db().from("app_data").select("key").eq("athlete_id", athleteId),
    "Liens de records non chargés",
  )
    .map((r) => r.key as string)
    .filter((k) => k === "asp:exos" || k.startsWith("asp:exos::"));
  if (keys.length === 0) return {};
  const rows = unwrapRows(
    await db().from("app_data").select("key, value").eq("athlete_id", athleteId).in("key", keys),
    "Liens de records non chargés",
  );
  return parseRecordLinks(rows.map((r) => ({ key: r.key as string, value: r.value })));
}

export { resolveRecordRef };

export { recordRefOf, type RecordRefSource };

// ── Écritures ────────────────────────────────────────────────────────────────

export interface NewRecord {
  athleteId: string;
  /** Référence (rm_ref ou nom de l'exercice). */
  ref: string;
  /** Charge soulevée. */
  kg: number;
  /** Répétitions à cette charge ; > 1 → 1RM estimé (Epley, 0,5 kg). Défaut 1. */
  reps?: number;
  /** "YYYY-MM-DD" ; défaut : aujourd'hui. */
  date?: string;
  notes?: string | null;
  source?: "manual" | "computed";
}

/** Enregistre un record (1RM direct, ou estimé depuis une série de plusieurs reps). */
export async function addRecord(r: NewRecord): Promise<PRLog> {
  const ref = r.ref.trim();
  const reps = r.reps ?? 1;
  const oneRm = estimateOneRm(r.kg, reps);
  if (!ref) throw new Error("Référence d'exercice manquante");
  if (oneRm <= 0) throw new Error("Charge ou répétitions invalides");
  const row = unwrap(
    await db()
      .from("exercise_pr_logs")
      .insert({
        athlete_id: r.athleteId,
        exercise_ref: ref,
        kg: oneRm,
        date: r.date ?? localIsoDay(),
        notes: r.notes?.trim() || null,
        source: r.source ?? "manual",
        source_reps: reps > 1 ? reps : null,
        source_kg: reps > 1 ? r.kg : null,
      })
      .select()
      .single(),
    "Record non enregistré",
  );
  if (!row) throw new Error("Record non enregistré");
  return toRecord(row as unknown as Record<string, unknown>);
}

export async function deleteRecord(id: string): Promise<void> {
  check(await db().from("exercise_pr_logs").delete().eq("id", id), "Suppression du record impossible");
}

/**
 * Records battus pendant une séance : pour chaque référence, la meilleure
 * série (1RM estimé) est enregistrée si elle dépasse le record actuel.
 * À appeler à la validation de la séance (lot 2). Renvoie les nouveaux records.
 *
 * `sets` : séries réalisées, déjà rattachées à leur référence
 * (`resolveRecordRef` / `recordRefOf` de l'exercice).
 */
export async function computeRecordsFromSession(
  athleteId: string,
  sets: RecordSet[],
  opts: { date?: string } = {},
): Promise<RecordCandidate[]> {
  const refs = [...new Set(sets.map((s) => s.ref).filter(Boolean))];
  if (refs.length === 0) return [];
  const existing = unwrapRows(
    await db().from("exercise_pr_logs").select("exercise_ref, kg").eq("athlete_id", athleteId).in("exercise_ref", refs),
    "Records actuels non chargés",
  );
  const currentBest: Record<string, number> = {};
  for (const e of existing) currentBest[e.exercise_ref] = Math.max(currentBest[e.exercise_ref] ?? 0, Number(e.kg));

  const found = newRecordsFromSets(sets, currentBest);
  if (found.length === 0) return [];
  const date = opts.date ?? localIsoDay();
  check(
    await db()
      .from("exercise_pr_logs")
      .insert(
        found.map((c) => ({
          athlete_id: athleteId,
          exercise_ref: c.ref,
          kg: c.kg,
          date,
          source: "computed",
          source_reps: c.sourceReps,
          source_kg: c.sourceKg,
        })),
      ),
    "Records non enregistrés",
  );
  return found;
}

/**
 * Séries de l'ancien stockage (`app_data` `asp:sets`, plus écrit depuis
 * 2026-06), rattachées à leur référence de record — pour le bouton « Sync »
 * du Profil sportif. `exercises` : exercices du programme (`id`, `name`, `rm_ref`…).
 */
export async function getLegacyRecordSets(
  athleteId: string,
  exercises: (RecordRefSource & { id: string })[],
): Promise<RecordSet[]> {
  const row = unwrap(
    await db().from("app_data").select("value").eq("athlete_id", athleteId).eq("key", "asp:sets").maybeSingle(),
    "Historique de séries non chargé",
  );
  const map = (row?.value ?? {}) as Record<string, { done?: boolean; kg?: number; reps?: number }[]>;
  const refById = new Map<string, string>();
  for (const ex of exercises) {
    const ref = recordRefOf(ex);
    if (ref) refById.set(ex.id, ref);
  }
  // Clé "{exerciseId}_{semaine}" ; l'id peut contenir des "_" → l'id le plus long qui correspond.
  const ids = [...refById.keys()].sort((a, b) => b.length - a.length);
  const out: RecordSet[] = [];
  for (const [key, rows] of Object.entries(map)) {
    const id = ids.find((i) => key === i || key.startsWith(i + "_"));
    if (!id || !Array.isArray(rows)) continue;
    const ref = refById.get(id)!;
    for (const s of rows) if (s?.done) out.push({ ref, kg: s.kg, reps: s.reps });
  }
  return out;
}
