/**
 * Séances énergétiques proposées par l'assistant IA d'un coach.
 *
 * Reprend la structure stockée dans `energy_sessions.intervals`
 * (`src/types/energy.ts`) : mêmes noms de champs, mêmes unités. Ce module ne
 * peut pas importer depuis `src/` (il tourne aussi dans Deno) : les listes
 * fermées sont recopiées ici, et un test vérifie qu'elles restent égales à
 * celles de l'app.
 *
 * Exclu : les étapes « exercice » des séances spécifiques, le format
 * classique par blocs, les schémas terrain et les images. Ce qui ne s'écrit
 * pas proprement en JSON se construit dans l'éditeur d'Agon.
 */
import { cleanText, fail, int, isObj, num, type Obj, oneOf, onlyKeys, reqText } from "./coachApiCheck.ts";

export const ENERGY_KINDS = ["vo2", "tempo", "seuil", "footing", "fartlek", "autre"] as const;
export type EnergyKind = typeof ENERGY_KINDS[number];

export const ENERGY_ROLES = ["warmup", "work", "recovery", "rest", "cooldown", "open"] as const;
type Role = typeof ENERGY_ROLES[number];

/** Clés d'équipement de l'éditeur (`EQUIPMENT_WORDS` de l'import YOXX). */
export const ENERGY_EQUIPMENT = ["course", "rameur", "skierg", "bikeerg", "velo", "elliptique", "corde", "autre"] as const;

/** Métriques de test reconnues par l'app pour les cibles en %. */
export const PACE_TEST_METRICS = ["VMA", "VC", "Allure 10K", "Allure semi", "Allure marathon"] as const;
export const POWER_TEST_METRICS = ["PMA", "FTP", "PC30", "PC5"] as const;

export const ENERGY_LIMITS = {
  name: 80,
  notes: 1000,
  stepNotes: 300,
  instructions: 500,
  textTarget: 120,
  /** Étapes au total, groupes compris. */
  steps: 120,
  depth: 3,
} as const;

// ── Formes stockées ─────────────────────────────────────────────────────────

export type EnergyDurationShape = { kind: "time" | "distance" | "calories"; value: number } | { kind: "lap_button" };

export type EnergyTargetShape =
  | { kind: "none" }
  | { kind: "hr_zone"; zone: 1 | 2 | 3 | 4 | 5 }
  | { kind: "hr_pct"; min: number; max: number }
  | { kind: "hr_bpm"; min: number; max: number }
  | { kind: "pace"; min_s_per_unit: number; max_s_per_unit: number; unit: "min_per_km" | "kmh" }
  | { kind: "pace_test_pct"; test_metric: string; min: number; max: number }
  | { kind: "power"; min: number; max: number }
  | { kind: "power_test_pct"; test_metric: string; min: number; max: number }
  | { kind: "cadence"; min: number; max: number; unit: "spm" | "rpm" }
  | { kind: "x_per_y"; x_kind: "time" | "cal" | "watt"; y_kind: "time" | "distance"; x_value: number; y_value: number }
  | { kind: "text"; value: string };

export interface EnergyIntervalShape {
  type: "interval";
  id: string;
  role: Role;
  duration: EnergyDurationShape;
  target: EnergyTargetShape;
  equipment?: string;
  notes?: string;
}

export interface EnergyGroupShape {
  type: "group";
  id: string;
  role: Role;
  repeat: number;
  children: EnergyStepShape[];
  rest_between?: EnergyIntervalShape;
  departure_every_s?: number;
  instructions?: string;
}

export type EnergyStepShape = EnergyIntervalShape | EnergyGroupShape;

/** Ce que la proposition crée dans `energy_sessions`. */
export interface EnergySessionShape {
  id: string;
  name: string;
  session_kind: EnergyKind;
  structure_type: "continu" | "fractionne";
  notes: string | null;
  intervals: EnergyStepShape[];
}

// ── Validation ──────────────────────────────────────────────────────────────

function duration(v: unknown, path: string): EnergyDurationShape {
  if (!isObj(v)) fail(path, "{ kind, value } attendu");
  const kind = oneOf(v.kind, ["time", "distance", "calories", "lap_button"] as const, `${path}.kind`);
  if (kind === "lap_button") {
    onlyKeys(v, ["kind"], path);
    return { kind };
  }
  onlyKeys(v, ["kind", "value"], path);
  const max = kind === "time" ? 36_000 : kind === "distance" ? 100_000 : 5_000;
  const unit = kind === "time" ? "secondes" : kind === "distance" ? "mètres" : "kcal";
  if (typeof v.value !== "number" || !Number.isFinite(v.value) || v.value <= 0 || v.value > max) {
    fail(`${path}.value`, `${unit}, entre 1 et ${max}`);
  }
  return { kind, value: Math.round(v.value) };
}

function range(v: Obj, min: number, max: number, path: string) {
  const a = num(v.min, min, max, `${path}.min`);
  const b = num(v.max, min, max, `${path}.max`);
  return { min: a, max: b };
}

function target(v: unknown, path: string): EnergyTargetShape {
  if (v === undefined) return { kind: "none" };
  if (!isObj(v)) fail(path, "objet attendu");
  const kinds = [
    "none", "hr_zone", "hr_pct", "hr_bpm", "pace", "pace_test_pct",
    "power", "power_test_pct", "cadence", "x_per_y", "text",
  ] as const;
  const kind = oneOf(v.kind, kinds, `${path}.kind`);
  switch (kind) {
    case "none":
      onlyKeys(v, ["kind"], path);
      return { kind };
    case "hr_zone":
      onlyKeys(v, ["kind", "zone"], path);
      return { kind, zone: int(v.zone, 1, 5, `${path}.zone`) as 1 | 2 | 3 | 4 | 5 };
    case "hr_pct":
      onlyKeys(v, ["kind", "min", "max"], path);
      return { kind, ...range(v, 30, 120, path) };
    case "hr_bpm":
      onlyKeys(v, ["kind", "min", "max"], path);
      return { kind, ...range(v, 40, 230, path) };
    case "pace": {
      onlyKeys(v, ["kind", "min_s_per_unit", "max_s_per_unit", "unit"], path);
      // Toujours stockée en secondes par km, même affichée en km/h.
      return {
        kind,
        unit: oneOf(v.unit ?? "min_per_km", ["min_per_km", "kmh"] as const, `${path}.unit`),
        min_s_per_unit: int(v.min_s_per_unit, 60, 1800, `${path}.min_s_per_unit`),
        max_s_per_unit: int(v.max_s_per_unit, 60, 1800, `${path}.max_s_per_unit`),
      };
    }
    case "pace_test_pct":
      onlyKeys(v, ["kind", "test_metric", "min", "max"], path);
      return { kind, test_metric: oneOf(v.test_metric, PACE_TEST_METRICS, `${path}.test_metric`), ...range(v, 30, 150, path) };
    case "power":
      onlyKeys(v, ["kind", "min", "max"], path);
      return { kind, ...range(v, 0, 3000, path) };
    case "power_test_pct":
      onlyKeys(v, ["kind", "test_metric", "min", "max"], path);
      return { kind, test_metric: oneOf(v.test_metric, POWER_TEST_METRICS, `${path}.test_metric`), ...range(v, 30, 250, path) };
    case "cadence":
      onlyKeys(v, ["kind", "min", "max", "unit"], path);
      return { kind, unit: oneOf(v.unit, ["spm", "rpm"] as const, `${path}.unit`), ...range(v, 20, 250, path) };
    case "x_per_y":
      onlyKeys(v, ["kind", "x_kind", "y_kind", "x_value", "y_value"], path);
      return {
        kind,
        x_kind: oneOf(v.x_kind, ["time", "cal", "watt"] as const, `${path}.x_kind`),
        y_kind: oneOf(v.y_kind, ["time", "distance"] as const, `${path}.y_kind`),
        x_value: num(v.x_value, 0.01, 100_000, `${path}.x_value`),
        y_value: num(v.y_value, 0.01, 100_000, `${path}.y_value`),
      };
    case "text":
      onlyKeys(v, ["kind", "value"], path);
      return { kind, value: reqText(v.value, ENERGY_LIMITS.textTarget, `${path}.value`) };
  }
}

interface StepCtx {
  newId: () => string;
  count: number;
}

function interval(v: Obj, path: string, ctx: StepCtx): EnergyIntervalShape {
  onlyKeys(v, ["type", "role", "duration", "target", "equipment", "notes"], path);
  const out: EnergyIntervalShape = {
    type: "interval",
    id: ctx.newId(),
    role: oneOf(v.role, ENERGY_ROLES, `${path}.role`),
    duration: duration(v.duration, `${path}.duration`),
    target: target(v.target, `${path}.target`),
  };
  if (v.equipment !== undefined) out.equipment = oneOf(v.equipment, ENERGY_EQUIPMENT, `${path}.equipment`);
  if (v.notes !== undefined) {
    const n = cleanText(v.notes, ENERGY_LIMITS.stepNotes, `${path}.notes`);
    if (n) out.notes = n;
  }
  return out;
}

function steps(v: unknown, path: string, ctx: StepCtx, depth: number): EnergyStepShape[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, "au moins une étape attendue");
  return v.map((raw, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(raw)) fail(p, "objet attendu");
    ctx.count += 1;
    if (ctx.count > ENERGY_LIMITS.steps) fail(p, `${ENERGY_LIMITS.steps} étapes maximum par séance`);
    if (raw.type === "interval") return interval(raw, p, ctx);
    if (raw.type !== "group") fail(`${p}.type`, "« interval » ou « group » attendu");
    if (depth >= ENERGY_LIMITS.depth) fail(p, `${ENERGY_LIMITS.depth} niveaux de groupes maximum`);
    onlyKeys(raw, ["type", "role", "repeat", "children", "rest_between", "departure_every_s", "instructions"], p);
    const g: EnergyGroupShape = {
      type: "group",
      id: ctx.newId(),
      role: raw.role === undefined ? "work" : oneOf(raw.role, ENERGY_ROLES, `${p}.role`),
      repeat: int(raw.repeat, 1, 50, `${p}.repeat`),
      children: steps(raw.children, `${p}.children`, ctx, depth + 1),
    };
    if (raw.rest_between !== undefined) {
      if (!isObj(raw.rest_between) || raw.rest_between.type !== "interval") {
        fail(`${p}.rest_between`, "étape { type: \"interval\", … } attendue");
      }
      g.rest_between = interval(raw.rest_between, `${p}.rest_between`, ctx);
    }
    if (raw.departure_every_s !== undefined) g.departure_every_s = int(raw.departure_every_s, 5, 3600, `${p}.departure_every_s`);
    if (raw.instructions !== undefined) {
      const t = cleanText(raw.instructions, ENERGY_LIMITS.instructions, `${p}.instructions`);
      if (t) g.instructions = t;
    }
    return g;
  });
}

/**
 * Séance énergétique proposée. `structure_type` par défaut : fractionnée dès
 * qu'elle contient un groupe répété, continue sinon.
 */
export function parseEnergySession(raw: Obj, path: string, newId: () => string): EnergySessionShape {
  const intervals = steps(raw.intervals, `${path}.intervals`, { newId, count: 0 }, 0);
  const hasGroup = intervals.some((s) => s.type === "group" && s.repeat > 1);
  const notes = raw.notes === undefined ? "" : cleanText(raw.notes, ENERGY_LIMITS.notes, `${path}.notes`);
  return {
    id: newId(),
    name: reqText(raw.name, ENERGY_LIMITS.name, `${path}.name`),
    session_kind: oneOf(raw.session_kind, ENERGY_KINDS, `${path}.session_kind`),
    structure_type: raw.structure_type === undefined
      ? (hasGroup ? "fractionne" : "continu")
      : oneOf(raw.structure_type, ["continu", "fractionne"] as const, `${path}.structure_type`),
    notes: notes || null,
    intervals,
  };
}

// ── Totaux ──────────────────────────────────────────────────────────────────

/**
 * Durée (s) et distance (m) totales d'une séance, comme `computeTotals`
 * (`src/lib/energy`) sans références athlète : c'est ce que l'éditeur
 * enregistre dans `total_duration_s` / `total_distance_m`. Recopié parce que
 * le serveur applique aussi les propositions ; un test compare les deux.
 */
export function energyTotals(steps: readonly EnergyStepShape[]): { durationS: number; distanceM: number } {
  let durationS = 0;
  let distanceM = 0;
  const one = (iv: EnergyIntervalShape) => {
    const d = iv.duration;
    if (d.kind === "time") durationS += d.value;
    else if (d.kind === "calories") durationS += Math.round(d.value * 6);
    else if (d.kind === "distance") {
      distanceM += d.value;
      let mPerS = 4;
      if (iv.target.kind === "pace") {
        const avg = (iv.target.min_s_per_unit + iv.target.max_s_per_unit) / 2;
        if (avg > 0) mPerS = 1000 / avg;
      }
      durationS += Math.round(d.value / mPerS);
    }
  };
  const walk = (list: readonly EnergyStepShape[], repeat: number, restBetween?: EnergyIntervalShape) => {
    for (let r = 0; r < repeat; r++) {
      for (const st of list) {
        if (st.type === "interval") one(st);
        else walk(st.children, st.repeat, st.rest_between);
      }
      if (restBetween && r < repeat - 1) one(restBetween);
    }
  };
  walk(steps, 1);
  return { durationS, distanceM };
}
