/**
 * Propositions de l'assistant IA d'un coach : validation et application.
 *
 * Partagé entre l'Edge Function `coach-api`, qui valide une proposition avant
 * de l'enregistrer, et l'app, qui l'applique quand le coach clique. Une seule
 * définition des opérations : si le serveur et l'app avaient chacun la leur,
 * une proposition acceptée par l'un pourrait être appliquée autrement — ou
 * pas du tout — par l'autre.
 *
 * Module pur : ni Deno, ni navigateur, ni base. Testé par vitest.
 *
 * Le programme visé est `asp:prog` (`ProgSession[]`). Les formes ci-dessous
 * reprennent le strict nécessaire de
 * `src/features/coach/components/programmation/types.ts` ; les champs qu'elles
 * ne nomment pas (fiches, demandes vidéo, méthodes…) traversent l'application
 * intacts, par décomposition d'objet.
 */

/**
 * Version du texte de consentement IA qui nomme l'assistant Claude du coach.
 *
 * Un accord `ai_programming` donné sous une version antérieure ne nommait que
 * Google Gemini : il ne vaut pas pour ce destinataire. Doit rester égal ou
 * inférieur à `LEGAL_VERSION` (`src/lib/legal.ts`) — un test le vérifie.
 */
export const AI_ASSISTANT_SINCE = "2026-10-30";

export const DRAFT_KINDS = ["axe", "programme", "planning", "objectifs"] as const;
export type DraftKind = typeof DRAFT_KINDS[number];

export const LIMITS = {
  title: 120,
  body: 4000,
  ops: 50,
  comment: 500,
  libreText: 500,
  instructions: 1000,
  exerciseName: 80,
  tempo: 12,
  series: 20,
} as const;

// ─────────────────────────────── Formes ─────────────────────────────────────

export type ParamValue<T> =
  | { mode: "global"; value: T }
  | { mode: "par_serie"; values: T[] };

export interface ExerciceParamsShape {
  nb_series: number;
  reps: ParamValue<number>;
  reps_max?: ParamValue<number | null>;
  reps_mode: ParamValue<"EC" | "iso">;
  charge_unit: "%RM" | "kg" | "PDC";
  charge: ParamValue<number | null>;
  rir: ParamValue<number | null>;
  tempo: ParamValue<string>;
  manual_rm?: number | null;
}

export interface ExerciceShape {
  id: string;
  exercise_id: string;
  exercise_name: string;
  mode: "classique" | "methode" | "libre";
  libre_text?: string;
  comment?: string;
  sort_order: number;
  params: ExerciceParamsShape | Record<string, ExerciceParamsShape>;
}

export interface BlocShape {
  id: string;
  name: string;
  category?: string;
  instructions?: string;
  sort_order: number;
  exercices: ExerciceShape[];
}

export interface ProgSessionShape {
  id: string;
  name: string;
  short: string;
  day_of_week?: number;
  recurrence: "weekly" | "once";
  multi_semaine: boolean;
  nb_semaines?: number;
  blocs: BlocShape[];
}

export interface GoalsShape {
  sessionsPerWeek: number;
  sleepTarget: number;
  sleepBedtime?: { h: number; m: number };
  sleepWakeup?: { h: number; m: number };
}

// ─────────────────────────────── Opérations ─────────────────────────────────

export type ProgOp =
  | {
    op: "add_exercice";
    session_id: string;
    bloc_id: string;
    /** Rang d'insertion dans le bloc (0 = en tête). Absent = à la fin. */
    position?: number;
    exercice: ExerciceShape;
  }
  | {
    op: "update_exercice";
    session_id: string;
    exercice_id: string;
    /**
     * Occurrence de la séance à partir de laquelle la modification vaut,
     * jusqu'à la prochaine occurrence qui a ses propres valeurs. Obligatoire
     * pour `params` : sans elle, l'édition réécrirait aussi les séances déjà
     * faites.
     */
    a_partir_de?: number;
    params?: ExerciceParamsShape;
    comment?: string;
    libre_text?: string;
  }
  | { op: "remove_exercice"; session_id: string; exercice_id: string }
  | { op: "set_bloc_instructions"; session_id: string; bloc_id: string; instructions: string };

export type PlanningOp = {
  op: "set_session_schedule";
  session_id: string;
  /** 0 = lundi … 6 = dimanche ; null = sans jour fixe. */
  day_of_week: number | null;
  recurrence?: "weekly" | "once";
};

export type GoalsOp = {
  op: "set_goals";
  sessionsPerWeek?: number;
  sleepTarget?: number;
  sleepBedtime?: { h: number; m: number };
  sleepWakeup?: { h: number; m: number };
};

export type DraftOp = ProgOp | PlanningOp | GoalsOp;

export interface ValidDraft {
  kind: DraftKind;
  title: string;
  body: string;
  ops: DraftOp[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Erreur d'application : la proposition ne correspond plus au programme. */
export class DraftApplyError extends Error {}

// ─────────────────────────────── Outils ─────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Erreur de validation, avec le chemin du champ fautif pour que l'IA corrige. */
class Invalid extends Error {}

function fail(path: string, msg: string): never {
  throw new Invalid(`${path} : ${msg}`);
}

function onlyKeys(o: Obj, allowed: readonly string[], path: string) {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) fail(`${path}.${k}`, `champ inconnu (attendus : ${allowed.join(", ")})`);
  }
}

/**
 * Texte libre : sans caractères de contrôle, borné. Ce texte sera affiché au
 * coach puis, s'il applique, à l'athlète — il ne doit rien contenir qu'un
 * humain n'ait pas pu taper.
 */
export function cleanText(v: unknown, max: number, path: string): string {
  if (typeof v !== "string") fail(path, "texte attendu");
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (s.length > max) fail(path, `${max} caractères maximum (reçu ${s.length})`);
  return s;
}

function reqText(v: unknown, max: number, path: string): string {
  const s = cleanText(v, max, path);
  if (!s) fail(path, "ne peut pas être vide");
  return s;
}

function int(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    fail(path, `entier entre ${min} et ${max} attendu`);
  }
  return v;
}

function num(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    fail(path, `nombre entre ${min} et ${max} attendu`);
  }
  return Math.round(v * 100) / 100;
}

function id(v: unknown, path: string): string {
  if (typeof v !== "string" || !v || v.length > 64) fail(path, "identifiant attendu");
  return v;
}

/** Normalisation de nom d'exercice pour retrouver l'entrée de bibliothèque. */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─────────────────────────────── Paramètres ─────────────────────────────────

/**
 * Valeur de paramètre. Accepte la forme stockée (`{ mode, value(s) }`) et
 * deux raccourcis, pour qu'un assistant n'ait pas à reproduire la structure
 * interne : une valeur seule (= globale) ou un tableau (= par série).
 */
function paramValue<T>(
  v: unknown,
  nbSeries: number,
  parse: (x: unknown, path: string) => T,
  path: string,
): ParamValue<T> {
  let values: unknown[] | null = null;
  let value: unknown;
  if (Array.isArray(v)) values = v;
  else if (isObj(v) && v.mode === "par_serie") {
    onlyKeys(v, ["mode", "values"], path);
    if (!Array.isArray(v.values)) fail(`${path}.values`, "tableau attendu");
    values = v.values;
  } else if (isObj(v) && v.mode === "global") {
    onlyKeys(v, ["mode", "value"], path);
    value = v.value;
  } else value = v;

  if (values) {
    if (values.length !== nbSeries) {
      fail(path, `${nbSeries} valeurs attendues, une par série (reçu ${values.length})`);
    }
    return { mode: "par_serie", values: values.map((x, i) => parse(x, `${path}[${i}]`)) };
  }
  return { mode: "global", value: parse(value, path) };
}

const PARAM_KEYS = [
  "nb_series", "reps", "reps_max", "reps_mode", "charge_unit", "charge", "rir", "tempo", "manual_rm",
] as const;

export function parseParams(raw: unknown, path: string): ExerciceParamsShape {
  if (!isObj(raw)) fail(path, "objet attendu");
  onlyKeys(raw, PARAM_KEYS, path);

  const nb = int(raw.nb_series, 1, LIMITS.series, `${path}.nb_series`);
  const unit = raw.charge_unit ?? "kg";
  if (unit !== "kg" && unit !== "%RM" && unit !== "PDC") {
    fail(`${path}.charge_unit`, "« kg », « %RM » ou « PDC » attendu");
  }
  const chargeMax = unit === "%RM" ? 200 : 1000;

  const repsN = (x: unknown, p: string) => int(x, 0, 100, p);
  const repsOrNull = (x: unknown, p: string) => (x === null ? null : int(x, 0, 100, p));
  const charge = (x: unknown, p: string) => (x === null || x === undefined ? null : num(x, 0, chargeMax, p));
  const rir = (x: unknown, p: string) => (x === null || x === undefined ? null : num(x, 0, 10, p));
  const tempo = (x: unknown, p: string) => (x === undefined ? "" : cleanText(x, LIMITS.tempo, p));
  const repsMode = (x: unknown, p: string): "EC" | "iso" => {
    if (x === undefined || x === "EC") return "EC";
    if (x === "iso") return "iso";
    return fail(p, "« EC » ou « iso » attendu");
  };

  const out: ExerciceParamsShape = {
    nb_series: nb,
    reps: paramValue(raw.reps, nb, repsN, `${path}.reps`),
    reps_mode: paramValue(raw.reps_mode, nb, repsMode, `${path}.reps_mode`),
    charge_unit: unit,
    charge: paramValue(raw.charge, nb, charge, `${path}.charge`),
    rir: paramValue(raw.rir, nb, rir, `${path}.rir`),
    tempo: paramValue(raw.tempo, nb, tempo, `${path}.tempo`),
  };
  if (raw.reps_max !== undefined) out.reps_max = paramValue(raw.reps_max, nb, repsOrNull, `${path}.reps_max`);
  if (raw.manual_rm !== undefined) {
    out.manual_rm = raw.manual_rm === null ? null : num(raw.manual_rm, 0, 1000, `${path}.manual_rm`);
  }
  return out;
}

// ─────────────────────────── Occurrences de séance ──────────────────────────

/** True quand les params sont indexés par occurrence (clés numériques). */
export function isWeekRecord(p: unknown): p is Record<string, ExerciceParamsShape> {
  return isObj(p) && Object.keys(p).some((k) => /^\d+$/.test(k));
}

/**
 * Passe une séance en stockage par occurrence sans changer ce qu'elle
 * produit. Même règle que `toMultiWeekSession` (`src/lib/sessionOccurrence.ts`),
 * reprise ici parce que ce module ne peut pas importer depuis `src/`.
 */
export function toMultiWeek(session: ProgSessionShape): ProgSessionShape {
  const flat = (ex: ExerciceShape) => ex.params && !isWeekRecord(ex.params);
  const needs = !session.multi_semaine || session.blocs.some((b) => b.exercices.some(flat));
  if (!needs) return session;
  let maxWeek = 0;
  for (const b of session.blocs) for (const ex of b.exercices) {
    if (!isWeekRecord(ex.params)) continue;
    for (const k of Object.keys(ex.params)) if (/^\d+$/.test(k)) maxWeek = Math.max(maxWeek, Number(k));
  }
  return {
    ...session,
    multi_semaine: true,
    nb_semaines: Math.max(session.nb_semaines ?? 1, maxWeek, 1),
    blocs: session.blocs.map((b) => ({
      ...b,
      exercices: b.exercices.map((ex) => (flat(ex) ? { ...ex, params: { "1": ex.params as ExerciceParamsShape } } : ex)),
    })),
  };
}

// ─────────────────────────────── Validation ─────────────────────────────────

function findSession(prog: ProgSessionShape[], sid: string, path: string): ProgSessionShape {
  const s = prog.find((x) => x.id === sid);
  if (!s) fail(path, `séance « ${sid} » introuvable dans le programme`);
  return s;
}

function findExercice(session: ProgSessionShape, eid: string, path: string): ExerciceShape {
  for (const b of session.blocs) for (const e of b.exercices) if (e.id === eid) return e;
  return fail(path, `exercice « ${eid} » introuvable dans la séance « ${session.name} »`);
}

function findBloc(session: ProgSessionShape, bid: string, path: string): BlocShape {
  const b = session.blocs.find((x) => x.id === bid);
  if (!b) fail(path, `bloc « ${bid} » introuvable dans la séance « ${session.name} »`);
  return b;
}

interface ValidateCtx {
  prog: ProgSessionShape[];
  /** Fournit l'id d'un exercice ajouté : fixé à la validation, pour que
   *  l'application de la proposition soit déterministe. */
  newId: () => string;
  /** Lien vers la bibliothèque d'exercices par nom normalisé. */
  library?: Map<string, { id: string; name: string }>;
}

function parseProgOp(raw: Obj, path: string, ctx: ValidateCtx): ProgOp {
  switch (raw.op) {
    case "add_exercice": {
      onlyKeys(raw, ["op", "session_id", "bloc_id", "position", "exercice"], path);
      const session = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`);
      const bloc = findBloc(session, id(raw.bloc_id, `${path}.bloc_id`), `${path}.bloc_id`);
      const position = raw.position === undefined
        ? undefined
        : int(raw.position, 0, bloc.exercices.length, `${path}.position`);

      const e = raw.exercice;
      const ep = `${path}.exercice`;
      if (!isObj(e)) fail(ep, "objet attendu");
      onlyKeys(e, ["exercise_name", "mode", "libre_text", "comment", "params"], ep);
      const name = reqText(e.exercise_name, LIMITS.exerciseName, `${ep}.exercise_name`);
      const mode = e.mode ?? "classique";
      if (mode !== "classique" && mode !== "libre") {
        fail(`${ep}.mode`, "« classique » ou « libre » attendu (les méthodes se choisissent dans Agon)");
      }
      const lib = ctx.library?.get(normName(name));
      const exercice: ExerciceShape = {
        id: ctx.newId(),
        exercise_id: lib?.id ?? "",
        exercise_name: lib?.name ?? name,
        mode,
        sort_order: 0,
        // Un exercice libre garde des paramètres, comme dans l'éditeur où le
        // mode libre se choisit sur un exercice existant : ceux de
        // `defaultExerciceParams`, s'il n'en donne pas.
        params: mode === "classique"
          ? parseParams(e.params, `${ep}.params`)
          : parseParams(e.params ?? { nb_series: 4, reps: 8, rir: 2 }, `${ep}.params`),
      };
      if (mode === "libre") exercice.libre_text = reqText(e.libre_text, LIMITS.libreText, `${ep}.libre_text`);
      if (e.comment !== undefined) exercice.comment = cleanText(e.comment, LIMITS.comment, `${ep}.comment`);
      return {
        op: "add_exercice", session_id: session.id, bloc_id: bloc.id, exercice,
        ...(position !== undefined ? { position } : {}),
      };
    }

    case "update_exercice": {
      onlyKeys(raw, ["op", "session_id", "exercice_id", "a_partir_de", "params", "comment", "libre_text"], path);
      const session = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`);
      const ex = findExercice(session, id(raw.exercice_id, `${path}.exercice_id`), `${path}.exercice_id`);
      const op: ProgOp = { op: "update_exercice", session_id: session.id, exercice_id: ex.id };
      if (raw.params !== undefined) {
        if (ex.mode === "methode") {
          fail(`${path}.params`, "exercice en mode méthode : ses paramètres viennent de la méthode, à modifier dans Agon");
        }
        if (raw.a_partir_de === undefined) {
          fail(`${path}.a_partir_de`, "obligatoire avec params : numéro de l'occurrence de la séance à partir de laquelle la modification vaut (voir prochaine_occurrence)");
        }
        op.a_partir_de = int(raw.a_partir_de, 1, 200, `${path}.a_partir_de`);
        op.params = parseParams(raw.params, `${path}.params`);
      }
      if (raw.comment !== undefined) op.comment = cleanText(raw.comment, LIMITS.comment, `${path}.comment`);
      if (raw.libre_text !== undefined) {
        if (ex.mode !== "libre") fail(`${path}.libre_text`, "réservé aux exercices en mode libre");
        op.libre_text = reqText(raw.libre_text, LIMITS.libreText, `${path}.libre_text`);
      }
      if (op.params === undefined && op.comment === undefined && op.libre_text === undefined) {
        fail(path, "rien à modifier (params, comment ou libre_text)");
      }
      return op;
    }

    case "remove_exercice": {
      onlyKeys(raw, ["op", "session_id", "exercice_id"], path);
      const session = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`);
      const ex = findExercice(session, id(raw.exercice_id, `${path}.exercice_id`), `${path}.exercice_id`);
      return { op: "remove_exercice", session_id: session.id, exercice_id: ex.id };
    }

    case "set_bloc_instructions": {
      onlyKeys(raw, ["op", "session_id", "bloc_id", "instructions"], path);
      const session = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`);
      const bloc = findBloc(session, id(raw.bloc_id, `${path}.bloc_id`), `${path}.bloc_id`);
      return {
        op: "set_bloc_instructions", session_id: session.id, bloc_id: bloc.id,
        instructions: cleanText(raw.instructions, LIMITS.instructions, `${path}.instructions`),
      };
    }

    default:
      return fail(`${path}.op`, "add_exercice, update_exercice, remove_exercice ou set_bloc_instructions attendu");
  }
}

function parsePlanningOp(raw: Obj, path: string, ctx: ValidateCtx): PlanningOp {
  if (raw.op !== "set_session_schedule") fail(`${path}.op`, "set_session_schedule attendu");
  onlyKeys(raw, ["op", "session_id", "day_of_week", "recurrence"], path);
  const session = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`);
  if (raw.day_of_week === undefined) fail(`${path}.day_of_week`, "obligatoire (0 = lundi … 6 = dimanche, ou null)");
  const op: PlanningOp = {
    op: "set_session_schedule",
    session_id: session.id,
    day_of_week: raw.day_of_week === null ? null : int(raw.day_of_week, 0, 6, `${path}.day_of_week`),
  };
  if (raw.recurrence !== undefined) {
    if (raw.recurrence !== "weekly" && raw.recurrence !== "once") {
      fail(`${path}.recurrence`, "« weekly » ou « once » attendu");
    }
    op.recurrence = raw.recurrence;
  }
  return op;
}

function hm(v: unknown, path: string): { h: number; m: number } {
  if (!isObj(v)) fail(path, "{ h, m } attendu");
  onlyKeys(v, ["h", "m"], path);
  return { h: int(v.h, 0, 23, `${path}.h`), m: int(v.m, 0, 59, `${path}.m`) };
}

function parseGoalsOp(raw: Obj, path: string): GoalsOp {
  if (raw.op !== "set_goals") fail(`${path}.op`, "set_goals attendu");
  onlyKeys(raw, ["op", "sessionsPerWeek", "sleepTarget", "sleepBedtime", "sleepWakeup"], path);
  const op: GoalsOp = { op: "set_goals" };
  if (raw.sessionsPerWeek !== undefined) op.sessionsPerWeek = int(raw.sessionsPerWeek, 1, 14, `${path}.sessionsPerWeek`);
  if (raw.sleepTarget !== undefined) op.sleepTarget = num(raw.sleepTarget, 4, 12, `${path}.sleepTarget`);
  if (raw.sleepBedtime !== undefined) op.sleepBedtime = hm(raw.sleepBedtime, `${path}.sleepBedtime`);
  if (raw.sleepWakeup !== undefined) op.sleepWakeup = hm(raw.sleepWakeup, `${path}.sleepWakeup`);
  if (Object.keys(op).length === 1) fail(path, "aucun objectif à modifier");
  return op;
}

/**
 * Valide une proposition reçue par l'API.
 *
 * Champs connus seulement, longueurs bornées, références vérifiées contre le
 * programme courant, puis application à blanc : une proposition acceptée ici
 * s'applique telle quelle tant que le programme n'a pas changé.
 */
export function validateDraft(raw: unknown, ctx: ValidateCtx): Result<ValidDraft> {
  try {
    if (!isObj(raw)) fail("body", "objet JSON attendu");
    onlyKeys(raw, ["kind", "title", "body", "ops"], "body");
    const kind = raw.kind;
    if (!DRAFT_KINDS.includes(kind as DraftKind)) fail("kind", `${DRAFT_KINDS.join(", ")} attendu`);
    const title = reqText(raw.title, LIMITS.title, "title");
    const body = raw.body === undefined ? "" : cleanText(raw.body, LIMITS.body, "body");

    if (kind === "axe") {
      if (raw.ops !== undefined && !(Array.isArray(raw.ops) && raw.ops.length === 0)) {
        fail("ops", "un axe de travail est un texte : pas d'opérations");
      }
      if (!body) fail("body", "le contenu de l'axe de travail ne peut pas être vide");
      return { ok: true, value: { kind: "axe", title, body, ops: [] } };
    }

    if (!Array.isArray(raw.ops) || raw.ops.length === 0) fail("ops", "au moins une opération attendue");
    if (raw.ops.length > LIMITS.ops) fail("ops", `${LIMITS.ops} opérations maximum`);

    const ops: DraftOp[] = raw.ops.map((o: unknown, i: number) => {
      const p = `ops[${i}]`;
      if (!isObj(o)) fail(p, "objet attendu");
      if (kind === "programme") return parseProgOp(o, p, ctx);
      if (kind === "planning") return parsePlanningOp(o, p, ctx);
      return parseGoalsOp(o, p);
    });

    // Application à blanc : détecte par exemple deux suppressions du même
    // exercice, ou une modification d'un exercice supprimé plus haut.
    if (kind === "programme" || kind === "planning") {
      try {
        applyProgOps(ctx.prog, ops as (ProgOp | PlanningOp)[]);
      } catch (e) {
        if (e instanceof DraftApplyError) fail("ops", e.message);
        throw e;
      }
    }
    return { ok: true, value: { kind: kind as DraftKind, title, body, ops } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

// ─────────────────────────────── Application ────────────────────────────────

function mapSession(
  prog: ProgSessionShape[],
  sid: string,
  f: (s: ProgSessionShape) => ProgSessionShape,
): ProgSessionShape[] {
  if (!prog.some((s) => s.id === sid)) throw new DraftApplyError(`la séance « ${sid} » n'existe plus`);
  return prog.map((s) => (s.id === sid ? f(s) : s));
}

function hasExercice(s: ProgSessionShape, eid: string): boolean {
  return s.blocs.some((b) => b.exercices.some((e) => e.id === eid));
}

function mapExercice(
  s: ProgSessionShape,
  eid: string,
  f: (e: ExerciceShape) => ExerciceShape,
): ProgSessionShape {
  if (!hasExercice(s, eid)) throw new DraftApplyError(`l'exercice « ${eid} » n'existe plus dans « ${s.name} »`);
  return { ...s, blocs: s.blocs.map((b) => ({ ...b, exercices: b.exercices.map((e) => (e.id === eid ? f(e) : e)) })) };
}

/** Renumérote `sort_order` dans l'ordre du tableau, comme le fait l'éditeur. */
function renumber(exercices: ExerciceShape[]): ExerciceShape[] {
  return exercices.map((e, i) => (e.sort_order === i ? e : { ...e, sort_order: i }));
}

/**
 * Applique des opérations de programme ou de planning à `asp:prog`.
 *
 * Ne modifie pas l'entrée. Lève `DraftApplyError` si une référence n'existe
 * plus — le programme a changé depuis la proposition.
 */
export function applyProgOps(
  prog: ProgSessionShape[],
  ops: readonly (ProgOp | PlanningOp)[],
): ProgSessionShape[] {
  let next = prog;
  for (const op of ops) {
    switch (op.op) {
      case "add_exercice":
        next = mapSession(next, op.session_id, (s) => {
          if (!s.blocs.some((b) => b.id === op.bloc_id)) {
            throw new DraftApplyError(`le bloc « ${op.bloc_id} » n'existe plus dans « ${s.name} »`);
          }
          if (hasExercice(s, op.exercice.id)) throw new DraftApplyError("exercice déjà ajouté");
          return {
            ...s,
            blocs: s.blocs.map((b) => {
              if (b.id !== op.bloc_id) return b;
              const list = [...b.exercices];
              list.splice(op.position ?? list.length, 0, { ...op.exercice });
              return { ...b, exercices: renumber(list) };
            }),
          };
        });
        break;

      case "update_exercice":
        next = mapSession(next, op.session_id, (s) => {
          let session = s;
          if (op.params) {
            session = toMultiWeek(session);
            session = { ...session, nb_semaines: Math.max(session.nb_semaines ?? 1, op.a_partir_de ?? 1) };
          }
          return mapExercice(session, op.exercice_id, (e) => {
            const out: ExerciceShape = { ...e };
            if (op.params) {
              out.params = { ...(e.params as Record<string, ExerciceParamsShape>), [String(op.a_partir_de ?? 1)]: op.params };
            }
            if (op.comment !== undefined) out.comment = op.comment;
            if (op.libre_text !== undefined) out.libre_text = op.libre_text;
            return out;
          });
        });
        break;

      case "remove_exercice":
        next = mapSession(next, op.session_id, (s) => {
          if (!hasExercice(s, op.exercice_id)) {
            throw new DraftApplyError(`l'exercice « ${op.exercice_id} » n'existe plus dans « ${s.name} »`);
          }
          return {
            ...s,
            blocs: s.blocs.map((b) => (
              b.exercices.some((e) => e.id === op.exercice_id)
                ? { ...b, exercices: renumber(b.exercices.filter((e) => e.id !== op.exercice_id)) }
                : b
            )),
          };
        });
        break;

      case "set_bloc_instructions":
        next = mapSession(next, op.session_id, (s) => {
          if (!s.blocs.some((b) => b.id === op.bloc_id)) {
            throw new DraftApplyError(`le bloc « ${op.bloc_id} » n'existe plus dans « ${s.name} »`);
          }
          return { ...s, blocs: s.blocs.map((b) => (b.id === op.bloc_id ? { ...b, instructions: op.instructions } : b)) };
        });
        break;

      case "set_session_schedule":
        next = mapSession(next, op.session_id, (s) => {
          const out = { ...s, ...(op.recurrence ? { recurrence: op.recurrence } : {}) };
          if (op.day_of_week === null) delete out.day_of_week;
          else out.day_of_week = op.day_of_week;
          return out;
        });
        break;
    }
  }
  return next;
}

/** Applique des opérations d'objectifs. Ne modifie pas l'entrée. */
export function applyGoalsOps(goals: GoalsShape, ops: readonly GoalsOp[]): GoalsShape {
  let next = goals;
  for (const op of ops) {
    next = {
      ...next,
      ...(op.sessionsPerWeek !== undefined ? { sessionsPerWeek: op.sessionsPerWeek } : {}),
      ...(op.sleepTarget !== undefined ? { sleepTarget: op.sleepTarget } : {}),
      ...(op.sleepBedtime !== undefined ? { sleepBedtime: op.sleepBedtime } : {}),
      ...(op.sleepWakeup !== undefined ? { sleepWakeup: op.sleepWakeup } : {}),
    };
  }
  return next;
}
