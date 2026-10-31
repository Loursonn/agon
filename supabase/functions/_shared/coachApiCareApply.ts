/**
 * Application des fiches et habitudes d'une planification, leur annulation,
 * et la synchronisation des fiches attribuées par les séances.
 *
 * Mêmes promesses que le reste : chaque écriture entre au journal avec
 * l'état d'avant, bornée à l'athlète de la proposition ; ce que l'athlète a
 * fait depuis reste (une habitude cochée n'est pas supprimée).
 */
import { ApplyConflict, check, cols, type Db, readKey, type Row, type UndoStep, writeKey } from "./coachApiDb.ts";
import type { CareOp, FicheTarget } from "./coachApiCare.ts";
import { collectDocIds, collectProgDocIds, type FicheAttachment } from "./fiches.ts";

type Journal = UndoStep[];
type Session = { id: string; name?: string; fiches?: FicheAttachment[] | null; blocs?: unknown[] };

const CLAUDE_TAG = "claude";

/** Une fiche que le coach peut donner à cet athlète : la sienne, en banque ou personnelle à l'athlète. */
async function usableDoc(db: Db, athleteId: string, coachId: string, docId: string, title: string): Promise<Row> {
  const doc = check<Row | null>(
    await db.from("docs").select("id, athlete_id, archived_at, tags").eq("id", docId).eq("coach_id", coachId).maybeSingle(),
    "docs",
  );
  if (!doc || doc.archived_at || (doc.athlete_id !== null && doc.athlete_id !== athleteId)) {
    throw new ApplyConflict(`la fiche « ${title} » n'est plus disponible`);
  }
  return doc;
}

// ─────────────────────────────── Séances ────────────────────────────────────

/** Fiches au niveau d'une séance (musculation dans `asp:prog`, ou copie énergie de l'athlète). */
async function readLinks(db: Db, athleteId: string, target: FicheTarget, sessionId: string) {
  if (target === "prog") {
    const prog = await readKey(db, athleteId, "asp:prog");
    const list = (Array.isArray(prog) ? prog : []) as Session[];
    const session = list.find((s) => s.id === sessionId);
    return session ? { fiches: Array.isArray(session.fiches) ? session.fiches : [], absent: !Array.isArray(session.fiches), prog: list } : null;
  }
  const row = check<Row | null>(
    await db.from("energy_sessions").select("id, fiches").eq("id", sessionId).eq("athlete_id", athleteId).maybeSingle(),
    "energy_sessions",
  );
  return row ? { fiches: Array.isArray(row.fiches) ? row.fiches as FicheAttachment[] : [], absent: !Array.isArray(row.fiches) } : null;
}

/** `fiches: null` : la séance revient sans liste de fiches, comme avant le premier rattachement. */
async function writeLinks(
  db: Db,
  athleteId: string,
  target: FicheTarget,
  sessionId: string,
  fiches: FicheAttachment[] | null,
  ctx: { prog?: Session[] },
) {
  if (target === "prog") {
    const next = ctx.prog!.map((s) => {
      if (s.id !== sessionId) return s;
      if (fiches !== null) return { ...s, fiches };
      const { fiches: _drop, ...rest } = s;
      return rest;
    });
    await writeKey(db, athleteId, "asp:prog", next);
    return;
  }
  check(
    await db.from("energy_sessions").update({ fiches }).eq("id", sessionId).eq("athlete_id", athleteId),
    "energy_sessions",
  );
}

const refersTo = (a: FicheAttachment, docId: string) => a.doc_id === docId || Object.values(a.weeks ?? {}).includes(docId);

// ─────────────────────────────── Application ────────────────────────────────

export async function applyCareOp(db: Db, athleteId: string, coachId: string, op: CareOp, journal: Journal): Promise<void> {
  switch (op.op) {
    case "assign_fiche": {
      const doc = await usableDoc(db, athleteId, coachId, op.doc_id, op.title);
      const existing = check<Row[]>(
        await db.from("doc_assignments").select("id").eq("athlete_id", athleteId).eq("doc_id", op.doc_id).eq("source", "manuel"),
        "doc_assignments",
      );
      if (existing.length > 0) throw new ApplyConflict(`la fiche « ${op.title} » a été attribuée entre-temps`);
      if (op.perso) {
        const others = check<Row[]>(
          await db.from("doc_assignments").select("athlete_id").eq("doc_id", op.doc_id),
          "doc_assignments",
        ).filter((a) => a.athlete_id !== athleteId);
        const tags = Array.isArray(doc.tags) ? doc.tags : [];
        if (doc.athlete_id !== null || !tags.includes(CLAUDE_TAG) || others.length > 0) {
          throw new ApplyConflict(`la fiche « ${op.title} » ne peut plus devenir personnelle (donnée à d'autres entre-temps)`);
        }
        check(
          await db.from("docs").update({ athlete_id: athleteId })
            .eq("id", op.doc_id).eq("coach_id", coachId).is("athlete_id", null),
          "docs",
        );
        journal.push({ t: "fiche_perso", doc_id: op.doc_id });
      }
      const data = check<Row[]>(
        await db.from("doc_assignments").insert({
          doc_id: op.doc_id, athlete_id: athleteId, assigned_by: coachId, source: "manuel", coach_note: op.note,
        }).select("id"),
        "doc_assignments",
      );
      journal.push({ t: "inserted", table: "doc_assignments", ids: data.map((r) => r.id as string) });
      return;
    }
    case "unassign_fiche": {
      const rows = check<Row[]>(
        await db.from("doc_assignments").select(cols("doc_assignments"))
          .eq("athlete_id", athleteId).eq("doc_id", op.doc_id).eq("source", "manuel"),
        "doc_assignments",
      );
      if (rows.length === 0) throw new ApplyConflict(`la fiche « ${op.title} » n'est plus attribuée`);
      check(
        await db.from("doc_assignments").delete().eq("athlete_id", athleteId).in("id", rows.map((r) => r.id)),
        "doc_assignments",
      );
      journal.push({ t: "deleted", table: "doc_assignments", rows });
      return;
    }
    case "attach_fiche": {
      await usableDoc(db, athleteId, coachId, op.doc_id, op.title);
      const cur = await readLinks(db, athleteId, op.target, op.session_id);
      if (!cur) throw new ApplyConflict(`la séance « ${op.session_name} » n'existe plus`);
      if (cur.fiches.some((a) => refersTo(a, op.doc_id))) {
        throw new ApplyConflict(`la fiche « ${op.title} » a été rattachée à « ${op.session_name} » entre-temps`);
      }
      await writeLinks(db, athleteId, op.target, op.session_id, [...cur.fiches, { id: op.attachment_id, doc_id: op.doc_id }], cur);
      journal.push({
        t: "fiche_link", target: op.target, session_id: op.session_id, attachment_id: op.attachment_id,
        ...(cur.absent ? { fresh: true } : {}),
      });
      return;
    }
    case "detach_fiche": {
      const cur = await readLinks(db, athleteId, op.target, op.session_id);
      if (!cur) throw new ApplyConflict(`la séance « ${op.session_name} » n'existe plus`);
      const items = cur.fiches
        .map((attachment, index) => ({ index, attachment }))
        .filter(({ attachment }) => refersTo(attachment, op.doc_id));
      if (items.length === 0) throw new ApplyConflict(`la fiche « ${op.title} » n'est plus rattachée à « ${op.session_name} »`);
      await writeLinks(db, athleteId, op.target, op.session_id, cur.fiches.filter((a) => !refersTo(a, op.doc_id)), cur);
      journal.push({
        t: "fiche_unlink", target: op.target, session_id: op.session_id,
        items: items.map((x) => ({ index: x.index, attachment: x.attachment as unknown as Row })),
      });
      return;
    }

    case "create_habit": {
      let tracker = journal.find((s): s is Extract<UndoStep, { t: "habit_tracker" }> => s.t === "habit_tracker");
      if (op.enable_tracker && !tracker) {
        const profile = check<Row | null>(
          await db.from("profiles").select("habit_tracker_enabled").eq("id", athleteId).maybeSingle(),
          "profiles",
        );
        if (profile && profile.habit_tracker_enabled !== true) {
          check(await db.from("profiles").update({ habit_tracker_enabled: true }).eq("id", athleteId), "profiles");
          tracker = { t: "habit_tracker", habit_ids: [] };
          journal.push(tracker);
        }
      }
      const current = check<Row[]>(
        await db.from("habits").select("sort_order").eq("athlete_id", athleteId).eq("is_active", true),
        "habits",
      );
      const last = Math.max(-1, ...current.map((h) => (typeof h.sort_order === "number" ? h.sort_order : -1)));
      const data = check<Row[]>(
        await db.from("habits").insert({
          ...op.row, athlete_id: athleteId, created_by: coachId, is_active: true, sort_order: last + 1,
        }).select("id"),
        "habits",
      );
      journal.push({ t: "inserted", table: "habits", ids: data.map((r) => r.id as string) });
      // Le suivi a été activé pour ces habitudes : l'annuler les concerne.
      tracker?.habit_ids.push(...data.map((r) => r.id as string));
      return;
    }
    case "update_habit":
    case "remove_habit": {
      const habit = check<Row | null>(
        await db.from("habits").select(cols("habits"))
          .eq("id", op.id).eq("athlete_id", athleteId).eq("is_active", true).not("created_by", "is", null).maybeSingle(),
        "habits",
      );
      if (!habit) throw new ApplyConflict(`l'habitude « ${op.name} » n'existe plus`);
      const patch: Row = op.op === "update_habit" ? op.patch : { is_active: false };
      check(await db.from("habits").update(patch).eq("id", op.id).eq("athlete_id", athleteId), "habits");
      const before: Row = { id: habit.id };
      for (const k of Object.keys(patch)) before[k] = habit[k] ?? null;
      journal.push({ t: "updated", table: "habits", rows: [before] });
      return;
    }
    default: {
      const never: never = op;
      throw new Error(`opération non appliquée : ${(never as { op: string }).op}`);
    }
  }
}

// ─────────────────────────────── Annulation ─────────────────────────────────

/** Annule une étape propre aux fiches et habitudes ; renvoie le nombre d'éléments gardés. */
export async function undoCareStep(
  db: Db,
  athleteId: string,
  coachId: string,
  s: Extract<UndoStep, { t: "fiche_link" | "fiche_unlink" | "fiche_perso" | "habit_tracker" }>,
): Promise<number> {
  if (s.t === "fiche_link" || s.t === "fiche_unlink") {
    const cur = await readLinks(db, athleteId, s.target, s.session_id);
    if (!cur) return 0; // séance supprimée depuis : plus rien à défaire
    let next = cur.fiches;
    if (s.t === "fiche_link") next = cur.fiches.filter((a) => a.id !== s.attachment_id);
    else {
      next = [...cur.fiches];
      for (const { index, attachment } of [...s.items].sort((a, b) => a.index - b.index)) {
        const att = attachment as unknown as FicheAttachment;
        if (typeof att?.id !== "string" || typeof att.doc_id !== "string" || next.some((a) => a.id === att.id)) continue;
        next.splice(Math.min(index, next.length), 0, att);
      }
    }
    if (next.length !== cur.fiches.length) {
      const gone = s.t === "fiche_link" && s.fresh === true && next.length === 0;
      await writeLinks(db, athleteId, s.target, s.session_id, gone ? null : next, cur);
    }
    return 0;
  }
  if (s.t === "fiche_perso") {
    check(
      await db.from("docs").update({ athlete_id: null })
        .eq("id", s.doc_id).eq("coach_id", coachId).eq("athlete_id", athleteId),
      "docs",
    );
    return 0;
  }
  // habit_tracker : les habitudes créées avec lui sont déjà défaites (étapes
  // suivantes du journal) ; celles qui restent ont été cochées.
  if (s.habit_ids.length > 0) {
    const left = check<Row[]>(
      await db.from("habits").select("id").eq("athlete_id", athleteId).in("id", s.habit_ids),
      "habits",
    );
    if (left.length > 0) return 0;
  }
  check(await db.from("profiles").update({ habit_tracker_enabled: false }).eq("id", athleteId), "profiles");
  return 0;
}

/** Annule une attribution ou une habitude créée. Une habitude cochée depuis reste. */
export async function undoCareInserted(db: Db, athleteId: string, table: "doc_assignments" | "habits", ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  if (table === "doc_assignments") {
    check(
      await db.from("doc_assignments").delete().eq("athlete_id", athleteId).eq("source", "manuel").in("id", ids),
      "doc_assignments",
    );
    return 0;
  }
  const used = new Set(check<Row[]>(
    await db.from("habit_logs").select("habit_id").eq("athlete_id", athleteId).in("habit_id", ids),
    "habit_logs",
  ).map((r) => r.habit_id as string));
  const remove = ids.filter((x) => !used.has(x));
  if (remove.length > 0) check(await db.from("habits").delete().eq("athlete_id", athleteId).in("id", remove), "habits");
  return used.size;
}

// ─────────────────────────────── Synchronisation ────────────────────────────

/**
 * Attributions « programme » et « énergie » : les fiches rattachées aux
 * séances de l'athlète. Même calcul que la RPC `sync_doc_assignments`, que
 * l'app appelle après chaque sauvegarde — ici sans session utilisateur, après
 * une application ou une annulation. Ne touche jamais aux attributions
 * manuelles ; garde `seen_at` des lignes conservées.
 */
export async function syncFicheAssignments(db: Db, athleteId: string, coachId: string): Promise<void> {
  const prog = await readKey(db, athleteId, "asp:prog");
  const logs = check<Row[]>(
    await db.from("workout_logs").select("athlete_modifications").eq("athlete_id", athleteId),
    "workout_logs",
  );
  const overrides = logs
    .map((l) => (l.athlete_modifications as { coachOverride?: Session } | null)?.coachOverride)
    .filter((o): o is Session => !!o && typeof o === "object")
    .map((o) => ({ fiches: o.fiches, blocs: (Array.isArray(o.blocs) ? o.blocs : []) as { fiches?: FicheAttachment[] }[] }));
  const progIds = collectProgDocIds([...(Array.isArray(prog) ? prog as Session[] : []), ...overrides]);

  const assigned = check<Row[]>(
    await db.from("energy_session_assignments").select("energy_session_id").eq("athlete_id", athleteId),
    "energy_session_assignments",
  );
  const energyIds = [...new Set(assigned.map((a) => a.energy_session_id as string))];
  const energy = energyIds.length === 0 ? [] : check<Row[]>(
    await db.from("energy_sessions").select("fiches").in("id", energyIds),
    "energy_sessions",
  );
  const energyDocIds = collectDocIds(energy.map((e) => e.fiches as FicheAttachment[] | null));

  for (const [source, want] of [["programme", progIds], ["energie", energyDocIds]] as const) {
    const current = check<Row[]>(
      await db.from("doc_assignments").select("id, doc_id").eq("athlete_id", athleteId).eq("source", source),
      "doc_assignments",
    );
    const stale = current.filter((r) => !want.includes(r.doc_id as string)).map((r) => r.id as string);
    if (stale.length > 0) {
      check(await db.from("doc_assignments").delete().eq("athlete_id", athleteId).in("id", stale), "doc_assignments");
    }
    const have = new Set(current.map((r) => r.doc_id as string));
    const missing = want.filter((d) => !have.has(d));
    if (missing.length === 0) continue;
    // Fiches du coach seulement : en banque, ou personnelles à cet athlète.
    const docs = check<Row[]>(
      await db.from("docs").select("id, athlete_id").eq("coach_id", coachId).in("id", missing),
      "docs",
    ).filter((d) => d.athlete_id === null || d.athlete_id === athleteId);
    if (docs.length === 0) continue;
    check(
      await db.from("doc_assignments").upsert(
        docs.map((d) => ({ doc_id: d.id, athlete_id: athleteId, assigned_by: coachId, source })),
        { onConflict: "doc_id,athlete_id,source", ignoreDuplicates: true },
      ),
      "doc_assignments",
    );
  }
}
