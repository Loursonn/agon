/**
 * Accès base et journal d'annulation, partagés par l'application des
 * propositions de l'assistant (`coachApiApply.ts`) et celle d'une
 * planification (`coachApiPlanApply.ts`).
 */

/** Client Supabase (supabase-js v2). Typé au plus large : partagé Deno / Node. */
// Le constructeur de requêtes de supabase-js n'a pas de type exportable sans
// importer le paquet, que Deno et Node résolvent différemment.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any };

export type Row = Record<string, unknown>;

/** La proposition ne s'applique plus (référence disparue). */
export class ApplyConflict extends Error {}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function hashJson(v: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(v ?? null)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readKey(db: Db, athleteId: string, key: string): Promise<unknown> {
  const data = check<Row | null>(
    await db.from("app_data").select("value").eq("athlete_id", athleteId).eq("key", key).maybeSingle(),
    `app_data ${key}`,
  );
  return data ? data.value : null;
}

/** Écrit une clé et renvoie l'empreinte de ce que la base a stocké. */
export async function writeKey(db: Db, athleteId: string, key: string, value: unknown): Promise<string> {
  const data = check<Row>(
    await db.from("app_data").upsert({ athlete_id: athleteId, key, value }).select("value").single(),
    `app_data ${key}`,
  );
  // jsonb réordonne les clés : on hache ce que la base renvoie, pas ce qu'on
  // a envoyé, sinon l'empreinte ne correspondrait jamais à une relecture.
  return hashJson(data.value);
}

// ─────────────────────────────── Journal ────────────────────────────────────

/**
 * Colonnes gardées d'une ligne supprimée ou modifiée, pour la remettre. Une
 * annulation ne réécrit que ces colonnes-là, quel que soit le journal.
 */
export const ROW_COLUMNS = {
  macrocycles: ["id", "athlete_id", "coach_id", "name", "start_date", "end_date", "objective", "created_at"],
  mesocycles: [
    "id", "macrocycle_id", "name", "start_date", "end_date", "objective",
    "volume_config", "intensity_config", "frequency", "deload_week", "created_at",
  ],
  cycles: ["id", "mesocycle_id", "athlete_id", "coach_id", "name", "start_date", "end_date", "objective", "created_at"],
  microcycles: ["id", "cycle_id", "week_number", "start_date", "end_date", "is_deload", "created_at"],
  competitions: [
    "id", "athlete_id", "coach_id", "name", "type", "date", "location", "notes", "priority",
    "athlete_comment", "macrocycle_id", "created_at",
  ],
  test_sessions: [
    "id", "athlete_id", "coach_id", "type", "custom_type", "title", "description", "reference_file_url",
    "reference_file_type", "date", "completed", "results_structured", "results_note", "created_at",
  ],
  workout_logs: [
    "id", "athlete_id", "coach_id", "session_id", "session_name", "scheduled_date", "status", "microcycle_id",
    "notes", "original_scheduled_date", "rescheduled_by_athlete", "coach_alert", "week_number", "created_at",
  ],
  energy_session_assignments: [
    "id", "athlete_id", "coach_id", "energy_session_id", "scheduled_date", "status", "microcycle_id", "notes", "created_at",
  ],
} as const;
export type RowTable = keyof typeof ROW_COLUMNS;
export const ROW_TABLES = Object.keys(ROW_COLUMNS) as RowTable[];

export const cols = (t: RowTable) => ROW_COLUMNS[t].join(", ");

export const INSERTED_TABLES = [
  "workout_logs", "energy_session_assignments", "energy_sessions", "day_themes",
  "macrocycles", "mesocycles", "cycles", "microcycles", "competitions", "test_sessions",
] as const;
export type InsertedTable = typeof INSERTED_TABLES[number];
export const RESTORE_TABLES = ["day_themes"] as const;
export type RestoreTable = typeof RESTORE_TABLES[number];

export const RELINKS = {
  workout_logs: "microcycle_id",
  energy_session_assignments: "microcycle_id",
  hyrox_race_plans: "competition_id",
} as const;
export type RelinkTable = keyof typeof RELINKS;

/** Une étape du journal : ce qu'il faut faire pour revenir en arrière. */
export type UndoStep =
  /** Une clé `app_data` remplacée : valeur d'avant, empreinte d'après. */
  | { t: "app_data"; key: "asp:prog" | "asp:goals"; before: unknown; after_hash: string }
  /**
   * Séances ajoutées au programme : à retirer, sauf celles que l'athlète a
   * déjà faites (sa séance réalisée garde sa définition).
   */
  | { t: "prog_sessions_added"; ids: string[] }
  /** Lignes créées : à supprimer, sauf ce que l'athlète a réalisé depuis. */
  | { t: "inserted"; table: InsertedTable; ids: string[] }
  /** Thèmes du jour remplacés ou retirés : leur état d'avant, à remettre. */
  | { t: "restore"; table: RestoreTable; rows: Row[] }
  /** Lignes supprimées, telles qu'elles étaient : à recréer. */
  | { t: "deleted"; table: RowTable; rows: Row[] }
  /** Lignes modifiées : `id` et colonnes d'avant, à remettre. */
  | { t: "updated"; table: RowTable; rows: Row[] }
  /**
   * Liens remis à zéro par une suppression (séance réalisée d'une semaine
   * supprimée, plan de course d'une compétition supprimée) : à renouer.
   */
  | { t: "relink"; table: RelinkTable; rows: { id: string; value: string }[] };

export function pick(table: RowTable, r: Row): Row {
  const out: Row = {};
  for (const c of ROW_COLUMNS[table]) if (c in r) out[c] = r[c];
  return out;
}
