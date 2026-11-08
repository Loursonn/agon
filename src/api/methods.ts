import type { QueryClient } from "@tanstack/react-query";
import type { MethodCategory, MethodScope, TrainingMethod } from "@/types/trainingMethods";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Banque de méthodes d'entraînement (`training_methods`) : méthodes
 * officielles Agon + méthodes des coachs (RLS).
 */

export type { MethodCategory, MethodScope, TrainingMethod };

export const methodKeys = {
  all: ["training-methods"] as const,
  list: ["training-methods", "list"] as const,
};

export function invalidateMethods(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: methodKeys.all });
}

function toMethod(r: Record<string, unknown>): TrainingMethod {
  return {
    ...(r as unknown as TrainingMethod),
    // `tags` peut être NULL en base : la recherche par tag plantait.
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  };
}

/** Officielles d'abord, puis par nom. */
export async function listTrainingMethods(): Promise<TrainingMethod[]> {
  const rows = unwrapRows(
    await db().from("training_methods").select("*").order("is_official", { ascending: false }).order("name", { ascending: true }),
    "Méthodes non chargées",
  );
  return rows.map((r) => toMethod(r as unknown as Record<string, unknown>));
}

export interface TrainingMethodFilters {
  scope?: MethodScope;
  category?: MethodCategory;
  is_official?: boolean;
  search?: string;
}

/** Filtre côté client (nom ou tag pour la recherche). */
export function filterTrainingMethods(list: TrainingMethod[], f?: TrainingMethodFilters): TrainingMethod[] {
  let out = list;
  if (f?.scope) out = out.filter((m) => m.scope === f.scope);
  if (f?.category) out = out.filter((m) => m.category === f.category);
  if (f?.is_official !== undefined) out = out.filter((m) => m.is_official === f.is_official);
  if (f?.search) {
    const q = f.search.toLowerCase();
    out = out.filter((m) => m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
  }
  return out;
}

export type CreateTrainingMethodInput = Omit<TrainingMethod, "id" | "created_at" | "updated_at" | "is_official">;

export async function createTrainingMethod(input: CreateTrainingMethodInput): Promise<TrainingMethod> {
  const row = unwrap(
    await db()
      .from("training_methods")
      .insert({
        name: input.name,
        description: input.description ?? null,
        scope: input.scope,
        category: input.category,
        config: input.config as never,
        is_official: false,
        created_by: input.created_by ?? null,
        tags: input.tags,
      })
      .select()
      .single(),
    "Création de la méthode impossible",
  );
  if (!row) throw new ApiError("Création de la méthode impossible", { message: "aucune ligne" });
  return toMethod(row as unknown as Record<string, unknown>);
}

export type UpdateTrainingMethodInput = Partial<Omit<TrainingMethod, "id" | "created_at" | "is_official">> & { id: string };

export async function updateTrainingMethod({ id, ...u }: UpdateTrainingMethodInput): Promise<TrainingMethod> {
  const row = unwrap(
    await db()
      .from("training_methods")
      .update({
        ...(u.name !== undefined && { name: u.name }),
        ...(u.description !== undefined && { description: u.description }),
        ...(u.scope !== undefined && { scope: u.scope }),
        ...(u.category !== undefined && { category: u.category }),
        ...(u.config !== undefined && { config: u.config as never }),
        ...(u.tags !== undefined && { tags: u.tags }),
      })
      .eq("id", id)
      .select()
      .single(),
    "Mise à jour de la méthode impossible",
  );
  if (!row) throw new ApiError("Mise à jour de la méthode impossible", { message: "aucune ligne" });
  return toMethod(row as unknown as Record<string, unknown>);
}

export async function deleteTrainingMethod(id: string): Promise<void> {
  check(await db().from("training_methods").delete().eq("id", id), "Suppression de la méthode impossible");
}
