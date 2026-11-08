import type { QueryClient } from "@tanstack/react-query";
import type { CreateSpecificBlockInput, PhysicalQuality, SpecificBlockRow, SpecificSport } from "@/types/specific";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Banque spécifique : blocs du coach (`specific_blocks`, privés par coach,
 * RLS) et référentiels sports (`specific_sports`) / qualités physiques
 * (`physical_qualities`) — défauts globaux (`coach_id` NULL) + ceux du coach.
 */

export type { CreateSpecificBlockInput, PhysicalQuality, SpecificBlockRow, SpecificSport };

export const specificKeys = {
  all: ["specific"] as const,
  blocks: ["specific", "blocks"] as const,
  sports: ["specific", "sports"] as const,
  qualities: ["specific", "qualities"] as const,
};

export function invalidateSpecific(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: specificKeys.all });
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function one<T>(row: unknown, what: string): T {
  if (!row) throw new ApiError(what, { message: "aucune ligne" });
  return row as T;
}

// ── Blocs ────────────────────────────────────────────────────────────────────

/** Blocs du coach connecté, les plus récents d'abord. */
export async function listSpecificBlocks(): Promise<SpecificBlockRow[]> {
  return unwrapRows(
    await db().from("specific_blocks").select("*").order("created_at", { ascending: false }),
    "Banque de blocs non chargée",
  ) as unknown as SpecificBlockRow[];
}

export async function createSpecificBlock(input: CreateSpecificBlockInput): Promise<SpecificBlockRow> {
  const what = "Enregistrement du bloc impossible";
  return one(unwrap(await db().from("specific_blocks").insert(input as never).select().single(), what), what);
}

export async function updateSpecificBlock({ id, ...patch }: Partial<SpecificBlockRow> & { id: string }): Promise<SpecificBlockRow> {
  const what = "Mise à jour du bloc impossible";
  return one(
    unwrap(
      await db()
        .from("specific_blocks")
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .select()
        .single(),
      what,
    ),
    what,
  );
}

export async function deleteSpecificBlock(id: string): Promise<void> {
  check(await db().from("specific_blocks").delete().eq("id", id), "Suppression du bloc impossible");
}

// ── Sports ───────────────────────────────────────────────────────────────────

/** Sports par défaut d'abord, puis par nom. */
export async function listSpecificSports(): Promise<SpecificSport[]> {
  return unwrapRows(
    await db().from("specific_sports").select("*").order("is_default", { ascending: false }).order("name"),
    "Sports non chargés",
  ) as unknown as SpecificSport[];
}

export async function createSport(p: { name: string; coachId: string; color?: string }): Promise<SpecificSport> {
  const what = "Ajout du sport impossible";
  return one(
    unwrap(
      await db()
        .from("specific_sports")
        .insert({ name: p.name.trim(), slug: slugify(p.name), coach_id: p.coachId, color: p.color ?? null })
        .select()
        .single(),
      what,
    ),
    what,
  );
}

export async function deleteSport(id: string): Promise<void> {
  check(await db().from("specific_sports").delete().eq("id", id), "Suppression du sport impossible");
}

// ── Qualités physiques ───────────────────────────────────────────────────────

export async function listPhysicalQualities(): Promise<PhysicalQuality[]> {
  return unwrapRows(
    await db().from("physical_qualities").select("*").order("is_default", { ascending: false }).order("name"),
    "Qualités physiques non chargées",
  ) as unknown as PhysicalQuality[];
}

export async function createQuality(p: { name: string; coachId: string }): Promise<PhysicalQuality> {
  const what = "Ajout de la qualité impossible";
  return one(
    unwrap(
      await db()
        .from("physical_qualities")
        .insert({ name: p.name.trim(), slug: slugify(p.name), coach_id: p.coachId })
        .select()
        .single(),
      what,
    ),
    what,
  );
}

export async function deleteQuality(id: string): Promise<void> {
  check(await db().from("physical_qualities").delete().eq("id", id), "Suppression de la qualité impossible");
}
