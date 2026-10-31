/**
 * Fiches et habitudes proposées par l'assistant IA d'un coach, dans une
 * planification (`kind: "plan"`).
 *
 * Fiches : l'assistant attribue une fiche de la banque du coach (ou une fiche
 * personnelle de l'athlète), ou la rattache à une séance. Il ne touche ni aux
 * fiches ajoutées par l'athlète, ni à une séance énergétique de la
 * bibliothèque partagée (le changement toucherait tous les athlètes qui l'ont).
 *
 * Habitudes : l'assistant en crée pour l'athlète ; il ne modifie ou ne retire
 * que celles posées par le coach (lui ou son assistant). Celles que l'athlète
 * s'est données lui appartiennent : l'assistant n'en connaît que l'assiduité.
 *
 * Validation sur la copie de travail de l'état, comme le reste du plan.
 */
import { cleanText, fail, id as idOf, type Obj, oneOf, onlyKeys, reqText } from "./coachApiCheck.ts";
import type { FicheAttachment } from "./fiches.ts";

// ── État lu en base ─────────────────────────────────────────────────────────

export interface FicheState {
  id: string;
  title: string;
  /** Banque du coach (sinon : fiche personnelle de cet athlète). */
  bank: boolean;
  /** Déposée par l'assistant (étiquette « claude »). */
  claude: boolean;
  /** Attribuée ou rattachée chez au moins un autre athlète. */
  shared: boolean;
}

export interface CareState {
  /** Fiches que l'assistant peut attribuer ou rattacher. */
  fiches?: FicheState[];
  /** Fiches attribuées à la main à l'athlète (doc_id). */
  manualFiches?: string[];
  /** Séances énergétiques propres à l'athlète (copies), avec leurs fiches. */
  energyOwned?: { id: string; name: string; fiches: FicheAttachment[] }[];
  /** Habitudes actives ; `name` absent pour celles que l'athlète s'est données. */
  habits?: { id: string; name: string | null; mine: boolean }[];
  habitTracker?: boolean;
}

// ── Opérations ──────────────────────────────────────────────────────────────

/** Icônes et couleurs proposées par l'éditeur d'habitudes de l'app (`src/lib/theme.ts`). */
export const HABIT_ICONS = [
  "musculation", "course", "wellness", "hydratation", "clipboard", "sommeil",
  "nutrition", "objectif", "intensite", "flamme", "coeur", "tempo",
  "crayon", "endurance", "habitude", "cerveau", "performance", "progression",
  "repos", "lune", "refresh", "stress", "drapeau", "balance",
] as const;
export const HABIT_COLORS = ["#FFC933", "#66F03C", "#33B5FF", "#FF5A33", "#FF9500", "#1FF0B0", "#F060C0", "#E7D3A8"] as const;

export type FicheTarget = "prog" | "energy";

export type CareOp =
  | { op: "assign_fiche"; doc_id: string; title: string; note: string | null; perso: boolean }
  | { op: "unassign_fiche"; doc_id: string; title: string }
  | { op: "attach_fiche"; doc_id: string; title: string; target: FicheTarget; session_id: string; session_name: string; attachment_id: string }
  | { op: "detach_fiche"; doc_id: string; title: string; target: FicheTarget; session_id: string; session_name: string }
  | { op: "create_habit"; row: { id: string; name: string; emoji: string; color: string }; enable_tracker: boolean }
  | { op: "update_habit"; id: string; name: string; patch: { name?: string; emoji?: string; color?: string } }
  | { op: "remove_habit"; id: string; name: string };

export const CARE_OPS = [
  "assign_fiche", "unassign_fiche", "attach_fiche", "detach_fiche",
  "create_habit", "update_habit", "remove_habit",
] as const;

export function isCareOpName(v: unknown): boolean {
  return typeof v === "string" && (CARE_OPS as readonly string[]).includes(v);
}

// ── Contexte ────────────────────────────────────────────────────────────────

export interface CareCtx {
  newId: () => string;
  state: CareState;
  /** Séances du programme (après les créations de la proposition). */
  sessions: () => { id: string; name: string; fiches?: unknown }[];
  /** Référence de séance créée plus haut → id. */
  sessionRef: (ref: string) => string | undefined;
  /** Référence de séance énergétique créée plus haut (copie propre à l'athlète). */
  energyRef: (ref: string) => { id: string; name: string } | undefined;
  /** Fiches rattachées par séance, suivies opération après opération. */
  links: Map<string, string[]>;
}

const docIdsOf = (list: unknown): string[] =>
  Array.isArray(list)
    ? list.flatMap((a) => (a && typeof a === "object" && typeof (a as FicheAttachment).doc_id === "string"
      ? [(a as FicheAttachment).doc_id, ...Object.values((a as FicheAttachment).weeks ?? {})]
      : []))
    : [];

function fiche(raw: Obj, path: string, st: CareState): FicheState {
  const docId = idOf(raw.fiche_id, `${path}.fiche_id`);
  const f = (st.fiches ?? []).find((x) => x.id === docId);
  if (!f) fail(`${path}.fiche_id`, `fiche « ${docId} » introuvable (voir GET /athletes/:id/fiches)`);
  return f;
}

/** La séance visée : muscu (`session_id` / `ref`) ou énergie (`energy_session_id` / `energy_ref`). */
function session(raw: Obj, path: string, ctx: CareCtx) {
  const given = ["session_id", "ref", "energy_session_id", "energy_ref"].filter((k) => raw[k] !== undefined);
  if (given.length !== 1) fail(path, "une seule séance attendue : session_id, ref, energy_session_id ou energy_ref");
  const key = given[0];
  if (key === "session_id" || key === "ref") {
    let sid: string;
    if (key === "ref") {
      const r = typeof raw.ref === "string" ? ctx.sessionRef(raw.ref) : undefined;
      if (!r) fail(`${path}.ref`, "aucune séance créée plus haut avec cette ref");
      sid = r;
    } else sid = idOf(raw.session_id, `${path}.session_id`);
    const s = ctx.sessions().find((x) => x.id === sid);
    if (!s) fail(`${path}.session_id`, `séance « ${sid} » introuvable dans le programme`);
    const k = `prog:${s.id}`;
    if (!ctx.links.has(k)) ctx.links.set(k, docIdsOf(s.fiches));
    return { target: "prog" as const, id: s.id, name: s.name, key: k };
  }
  let e: { id: string; name: string } | undefined;
  let attached: string[] = [];
  if (key === "energy_ref") {
    e = typeof raw.energy_ref === "string" ? ctx.energyRef(raw.energy_ref) : undefined;
    if (!e) fail(`${path}.energy_ref`, "aucune séance énergétique créée plus haut avec cette ref");
  } else {
    const eid = idOf(raw.energy_session_id, `${path}.energy_session_id`);
    const own = (ctx.state.energyOwned ?? []).find((x) => x.id === eid);
    if (!own) {
      fail(`${path}.energy_session_id`, "séance énergétique introuvable chez l'athlète : seules ses copies reçoivent une fiche (une séance de la bibliothèque est partagée avec d'autres athlètes)");
    }
    e = own;
    attached = docIdsOf(own.fiches);
  }
  const k = `energy:${e.id}`;
  if (!ctx.links.has(k)) ctx.links.set(k, attached);
  return { target: "energy" as const, id: e.id, name: e.name, key: k };
}

function habitName(v: unknown, path: string) {
  return reqText(v, 40, path).replace(/\s+/g, " ");
}

function mineHabit(raw: Obj, path: string, st: CareState) {
  const hid = idOf(raw.id, `${path}.id`);
  const h = (st.habits ?? []).find((x) => x.id === hid);
  if (!h) fail(`${path}.id`, `habitude « ${hid} » introuvable (voir GET /athletes/:id/habitudes)`);
  if (!h.mine || h.name === null) fail(`${path}.id`, "habitude que l'athlète s'est donnée : elle lui appartient, seul l'athlète la modifie");
  return h as { id: string; name: string; mine: true };
}

// ── Validation ──────────────────────────────────────────────────────────────

export function parseCareOp(raw: Obj, path: string, ctx: CareCtx): CareOp {
  const st = ctx.state;
  switch (raw.op) {
    case "assign_fiche": {
      onlyKeys(raw, ["op", "fiche_id", "note", "perso"], path);
      const f = fiche(raw, path, st);
      if ((st.manualFiches ?? []).includes(f.id)) fail(`${path}.fiche_id`, `« ${f.title} » est déjà attribuée à l'athlète`);
      const note = raw.note === undefined || raw.note === null ? null : (cleanText(raw.note, 500, `${path}.note`) || null);
      if (raw.perso !== undefined && typeof raw.perso !== "boolean") fail(`${path}.perso`, "true ou false attendu");
      const perso = raw.perso === true;
      if (perso) {
        // Ranger dans les fiches de l'athlète une fiche que l'assistant a
        // déposée pour lui : jamais une fiche du coach, ni une fiche déjà
        // donnée à d'autres.
        if (!f.bank) fail(`${path}.perso`, "fiche déjà personnelle à l'athlète");
        if (!f.claude) fail(`${path}.perso`, "seule une fiche déposée par l'assistant peut devenir personnelle ; une fiche de la banque du coach reste dans la banque");
        if (f.shared) fail(`${path}.perso`, "fiche déjà donnée à d'autres athlètes : elle reste dans la banque");
        f.bank = false;
      }
      st.manualFiches = [...(st.manualFiches ?? []), f.id];
      return { op: "assign_fiche", doc_id: f.id, title: f.title, note, perso };
    }
    case "unassign_fiche": {
      onlyKeys(raw, ["op", "fiche_id"], path);
      const f = fiche(raw, path, st);
      if (!(st.manualFiches ?? []).includes(f.id)) {
        fail(`${path}.fiche_id`, `« ${f.title} » n'est pas attribuée à la main ; si elle vient d'une séance, retire-la de la séance (detach_fiche)`);
      }
      st.manualFiches = (st.manualFiches ?? []).filter((x) => x !== f.id);
      return { op: "unassign_fiche", doc_id: f.id, title: f.title };
    }
    case "attach_fiche": {
      onlyKeys(raw, ["op", "fiche_id", "session_id", "ref", "energy_session_id", "energy_ref"], path);
      const f = fiche(raw, path, st);
      const s = session(raw, path, ctx);
      const list = ctx.links.get(s.key)!;
      if (list.includes(f.id)) fail(path, `« ${f.title} » est déjà rattachée à « ${s.name} »`);
      ctx.links.set(s.key, [...list, f.id]);
      return { op: "attach_fiche", doc_id: f.id, title: f.title, target: s.target, session_id: s.id, session_name: s.name, attachment_id: ctx.newId() };
    }
    case "detach_fiche": {
      onlyKeys(raw, ["op", "fiche_id", "session_id", "energy_session_id"], path);
      const f = fiche(raw, path, st);
      const s = session(raw, path, ctx);
      const list = ctx.links.get(s.key)!;
      if (!list.includes(f.id)) fail(path, `« ${f.title} » n'est pas rattachée à « ${s.name} » (ou seulement à un de ses blocs : à retirer dans Agon)`);
      ctx.links.set(s.key, list.filter((x) => x !== f.id));
      return { op: "detach_fiche", doc_id: f.id, title: f.title, target: s.target, session_id: s.id, session_name: s.name };
    }

    case "create_habit": {
      onlyKeys(raw, ["op", "name", "icon", "color"], path);
      const row = {
        id: ctx.newId(),
        name: habitName(raw.name, `${path}.name`),
        emoji: raw.icon === undefined ? "habitude" : oneOf(raw.icon, HABIT_ICONS, `${path}.icon`),
        color: raw.color === undefined ? HABIT_COLORS[0] : oneOf(raw.color, HABIT_COLORS, `${path}.color`),
      };
      const clash = (st.habits ?? []).find((h) => h.name !== null && h.name.toLowerCase() === row.name.toLowerCase());
      if (clash) fail(`${path}.name`, `l'athlète a déjà l'habitude « ${clash.name} »`);
      const enable = st.habitTracker !== true;
      st.habitTracker = true;
      st.habits = [...(st.habits ?? []), { id: row.id, name: row.name, mine: true }];
      return { op: "create_habit", row, enable_tracker: enable };
    }
    case "update_habit": {
      onlyKeys(raw, ["op", "id", "name", "icon", "color"], path);
      const h = mineHabit(raw, path, st);
      const patch: { name?: string; emoji?: string; color?: string } = {};
      if (raw.name !== undefined) patch.name = habitName(raw.name, `${path}.name`);
      if (raw.icon !== undefined) patch.emoji = oneOf(raw.icon, HABIT_ICONS, `${path}.icon`);
      if (raw.color !== undefined) patch.color = oneOf(raw.color, HABIT_COLORS, `${path}.color`);
      if (Object.keys(patch).length === 0) fail(path, "rien à modifier");
      const was = h.name;
      if (patch.name) h.name = patch.name;
      return { op: "update_habit", id: h.id, name: was, patch };
    }
    case "remove_habit": {
      onlyKeys(raw, ["op", "id"], path);
      const h = mineHabit(raw, path, st);
      st.habits = (st.habits ?? []).filter((x) => x.id !== h.id);
      return { op: "remove_habit", id: h.id, name: h.name };
    }

    default:
      return fail(`${path}.op`, `opération inconnue (${CARE_OPS.join(", ")})`);
  }
}
