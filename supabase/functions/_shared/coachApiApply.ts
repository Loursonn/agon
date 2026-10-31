/**
 * Application et annulation des propositions de l'assistant IA d'un coach.
 *
 * Tourne côté serveur (Edge Function `coach-api`, clé de service) : c'est le
 * même code qui applique quand le coach clique « Appliquer » dans Agon et
 * quand l'assistant écrit directement à la demande du coach.
 *
 * Chaque application tient un journal de ce qu'elle a changé, avec l'état
 * d'avant. Ce journal sert deux fois :
 *  - si l'application échoue en route, on rejoue le journal à l'envers et
 *    rien ne reste à moitié posé ;
 *  - plus tard, le coach (ou l'assistant, à sa demande) annule la
 *    proposition et tout revient comme avant.
 *
 * L'annulation ne supprime jamais ce que l'athlète a réalisé entre-temps :
 * une séance placée puis faite reste en place.
 */
import {
  applyGoalsOps,
  applyProgOps,
  applyWeekProgOps,
  type DraftKind,
  type DraftOp,
  type GoalsOp,
  type GoalsShape,
  type PlanningOp,
  type ProgOp,
  type ProgSessionShape,
  type WeekOp,
} from "./coachApiOps.ts";
import { energyTotals } from "./coachApiEnergy.ts";

/** Client Supabase (supabase-js v2). Typé au plus large : partagé Deno / Node. */
// Le constructeur de requêtes de supabase-js n'a pas de type exportable sans
// importer le paquet, que Deno et Node résolvent différemment.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any };

type Row = Record<string, unknown>;

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
  /** Lignes modifiées ou supprimées : leur état d'avant, à remettre. */
  | { t: "restore"; table: RestoreTable; rows: Row[] };

export const INSERTED_TABLES = ["workout_logs", "energy_session_assignments", "energy_sessions", "day_themes"] as const;
export type InsertedTable = typeof INSERTED_TABLES[number];
export const RESTORE_TABLES = ["day_themes"] as const;
export type RestoreTable = typeof RESTORE_TABLES[number];

/** La proposition ne s'applique plus (référence disparue). */
export class ApplyConflict extends Error {}

/** Valeur par défaut des objectifs, comme `useAthletePersistedState`. */
const DEFAULT_GOALS: GoalsShape = { sessionsPerWeek: 6, sleepTarget: 8 };

export async function hashJson(v: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(v ?? null)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function readKey(db: Db, athleteId: string, key: string): Promise<unknown> {
  const data = check<Row | null>(
    await db.from("app_data").select("value").eq("athlete_id", athleteId).eq("key", key).maybeSingle(),
    `app_data ${key}`,
  );
  return data ? data.value : null;
}

/** Écrit une clé et renvoie l'empreinte de ce que la base a stocké. */
async function writeKey(db: Db, athleteId: string, key: string, value: unknown): Promise<string> {
  const data = check<Row>(
    await db.from("app_data").upsert({ athlete_id: athleteId, key, value }).select("value").single(),
    `app_data ${key}`,
  );
  // jsonb réordonne les clés : on hache ce que la base renvoie, pas ce qu'on
  // a envoyé, sinon l'empreinte ne correspondrait jamais à une relecture.
  return hashJson(data.value);
}

export interface ApplyInput {
  db: Db;
  athleteId: string;
  coachId: string;
  kind: DraftKind;
  ops: DraftOp[];
}

export interface ApplyResult {
  undo: UndoStep[];
  /** Objectifs écrits, pour que l'app mette son état à jour. */
  goals?: GoalsShape;
}

/**
 * Applique une proposition. En cas d'échec, défait ce qui a déjà été écrit
 * puis relance l'erreur : rien ne reste à moitié appliqué.
 */
export async function applyDraft(input: ApplyInput): Promise<ApplyResult> {
  const journal: UndoStep[] = [];
  try {
    const goals = await run(input, journal);
    return { undo: journal, ...(goals ? { goals } : {}) };
  } catch (e) {
    const report = await undoSteps(input.db, input.athleteId, input.coachId, journal, true, true);
    if (report.failed.length > 0) console.error("coach-api rollback incomplet:", report.failed.join(" ; "));
    throw e;
  }
}

async function run(input: ApplyInput, journal: UndoStep[]): Promise<GoalsShape | undefined> {
  const { db, athleteId, coachId, kind, ops } = input;

  if (kind === "programme" || kind === "planning") {
    const before = await readKey(db, athleteId, "asp:prog");
    const current = (Array.isArray(before) ? before : []) as ProgSessionShape[];
    let next: ProgSessionShape[];
    try {
      next = applyProgOps(current, ops as (ProgOp | PlanningOp)[]);
    } catch (e) {
      throw new ApplyConflict(e instanceof Error ? e.message : String(e));
    }
    const after_hash = await writeKey(db, athleteId, "asp:prog", next);
    journal.push({ t: "app_data", key: "asp:prog", before, after_hash });
    return undefined;
  }

  if (kind === "objectifs") {
    const before = await readKey(db, athleteId, "asp:goals");
    const base = (before && typeof before === "object" ? before : DEFAULT_GOALS) as GoalsShape;
    const next = applyGoalsOps(base, ops as GoalsOp[]);
    const after_hash = await writeKey(db, athleteId, "asp:goals", next);
    journal.push({ t: "app_data", key: "asp:goals", before, after_hash });
    return next;
  }

  if (kind === "semaine") {
    await runWeek(db, athleteId, coachId, ops as WeekOp[], journal);
  }
  return undefined;
}

function ofOp<K extends WeekOp["op"]>(ops: WeekOp[], op: K): Extract<WeekOp, { op: K }>[] {
  return ops.filter((o): o is Extract<WeekOp, { op: K }> => o.op === op);
}

async function runWeek(db: Db, athleteId: string, coachId: string, ops: WeekOp[], journal: UndoStep[]) {
  // 1. Séances de musculation créées → programme.
  const before = await readKey(db, athleteId, "asp:prog");
  const current = (Array.isArray(before) ? before : []) as ProgSessionShape[];
  const prog = applyWeekProgOps(current, ops);
  if (prog !== current) {
    await writeKey(db, athleteId, "asp:prog", prog);
    const had = new Set(current.map((x) => x.id));
    journal.push({ t: "prog_sessions_added", ids: prog.filter((x) => !had.has(x.id)).map((x) => x.id) });
  }

  // 2. Séances énergétiques créées : copies propres à l'athlète.
  const creates = ofOp(ops, "create_energy_session");
  if (creates.length > 0) {
    const rows = creates.map(({ energy }) => {
      const t = energyTotals(energy.intervals);
      return {
        id: energy.id,
        name: energy.name,
        session_kind: energy.session_kind,
        structure_type: energy.structure_type,
        notes: energy.notes,
        intervals: energy.intervals,
        format: "wod",
        created_by: coachId,
        athlete_id: athleteId,
        total_duration_s: t.durationS,
        total_distance_m: t.distanceM,
      };
    });
    const data = check<Row[]>(await db.from("energy_sessions").insert(rows).select("id"), "energy_sessions");
    journal.push({ t: "inserted", table: "energy_sessions", ids: data.map((r) => r.id as string) });
  }

  // 3. Séances de musculation placées. Une séance déjà prévue ce jour-là
  //    reste telle quelle (ignoreDuplicates) et n'entre pas au journal.
  const placeWorkout = ofOp(ops, "place_session");
  if (placeWorkout.length > 0) {
    const rows = placeWorkout.map((o) => {
      const session = prog.find((s) => s.id === o.session_id);
      if (!session) throw new ApplyConflict(`la séance « ${o.session_id} » n'existe plus dans le programme`);
      return {
        athlete_id: athleteId,
        coach_id: coachId,
        session_id: session.id,
        session_name: session.name,
        scheduled_date: o.date,
        original_scheduled_date: o.date,
        status: "planned",
      };
    });
    const data = check<Row[]>(
      await db.from("workout_logs")
        .upsert(rows, { onConflict: "athlete_id,session_id,scheduled_date", ignoreDuplicates: true })
        .select("id"),
      "workout_logs",
    );
    if (data.length > 0) journal.push({ t: "inserted", table: "workout_logs", ids: data.map((r) => r.id as string) });
  }

  // 4. Séances énergétiques placées (pas d'unicité en base : on vérifie).
  const placeEnergy = ofOp(ops, "place_energy_session");
  if (placeEnergy.length > 0) {
    const existing = check<Row[]>(
      await db.from("energy_session_assignments")
        .select("energy_session_id, scheduled_date")
        .eq("athlete_id", athleteId)
        .in("energy_session_id", [...new Set(placeEnergy.map((o) => o.energy_session_id))])
        .in("scheduled_date", [...new Set(placeEnergy.map((o) => o.date))]),
      "energy_session_assignments",
    );
    const done = new Set(existing.map((a) => `${a.energy_session_id}|${a.scheduled_date}`));
    const rows = placeEnergy
      .filter((o) => !done.has(`${o.energy_session_id}|${o.date}`))
      .map((o) => ({
        athlete_id: athleteId,
        coach_id: coachId,
        energy_session_id: o.energy_session_id,
        scheduled_date: o.date,
        status: "planned",
      }));
    if (rows.length > 0) {
      const data = check<Row[]>(
        await db.from("energy_session_assignments").insert(rows).select("id"),
        "energy_session_assignments",
      );
      journal.push({ t: "inserted", table: "energy_session_assignments", ids: data.map((r) => r.id as string) });
    }
  }

  // 5. Thèmes du jour : remplacent celui de la date ; l'ancien est gardé.
  const themes = ofOp(ops, "set_day_theme");
  if (themes.length > 0) {
    const previous = check<Row[]>(
      await db.from("day_themes")
        .select("athlete_id, coach_id, date, label, intensity, dominante, color, note")
        .eq("athlete_id", athleteId)
        .in("date", themes.map((t) => t.date)),
      "day_themes",
    );
    const now = new Date().toISOString();
    const data = check<Row[]>(
      await db.from("day_themes").upsert(themes.map((t) => ({
        athlete_id: athleteId,
        coach_id: coachId,
        date: t.date,
        label: t.label,
        intensity: t.intensity,
        dominante: t.dominante,
        color: t.color,
        note: t.note,
        updated_at: now,
      })), { onConflict: "athlete_id,date" }).select("id, date"),
      "day_themes",
    );
    if (previous.length > 0) journal.push({ t: "restore", table: "day_themes", rows: previous });
    const replaced = new Set(previous.map((p) => p.date as string));
    const created = data.filter((r) => !replaced.has(r.date as string)).map((r) => r.id as string);
    if (created.length > 0) journal.push({ t: "inserted", table: "day_themes", ids: created });
  }
}

// ─────────────────────────────── Annulation ─────────────────────────────────

/** Le contenu a changé depuis l'application : annuler écraserait ces changements. */
export class UndoConflict extends Error {
  constructor(public keys: string[]) {
    super(`modifié depuis : ${keys.join(", ")}`);
  }
}

export interface UndoReport {
  /** Éléments laissés en place parce que l'athlète les a réalisés depuis. */
  kept: number;
  /** Étapes en échec (mode `bestEffort` seulement). */
  failed: string[];
}

/**
 * Relit un journal stocké en base. Le serveur est seul à l'écrire, mais une
 * annulation agit avec la clé de service : on n'exécute que des étapes de
 * forme connue, sur des tables connues.
 */
export function parseUndo(raw: unknown): UndoStep[] {
  if (!Array.isArray(raw)) return [];
  const out: UndoStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Row;
    if (o.t === "app_data" && (o.key === "asp:prog" || o.key === "asp:goals") && typeof o.after_hash === "string") {
      out.push({ t: "app_data", key: o.key, before: o.before ?? null, after_hash: o.after_hash });
    } else if (o.t === "prog_sessions_added" && Array.isArray(o.ids)) {
      out.push({ t: "prog_sessions_added", ids: o.ids.filter((x): x is string => typeof x === "string") });
    } else if (o.t === "inserted" && INSERTED_TABLES.includes(o.table as InsertedTable) && Array.isArray(o.ids)) {
      out.push({ t: "inserted", table: o.table as InsertedTable, ids: o.ids.filter((x): x is string => typeof x === "string") });
    } else if (o.t === "restore" && RESTORE_TABLES.includes(o.table as RestoreTable) && Array.isArray(o.rows)) {
      out.push({ t: "restore", table: o.table as RestoreTable, rows: o.rows.filter((r): r is Row => !!r && typeof r === "object") });
    }
  }
  return out;
}

/**
 * Défait un journal, de la dernière étape à la première. Sans `force`, refuse
 * si une clé du programme ou des objectifs a été modifiée depuis : annuler
 * effacerait ces modifications.
 *
 * Toute écriture est bornée à l'athlète de la proposition.
 */
export async function undoSteps(
  db: Db,
  athleteId: string,
  coachId: string,
  steps: UndoStep[],
  force = false,
  /**
   * Continue après une étape en échec au lieu de s'arrêter. Pour le retour
   * arrière d'une application ratée : mieux vaut défaire tout ce qui peut
   * l'être que laisser le reste en place.
   */
  bestEffort = false,
): Promise<UndoReport> {
  if (!force) {
    const changed: string[] = [];
    for (const s of steps) {
      if (s.t !== "app_data") continue;
      if ((await hashJson(await readKey(db, athleteId, s.key))) !== s.after_hash) changed.push(s.key);
    }
    if (changed.length > 0) throw new UndoConflict(changed);
  }

  let kept = 0;
  const failed: string[] = [];
  for (const s of [...steps].reverse()) {
    try {
      kept += await undoOne(db, athleteId, coachId, s);
    } catch (e) {
      if (!bestEffort) throw e;
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { kept, failed };
}

/** Défait une étape ; renvoie le nombre d'éléments gardés (réalisés). */
async function undoOne(db: Db, athleteId: string, coachId: string, s: UndoStep): Promise<number> {
  let kept = 0;
  if (s.t === "app_data") {
    if (s.before === null || s.before === undefined) {
      check(await db.from("app_data").delete().eq("athlete_id", athleteId).eq("key", s.key), `app_data ${s.key}`);
    } else {
      check(await db.from("app_data").upsert({ athlete_id: athleteId, key: s.key, value: s.before }), `app_data ${s.key}`);
    }
    return kept;
  }

  if (s.t === "prog_sessions_added") {
    // Les placements prévus ont déjà été retirés (étape suivante dans le
    // journal, donc annulée avant) : ce qui reste a été réalisé.
    if (s.ids.length === 0) return 0;
    const used = check<Row[]>(
      await db.from("workout_logs").select("session_id").eq("athlete_id", athleteId).in("session_id", s.ids),
      "workout_logs",
    );
    const keep = new Set(used.map((u) => u.session_id as string));
    kept += keep.size;
    const prog = await readKey(db, athleteId, "asp:prog");
    const list = (Array.isArray(prog) ? prog : []) as ProgSessionShape[];
    const remove = new Set(s.ids.filter((x) => !keep.has(x)));
    const next = list.filter((x) => !remove.has(x.id));
    if (next.length !== list.length) {
      check(await db.from("app_data").upsert({ athlete_id: athleteId, key: "asp:prog", value: next }), "app_data asp:prog");
    }
    return kept;
  }

  if (s.t === "restore") {
    const rows = s.rows.map((r) => ({
      athlete_id: athleteId,
      coach_id: typeof r.coach_id === "string" ? r.coach_id : coachId,
      date: r.date,
      label: r.label ?? "",
      intensity: r.intensity ?? null,
      dominante: r.dominante ?? null,
      color: r.color,
      note: r.note ?? "",
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) check(await db.from("day_themes").upsert(rows, { onConflict: "athlete_id,date" }), "day_themes");
    return kept;
  }

  if (s.ids.length === 0) return 0;
  if (s.table === "workout_logs" || s.table === "energy_session_assignments") {
    // Seul le prévu part : une séance faite, en cours ou manquée a une
    // histoire côté athlète.
    const removed = check<Row[]>(
      await db.from(s.table).delete()
        .eq("athlete_id", athleteId).in("id", s.ids).eq("status", "planned").select("id"),
      s.table,
    );
    kept += s.ids.length - removed.length;
  } else if (s.table === "energy_sessions") {
    // Une séance encore programmée quelque part reste.
    const used = check<Row[]>(
      await db.from("energy_session_assignments").select("energy_session_id").in("energy_session_id", s.ids),
      "energy_session_assignments",
    );
    const keep = new Set(used.map((u) => u.energy_session_id as string));
    const ids = s.ids.filter((x) => !keep.has(x));
    kept += s.ids.length - ids.length;
    if (ids.length > 0) {
      check(await db.from("energy_sessions").delete().eq("athlete_id", athleteId).in("id", ids), "energy_sessions");
    }
  } else if (s.table === "day_themes") {
    check(await db.from("day_themes").delete().eq("athlete_id", athleteId).in("id", s.ids), "day_themes");
  }
  return kept;
}
