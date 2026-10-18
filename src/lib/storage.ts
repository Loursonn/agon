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
  injuries:       "asp:injuries",
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

export async function sLoad<T>(k: string, fb: T, aid: string | null | undefined): Promise<T> {
  if (!aid) return fb;
  try {
    const { data } = await db
      .from("app_data")
      .select("value")
      .eq("athlete_id", aid)
      .eq("key", k)
      .maybeSingle();
    if (data) return data.value as T;
    return fb;
  } catch {
    return fb;
  }
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
    if (error) return { ok: false };
    return { ok: true, value: data ? (data.value as T) : undefined };
  } catch {
    return { ok: false };
  }
}

export async function sSave(k: string, v: unknown, aid: string | null | undefined): Promise<void> {
  if (!aid) return;
  if (v === null || v === undefined) return;
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
