import type { QueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import type { LibraryExercise } from "@/lib/import/yoxx/matchExercise";
import type { BankMuscles } from "@/lib/muscleVolume";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Banque d'exercices (`exercises`) : recherche, bibliothèque complète, vidéos,
 * muscles. Lecture ouverte à tous (RLS) ; un coach crée des exercices
 * « Communauté » (`is_verified = false`), rattachés à lui (`created_by`).
 */

export type { BankMuscles, LibraryExercise };

type ExerciseTable = Database["public"]["Tables"]["exercises"];
export type ExerciseRow = ExerciseTable["Row"];
export type ExerciseInsert = ExerciseTable["Insert"];
export type ExerciseUpdate = ExerciseTable["Update"];

/** Exercice tel que l'athlète le choisit dans la banque (ajout en séance). */
export type AthleteBankExercise = Pick<ExerciseRow, "id" | "name" | "target" | "ex_type" | "youtube_id" | "image_url">;

/** Candidat doublon proposé dans la fusion. */
export type MergeCandidate = Pick<ExerciseRow, "id" | "name" | "target" | "youtube_id">;

/** Filtres de la page « Banque d'exercices » du coach. */
export interface ExerciseBankFilters {
  search?: string;
  /** Un exercice correspond s'il touche UN des muscles (principal, 2ᵉ ou secondaire). */
  muscles?: string[];
  equipment?: string;
  difficulty?: string;
  type?: string;
  /** Page à partir de 0. */
  page: number;
  pageSize: number;
}

export interface ExerciseLite {
  id: string;
  name: string;
  ex_type?: string | null;
  youtube_id?: string | null;
}

/** Préfixe `['exercises', …]` : la banque est commune, sans id de propriétaire. */
export const exerciseKeys = {
  all: ["exercises"] as const,
  library: ["exercises", "library"] as const,
  search: (search: string, type: string) => ["exercises", "search", search, type] as const,
  videos: (idsKey: string) => ["exercises", "videos", idsKey] as const,
  muscles: ["exercises", "muscles"] as const,
};

export function invalidateExercises(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: exerciseKeys.all });
}

// ── Lectures ─────────────────────────────────────────────────────────────────

/** Recherche par nom (contient) et/ou type, triée par nom. */
export async function searchExercises(p: { search?: string; type?: string; limit?: number }): Promise<ExerciseLite[]> {
  let q = db().from("exercises").select("id, name, ex_type, youtube_id").limit(p.limit ?? 10);
  const s = p.search?.trim();
  if (s) q = q.ilike("name", `%${s}%`);
  if (p.type) q = q.eq("ex_type", p.type);
  return unwrapRows(await q.order("name"), "Recherche d'exercices impossible") as ExerciseLite[];
}

/** Toute la bibliothèque (id, nom, vidéo), par pages de 1000 — pour rapprocher des noms écrits. */
export async function getExerciseLibrary(): Promise<LibraryExercise[]> {
  const all: LibraryExercise[] = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrapRows(
      await db().from("exercises").select("id, name, youtube_id").order("name").range(from, from + 999),
      "Bibliothèque d'exercices non chargée",
    ) as LibraryExercise[];
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

/** Une page de la banque (toutes colonnes) + le nombre total d'exercices filtrés. */
export async function getExerciseBankPage(f: ExerciseBankFilters): Promise<{ rows: ExerciseRow[]; total: number }> {
  let q = db()
    .from("exercises")
    .select("*", { count: "exact" })
    .order("name")
    .range(f.page * f.pageSize, (f.page + 1) * f.pageSize - 1);
  if (f.search) q = q.ilike("name", `%${f.search}%`);
  if (f.muscles?.length) {
    q = q.or(f.muscles.flatMap((m) => [`target.eq.${m}`, `target_2.eq.${m}`, `secondary.cs.{${m}}`]).join(","));
  }
  if (f.equipment) q = q.eq("equipment", f.equipment);
  if (f.difficulty) q = q.eq("difficulty", f.difficulty);
  if (f.type) q = q.eq("ex_type", f.type);
  const res = await q;
  const rows = unwrapRows(res, "Banque d'exercices non chargée");
  return { rows, total: res.count ?? 0 };
}

/** Doublons possibles d'un exercice (nom contient), lui-même exclu, 8 au plus. */
export async function searchMergeCandidates(search: string, excludeId: string): Promise<MergeCandidate[]> {
  return unwrapRows(
    await db().from("exercises").select("id, name, target, youtube_id").ilike("name", `%${search}%`).neq("id", excludeId).limit(8),
    "Recherche de doublons impossible",
  );
}

/** Toute la banque pour l'ajout d'un exercice par l'athlète, par pages de 1000, triée par nom. */
export async function getAthleteBankExercises(): Promise<AthleteBankExercise[]> {
  const all: AthleteBankExercise[] = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrapRows(
      await db()
        .from("exercises")
        .select("id, name, target, ex_type, youtube_id, image_url")
        .order("name")
        .range(from, from + 999),
      "Banque d'exercices non chargée",
    );
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

/** exercise_id → youtube_id, pour les exercices demandés qui ont une vidéo. */
export async function getExerciseVideos(exerciseIds: string[]): Promise<Record<string, string>> {
  if (exerciseIds.length === 0) return {};
  const rows = unwrapRows(
    await db().from("exercises").select("id, youtube_id").in("id", exerciseIds).not("youtube_id", "is", null),
    "Vidéos d'exercices non chargées",
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.youtube_id as string]));
}

/** Muscles (2 principaux max + secondaires) de chaque exercice de la banque, par id. */
export async function getExerciseBankMuscles(): Promise<Map<string, BankMuscles>> {
  const rows = unwrapRows(
    await db().from("exercises").select("id, target, target_2, secondary"),
    "Muscles des exercices non chargés",
  );
  const map = new Map<string, BankMuscles>();
  for (const e of rows) {
    map.set(e.id, {
      primary: [e.target, e.target_2].filter((m): m is string => !!m),
      secondary: e.secondary ?? [],
    });
  }
  return map;
}

// ── Écritures ────────────────────────────────────────────────────────────────

/** Crée un exercice « Communauté » (non vérifié), rattaché à son créateur. */
export async function createExercise(p: { name: string; createdBy?: string | null }): Promise<ExerciseLite> {
  const name = p.name.trim();
  if (!name) throw new ApiError("Création de l'exercice impossible", { message: "nom manquant" });
  const row = unwrap(
    await db()
      .from("exercises")
      .insert({ name, is_verified: false, ...(p.createdBy ? { created_by: p.createdBy } : {}) })
      .select("id, name, ex_type, youtube_id")
      .single(),
    "Création de l'exercice impossible",
  );
  if (!row) throw new ApiError("Création de l'exercice impossible", { message: "aucune ligne" });
  return row as ExerciseLite;
}

/** Crée plusieurs exercices (non vérifiés, rattachés au coach). */
export async function createExercises(names: string[], coachId: string): Promise<LibraryExercise[]> {
  if (names.length === 0) return [];
  return unwrapRows(
    await db()
      .from("exercises")
      .insert(names.map((name) => ({ name, created_by: coachId, is_verified: false })))
      .select("id, name, youtube_id"),
    "Création des exercices impossible",
  ) as LibraryExercise[];
}

/** Noms d'exercices de la banque, par id. Lève en cas d'erreur. */
export async function getExerciseNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = unwrapRows<{ id: string; name: string }>(
    (await db().from("exercises").select("id, name").in("id", [...ids])) as never,
    "Noms d'exercices non chargés",
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Crée un exercice complet depuis la fiche du coach (champs fournis tels quels). */
export async function createBankExercise(row: ExerciseInsert): Promise<void> {
  check(await db().from("exercises").insert(row), "Création de l'exercice impossible");
}

/**
 * Équivalent Garmin choisi par le coach (`null` : revenir à la proposition
 * automatique faite depuis le nom). Le couple catégorie / exercice est écrit
 * en une fois : la base refuse l'un sans l'autre.
 */
export async function setGarminEquivalent(id: string, pick: { category: string; name: string } | null): Promise<void> {
  await updateExercise(id, { garmin_category: pick?.category ?? null, garmin_exercise: pick?.name ?? null });
}

/** Modifie un exercice (caractéristiques, vidéo, type, validation…). */
export async function updateExercise(id: string, patch: ExerciseUpdate): Promise<void> {
  check(await db().from("exercises").update(patch).eq("id", id), "Modification de l'exercice impossible");
}

export async function deleteExercise(id: string): Promise<void> {
  check(await db().from("exercises").delete().eq("id", id), "Suppression de l'exercice impossible");
}

type MergeFields = Pick<ExerciseRow, "youtube_id" | "image_url" | "instructions" | "tips" | "garmin_category" | "garmin_exercise">;
const MERGE_FIELDS = ["youtube_id", "image_url", "instructions", "tips"] as const;

/**
 * Ce que l'exercice conservé récupère du doublon : seulement les champs qu'il
 * n'a pas. L'équivalent Garmin passe en couple (jamais l'un sans l'autre).
 */
export function mergePatch(keep: Partial<MergeFields>, dup: Partial<MergeFields>): ExerciseUpdate {
  const patch: ExerciseUpdate = {};
  for (const k of MERGE_FIELDS) if (!keep[k] && dup[k]) patch[k] = dup[k];
  if (!keep.garmin_category && dup.garmin_category && dup.garmin_exercise) {
    patch.garmin_category = dup.garmin_category;
    patch.garmin_exercise = dup.garmin_exercise;
  }
  return patch;
}

/**
 * Fusionne un doublon dans l'exercice conservé : le conservé récupère la vidéo,
 * l'image, les consignes et les conseils qui lui manquent, puis le doublon est
 * supprimé. Deux écritures successives ; si la première échoue, rien n'est
 * supprimé.
 */
export async function mergeExercises(keepId: string, deleteId: string): Promise<void> {
  if (keepId === deleteId) throw new ApiError("Fusion impossible", { message: "même exercice" });
  const rows = unwrapRows(
    await db().from("exercises").select("id, youtube_id, image_url, instructions, tips, garmin_category, garmin_exercise").in("id", [keepId, deleteId]),
    "Fusion impossible",
  );
  const keep = rows.find((r) => r.id === keepId);
  if (!keep) throw new ApiError("Fusion impossible", { message: "exercice conservé introuvable" });
  const dup = rows.find((r) => r.id === deleteId);
  const patch = dup ? mergePatch(keep, dup) : {};
  if (Object.keys(patch).length) await updateExercise(keepId, patch);
  await deleteExercise(deleteId);
}

// ── Ancien stockage (app_data) ───────────────────────────────────────────────

/** Ancien stockage des exercices par cycle (`app_data`, clés `asp:exos::<cycle>`). */
export async function listLegacyCycleExercises(athleteId: string): Promise<{ key: string; value: unknown }[]> {
  return unwrapRows<{ key: string; value: unknown }>(
    (await db().from("app_data").select("key, value").eq("athlete_id", athleteId).like("key", "asp:exos::%")) as never,
    "Lecture des anciens exercices impossible",
  );
}
