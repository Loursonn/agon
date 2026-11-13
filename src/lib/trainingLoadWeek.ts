/**
 * Charge YOXX d'une plage de semaines : assemble les lectures de la base
 * (séances prévues, saisies, activités de montre, zones, VC) en points par
 * séance, puis en tableaux de semaine (`weekLoad`). Pur, testé.
 *
 * Règles (P28, `_shared/domain/trainingLoad.ts`) :
 * - séance énergie / spécifique : prévu = étapes ; réalisé = activité
 *   rattachée (course : tours à l'allure ou FC ; autre : FC), sinon « fait
 *   comme prévu » (prévu × durée réelle ÷ durée prévue si l'athlète l'a corrigée) ;
 * - musculation : prévu = séries × RIR prévus ; réalisé = séries saisies ;
 * - activité libre (sans séance) : FC (course : tours) ; muscu libre ignorée
 *   (déjà comptée par la séance saisie) ;
 * - ni montre exploitable ni prévu chiffrable : `null` (« — »).
 */
import { addDays, localIsoDay, type IsoDay } from "@shared/domain/dates";
import { activeModelAt, validBounds } from "@shared/domain/hrZones";
import { isStepSport } from "@shared/activityFiles/stream";
import {
  exerciseFactor,
  plannedYoxxMinutes,
  pointsFromMinutes,
  runYoxxMinutes,
  strengthLoad,
  weekLoad,
  yoxxMinutesFromZoneSeconds,
  type ExerciseInfo,
  type LapRange,
  type PlanContext,
  type PlanStepForLoad,
  type RunStreamForLoad,
  type SessionLoad,
  type StrengthSetForLoad,
  type WeekLoad,
  type YoxxMinutes,
} from "@shared/domain/trainingLoad";

// ── Entrées (formes minimales lues par `src/api/load.ts`) ────────────────────

export interface LoadEnergyRow {
  id: string;
  day: IsoDay;
  status: string;
  actualDurationMin: number | null;
  distanceKm: number | null;
  name: string;
  /** `specifique` = séance mixte. */
  sessionKind: string | null;
  intervals: PlanStepForLoad[] | null;
}

export interface LoadSetRow {
  done?: boolean;
  skipped?: boolean;
  rir?: number | null;
}

export interface LoadWorkoutRow {
  id: string;
  day: IsoDay;
  status: string;
  sessionId: string;
  name: string;
  weekNumber: number | null;
  /** `athlete_modifications.sessionSets` (clé = Exercice.id). */
  sessionSets: Record<string, LoadSetRow[]> | null;
  /** Blocs de l'adaptation du coach, s'il y en a (remplacent ceux du programme). */
  overrideBlocs: ProgBlocLite[] | null;
}

/** Forme minimale du programme (`ProgSession`). */
export interface ProgExerciceLite {
  id: string;
  exercise_id: string;
  exercise_name: string;
  mode?: string;
  params?: unknown;
}
export interface ProgBlocLite {
  category?: string;
  exercices: ProgExerciceLite[];
}
export interface ProgSessionLite {
  id: string;
  blocs: ProgBlocLite[];
}

export interface LoadActivityRow {
  id: string;
  day: IsoDay;
  sport: string | null;
  distanceM: number | null;
  title: string | null;
}

export interface LoadLinkRow {
  activityId: string;
  plannedKind: "energy" | "workout" | "test";
  plannedId: string;
}

export interface LoadZoneModelRow {
  kind: string;
  bounds: number[];
  validFrom: IsoDay;
  status: string;
  createdAt?: string | null;
}

export interface LoadInputs {
  /** Lundi de la première semaine. */
  from: IsoDay;
  weeks: number;
  energy: LoadEnergyRow[];
  workouts: LoadWorkoutRow[];
  program: ProgSessionLite[];
  exercises: Record<string, ExerciseInfo>;
  activities: LoadActivityRow[];
  links: LoadLinkRow[];
  /** Secondes par zone, par activité (`activity_zone_summaries`). */
  zoneSeconds: Record<string, number[]>;
  /** Courses : série + tours, par activité. */
  runStreams: Record<string, { stream: RunStreamForLoad; laps: LapRange[] }>;
  zoneModels: LoadZoneModelRow[];
  /** Bornes du modèle 5 zones (références `FCzone_*`), `null` si absentes. */
  fiveBounds: number[] | null;
  fcmax: number | null;
  speedRefs: Record<string, number>;
  s1Kmh: number | null;
  csKmh: number | null;
}

export interface LoadWeeks {
  weeks: WeekLoad[];
  /** Séances musculation dont des séries n'ont ni RIR saisi ni prévu. */
  missingRirSessions: number;
}

// ── Aides ────────────────────────────────────────────────────────────────────

const DONE = new Set(["completed", "done"]);
const isRun = (sport: string | null) => isStepSport(sport) && !/walk|hik|marche|rando/i.test(sport ?? "");
const isStrengthSport = (sport: string | null) => /strength|muscu|weight|training_strength/i.test(sport ?? "");

function boundsAt(inp: LoadInputs, day: IsoDay): number[] | null {
  const m = activeModelAt(inp.zoneModels, day);
  if (m && m.kind !== "five") return validBounds(m.bounds);
  return inp.fiveBounds;
}

function planCtx(inp: LoadInputs, day: IsoDay, mixed: boolean): PlanContext {
  return { mixed, bounds: boundsAt(inp, day), fcmax: inp.fcmax, speedRefs: inp.speedRefs, s1Kmh: inp.s1Kmh, csKmh: inp.csKmh };
}

/** Paramètres d'un exercice pour une semaine (multi-semaine : semaine écrite ≤ n, sinon la première). */
function paramsFor(params: unknown, week: number | null): Record<string, unknown> | null {
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  if ("nb_series" in p) return p;
  const keys = Object.keys(p).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const w = week ?? keys[0];
  const k = [...keys].reverse().find((x) => x <= w) ?? keys[0];
  const v = p[String(k)];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function plannedRir(params: Record<string, unknown> | null, setIndex: number): number | null {
  const rir = params?.rir as { mode?: string; value?: unknown; values?: unknown[] } | undefined;
  if (!rir) return null;
  const v = rir.mode === "par_serie" ? rir.values?.[setIndex] : rir.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function exerciseList(blocs: ProgBlocLite[]): Array<{ ex: ProgExerciceLite; warmup: boolean }> {
  return blocs.flatMap((b) => (b.exercices ?? []).map((ex) => ({ ex, warmup: /chauff/i.test(b.category ?? "") })));
}

function strengthSessionLoads(w: LoadWorkoutRow, inp: LoadInputs): { planned: number | null; done: number | null; missingRir: number } {
  const blocs = w.overrideBlocs ?? inp.program.find((s) => s.id === w.sessionId)?.blocs ?? [];
  const list = exerciseList(blocs);
  const info = (ex: ProgExerciceLite | undefined) => exerciseFactor(ex ? (inp.exercises[ex.exercise_id] ?? { name: ex.exercise_name }) : null);

  const plannedSets: StrengthSetForLoad[] = [];
  for (const { ex, warmup } of list) {
    if (warmup || ex.mode === "libre") continue;
    const p = paramsFor(ex.params, w.weekNumber);
    const n = Number(p?.nb_series);
    if (!Number.isFinite(n) || n <= 0) continue;
    const f = info(ex);
    for (let i = 0; i < n; i++) plannedSets.push({ plannedRir: plannedRir(p, i), exFactor: f });
  }
  const planned = strengthLoad(plannedSets);

  let done: ReturnType<typeof strengthLoad> = null;
  if (DONE.has(w.status) && w.sessionSets) {
    const doneSets: StrengthSetForLoad[] = [];
    const byId = new Map(list.map((x) => [x.ex.id, x]));
    for (const [exId, rows] of Object.entries(w.sessionSets)) {
      const planEx = byId.get(exId);
      if (planEx?.ex.mode === "libre") continue;
      const p = planEx ? paramsFor(planEx.ex.params, w.weekNumber) : null;
      const f = info(planEx?.ex);
      (rows ?? []).forEach((r, i) => {
        if (!r || r.done !== true || r.skipped) return;
        doneSets.push({ rir: r.rir ?? null, plannedRir: plannedRir(p, i), exFactor: f, warmup: planEx?.warmup });
      });
    }
    done = strengthLoad(doneSets) ?? { sdp: 0, points: 0, missingRir: 0 };
  }
  return { planned: planned?.points ?? null, done: done?.points ?? null, missingRir: done?.missingRir ?? 0 };
}

/** Minutes réalisées d'une activité : course = tours/allure, sinon résumé de zones FC. */
function activityMinutes(a: LoadActivityRow, inp: LoadInputs): YoxxMinutes | null {
  const rs = inp.runStreams[a.id];
  if (rs && isRun(a.sport)) {
    const m = runYoxxMinutes(rs.stream, rs.laps, boundsAt(inp, a.day), { s1Kmh: inp.s1Kmh, csKmh: inp.csKmh });
    if (m) return m;
  }
  return yoxxMinutesFromZoneSeconds(inp.zoneSeconds[a.id]);
}

const scale = (m: YoxxMinutes, r: number): YoxxMinutes => [m[0] * r, m[1] * r, m[2] * r];
const total = (m: YoxxMinutes) => m[0] + m[1] + m[2];
const runKm = (a: LoadActivityRow | undefined) => (a && isRun(a.sport) && a.distanceM ? a.distanceM / 1000 : null);

// ── Assemblage ───────────────────────────────────────────────────────────────

export function sessionLoads(inp: LoadInputs): SessionLoad[] {
  const actById = new Map(inp.activities.map((a) => [a.id, a]));
  const linked = new Map<string, string>(); // `${kind}:${id}` → activity
  const usedActs = new Set<string>();
  for (const l of inp.links) {
    if (!actById.has(l.activityId)) continue;
    linked.set(`${l.plannedKind}:${l.plannedId}`, l.activityId);
    usedActs.add(l.activityId);
  }
  const out: SessionLoad[] = [];

  for (const e of inp.energy) {
    const mixed = e.sessionKind === "specifique";
    const plannedMin = plannedYoxxMinutes(e.intervals, planCtx(inp, e.day, mixed));
    const planned = plannedMin ? pointsFromMinutes(plannedMin) : null;
    const act = actById.get(linked.get(`energy:${e.id}`) ?? "");
    let minutes: YoxxMinutes | null = null;
    let asPlanned = false;
    if (act) minutes = activityMinutes(act, inp);
    if (!minutes && (DONE.has(e.status) || act) && plannedMin) {
      const ratio = e.actualDurationMin && total(plannedMin) > 0 ? e.actualDurationMin / total(plannedMin) : 1;
      minutes = scale(plannedMin, ratio);
      asPlanned = true;
    }
    const km = runKm(act) ?? (DONE.has(e.status) && e.distanceKm ? e.distanceKm : null);
    out.push({
      id: e.id, day: e.day, label: e.name, focus: mixed ? "mixed" : "endurance",
      planned, done: minutes ? pointsFromMinutes(minutes) : null, minutes, km, asPlanned,
    });
  }

  for (const w of inp.workouts) {
    const r = strengthSessionLoads(w, inp);
    out.push({ id: w.id, day: w.day, label: w.name, focus: "strength", planned: r.planned, done: r.done, missingRir: r.missingRir });
  }

  for (const a of inp.activities) {
    if (usedActs.has(a.id) || isStrengthSport(a.sport)) continue;
    const minutes = activityMinutes(a, inp);
    const km = runKm(a);
    if (!minutes && !km) continue;
    out.push({
      id: a.id, day: a.day, label: a.title ?? a.sport ?? "Activité", focus: "endurance",
      planned: null, done: minutes ? pointsFromMinutes(minutes) : null, minutes, km,
    });
  }
  return out;
}

/** Plus longue course (km) sur les 30 jours finissant à `day`. */
function longestRun(activities: LoadActivityRow[], day: IsoDay): number | null {
  const from = addDays(day, -29);
  let best: number | null = null;
  for (const a of activities) {
    const km = runKm(a);
    if (km && a.day >= from && a.day <= day && (best === null || km > best)) best = km;
  }
  return best;
}

export function buildLoadWeeks(inp: LoadInputs): LoadWeeks {
  const all = sessionLoads(inp);
  const weeks: WeekLoad[] = [];
  const doneByWeek: number[] = [];
  const kmByWeek: number[] = [];
  for (let i = 0; i < inp.weeks; i++) {
    const from = addDays(inp.from, i * 7);
    const to = addDays(from, 6);
    const sessions = all.filter((s) => s.day >= from && s.day <= to);
    const w = weekLoad({
      from,
      sessions,
      previousWeeks: [...doneByWeek].reverse(),
      previousWeekKm: kmByWeek.length > 0 ? kmByWeek[kmByWeek.length - 1] : null,
      // Plafond pour la semaine : plus longue course des 30 jours qui la précèdent.
      longestRun30dKm: longestRun(inp.activities, addDays(from, -1)),
    });
    weeks.push(w);
    doneByWeek.push(w.done);
    kmByWeek.push(w.km.total);
  }
  return { weeks, missingRirSessions: all.filter((s) => (s.missingRir ?? 0) > 0).length };
}

/** Lundi de la semaine d'un jour (par défaut : aujourd'hui, jour local). */
export function mondayOf(day: IsoDay = localIsoDay()): IsoDay {
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}
