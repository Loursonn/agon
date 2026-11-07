import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const SKEYS = {
  exos:           "asp:exos",
  exMeta:         "asp:exMeta",
  sets:           "asp:sets",
  wellness:       "asp:wellness",
  wellnessHistory:"asp:wh",
  bw:             "asp:bw",
  completed:      "asp:completed",
  goals:          "asp:goals",
  anotes:         "asp:anotes",
  custMethods:    "asp:custmethods",
  weightLog:      "asp:wlog",
  weightMilestones:"asp:wmile",
  sessions:       "asp:sessions",
  blockConfig:    "asp:blockConfig",
  blockHistory:   "asp:blockHistory",
  weekSchedule:   "asp:weekschedule",
  sessionLogs:    "asp:sessionlogs",
  freeSessions:   "asp:freesess",
} as const;

/**
 * Clé scopée par cycle : `asp:exos::<cycleId>`.
 * Permet à chaque cycle de garder ses propres exos/séances/validations, au lieu
 * d'un blob global unique qui s'écrasait à chaque changement de cycle.
 */
export function cycleKey(base: string, cycleId: string): string {
  return `${base}::${cycleId}`;
}

export function sLoadCycle<T>(base: string, cycleId: string, fb: T, aid: string | null | undefined): Promise<T> {
  return sLoad<T>(cycleKey(base, cycleId), fb, aid);
}

export function sSaveCycle(base: string, cycleId: string, v: unknown, aid: string | null | undefined): Promise<void> {
  return sSave(cycleKey(base, cycleId), v, aid);
}

// ── Garde « clé non chargée » ────────────────────────────────────────────────
// Chaque clé app_data est un blob ENTIER (historique wellness, poids, blessures…)
// réécrit d'un bloc. Si sa lecture échoue (réseau coupé, 5xx, JWT expiré), l'état
// local vaut la valeur par défaut ({} / []) : la moindre écriture suivante
// remplaçait alors tout l'historique en base par ce défaut. On retient donc les
// clés dont la dernière lecture a échoué et sSave refuse de les écrire tant
// qu'une relecture n'a pas réussi.
const failedKeys = new Set<string>();
const regKey = (aid: string, k: string) => `${aid}\u0000${k}`;

export class KeyNotLoadedError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Écriture bloquée : la clé ${key} n'a pas pu être chargée`);
    this.name = "KeyNotLoadedError";
    this.key = key;
  }
}

export function isKeyNotLoadedError(e: unknown): e is KeyNotLoadedError {
  return e instanceof KeyNotLoadedError || (e as { name?: string } | null)?.name === "KeyNotLoadedError";
}

/** true si la dernière lecture de cette clé a échoué (écriture bloquée). */
export function isKeyLoadFailed(k: string, aid: string | null | undefined): boolean {
  return !!aid && failedKeys.has(regKey(aid, k));
}

function markLoad(k: string, aid: string, ok: boolean): void {
  if (ok) failedKeys.delete(regKey(aid, k));
  else failedKeys.add(regKey(aid, k));
}

/** Tests uniquement. */
export function _resetLoadGuard(): void {
  failedKeys.clear();
}

/**
 * Lecture avec valeur par défaut. En cas d'ERREUR (≠ clé absente), renvoie
 * aussi `fb` mais marque la clé : toute écriture de cette clé sera refusée par
 * sSave jusqu'à une relecture réussie (sLoad / sLoadResult).
 */
export async function sLoad<T>(k: string, fb: T, aid: string | null | undefined): Promise<T> {
  const r = await sLoadResult<T>(k, aid);
  if (!r.ok || r.value === undefined) return fb;
  return r.value;
}

/**
 * Comme sLoad, mais distingue « erreur » (ok=false) de « clé absente »
 * (ok=true, value=undefined). À utiliser avant toute réécriture dérivée d'une
 * lecture : une erreur réseau / auth ne doit jamais devenir une valeur par défaut
 * réécrite en base.
 */
export async function sLoadResult<T>(k: string, aid: string | null | undefined): Promise<{ ok: boolean; value?: T }> {
  if (!aid) return { ok: false };
  try {
    const { data, error } = await db
      .from("app_data")
      .select("value")
      .eq("athlete_id", aid)
      .eq("key", k)
      .maybeSingle();
    if (error) {
      markLoad(k, aid, false);
      return { ok: false };
    }
    markLoad(k, aid, true);
    return { ok: true, value: data ? (data.value as T) : undefined };
  } catch {
    markLoad(k, aid, false);
    return { ok: false };
  }
}

export async function sSave(k: string, v: unknown, aid: string | null | undefined): Promise<void> {
  if (!aid) return;
  if (v === null || v === undefined) return;
  // Lecture en erreur → on ne connaît pas la valeur en base : la réécrire
  // effacerait des données. L'appelant doit relire la clé d'abord.
  if (isKeyLoadFailed(k, aid)) throw new KeyNotLoadedError(k);
  const { error } = await db.from("app_data").upsert(
    { athlete_id: aid, key: k, value: v, updated_at: new Date().toISOString() },
    { onConflict: "athlete_id,key" }
  );
  if (error) {
    console.error("sSave error", k, error.message, error.code);
    throw error;
  }
}

export function clearAllLocalStorage(): void {
  Object.values(SKEYS).forEach((k) => localStorage.removeItem(k));
}
