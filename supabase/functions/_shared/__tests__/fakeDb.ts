/**
 * Base simulée en mémoire pour tester l'application et l'annulation des
 * propositions : juste ce que le moteur utilise de supabase-js, plus les
 * clés étrangères qui comptent (suppression en cascade, mise à null).
 */
import type { Db } from "../coachApiDb";

export type Row = Record<string, unknown>;

/** Clés d'unicité utilisées par les upserts sans `onConflict`. */
const PK: Record<string, string[]> = {
  app_data: ["athlete_id", "key"],
  day_themes: ["athlete_id", "date"],
  workout_logs: ["athlete_id", "session_id", "scheduled_date"],
};

/** Comme en base (voir les migrations) : ce qui suit une suppression. */
const FKS: { table: string; column: string; ref: string; action: "cascade" | "null" }[] = [
  { table: "mesocycles", column: "macrocycle_id", ref: "macrocycles", action: "cascade" },
  { table: "cycles", column: "mesocycle_id", ref: "mesocycles", action: "cascade" },
  { table: "microcycles", column: "cycle_id", ref: "cycles", action: "cascade" },
  { table: "workout_logs", column: "microcycle_id", ref: "microcycles", action: "null" },
  { table: "energy_session_assignments", column: "microcycle_id", ref: "microcycles", action: "null" },
  { table: "hyrox_race_plans", column: "competition_id", ref: "competitions", action: "null" },
];

let seq = 0;

export function fakeDb(initial: Record<string, Row[]> = {}, failOn?: { table: string; op: string }) {
  const tables: Record<string, Row[]> = structuredClone(initial);
  const t = (name: string) => (tables[name] ??= []);

  function remove(table: string, gone: Row[]) {
    if (gone.length === 0) return;
    tables[table] = t(table).filter((r) => !gone.includes(r));
    const ids = gone.map((r) => r.id);
    for (const fk of FKS.filter((f) => f.ref === table)) {
      const hit = t(fk.table).filter((r) => ids.includes(r[fk.column]));
      if (fk.action === "cascade") remove(fk.table, hit);
      else for (const r of hit) r[fk.column] = null;
    }
  }

  const db: Db = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "insert" | "upsert" | "delete" | "update" = "select";
      let payload: Row[] = [];
      let opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
      let single: "one" | "maybe" | null = null;

      const exec = () => {
        if (failOn && failOn.table === table && failOn.op === op) return { data: null, error: { message: "panne simulée" } };
        // Une lecture ne crée pas la table : l'état comparé reste celui écrit.
        const rows = op === "insert" || op === "upsert" ? t(table) : (tables[table] ?? []);
        let out: Row[] = [];
        if (op === "select") out = rows.filter((r) => filters.every((f) => f(r)));
        else if (op === "delete") {
          out = rows.filter((r) => filters.every((f) => f(r)));
          remove(table, out);
        } else if (op === "update") {
          out = rows.filter((r) => filters.every((f) => f(r)));
          for (const r of out) Object.assign(r, structuredClone(payload[0]));
        } else if (op === "insert") {
          out = payload.map((p) => ({ id: p.id ?? `row-${++seq}`, ...p }));
          for (const r of out) if (rows.some((x) => x.id === r.id)) return { data: null, error: { message: "doublon" } };
          rows.push(...out);
        } else {
          const keys = opts.onConflict?.split(",") ?? PK[table] ?? ["id"];
          for (const p of payload) {
            const found = rows.find((r) => keys.every((k) => r[k] === p[k]));
            if (found) {
              if (opts.ignoreDuplicates) continue;
              Object.assign(found, p);
              out.push(found);
            } else {
              const row = { id: `row-${++seq}`, ...p };
              rows.push(row);
              out.push(row);
            }
          }
        }
        const copy = structuredClone(out);
        if (single === "one") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: "pas une ligne" } };
        if (single === "maybe") return { data: copy[0] ?? null, error: null };
        return { data: copy, error: null };
      };

      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        not: (c: string, o: string, v: unknown) => (filters.push((r) => !(o === "is" ? (r[c] ?? null) === v : r[c] === v)), q),
        insert: (p: Row | Row[]) => ((op = "insert"), (payload = structuredClone(Array.isArray(p) ? p : [p])), q),
        upsert: (p: Row | Row[], o = {}) => ((op = "upsert"), (payload = structuredClone(Array.isArray(p) ? p : [p])), (opts = o), q),
        update: (p: Row) => ((op = "update"), (payload = [structuredClone(p)]), q),
        delete: () => ((op = "delete"), q),
        single: () => ((single = "one"), q),
        maybeSingle: () => ((single = "maybe"), q),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      };
      return q;
    },
  };
  return { db, tables };
}
