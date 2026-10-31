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

import {
  cleanText,
  fail,
  id,
  int,
  Invalid,
  isObj,
  num,
  type Obj,
  onlyKeys,
  reqText,
} from "./coachApiCheck.ts";
import { type EnergySessionShape, parseEnergySession } from "./coachApiEnergy.ts";
import { isPlanOpName, PLAN_OPS, parsePlanOp, type PlanCtx, type PlanOp, type PlanState } from "./coachApiPlan.ts";

export type { PlanOp, PlanState };

export { cleanText };

/**
 * Version du texte de consentement IA qui nomme l'assistant Claude du coach.
 *
 * Un accord `ai_programming` donné sous une version antérieure ne nommait que
 * Google Gemini : il ne vaut pas pour ce destinataire. Doit rester égal ou
 * inférieur à `LEGAL_VERSION` (`src/lib/legal.ts`) — un test le vérifie.
 */
export const AI_ASSISTANT_SINCE = "2026-10-30";

export const DRAFT_KINDS = ["axe", "programme", "planning", "objectifs", "semaine", "plan"] as const;
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
  sessionName: 80,
  blocName: 60,
  blocs: 12,
  exercicesPerBloc: 20,
  dayThemeNote: 500,
  /** Une semaine se propose au plus 8 semaines à l'avance. */
  horizonDays: 56,
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
  color?: string;
  series_mode?: "libre" | "fixe";
  timing_mode?: "libre" | "depart" | "repos";
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

/**
 * Semaine d'entraînement : créer des séances, les placer sur des dates,
 * poser le thème de chaque jour. Rien n'y supprime : une séance déjà prévue
 * reste prévue, la proposition ne fait qu'ajouter. Seul le thème d'un jour
 * qui en avait déjà un est remplacé, et l'aperçu le montre.
 */
export type WeekOp =
  | { op: "create_session"; session: ProgSessionShape }
  | { op: "place_session"; date: string; session_id: string }
  | { op: "create_energy_session"; energy: EnergySessionShape }
  | { op: "place_energy_session"; date: string; energy_session_id: string; name: string }
  | {
    op: "set_day_theme";
    date: string;
    label: string;
    intensity: DayIntensity | null;
    dominante: DayDominante | null;
    color: string;
    note: string;
  };

export type DraftOp = ProgOp | PlanningOp | GoalsOp | WeekOp | PlanOp;

// Listes du thème du jour, recopiées de `src/lib/dayTheme.ts` (un test
// vérifie qu'elles restent égales).
export const DAY_INTENSITIES = ["hard", "moyen", "easy", "recup_active", "repos"] as const;
export type DayIntensity = typeof DAY_INTENSITIES[number];
export const DAY_DOMINANTES = [
  "force", "puissance_vitesse", "volume", "aerobie", "seuil", "hyrox", "technique", "mixte",
] as const;
export type DayDominante = typeof DAY_DOMINANTES[number];
export const DAY_INTENSITY_COLOR: Record<DayIntensity, string> = {
  hard: "#ef4444",
  moyen: "#f59e0b",
  easy: "#22c55e",
  recup_active: "#06b6d4",
  repos: "#94a3b8",
};
export const DAY_DEFAULT_COLOR = "#3b82f6";

/** Catégories de bloc de l'éditeur (`BLOC_CATEGORIES`). */
export const BLOC_CATEGORIES = ["Echauffement", "Force", "Hypertrophie", "Explo/vitesse", "Mixte", "Cardio"] as const;
const BLOC_PALETTE = ["#FFC933", "#F97316", "#22C55E", "#EF4444", "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6"];

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

export interface ValidateCtx {
  prog: ProgSessionShape[];
  /** Fournit l'id d'un exercice ajouté : fixé à la validation, pour que
   *  l'application de la proposition soit déterministe. */
  newId: () => string;
  /** Lien vers la bibliothèque d'exercices par nom normalisé. */
  library?: Map<string, { id: string; name: string }>;
  /** Date du jour (AAAA-MM-JJ, Paris). Obligatoire pour une semaine. */
  today?: string;
  /** Séances énergétiques existantes que l'athlète peut recevoir. */
  energy?: Map<string, { name: string }>;
  /** Périodisation, compétitions, tests… de l'athlète. Obligatoire pour un plan. */
  plan?: PlanState;
}

/** Exercice ajouté par l'assistant, dans un bloc existant ou une séance créée. */
function parseNewExercice(e: unknown, ep: string, ctx: ValidateCtx): ExerciceShape {
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
  return exercice;
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

      const exercice = parseNewExercice(raw.exercice, `${path}.exercice`, ctx);
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

// ─────────────────────────────── Semaine ────────────────────────────────────

const REF = /^[A-Za-z0-9_-]{1,32}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** « Full body 2 » → « FB2 » : même règle que l'import YOXX (`deriveShort`). */
export function deriveShort(name: string): string {
  const words = normName(name).split(/\s+/).filter(Boolean);
  return words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join("").slice(0, 5) || "S";
}

function weekDate(v: unknown, path: string, today: string): string {
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) {
    fail(path, "date AAAA-MM-JJ attendue");
  }
  if (v < today) fail(path, `date passée (aujourd'hui : ${today})`);
  const last = addDays(today, LIMITS.horizonDays);
  if (v > last) fail(path, `${LIMITS.horizonDays} jours à l'avance au plus (jusqu'au ${last})`);
  return v;
}

function hexColor(v: unknown, path: string): string {
  if (typeof v !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())) {
    fail(path, "couleur #rrggbb attendue");
  }
  const hex = v.trim().toLowerCase().slice(1);
  return "#" + (hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex);
}

function parseRef(v: unknown, path: string, refs: Map<string, unknown>): string {
  if (typeof v !== "string" || !REF.test(v)) fail(path, "référence attendue : lettres, chiffres, - ou _, 32 caractères maximum");
  if (refs.has(v)) fail(path, `référence « ${v} » déjà utilisée dans cette proposition`);
  return v;
}

function parseNewSession(raw: Obj, path: string, ctx: ValidateCtx): ProgSessionShape {
  const name = reqText(raw.name, LIMITS.sessionName, `${path}.name`);
  const short = raw.short === undefined
    ? deriveShort(name)
    : reqText(raw.short, 6, `${path}.short`).toUpperCase();
  if (!Array.isArray(raw.blocs) || raw.blocs.length === 0) fail(`${path}.blocs`, "au moins un bloc attendu");
  if (raw.blocs.length > LIMITS.blocs) fail(`${path}.blocs`, `${LIMITS.blocs} blocs maximum`);
  const sessionId = ctx.newId();
  const blocs: BlocShape[] = raw.blocs.map((b: unknown, i: number) => {
    const bp = `${path}.blocs[${i}]`;
    if (!isObj(b)) fail(bp, "objet attendu");
    onlyKeys(b, ["name", "category", "instructions", "exercices"], bp);
    if (!Array.isArray(b.exercices) || b.exercices.length === 0) fail(`${bp}.exercices`, "au moins un exercice attendu");
    if (b.exercices.length > LIMITS.exercicesPerBloc) fail(`${bp}.exercices`, `${LIMITS.exercicesPerBloc} exercices maximum par bloc`);
    const bloc: BlocShape = {
      id: ctx.newId(),
      name: reqText(b.name, LIMITS.blocName, `${bp}.name`),
      category: b.category === undefined
        ? "Mixte"
        : (BLOC_CATEGORIES.includes(b.category as typeof BLOC_CATEGORIES[number])
          ? b.category as string
          : fail(`${bp}.category`, `${BLOC_CATEGORIES.join(", ")} attendu`)),
      color: BLOC_PALETTE[i % BLOC_PALETTE.length],
      series_mode: "libre",
      timing_mode: "libre",
      sort_order: i,
      exercices: b.exercices.map((e: unknown, j: number) => ({
        ...parseNewExercice(e, `${bp}.exercices[${j}]`, ctx),
        sort_order: j,
      })),
    };
    if (b.instructions !== undefined) {
      const t = cleanText(b.instructions, LIMITS.instructions, `${bp}.instructions`);
      if (t) bloc.instructions = t;
    }
    return bloc;
  });
  // Une séance créée pour une semaine n'a lieu qu'aux dates où elle est
  // placée : « once », sans jour fixe, pour ne pas se répéter seule ensuite.
  return { id: sessionId, name, short, recurrence: "once", multi_semaine: false, blocs };
}

/**
 * Opérations d'une semaine, lues une à une. Les séances créées portent une
 * `ref` choisie par l'assistant, citée ensuite par `place_session` /
 * `place_energy_session` ; elle doit être créée avant d'être placée.
 *
 * `plan` : la semaine fait partie d'une planification, une séance créée peut
 * alors revenir chaque semaine (`recurrence: "weekly"` + `day_of_week`) pour
 * être répartie sur un cycle.
 */
function weekParser(ctx: ValidateCtx, plan: boolean) {
  const today = ctx.today;
  if (!today) throw new Error("validateDraft: today manquant pour une semaine");
  const sessionRefs = new Map<string, ProgSessionShape>();
  const energyRefs = new Map<string, EnergySessionShape>();
  const placed = new Set<string>();
  const themed = new Set<string>();

  const parse = (raw: Obj, path: string): WeekOp => {
    switch (raw.op) {
      case "create_session": {
        onlyKeys(raw, ["op", "ref", "name", "short", "blocs", ...(plan ? ["day_of_week", "recurrence"] : [])], path);
        const ref = parseRef(raw.ref, `${path}.ref`, sessionRefs);
        const session = parseNewSession(raw, path, ctx);
        if (raw.day_of_week !== undefined) session.day_of_week = int(raw.day_of_week, 0, 6, `${path}.day_of_week`);
        if (raw.recurrence !== undefined) {
          if (raw.recurrence !== "weekly" && raw.recurrence !== "once") fail(`${path}.recurrence`, "« weekly » ou « once » attendu");
          session.recurrence = raw.recurrence;
        }
        if (session.recurrence === "weekly" && session.day_of_week === undefined) {
          fail(`${path}.day_of_week`, "une séance hebdomadaire a besoin de son jour (0 = lundi … 6 = dimanche)");
        }
        sessionRefs.set(ref, session);
        return { op: "create_session", session };
      }

      case "create_energy_session": {
        onlyKeys(raw, ["op", "ref", "name", "session_kind", "structure_type", "notes", "intervals"], path);
        const ref = parseRef(raw.ref, `${path}.ref`, energyRefs);
        const energy = parseEnergySession(raw, path, ctx.newId);
        energyRefs.set(ref, energy);
        return { op: "create_energy_session", energy };
      }

      case "place_session": {
        onlyKeys(raw, ["op", "date", "session_id", "ref"], path);
        const date = weekDate(raw.date, `${path}.date`, today);
        let sessionId: string;
        if (raw.ref !== undefined) {
          if (raw.session_id !== undefined) fail(path, "session_id ou ref, pas les deux");
          const created = typeof raw.ref === "string" ? sessionRefs.get(raw.ref) : undefined;
          if (!created) fail(`${path}.ref`, "aucune séance créée plus haut avec cette ref (create_session avant place_session)");
          sessionId = created.id;
        } else {
          sessionId = findSession(ctx.prog, id(raw.session_id, `${path}.session_id`), `${path}.session_id`).id;
        }
        const key = `${sessionId}|${date}`;
        if (placed.has(key)) fail(path, "séance déjà placée à cette date dans cette proposition");
        placed.add(key);
        return { op: "place_session", date, session_id: sessionId };
      }

      case "place_energy_session": {
        onlyKeys(raw, ["op", "date", "energy_session_id", "ref"], path);
        const date = weekDate(raw.date, `${path}.date`, today);
        let energyId: string;
        let name: string;
        if (raw.ref !== undefined) {
          if (raw.energy_session_id !== undefined) fail(path, "energy_session_id ou ref, pas les deux");
          const created = typeof raw.ref === "string" ? energyRefs.get(raw.ref) : undefined;
          if (!created) fail(`${path}.ref`, "aucune séance énergétique créée plus haut avec cette ref (create_energy_session avant place_energy_session)");
          energyId = created.id;
          name = created.name;
        } else {
          energyId = id(raw.energy_session_id, `${path}.energy_session_id`);
          const known = ctx.energy?.get(energyId);
          if (!known) fail(`${path}.energy_session_id`, "séance énergétique introuvable (voir GET /seances-energie)");
          name = known.name;
        }
        const key = `e:${energyId}|${date}`;
        if (placed.has(key)) fail(path, "séance déjà placée à cette date dans cette proposition");
        placed.add(key);
        return { op: "place_energy_session", date, energy_session_id: energyId, name };
      }

      case "set_day_theme": {
        onlyKeys(raw, ["op", "date", "label", "intensity", "dominante", "color", "note"], path);
        const date = weekDate(raw.date, `${path}.date`, today);
        if (themed.has(date)) fail(`${path}.date`, "un seul thème par jour");
        themed.add(date);
        const label = raw.label === undefined
          ? ""
          : cleanText(raw.label, 40, `${path}.label`).replace(/\s+/g, " ");
        const intensity = raw.intensity === undefined || raw.intensity === null
          ? null
          : (DAY_INTENSITIES.includes(raw.intensity as DayIntensity)
            ? raw.intensity as DayIntensity
            : fail(`${path}.intensity`, `${DAY_INTENSITIES.join(", ")} attendu`));
        const dominante = raw.dominante === undefined || raw.dominante === null
          ? null
          : (DAY_DOMINANTES.includes(raw.dominante as DayDominante)
            ? raw.dominante as DayDominante
            : fail(`${path}.dominante`, `${DAY_DOMINANTES.join(", ")} attendu`));
        // Un thème vide ne s'affiche pas chez l'athlète : il n'a rien à faire
        // dans une proposition.
        if (!label && !intensity && !dominante) fail(path, "label, intensity ou dominante attendu");
        const color = raw.color === undefined
          ? (intensity ? DAY_INTENSITY_COLOR[intensity] : DAY_DEFAULT_COLOR)
          : hexColor(raw.color, `${path}.color`);
        const note = raw.note === undefined ? "" : cleanText(raw.note, LIMITS.dayThemeNote, `${path}.note`);
        return { op: "set_day_theme", date, label, intensity, dominante, color, note };
      }

      default:
        return fail(`${path}.op`, plan
          ? `opération inconnue (attendues : ${[...WEEK_OPS, ...PLAN_OPS].join(", ")})`
          : `${WEEK_OPS.join(", ")} attendu`);
    }
  };
  return { parse, sessionRefs };
}

const WEEK_OPS = ["create_session", "place_session", "create_energy_session", "place_energy_session", "set_day_theme"] as const;

function parseWeekOps(rawOps: Obj[], ctx: ValidateCtx): WeekOp[] {
  const p = weekParser(ctx, false);
  return rawOps.map((raw, i) => p.parse(raw, `ops[${i}]`));
}

/**
 * Planification : tout ce qu'une semaine sait faire, plus la périodisation,
 * les compétitions, les tests et les retraits du planning. Une seule
 * proposition, donc une seule annulation pour tout ce qu'elle a posé.
 */
function parsePlanOps(rawOps: Obj[], ctx: ValidateCtx): DraftOp[] {
  if (!ctx.plan) throw new Error("validateDraft: état du planning manquant pour un plan");
  const week = weekParser(ctx, true);
  const pctx: PlanCtx = {
    today: ctx.today!,
    newId: ctx.newId,
    // Copie : la validation fait évoluer l'état opération après opération.
    state: structuredClone(ctx.plan),
    sessions: () => [...ctx.prog, ...week.sessionRefs.values()],
    sessionRef: (r) => week.sessionRefs.get(r)?.id,
    refs: new Map(),
  };
  return rawOps.map((raw, i) => (
    isPlanOpName(raw.op) ? parsePlanOp(raw, `ops[${i}]`, pctx) : week.parse(raw, `ops[${i}]`)
  ));
}



/**
 * Ajoute au programme les séances créées par une semaine. Une séance déjà
 * présente (même id) est laissée telle quelle : appliquer deux fois — après
 * un échec réseau à mi-chemin — ne la duplique pas.
 */
export function applyWeekProgOps(prog: ProgSessionShape[], ops: readonly DraftOp[]): ProgSessionShape[] {
  let next = prog;
  for (const op of ops) {
    if (op.op !== "create_session") continue;
    if (next.some((s) => s.id === op.session.id)) continue;
    next = [...next, op.session];
  }
  return next;
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

    raw.ops.forEach((o: unknown, i: number) => {
      if (!isObj(o)) fail(`ops[${i}]`, "objet attendu");
    });
    if (kind === "semaine") {
      const ops = parseWeekOps(raw.ops as Obj[], ctx);
      return { ok: true, value: { kind: "semaine", title, body, ops } };
    }
    if (kind === "plan") {
      const ops = parsePlanOps(raw.ops as Obj[], ctx);
      return { ok: true, value: { kind: "plan", title, body, ops } };
    }

    const ops: DraftOp[] = (raw.ops as Obj[]).map((o, i) => {
      const p = `ops[${i}]`;
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
