import { supabase } from "@/integrations/supabase/client";

/**
 * Point d'entrée unique vers Supabase pour la couche `src/api/`.
 *
 * - `db()` renvoie le client ; les tests le remplacent par la base simulée
 *   (`supabase/functions/_shared/__tests__/fakeDb.ts`) avec `setDbForTests`.
 * - `unwrap` / `unwrapRows` transforment toute erreur en `ApiError` : une
 *   lecture qui échoue LÈVE, elle ne renvoie jamais `[]` ou `{}` par défaut
 *   (c'est ce qui effaçait des historiques : audit §3, P1).
 */

export type ApiDb = typeof supabase;

let current: ApiDb = supabase;

export function db(): ApiDb {
  return current;
}

/** Tests uniquement. */
export function setDbForTests(next: unknown): void {
  current = (next ?? supabase) as ApiDb;
}

export class ApiError extends Error {
  readonly code?: string;
  constructor(what: string, err: { message: string; code?: string }) {
    super(`${what} : ${err.message}`);
    this.name = "ApiError";
    this.code = err.code;
  }
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Résultat d'une requête ou d'une RPC ; `null` reste `null` (ligne absente). */
export function unwrap<T>(res: Res<T>, what: string): T | null {
  if (res.error) throw new ApiError(what, res.error);
  return res.data;
}

/** Liste de lignes ; `null` sans erreur = liste vide. */
export function unwrapRows<T>(res: Res<T[]>, what: string): T[] {
  if (res.error) throw new ApiError(what, res.error);
  return res.data ?? [];
}

/** Écriture sans résultat attendu. */
export function check(res: { error: { message: string; code?: string } | null }, what: string): void {
  if (res.error) throw new ApiError(what, res.error);
}
