/**
 * Application d'une planification proposée par l'assistant IA d'un coach
 * (périodisation, compétitions, tests, retraits du planning), et annulation
 * des lignes qu'elle a créées, modifiées ou supprimées.
 *
 * Mêmes promesses que pour le reste (`coachApiApply.ts`) :
 *  - chaque écriture entre au journal avec l'état d'avant ;
 *  - le réalisé de l'athlète n'est jamais supprimé : supprimer un cycle
 *    retire ses séances prévues, une séance faite reste (sans semaine) ;
 *  - toute écriture est bornée à l'athlète de la proposition, y compris pour
 *    les mésocycles et les semaines, qui n'ont pas de colonne `athlete_id` :
 *    on vérifie que leur parent est à lui.
 *
 * Ordre du journal : l'annulation le rejoue à l'envers. Une suppression en
 * cascade inscrit les enfants avant les parents, pour que l'annulation
 * recrée les parents d'abord ; les liens à renouer passent avant tout, pour
 * être renoués en dernier.
 */
import {
  ApplyConflict,
  check,
  cols,
  type Db,
  type InsertedTable,
  pick,
  readKey,
  RELINKS,
  type RelinkTable,
  type Row,
  type RowTable,
  type UndoStep,
} from "./coachApiDb.ts";
import { addDays, buildWeeks, type PlanOp } from "./coachApiPlan.ts";
import type { ProgSessionShape } from "./coachApiOps.ts";

type Journal = UndoStep[];

const ids = (rows: Row[]) => rows.map((r) => r.id as string);

// ─────────────────────────────── Appartenance ───────────────────────────────

/** Ce qui, dans la périodisation, est à l'athlète. */
interface Owned {
  macros: Set<string>;
  mesos: Set<string>;
  cycles: Set<string>;
  micros: Set<string>;
}

async function owned(db: Db, athleteId: string): Promise<Owned> {
  const macros = check<Row[]>(await db.from("macrocycles").select("id").eq("athlete_id", athleteId), "macrocycles");
  const macroIds = ids(macros);
  const mesos = macroIds.length === 0 ? [] : check<Row[]>(
    await db.from("mesocycles").select("id").in("macrocycle_id", macroIds),
    "mesocycles",
  );
  const mesoIds = ids(mesos);
  // Un cycle a son `athlete_id`… quand l'écran qui l'a créé l'a rempli : on
  // reconnaît aussi ceux d'un mésocycle de l'athlète.
  const direct = check<Row[]>(await db.from("cycles").select("id").eq("athlete_id", athleteId), "cycles");
  const viaMeso = mesoIds.length === 0 ? [] : check<Row[]>(
    await db.from("cycles").select("id").in("mesocycle_id", mesoIds),
    "cycles",
  );
  const cycleIds = [...new Set([...ids(direct), ...ids(viaMeso)])];
  const micros = cycleIds.length === 0 ? [] : check<Row[]>(
    await db.from("microcycles").select("id").in("cycle_id", cycleIds),
    "microcycles",
  );
  return { macros: new Set(macroIds), mesos: new Set(mesoIds), cycles: new Set(cycleIds), micros: new Set(ids(micros)) };
}

async function one(db: Db, table: RowTable, id: string, what: string): Promise<Row> {
  const row = check<Row | null>(await db.from(table).select(cols(table)).eq("id", id).maybeSingle(), table);
  if (!row) throw new ApplyConflict(`${what} « ${id} » n'existe plus`);
  return row;
}

/** Une ligne de la périodisation, vérifiée comme étant à l'athlète. */
async function ownedRow(db: Db, athleteId: string, table: "macrocycles" | "mesocycles" | "cycles", id: string): Promise<Row> {
  const what = table === "macrocycles" ? "le macrocycle" : table === "mesocycles" ? "le mésocycle" : "le cycle";
  const row = await one(db, table, id, what);
  const o = await owned(db, athleteId);
  const set = table === "macrocycles" ? o.macros : table === "mesocycles" ? o.mesos : o.cycles;
  if (!set.has(id)) throw new ApplyConflict(`${what} « ${id} » n'existe plus`);
  return row;
}

/** Ligne d'une table qui porte `athlete_id`. */
async function athleteRow(db: Db, athleteId: string, table: RowTable, id: string, what: string): Promise<Row> {
  const row = check<Row | null>(
    await db.from(table).select(cols(table)).eq("id", id).eq("athlete_id", athleteId).maybeSingle(),
    table,
  );
  if (!row) throw new ApplyConflict(`${what} « ${id} » n'existe plus`);
  return row;
}

function before(row: Row, patch: Row): Row {
  const out: Row = { id: row.id };
  for (const k of Object.keys(patch)) out[k] = row[k] ?? null;
  return out;
}

// ─────────────────────────────── Suppressions ───────────────────────────────

/**
 * Retire des semaines : leurs séances prévues partent, le réalisé reste
 * (détaché de la semaine, renoué si on annule).
 */
async function removeWeeks(db: Db, athleteId: string, micros: Row[], journal: Journal) {
  if (micros.length === 0) return;
  const microIds = ids(micros);
  for (const table of ["workout_logs", "energy_session_assignments"] as const) {
    const rows = check<Row[]>(
      await db.from(table).select(cols(table)).eq("athlete_id", athleteId).in("microcycle_id", microIds),
      table,
    );
    const kept = rows.filter((r) => r.status !== "planned");
    if (kept.length > 0) {
      journal.push({ t: "relink", table, rows: kept.map((r) => ({ id: r.id as string, value: r.microcycle_id as string })) });
    }
    const planned = rows.filter((r) => r.status === "planned");
    if (planned.length > 0) {
      const gone = new Set(ids(check<Row[]>(
        await db.from(table).delete().eq("athlete_id", athleteId).in("id", ids(planned)).eq("status", "planned").select("id"),
        table,
      )));
      const deleted = planned.filter((r) => gone.has(r.id as string));
      if (deleted.length > 0) journal.push({ t: "deleted", table, rows: deleted });
      // Commencée entre la lecture et la suppression : elle reste, à renouer.
      const late = planned.filter((r) => !gone.has(r.id as string));
      if (late.length > 0) {
        journal.push({ t: "relink", table, rows: late.map((r) => ({ id: r.id as string, value: r.microcycle_id as string })) });
      }
    }
  }
  check(await db.from("microcycles").delete().in("id", microIds), "microcycles");
  journal.push({ t: "deleted", table: "microcycles", rows: micros });
}

/** Supprime un macrocycle, un mésocycle ou un cycle, et ce qu'il contient. */
async function deleteTree(
  db: Db,
  athleteId: string,
  root: { table: "macrocycles" | "mesocycles" | "cycles"; id: string },
  journal: Journal,
) {
  const top = await ownedRow(db, athleteId, root.table, root.id);
  const mesos = root.table === "macrocycles"
    ? check<Row[]>(await db.from("mesocycles").select(cols("mesocycles")).eq("macrocycle_id", root.id), "mesocycles")
    : root.table === "mesocycles" ? [top] : [];
  const cycles = root.table === "cycles"
    ? [top]
    : mesos.length === 0
    ? []
    : check<Row[]>(await db.from("cycles").select(cols("cycles")).in("mesocycle_id", ids(mesos)), "cycles");
  const micros = cycles.length === 0
    ? []
    : check<Row[]>(await db.from("microcycles").select(cols("microcycles")).in("cycle_id", ids(cycles)), "microcycles");

  await removeWeeks(db, athleteId, micros, journal);
  if (cycles.length > 0) {
    check(await db.from("cycles").delete().in("id", ids(cycles)), "cycles");
    journal.push({ t: "deleted", table: "cycles", rows: cycles });
  }
  if (root.table !== "cycles" && mesos.length > 0) {
    check(await db.from("mesocycles").delete().in("id", ids(mesos)), "mesocycles");
    journal.push({ t: "deleted", table: "mesocycles", rows: mesos });
  }
  if (root.table === "macrocycles") {
    check(await db.from("macrocycles").delete().eq("id", root.id).eq("athlete_id", athleteId), "macrocycles");
    journal.push({ t: "deleted", table: "macrocycles", rows: [top] });
  }
}

// ─────────────────────────────── Application ────────────────────────────────

async function insert(db: Db, table: InsertedTable, rows: Row[], journal: Journal) {
  if (rows.length === 0) return;
  const data = check<Row[]>(await db.from(table).insert(rows).select("id"), table);
  journal.push({ t: "inserted", table, ids: ids(data) });
}

async function update(db: Db, table: RowTable, row: Row, patch: Row, journal: Journal, scope?: [string, string]) {
  let q = db.from(table).update(patch).eq("id", row.id);
  if (scope) q = q.eq(scope[0], scope[1]);
  check(await q, table);
  journal.push({ t: "updated", table, rows: [before(row, patch)] });
}

/** Applique une opération de planification ; tout ce qu'elle écrit va au journal. */
export async function applyPlanOp(
  db: Db,
  athleteId: string,
  coachId: string,
  op: PlanOp,
  journal: Journal,
  today: string,
): Promise<void> {
  const mine = { athlete_id: athleteId, coach_id: coachId };
  const scope: [string, string] = ["athlete_id", athleteId];

  switch (op.op) {
    case "create_macrocycle":
      return insert(db, "macrocycles", [{ ...op.row, ...mine }], journal);
    case "update_macrocycle":
      return update(db, "macrocycles", await ownedRow(db, athleteId, "macrocycles", op.id), op.patch, journal, scope);
    case "delete_macrocycle":
      return deleteTree(db, athleteId, { table: "macrocycles", id: op.id }, journal);

    case "create_mesocycle":
      await ownedRow(db, athleteId, "macrocycles", op.row.macrocycle_id);
      return insert(db, "mesocycles", [{ ...op.row }], journal);
    case "update_mesocycle":
      return update(db, "mesocycles", await ownedRow(db, athleteId, "mesocycles", op.id), op.patch, journal);
    case "delete_mesocycle":
      return deleteTree(db, athleteId, { table: "mesocycles", id: op.id }, journal);

    case "create_cycle":
      if (op.row.mesocycle_id) await ownedRow(db, athleteId, "mesocycles", op.row.mesocycle_id);
      await insert(db, "cycles", [{ ...op.row, ...mine }], journal);
      return insert(db, "microcycles", op.weeks.map((w) => ({ ...w })), journal);
    case "update_cycle": {
      const cycle = await ownedRow(db, athleteId, "cycles", op.id);
      await update(db, "cycles", cycle, op.patch, journal);
      if (op.patch.start_date === undefined) return;
      // Les semaines suivent les nouvelles dates, renumérotées.
      const existing = check<Row[]>(
        await db.from("microcycles").select(cols("microcycles")).eq("cycle_id", op.id),
        "microcycles",
      );
      const needed = buildWeeks(op.id, op.patch.start_date, op.patch.end_date!, () => crypto.randomUUID());
      const starts = new Set(needed.map((w) => w.start_date));
      await removeWeeks(db, athleteId, existing.filter((m) => !starts.has(m.start_date as string)), journal);
      const fresh: Row[] = [];
      for (const w of needed) {
        const same = existing.find((m) => m.start_date === w.start_date);
        if (!same) fresh.push({ ...w });
        else if (same.week_number !== w.week_number) {
          await update(db, "microcycles", same, { week_number: w.week_number }, journal);
        }
      }
      return insert(db, "microcycles", fresh, journal);
    }
    case "delete_cycle":
      return deleteTree(db, athleteId, { table: "cycles", id: op.id }, journal);
    case "set_week_deload": {
      await ownedRow(db, athleteId, "cycles", op.cycle_id);
      const week = check<Row | null>(
        await db.from("microcycles").select(cols("microcycles"))
          .eq("cycle_id", op.cycle_id).eq("week_number", op.week_number).maybeSingle(),
        "microcycles",
      );
      if (!week) throw new ApplyConflict(`la semaine ${op.week_number} du cycle n'existe plus`);
      return update(db, "microcycles", week, { is_deload: op.is_deload }, journal);
    }
    case "schedule_session_in_cycle": {
      await ownedRow(db, athleteId, "cycles", op.cycle_id);
      const prog = await readKey(db, athleteId, "asp:prog");
      const session = (Array.isArray(prog) ? prog as ProgSessionShape[] : []).find((s) => s.id === op.session_id);
      if (!session) throw new ApplyConflict(`la séance « ${op.session_id} » n'existe plus dans le programme`);
      if (session.recurrence !== "weekly" || typeof session.day_of_week !== "number") {
        throw new ApplyConflict(`la séance « ${session.name} » n'a plus de jour fixe`);
      }
      const weeks = check<Row[]>(
        await db.from("microcycles").select("id, start_date, end_date").eq("cycle_id", op.cycle_id),
        "microcycles",
      );
      // Comme « placer sur le cycle » dans l'app, sans les jours déjà passés.
      const rows = weeks
        .map((w) => ({ w, date: addDays(w.start_date as string, session.day_of_week!) }))
        .filter(({ date }) => date >= today)
        .map(({ w, date }) => ({
          ...mine,
          session_id: session.id,
          session_name: session.name,
          scheduled_date: date,
          original_scheduled_date: date,
          status: "planned",
          microcycle_id: w.id,
        }));
      if (rows.length === 0) return;
      // Une séance déjà prévue ce jour-là reste telle quelle, hors journal.
      const data = check<Row[]>(
        await db.from("workout_logs")
          .upsert(rows, { onConflict: "athlete_id,session_id,scheduled_date", ignoreDuplicates: true })
          .select("id"),
        "workout_logs",
      );
      if (data.length > 0) journal.push({ t: "inserted", table: "workout_logs", ids: ids(data) });
      return;
    }

    case "remove_placement": {
      const log = check<Row | null>(
        await db.from("workout_logs").select("id, status")
          .eq("athlete_id", athleteId).eq("session_id", op.session_id).eq("scheduled_date", op.date).maybeSingle(),
        "workout_logs",
      );
      if (!log || log.status !== "planned") throw new ApplyConflict(`la séance du ${op.date} n'est plus prévue`);
      // « Sautée » plutôt que supprimée, comme le calendrier du coach : une
      // séance hebdomadaire supprimée réapparaîtrait d'elle-même.
      const done = check<Row[]>(
        await db.from("workout_logs").update({ status: "skipped" })
          .eq("id", log.id).eq("athlete_id", athleteId).eq("status", "planned").select("id"),
        "workout_logs",
      );
      if (done.length === 0) throw new ApplyConflict(`la séance du ${op.date} n'est plus prévue`);
      journal.push({ t: "updated", table: "workout_logs", rows: [{ id: log.id, status: "planned" }] });
      return;
    }
    case "remove_energy_placement": {
      const rows = check<Row[]>(
        await db.from("energy_session_assignments").select(cols("energy_session_assignments"))
          .eq("athlete_id", athleteId).eq("energy_session_id", op.energy_session_id)
          .eq("scheduled_date", op.date).eq("status", "planned"),
        "energy_session_assignments",
      );
      if (rows.length === 0) throw new ApplyConflict(`la séance énergétique du ${op.date} n'est plus prévue`);
      const gone = new Set(ids(check<Row[]>(
        await db.from("energy_session_assignments").delete()
          .eq("athlete_id", athleteId).in("id", ids(rows)).eq("status", "planned").select("id"),
        "energy_session_assignments",
      )));
      journal.push({ t: "deleted", table: "energy_session_assignments", rows: rows.filter((r) => gone.has(r.id as string)) });
      return;
    }
    case "remove_day_theme": {
      const theme = check<Row | null>(
        await db.from("day_themes")
          .select("id, athlete_id, coach_id, date, label, intensity, dominante, color, note, created_at")
          .eq("athlete_id", athleteId).eq("date", op.date).maybeSingle(),
        "day_themes",
      );
      if (!theme) throw new ApplyConflict(`plus de thème le ${op.date}`);
      check(await db.from("day_themes").delete().eq("id", theme.id).eq("athlete_id", athleteId), "day_themes");
      journal.push({ t: "restore", table: "day_themes", rows: [theme] });
      return;
    }

    case "create_competition":
      return insert(db, "competitions", [{ ...op.row, ...mine }], journal);
    case "update_competition":
      return update(db, "competitions", await athleteRow(db, athleteId, "competitions", op.id, "la compétition"), op.patch, journal, scope);
    case "delete_competition": {
      const comp = await athleteRow(db, athleteId, "competitions", op.id, "la compétition");
      const plans = check<Row[]>(
        await db.from("hyrox_race_plans").select("id").eq("athlete_id", athleteId).eq("competition_id", op.id),
        "hyrox_race_plans",
      );
      if (plans.length > 0) {
        journal.push({ t: "relink", table: "hyrox_race_plans", rows: plans.map((p) => ({ id: p.id as string, value: op.id })) });
      }
      check(await db.from("competitions").delete().eq("id", op.id).eq("athlete_id", athleteId), "competitions");
      journal.push({ t: "deleted", table: "competitions", rows: [comp] });
      return;
    }

    case "create_test":
      return insert(db, "test_sessions", [{ ...op.row, ...mine, completed: false }], journal);
    case "update_test": {
      const test = await athleteRow(db, athleteId, "test_sessions", op.id, "le test");
      if (test.completed) throw new ApplyConflict(`le test « ${test.title} » a été passé entre-temps`);
      return update(db, "test_sessions", test, op.patch, journal, scope);
    }
    case "delete_test": {
      const test = await athleteRow(db, athleteId, "test_sessions", op.id, "le test");
      if (test.completed) throw new ApplyConflict(`le test « ${test.title} » a été passé entre-temps`);
      check(await db.from("test_sessions").delete().eq("id", op.id).eq("athlete_id", athleteId).eq("completed", false), "test_sessions");
      journal.push({ t: "deleted", table: "test_sessions", rows: [test] });
      return;
    }
    default: {
      // Une opération ajoutée au validateur sans être appliquée ici ne doit
      // pas passer en silence.
      const never: never = op;
      throw new Error(`opération non appliquée : ${(never as { op: string }).op}`);
    }
  }
}

// ─────────────────────────────── Annulation ─────────────────────────────────

const WITH_ATHLETE = new Set<RowTable>([
  "macrocycles", "cycles", "competitions", "test_sessions", "workout_logs", "energy_session_assignments",
]);

/** Tables de la périodisation, des compétitions et des tests (étape `inserted`). */
export const PLAN_INSERTED = new Set<InsertedTable>([
  "macrocycles", "mesocycles", "cycles", "microcycles", "competitions", "test_sessions",
]);

/**
 * Annule une création. Ce qui a reçu du contenu depuis reste en place : un
 * macrocycle où le coach a ajouté un mésocycle, une compétition commentée
 * par l'athlète, un test passé.
 */
export async function undoPlanInserted(db: Db, athleteId: string, table: InsertedTable, idList: string[]): Promise<number> {
  if (idList.length === 0) return 0;
  const o = await owned(db, athleteId);
  const childOf: Partial<Record<InsertedTable, [string, string]>> = {
    macrocycles: ["mesocycles", "macrocycle_id"],
    mesocycles: ["cycles", "mesocycle_id"],
    cycles: ["microcycles", "cycle_id"],
  };
  let targets = idList;
  if (table === "mesocycles") targets = idList.filter((x) => o.mesos.has(x));
  if (table === "cycles") targets = idList.filter((x) => o.cycles.has(x));
  if (table === "microcycles") targets = idList.filter((x) => o.micros.has(x));
  let kept = 0;

  const child = childOf[table];
  if (child && targets.length > 0) {
    const used = new Set(check<Row[]>(
      await db.from(child[0]).select(child[1]).in(child[1], targets),
      child[0],
    ).map((r) => r[child[1]] as string));
    kept += used.size;
    targets = targets.filter((x) => !used.has(x));
  }
  if (table === "competitions" || table === "test_sessions") {
    const rows = check<Row[]>(
      await db.from(table).select(table === "competitions" ? "id, athlete_comment" : "id, completed")
        .eq("athlete_id", athleteId).in("id", targets),
      table,
    );
    const keep = new Set(ids(rows.filter((r) => (table === "competitions" ? !!r.athlete_comment : !!r.completed))));
    kept += keep.size;
    targets = targets.filter((x) => !keep.has(x));
  }
  if (targets.length === 0) return kept;
  let q = db.from(table).delete().in("id", targets);
  if (WITH_ATHLETE.has(table as RowTable)) q = q.eq("athlete_id", athleteId);
  check(await q, table);
  return kept;
}

/** Annule une suppression, une modification ou un lien remis à zéro. */
export async function undoRowStep(
  db: Db,
  athleteId: string,
  s: Extract<UndoStep, { t: "deleted" | "updated" | "relink" }>,
): Promise<number> {
  if (s.rows.length === 0) return 0;
  const o = await owned(db, athleteId);
  let kept = 0;

  if (s.t === "relink") {
    const column = RELINKS[s.table as RelinkTable];
    let valid: (v: string) => boolean = (v) => o.micros.has(v);
    if (s.table === "hyrox_race_plans") {
      const comps = new Set(ids(check<Row[]>(
        await db.from("competitions").select("id").eq("athlete_id", athleteId).in("id", s.rows.map((r) => r.value)),
        "competitions",
      )));
      valid = (v) => comps.has(v);
    }
    for (const r of s.rows) {
      if (!valid(r.value)) continue;
      // Seulement si le lien est toujours vide : rien n'est écrasé.
      check(
        await db.from(s.table).update({ [column]: r.value }).eq("id", r.id).eq("athlete_id", athleteId).is(column, null),
        s.table,
      );
    }
    return 0;
  }

  const rows = s.rows.map((r) => pick(s.table, r));

  if (s.t === "deleted") {
    const ok = rows.filter((r) => {
      if (s.table === "mesocycles") return o.macros.has(r.macrocycle_id as string);
      if (s.table === "microcycles") return o.cycles.has(r.cycle_id as string);
      return true;
    }).map((r) => {
      const out = { ...r };
      if (WITH_ATHLETE.has(s.table)) out.athlete_id = athleteId;
      // Une semaine qui n'est pas (ou plus) à l'athlète : la séance revient
      // sans semaine plutôt que rattachée ailleurs.
      if ((s.table === "workout_logs" || s.table === "energy_session_assignments") && out.microcycle_id && !o.micros.has(out.microcycle_id as string)) {
        out.microcycle_id = null;
      }
      return out;
    });
    if (ok.length === 0) return 0;
    const onConflict = s.table === "workout_logs" ? "athlete_id,session_id,scheduled_date" : "id";
    check(await db.from(s.table).upsert(ok, { onConflict, ignoreDuplicates: true }), s.table);
    return 0;
  }

  // updated
  for (const r of rows) {
    const { id, ...patch } = r;
    if (typeof id !== "string" || Object.keys(patch).length === 0) continue;
    let q = db.from(s.table).update(patch).eq("id", id);
    if (WITH_ATHLETE.has(s.table)) q = q.eq("athlete_id", athleteId);
    if (s.table === "mesocycles" && !o.mesos.has(id)) continue;
    if (s.table === "microcycles" && !o.micros.has(id)) continue;
    // Une séance retirée que l'athlète a faite depuis, un test passé depuis :
    // on n'y touche plus.
    if (s.table === "workout_logs") q = q.eq("status", "skipped");
    if (s.table === "test_sessions") q = q.eq("completed", false);
    const done = check<Row[]>(await q.select("id"), s.table);
    if (done.length === 0) kept++;
  }
  return kept;
}
