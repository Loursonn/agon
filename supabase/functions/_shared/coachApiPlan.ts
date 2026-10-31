/**
 * Planification proposée par l'assistant IA d'un coach : périodisation
 * (macrocycle → mésocycle → cycle → semaines), compétitions, tests, et
 * retraits du planning.
 *
 * Mêmes règles que l'app (`src/features/coach/components/planning/`) :
 * périodes du lundi au dimanche, une semaine (microcycle) par semaine ISO,
 * pas de chevauchement entre frères, un enfant dans les dates de son parent.
 * Les vérifier ici donne à l'assistant une erreur qui nomme le champ, plutôt
 * qu'un refus de trigger illisible au moment d'appliquer.
 *
 * Validation sur une copie de travail de l'état : une opération voit ce que
 * les précédentes ont créé, modifié ou supprimé.
 */
import { cleanText, fail, id as idOf, int, type Obj, oneOf, onlyKeys, reqText } from "./coachApiCheck.ts";

// ── État lu en base ─────────────────────────────────────────────────────────

export interface Period { id: string; name: string; start_date: string; end_date: string }
export interface MacroState extends Period { objective: string | null }
export interface MesoState extends Period { macrocycle_id: string }
export interface CycleState extends Period { mesocycle_id: string | null }
export interface MicroState { id: string; cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }

export interface PlanState {
  macros: MacroState[];
  mesos: MesoState[];
  cycles: CycleState[];
  micros: MicroState[];
  competitions: { id: string; name: string; date: string }[];
  tests: { id: string; title: string; date: string; completed: boolean }[];
  /** Placements existants aux dates citées par des retraits. */
  placements: { session_id: string; date: string; status: string }[];
  energyPlacements: { energy_session_id: string; date: string; status: string }[];
  themeDates: string[];
}

export function emptyPlanState(): PlanState {
  return {
    macros: [], mesos: [], cycles: [], micros: [], competitions: [], tests: [],
    placements: [], energyPlacements: [], themeDates: [],
  };
}

// ── Opérations ──────────────────────────────────────────────────────────────

export const VOLUME_TYPES = ["progressive", "ondulant", "plateau", "polarize"] as const;
export const ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;
export const COMPETITION_TYPES = ["competition", "match", "stage", "off", "autre"] as const;
export const PRIORITIES = ["A", "B", "C"] as const;
export const TEST_TYPES = ["musculation", "endurance", "vitesse", "puissance", "souplesse", "autre"] as const;

type MesoFields = {
  objective?: string | null;
  frequency?: number | null;
  deload_week?: number | null;
  volume_config?: { type: typeof VOLUME_TYPES[number] };
  intensity_config?: { zones: string[] };
};

export type PlanOp =
  | { op: "create_macrocycle"; row: MacroState }
  | { op: "update_macrocycle"; id: string; name: string; patch: Partial<Omit<MacroState, "id">> }
  | { op: "delete_macrocycle"; id: string; name: string }
  | { op: "create_mesocycle"; row: MesoState & MesoFields }
  | { op: "update_mesocycle"; id: string; name: string; patch: Partial<Omit<MesoState, "id" | "macrocycle_id">> & MesoFields }
  | { op: "delete_mesocycle"; id: string; name: string }
  | { op: "create_cycle"; row: CycleState & { objective: string | null }; weeks: MicroState[] }
  | { op: "update_cycle"; id: string; name: string; patch: { name?: string; objective?: string | null; start_date?: string; end_date?: string } }
  | { op: "delete_cycle"; id: string; name: string }
  | { op: "set_week_deload"; cycle_id: string; cycle_name: string; week_number: number; is_deload: boolean }
  | { op: "schedule_session_in_cycle"; session_id: string; cycle_id: string; cycle_name: string }
  | { op: "remove_placement"; session_id: string; date: string }
  | { op: "remove_energy_placement"; energy_session_id: string; date: string }
  | { op: "remove_day_theme"; date: string }
  | { op: "create_competition"; row: { id: string; name: string; date: string; type: string; priority: string; location: string | null } }
  | { op: "update_competition"; id: string; name: string; patch: { name?: string; date?: string; type?: string; priority?: string; location?: string | null } }
  | { op: "delete_competition"; id: string; name: string }
  | { op: "create_test"; row: { id: string; title: string; date: string; type: string; description: string | null } }
  | { op: "update_test"; id: string; title: string; patch: { title?: string; date?: string; type?: string; description?: string | null } }
  | { op: "delete_test"; id: string; title: string };

export const PLAN_OPS = [
  "create_macrocycle", "update_macrocycle", "delete_macrocycle",
  "create_mesocycle", "update_mesocycle", "delete_mesocycle",
  "create_cycle", "update_cycle", "delete_cycle", "set_week_deload", "schedule_session_in_cycle",
  "remove_placement", "remove_energy_placement", "remove_day_theme",
  "create_competition", "update_competition", "delete_competition",
  "create_test", "update_test", "delete_test",
] as const;

// ── Dates ───────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = lundi … 6 = dimanche. */
export function weekday(iso: string): number {
  return (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
}

function date(v: unknown, path: string, ctx: PlanCtx): string {
  if (typeof v !== "string" || !ISO.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) fail(path, "date AAAA-MM-JJ attendue");
  // Une période peut commencer dans le passé (bloc en cours), pas il y a un an.
  if (v < addDays(ctx.today, -365) || v > addDays(ctx.today, 730)) fail(path, "date à moins d'un an dans le passé et de deux ans dans le futur");
  return v;
}

/** Bornes d'une période : du lundi au dimanche, comme le planning de l'app. */
function period(rawStart: unknown, rawEnd: unknown, path: string, ctx: PlanCtx) {
  const start = date(rawStart, `${path}.start_date`, ctx);
  const end = date(rawEnd, `${path}.end_date`, ctx);
  if (weekday(start) !== 0) fail(`${path}.start_date`, "un lundi attendu");
  if (weekday(end) !== 6) fail(`${path}.end_date`, "un dimanche attendu");
  if (end <= start) fail(`${path}.end_date`, "après start_date attendu");
  return { start, end };
}

/** Semaines (microcycles) d'un cycle : une par semaine ISO. */
export function buildWeeks(cycleId: string, start: string, end: string, newId: () => string, deload: number[] = []): MicroState[] {
  const out: MicroState[] = [];
  for (let mon = start, n = 1; mon <= end; mon = addDays(mon, 7), n++) {
    out.push({ id: newId(), cycle_id: cycleId, week_number: n, start_date: mon, end_date: addDays(mon, 6), is_deload: deload.includes(n) });
  }
  return out;
}

const overlaps = (a: { start_date: string; end_date: string }, s: string, e: string) => s <= a.end_date && e >= a.start_date;

// ── Contexte ────────────────────────────────────────────────────────────────

export interface PlanCtx {
  today: string;
  newId: () => string;
  state: PlanState;
  /** Séances du programme (après les créations de la proposition). */
  sessions: () => { id: string; name: string; day_of_week?: number; recurrence: string }[];
  /** Référence de séance créée plus haut → id. */
  sessionRef: (ref: string) => string | undefined;
  refs: Map<string, { kind: "macrocycle" | "mesocycle" | "cycle"; id: string }>;
}

function newRef(v: unknown, path: string, ctx: PlanCtx): string | null {
  if (v === undefined) return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(v)) fail(path, "référence attendue : lettres, chiffres, - ou _, 32 caractères maximum");
  if (ctx.refs.has(v)) fail(path, `référence « ${v} » déjà utilisée dans cette proposition`);
  return v;
}

/** `xxx_id` (existant) ou `xxx_ref` (créé plus haut). */
function target(raw: Obj, kind: "macrocycle" | "mesocycle" | "cycle", path: string, ctx: PlanCtx): string | undefined {
  const idKey = `${kind}_id`;
  const refKey = `${kind}_ref`;
  if (raw[idKey] !== undefined && raw[refKey] !== undefined) fail(path, `${idKey} ou ${refKey}, pas les deux`);
  if (raw[refKey] !== undefined) {
    const r = typeof raw[refKey] === "string" ? ctx.refs.get(raw[refKey] as string) : undefined;
    if (!r || r.kind !== kind) fail(`${path}.${refKey}`, `aucun ${kind} créé plus haut avec cette ref`);
    return r.id;
  }
  if (raw[idKey] !== undefined) return idOf(raw[idKey], `${path}.${idKey}`);
  return undefined;
}

function findIn<T extends { id: string }>(list: T[], id: string, what: string, path: string): T {
  const x = list.find((e) => e.id === id);
  if (!x) fail(path, `${what} « ${id} » introuvable (voir GET /athletes/:id/periodisation)`);
  return x;
}

function name(v: unknown, path: string) {
  return reqText(v, 80, path);
}

function objective(v: unknown, path: string): string | null {
  if (v === null) return null;
  const s = cleanText(v, 500, path);
  return s || null;
}

function checkSiblings<T extends Period>(list: T[], s: string, e: string, selfId: string | null, what: string, path: string) {
  const clash = list.find((x) => x.id !== selfId && overlaps(x, s, e));
  if (clash) fail(path, `chevauche ${what} « ${clash.name} » (${clash.start_date} → ${clash.end_date})`);
}

function checkInside(parent: Period, s: string, e: string, what: string, path: string) {
  if (s < parent.start_date || e > parent.end_date) {
    fail(path, `doit tenir dans ${what} « ${parent.name} » (${parent.start_date} → ${parent.end_date})`);
  }
}

function mesoFields(raw: Obj, path: string, weeks: number): MesoFields {
  const out: MesoFields = {};
  if (raw.objective !== undefined) out.objective = objective(raw.objective, `${path}.objective`);
  if (raw.frequency !== undefined) out.frequency = raw.frequency === null ? null : int(raw.frequency, 1, 14, `${path}.frequency`);
  if (raw.deload_week !== undefined) {
    // 0 n'existe pas en base (CHECK >= 1) : « pas de décharge » = null.
    out.deload_week = raw.deload_week === null ? null : int(raw.deload_week, 1, weeks, `${path}.deload_week`);
  }
  if (raw.volume_type !== undefined) out.volume_config = { type: oneOf(raw.volume_type, VOLUME_TYPES, `${path}.volume_type`) };
  if (raw.zones !== undefined) {
    if (!Array.isArray(raw.zones)) fail(`${path}.zones`, "tableau attendu, ex. [\"Z2\", \"Z4\"]");
    out.intensity_config = { zones: [...new Set(raw.zones.map((z, i) => oneOf(z, ZONES, `${path}.zones[${i}]`)))] };
  }
  return out;
}

const weeksIn = (s: string, e: string) => Math.round((Date.parse(e) - Date.parse(s)) / (7 * 86_400_000)) + 1;

// ── Validation ──────────────────────────────────────────────────────────────

export function parsePlanOp(raw: Obj, path: string, ctx: PlanCtx): PlanOp {
  const st = ctx.state;
  switch (raw.op) {
    // ── Macrocycle ──
    case "create_macrocycle": {
      onlyKeys(raw, ["op", "ref", "name", "start_date", "end_date", "objective"], path);
      const ref = newRef(raw.ref, `${path}.ref`, ctx);
      const { start, end } = period(raw.start_date, raw.end_date, path, ctx);
      checkSiblings(st.macros, start, end, null, "le macrocycle", path);
      const row: MacroState = {
        id: ctx.newId(), name: name(raw.name, `${path}.name`), start_date: start, end_date: end,
        objective: raw.objective === undefined ? null : objective(raw.objective, `${path}.objective`),
      };
      st.macros.push(row);
      if (ref) ctx.refs.set(ref, { kind: "macrocycle", id: row.id });
      return { op: "create_macrocycle", row };
    }
    case "update_macrocycle": {
      onlyKeys(raw, ["op", "id", "name", "start_date", "end_date", "objective"], path);
      const m = findIn(st.macros, idOf(raw.id, `${path}.id`), "macrocycle", `${path}.id`);
      const patch: Partial<Omit<MacroState, "id">> = {};
      if (raw.name !== undefined) patch.name = name(raw.name, `${path}.name`);
      if (raw.objective !== undefined) patch.objective = objective(raw.objective, `${path}.objective`);
      if (raw.start_date !== undefined || raw.end_date !== undefined) {
        const { start, end } = period(raw.start_date ?? m.start_date, raw.end_date ?? m.end_date, path, ctx);
        checkSiblings(st.macros, start, end, m.id, "le macrocycle", path);
        for (const child of st.mesos.filter((x) => x.macrocycle_id === m.id)) {
          if (child.start_date < start || child.end_date > end) {
            fail(path, `le mésocycle « ${child.name} » (${child.start_date} → ${child.end_date}) en sortirait : déplace-le d'abord`);
          }
        }
        patch.start_date = start;
        patch.end_date = end;
      }
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = m.name;
      Object.assign(m, patch);
      return { op: "update_macrocycle", id: m.id, name: was, patch };
    }
    case "delete_macrocycle": {
      onlyKeys(raw, ["op", "id"], path);
      const m = findIn(st.macros, idOf(raw.id, `${path}.id`), "macrocycle", `${path}.id`);
      const mesoIds = st.mesos.filter((x) => x.macrocycle_id === m.id).map((x) => x.id);
      const cycleIds = st.cycles.filter((c) => c.mesocycle_id && mesoIds.includes(c.mesocycle_id)).map((c) => c.id);
      st.micros = st.micros.filter((w) => !cycleIds.includes(w.cycle_id));
      st.cycles = st.cycles.filter((c) => !cycleIds.includes(c.id));
      st.mesos = st.mesos.filter((x) => x.macrocycle_id !== m.id);
      st.macros = st.macros.filter((x) => x.id !== m.id);
      return { op: "delete_macrocycle", id: m.id, name: m.name };
    }

    // ── Mésocycle ──
    case "create_mesocycle": {
      onlyKeys(raw, ["op", "ref", "macrocycle_id", "macrocycle_ref", "name", "start_date", "end_date",
        "objective", "frequency", "deload_week", "volume_type", "zones"], path);
      const ref = newRef(raw.ref, `${path}.ref`, ctx);
      const parentId = target(raw, "macrocycle", path, ctx);
      if (!parentId) fail(path, "macrocycle_id ou macrocycle_ref attendu");
      const parent = findIn(st.macros, parentId, "macrocycle", path);
      const { start, end } = period(raw.start_date, raw.end_date, path, ctx);
      checkInside(parent, start, end, "le macrocycle", path);
      checkSiblings(st.mesos.filter((x) => x.macrocycle_id === parent.id), start, end, null, "le mésocycle", path);
      const row = {
        id: ctx.newId(), macrocycle_id: parent.id, name: name(raw.name, `${path}.name`), start_date: start, end_date: end,
        ...mesoFields(raw, path, weeksIn(start, end)),
      };
      st.mesos.push(row);
      if (ref) ctx.refs.set(ref, { kind: "mesocycle", id: row.id });
      return { op: "create_mesocycle", row };
    }
    case "update_mesocycle": {
      onlyKeys(raw, ["op", "id", "name", "start_date", "end_date", "objective", "frequency", "deload_week", "volume_type", "zones"], path);
      const m = findIn(st.mesos, idOf(raw.id, `${path}.id`), "mésocycle", `${path}.id`);
      let start = m.start_date;
      let end = m.end_date;
      const patch: Partial<Omit<MesoState, "id" | "macrocycle_id">> & MesoFields = {};
      if (raw.start_date !== undefined || raw.end_date !== undefined) {
        ({ start, end } = period(raw.start_date ?? m.start_date, raw.end_date ?? m.end_date, path, ctx));
        checkInside(findIn(st.macros, m.macrocycle_id, "macrocycle", path), start, end, "le macrocycle", path);
        checkSiblings(st.mesos.filter((x) => x.macrocycle_id === m.macrocycle_id), start, end, m.id, "le mésocycle", path);
        for (const c of st.cycles.filter((x) => x.mesocycle_id === m.id)) {
          if (c.start_date < start || c.end_date > end) fail(path, `le cycle « ${c.name} » en sortirait : déplace-le d'abord`);
        }
        patch.start_date = start;
        patch.end_date = end;
      }
      if (raw.name !== undefined) patch.name = name(raw.name, `${path}.name`);
      Object.assign(patch, mesoFields(raw, path, weeksIn(start, end)));
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = m.name;
      Object.assign(m, patch);
      return { op: "update_mesocycle", id: m.id, name: was, patch };
    }
    case "delete_mesocycle": {
      onlyKeys(raw, ["op", "id"], path);
      const m = findIn(st.mesos, idOf(raw.id, `${path}.id`), "mésocycle", `${path}.id`);
      const cycleIds = st.cycles.filter((c) => c.mesocycle_id === m.id).map((c) => c.id);
      st.micros = st.micros.filter((w) => !cycleIds.includes(w.cycle_id));
      st.cycles = st.cycles.filter((c) => !cycleIds.includes(c.id));
      st.mesos = st.mesos.filter((x) => x.id !== m.id);
      return { op: "delete_mesocycle", id: m.id, name: m.name };
    }

    // ── Cycle ──
    case "create_cycle": {
      onlyKeys(raw, ["op", "ref", "mesocycle_id", "mesocycle_ref", "name", "start_date", "end_date", "objective", "deload_weeks"], path);
      const ref = newRef(raw.ref, `${path}.ref`, ctx);
      const parentId = target(raw, "mesocycle", path, ctx) ?? null;
      const { start, end } = period(raw.start_date, raw.end_date, path, ctx);
      if (parentId) {
        const parent = findIn(st.mesos, parentId, "mésocycle", path);
        checkInside(parent, start, end, "le mésocycle", path);
        checkSiblings(st.cycles.filter((c) => c.mesocycle_id === parentId), start, end, null, "le cycle", path);
      }
      const n = weeksIn(start, end);
      let deload: number[] = [];
      if (raw.deload_weeks !== undefined) {
        if (!Array.isArray(raw.deload_weeks)) fail(`${path}.deload_weeks`, "tableau de numéros de semaine attendu, ex. [4]");
        deload = raw.deload_weeks.map((w, i) => int(w, 1, n, `${path}.deload_weeks[${i}]`));
      }
      const row = {
        id: ctx.newId(), mesocycle_id: parentId, name: name(raw.name, `${path}.name`), start_date: start, end_date: end,
        objective: raw.objective === undefined ? null : objective(raw.objective, `${path}.objective`),
      };
      const weeks = buildWeeks(row.id, start, end, ctx.newId, deload);
      st.cycles.push(row);
      st.micros.push(...weeks);
      if (ref) ctx.refs.set(ref, { kind: "cycle", id: row.id });
      return { op: "create_cycle", row, weeks };
    }
    case "update_cycle": {
      onlyKeys(raw, ["op", "id", "name", "start_date", "end_date", "objective"], path);
      const c = findIn(st.cycles, idOf(raw.id, `${path}.id`), "cycle", `${path}.id`);
      const patch: { name?: string; objective?: string | null; start_date?: string; end_date?: string } = {};
      if (raw.name !== undefined) patch.name = name(raw.name, `${path}.name`);
      if (raw.objective !== undefined) patch.objective = objective(raw.objective, `${path}.objective`);
      if (raw.start_date !== undefined || raw.end_date !== undefined) {
        const { start, end } = period(raw.start_date ?? c.start_date, raw.end_date ?? c.end_date, path, ctx);
        if (c.mesocycle_id) {
          checkInside(findIn(st.mesos, c.mesocycle_id, "mésocycle", path), start, end, "le mésocycle", path);
          checkSiblings(st.cycles.filter((x) => x.mesocycle_id === c.mesocycle_id), start, end, c.id, "le cycle", path);
        }
        patch.start_date = start;
        patch.end_date = end;
        // Les semaines suivent, renumérotées depuis le nouveau début : celles
        // qui sortent partent, les nouvelles arrivent (voir l'application
        // pour le sort des séances).
        const old = st.micros.filter((w) => w.cycle_id === c.id);
        const weeks = buildWeeks(c.id, start, end, () => "", []).map((w) => {
          const same = old.find((o) => o.start_date === w.start_date);
          return same ? { ...same, week_number: w.week_number } : w;
        });
        st.micros = [...st.micros.filter((w) => w.cycle_id !== c.id), ...weeks];
      }
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = c.name;
      Object.assign(c, patch);
      return { op: "update_cycle", id: c.id, name: was, patch };
    }
    case "delete_cycle": {
      onlyKeys(raw, ["op", "id"], path);
      const c = findIn(st.cycles, idOf(raw.id, `${path}.id`), "cycle", `${path}.id`);
      st.micros = st.micros.filter((w) => w.cycle_id !== c.id);
      st.cycles = st.cycles.filter((x) => x.id !== c.id);
      return { op: "delete_cycle", id: c.id, name: c.name };
    }
    case "set_week_deload": {
      onlyKeys(raw, ["op", "cycle_id", "cycle_ref", "week_number", "is_deload"], path);
      const cid = target(raw, "cycle", path, ctx);
      if (!cid) fail(path, "cycle_id ou cycle_ref attendu");
      const cyc = findIn(st.cycles, cid, "cycle", path);
      const n = int(raw.week_number, 1, 53, `${path}.week_number`);
      const w = st.micros.find((x) => x.cycle_id === cid && x.week_number === n);
      if (!w) fail(`${path}.week_number`, "semaine inexistante dans ce cycle");
      if (typeof raw.is_deload !== "boolean") fail(`${path}.is_deload`, "true ou false attendu");
      w.is_deload = raw.is_deload;
      return { op: "set_week_deload", cycle_id: cid, cycle_name: cyc.name, week_number: n, is_deload: raw.is_deload };
    }
    case "schedule_session_in_cycle": {
      onlyKeys(raw, ["op", "session_id", "ref", "cycle_id", "cycle_ref"], path);
      let sid: string;
      if (raw.ref !== undefined) {
        if (raw.session_id !== undefined) fail(path, "session_id ou ref, pas les deux");
        const r = typeof raw.ref === "string" ? ctx.sessionRef(raw.ref) : undefined;
        if (!r) fail(`${path}.ref`, "aucune séance créée plus haut avec cette ref");
        sid = r;
      } else sid = idOf(raw.session_id, `${path}.session_id`);
      const s = ctx.sessions().find((x) => x.id === sid);
      if (!s) fail(`${path}.session_id`, `séance « ${sid} » introuvable dans le programme`);
      if (s.recurrence !== "weekly" || typeof s.day_of_week !== "number") {
        fail(path, `la séance « ${s.name} » doit être hebdomadaire avec un jour fixe (day_of_week) pour être répartie sur un cycle`);
      }
      const cid = target(raw, "cycle", path, ctx);
      if (!cid) fail(path, "cycle_id ou cycle_ref attendu");
      const cyc = findIn(st.cycles, cid, "cycle", path);
      return { op: "schedule_session_in_cycle", session_id: sid, cycle_id: cid, cycle_name: cyc.name };
    }

    // ── Retraits du planning ──
    case "remove_placement": {
      onlyKeys(raw, ["op", "session_id", "date"], path);
      const sid = idOf(raw.session_id, `${path}.session_id`);
      const d = date(raw.date, `${path}.date`, ctx);
      const p = st.placements.find((x) => x.session_id === sid && x.date === d);
      if (!p) fail(path, "aucune séance prévue à cette date");
      if (p.status !== "planned") fail(path, `séance « ${p.status} » : seul le prévu se retire, le réalisé reste à l'athlète`);
      p.status = "skipped";
      return { op: "remove_placement", session_id: sid, date: d };
    }
    case "remove_energy_placement": {
      onlyKeys(raw, ["op", "energy_session_id", "date"], path);
      const eid = idOf(raw.energy_session_id, `${path}.energy_session_id`);
      const d = date(raw.date, `${path}.date`, ctx);
      const p = st.energyPlacements.find((x) => x.energy_session_id === eid && x.date === d);
      if (!p) fail(path, "aucune séance énergétique prévue à cette date");
      if (p.status !== "planned") fail(path, `séance « ${p.status} » : seul le prévu se retire, le réalisé reste à l'athlète`);
      st.energyPlacements = st.energyPlacements.filter((x) => x !== p);
      return { op: "remove_energy_placement", energy_session_id: eid, date: d };
    }
    case "remove_day_theme": {
      onlyKeys(raw, ["op", "date"], path);
      const d = date(raw.date, `${path}.date`, ctx);
      if (!st.themeDates.includes(d)) fail(path, "aucun thème posé ce jour-là");
      st.themeDates = st.themeDates.filter((x) => x !== d);
      return { op: "remove_day_theme", date: d };
    }

    // ── Compétitions ──
    case "create_competition": {
      onlyKeys(raw, ["op", "name", "date", "type", "priority", "location"], path);
      const row = {
        id: ctx.newId(),
        name: name(raw.name, `${path}.name`),
        date: date(raw.date, `${path}.date`, ctx),
        type: raw.type === undefined ? "competition" : oneOf(raw.type, COMPETITION_TYPES, `${path}.type`),
        priority: raw.priority === undefined ? "A" : oneOf(raw.priority, PRIORITIES, `${path}.priority`),
        location: raw.location === undefined || raw.location === null ? null : (cleanText(raw.location, 120, `${path}.location`) || null),
      };
      st.competitions.push({ id: row.id, name: row.name, date: row.date });
      return { op: "create_competition", row };
    }
    case "update_competition": {
      onlyKeys(raw, ["op", "id", "name", "date", "type", "priority", "location"], path);
      const c = findIn(st.competitions, idOf(raw.id, `${path}.id`), "compétition", `${path}.id`);
      const patch: { name?: string; date?: string; type?: string; priority?: string; location?: string | null } = {};
      if (raw.name !== undefined) patch.name = name(raw.name, `${path}.name`);
      if (raw.date !== undefined) patch.date = date(raw.date, `${path}.date`, ctx);
      if (raw.type !== undefined) patch.type = oneOf(raw.type, COMPETITION_TYPES, `${path}.type`);
      if (raw.priority !== undefined) patch.priority = oneOf(raw.priority, PRIORITIES, `${path}.priority`);
      if (raw.location !== undefined) patch.location = raw.location === null ? null : (cleanText(raw.location, 120, `${path}.location`) || null);
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = c.name;
      Object.assign(c, patch);
      return { op: "update_competition", id: c.id, name: was, patch };
    }
    case "delete_competition": {
      onlyKeys(raw, ["op", "id"], path);
      const c = findIn(st.competitions, idOf(raw.id, `${path}.id`), "compétition", `${path}.id`);
      st.competitions = st.competitions.filter((x) => x.id !== c.id);
      return { op: "delete_competition", id: c.id, name: c.name };
    }

    // ── Tests ──
    case "create_test": {
      onlyKeys(raw, ["op", "title", "date", "type", "description"], path);
      const row = {
        id: ctx.newId(),
        title: reqText(raw.title, 120, `${path}.title`),
        date: date(raw.date, `${path}.date`, ctx),
        type: raw.type === undefined ? "musculation" : oneOf(raw.type, TEST_TYPES, `${path}.type`),
        description: raw.description === undefined ? null : (cleanText(raw.description, 1000, `${path}.description`) || null),
      };
      st.tests.push({ id: row.id, title: row.title, date: row.date, completed: false });
      return { op: "create_test", row };
    }
    case "update_test": {
      onlyKeys(raw, ["op", "id", "title", "date", "type", "description"], path);
      const t = findIn(st.tests, idOf(raw.id, `${path}.id`), "test", `${path}.id`);
      if (t.completed) fail(`${path}.id`, "test déjà passé : ses résultats appartiennent à l'athlète");
      const patch: { title?: string; date?: string; type?: string; description?: string | null } = {};
      if (raw.title !== undefined) patch.title = reqText(raw.title, 120, `${path}.title`);
      if (raw.date !== undefined) patch.date = date(raw.date, `${path}.date`, ctx);
      if (raw.type !== undefined) patch.type = oneOf(raw.type, TEST_TYPES, `${path}.type`);
      if (raw.description !== undefined) patch.description = raw.description === null ? null : (cleanText(raw.description, 1000, `${path}.description`) || null);
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = t.title;
      Object.assign(t, patch);
      return { op: "update_test", id: t.id, title: was, patch };
    }
    case "delete_test": {
      onlyKeys(raw, ["op", "id"], path);
      const t = findIn(st.tests, idOf(raw.id, `${path}.id`), "test", `${path}.id`);
      if (t.completed) fail(`${path}.id`, "test déjà passé : ses résultats appartiennent à l'athlète");
      st.tests = st.tests.filter((x) => x.id !== t.id);
      return { op: "delete_test", id: t.id, title: t.title };
    }

    default:
      return fail(`${path}.op`, `opération inconnue (attendues : ${PLAN_OPS.join(", ")}, et celles d'une semaine)`);
  }
}

export function isPlanOpName(v: unknown): boolean {
  return typeof v === "string" && (PLAN_OPS as readonly string[]).includes(v);
}

