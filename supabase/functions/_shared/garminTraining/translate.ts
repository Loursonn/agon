/**
 * Séance Agon → séance Garmin (Training API V2). Pur, sans réseau.
 *
 * - Endurance (séances énergie) : sport choisi par le coach (course par défaut),
 *   échauffement / répétitions / récup / retour au calme, cibles calculées par
 *   Agon (`targets.ts`).
 * - Spécifique et HYROX : séance de course « comme sur tapis » (décision
 *   d'Hugo, 2026-11-12) — runs en étapes, ateliers en étapes « bouton Tour »
 *   avec la consigne en description.
 * - Musculation : une étape par série (répétitions ou maintien), charge en kg
 *   calculée par Agon, repos du bloc ; supersets enchaînés par tour.
 *
 * Limites Garmin : 100 étapes par séance mono-sport, 512 caractères par
 * description d'étape, 1 024 pour la séance.
 */
import { convertTarget } from "./targets.ts";
import type {
  AgonDuration,
  AgonEnergySession,
  AgonEnergyStep,
  AgonExerciseStep,
  AgonGroup,
  AgonInterval,
  AgonRole,
  AgonSpecificBlock,
  AthleteTrainingContext,
  GarminDurationType,
  GarminIntensity,
  GarminRepeatStep,
  GarminSport,
  GarminStep,
  GarminWorkout,
  GarminWorkoutStep,
  ResolvedSet,
  ResolvedStrengthBloc,
  ResolvedStrengthExercise,
  ResolvedStrengthSession,
  TranslateResult,
} from "./types.ts";

export const MAX_STEPS = 100;
export const WORKOUT_PROVIDER = "Agon";
const MAX_STEP_DESC = 512;
const MAX_WORKOUT_DESC = 1024;
const MAX_NAME = 80;

// ── Outils ──────────────────────────────────────────────────────────────────

function clip(text: string | null | undefined, max: number): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function join(parts: Array<string | null | undefined | false>, sep = " · "): string | null {
  const out = parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim());
  return out.length ? out.join(sep) : null;
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m === 0) return `${r} s`;
  return r ? `${m}'${String(r).padStart(2, "0")}` : `${m}'`;
}

function fmtKg(kg: number): string {
  return `${String(kg).replace(".", ",")} kg`;
}

const INTENSITY: Record<AgonRole, GarminIntensity> = {
  warmup: "WARMUP",
  work: "INTERVAL",
  recovery: "RECOVERY",
  rest: "REST",
  cooldown: "COOLDOWN",
  open: "ACTIVE",
};

/** Étape vide, numérotée plus tard (`numberSteps`). */
function step(partial: Partial<GarminWorkoutStep> & Pick<GarminWorkoutStep, "intensity" | "durationType">): GarminWorkoutStep {
  const { description, ...rest } = partial;
  return {
    type: "WorkoutStep",
    stepOrder: 0,
    durationValue: null,
    durationValueType: null,
    targetType: null,
    targetValue: null,
    targetValueLow: null,
    targetValueHigh: null,
    targetValueType: null,
    secondaryTargetType: null,
    secondaryTargetValue: null,
    secondaryTargetValueLow: null,
    secondaryTargetValueHigh: null,
    secondaryTargetValueType: null,
    strokeType: null,
    drillType: null,
    equipmentType: null,
    exerciseCategory: null,
    exerciseName: null,
    weightValue: null,
    weightDisplayUnit: null,
    ...rest,
    description: clip(description, MAX_STEP_DESC),
  };
}

function repeat(times: number, steps: GarminStep[], sport: GarminSport): GarminRepeatStep {
  return {
    type: "WorkoutRepeatStep",
    stepOrder: 0,
    repeatType: "REPEAT_UNTIL_STEPS_CMPLT",
    repeatValue: times,
    skipLastRestStep: sport === "LAP_SWIMMING",
    steps,
  };
}

/** Numérote toutes les étapes dans l'ordre de lecture (répétitions comprises), comme les exemples Garmin. */
function numberSteps(steps: GarminStep[]): GarminStep[] {
  let n = 0;
  const visit = (list: GarminStep[]): GarminStep[] =>
    list.map((s) => {
      n += 1;
      if (s.type === "WorkoutRepeatStep") {
        const order = n;
        return { ...s, stepOrder: order, steps: visit(s.steps) };
      }
      return { ...s, stepOrder: n };
    });
  return visit(steps);
}

export function countSteps(steps: GarminStep[]): number {
  let n = 0;
  for (const s of steps) n += s.type === "WorkoutRepeatStep" ? 1 + countSteps(s.steps) : 1;
  return n;
}

function finish(
  name: string,
  description: string | null,
  sport: GarminSport,
  steps: GarminStep[],
  warnings: string[],
): TranslateResult {
  if (steps.length === 0) return { ok: false, reason: "séance vide" };
  const total = countSteps(steps);
  if (total > MAX_STEPS) {
    return { ok: false, reason: `trop d'étapes pour la montre (${total}, Garmin en accepte ${MAX_STEPS})` };
  }
  const workout: GarminWorkout = {
    workoutName: clip(name, MAX_NAME) ?? "Séance Agon",
    description: clip(description, MAX_WORKOUT_DESC),
    sport,
    poolLength: null,
    poolLengthUnit: null,
    workoutProvider: WORKOUT_PROVIDER,
    workoutSourceId: WORKOUT_PROVIDER,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport, poolLength: null, poolLengthUnit: null, steps: numberSteps(steps) }],
  };
  return { ok: true, workout, warnings };
}

// ── Endurance / spécifique ──────────────────────────────────────────────────

/** Sport Garmin d'une séance énergie. Spécifique (HYROX compris) : course, format tapis. */
export function energySport(session: Pick<AgonEnergySession, "session_kind" | "modality">): GarminSport {
  if (session.session_kind === "specifique") return "RUNNING";
  switch ((session.modality ?? "").toLowerCase()) {
    case "velo":
      return "CYCLING";
    case "natation":
      return "LAP_SWIMMING";
    case "rameur":
    case "autre":
      return "CARDIO_TRAINING";
    default:
      return "RUNNING";
  }
}

function duration(d: AgonDuration | undefined, sport: GarminSport, role: AgonRole): {
  durationType: GarminDurationType;
  durationValue: number | null;
  durationValueType: "METER" | null;
  text: string | null;
} {
  const v = d?.value;
  const has = typeof v === "number" && Number.isFinite(v) && v > 0;
  if (d?.kind === "time" && has) {
    const type: GarminDurationType = sport === "LAP_SWIMMING" && role === "rest" ? "FIXED_REST" : "TIME";
    return { durationType: type, durationValue: Math.round(v), durationValueType: null, text: null };
  }
  if (d?.kind === "distance" && has) {
    return { durationType: "DISTANCE", durationValue: Math.round(v), durationValueType: "METER", text: null };
  }
  if (d?.kind === "calories" && has) {
    return { durationType: "CALORIES", durationValue: Math.round(v), durationValueType: null, text: null };
  }
  return { durationType: "OPEN", durationValue: null, durationValueType: null, text: null };
}

function intervalStep(i: AgonInterval, sport: GarminSport, ctx: AthleteTrainingContext): GarminWorkoutStep {
  const d = duration(i.duration, sport, i.role);
  const t = convertTarget(i.target, sport, ctx);
  return step({
    intensity: INTENSITY[i.role] ?? "ACTIVE",
    durationType: d.durationType,
    durationValue: d.durationValue,
    durationValueType: d.durationValueType,
    targetType: t.targetType,
    targetValueLow: t.low,
    targetValueHigh: t.high,
    description: join([t.label, i.equipment, i.notes]),
  });
}

/**
 * Atelier (exercice) dans une séance d'endurance ou spécifique : la montre est
 * en mode course, l'exercice ne peut pas être nommé par Garmin — l'étape se
 * termine au bouton Tour (ou au chrono si la consigne est en temps), la
 * consigne complète est dans la description.
 */
function exerciseStep(e: AgonExerciseStep, sport: GarminSport, ctx: AthleteTrainingContext): GarminWorkoutStep {
  const reps =
    e.reps_min && e.reps_max && e.reps_max !== e.reps_min
      ? `${e.reps_min}–${e.reps_max} reps`
      : e.reps_min || e.reps_max
        ? `${e.reps_min ?? e.reps_max} reps`
        : null;
  const weight =
    e.weight_unit === "bw" ? "poids du corps" : e.weight_unit === "pct_rm" && e.weight_kg ? `${e.weight_kg} %RM` : e.weight_kg ? fmtKg(e.weight_kg) : null;
  const v = e.duration?.value;
  const has = typeof v === "number" && Number.isFinite(v) && v > 0;
  const amount =
    e.duration?.kind === "distance" && has ? `${Math.round(v)} m` : e.duration?.kind === "calories" && has ? `${Math.round(v)} cal` : null;
  const timed = e.duration?.kind === "time" && has;
  const t = convertTarget(e.target, sport, ctx);
  return step({
    intensity: INTENSITY[e.role] ?? "INTERVAL",
    durationType: timed ? "TIME" : "OPEN",
    durationValue: timed ? Math.round(v as number) : null,
    targetType: t.targetType,
    targetValueLow: t.low,
    targetValueHigh: t.high,
    description: join([e.exercise_name, amount, reps, weight, t.label, e.notes]),
  });
}

function hasGroup(steps: AgonEnergyStep[]): boolean {
  return steps.some((s) => s.type === "group");
}

/**
 * Un groupe sans sous-groupe devient une répétition Garmin. Un groupe qui en
 * contient est déroulé (la répétition reste au niveau le plus fin), pour ne
 * pas dépendre de répétitions imbriquées que toutes les montres ne lisent pas.
 */
function groupSteps(g: AgonGroup, sport: GarminSport, ctx: AthleteTrainingContext): GarminStep[] {
  const times = Math.max(1, Math.round(g.repeat || 1));
  const body = g.children.flatMap((c) => energySteps(c, sport, ctx));
  if (g.rest_between) body.push(intervalStep(g.rest_between, sport, ctx));
  const note = join([g.instructions, g.departure_every_s ? `Départ toutes les ${fmtDuration(g.departure_every_s)}` : null]);
  if (note && body[0] && body[0].type === "WorkoutStep") {
    body[0] = { ...body[0], description: clip(join([note, body[0].description]), MAX_STEP_DESC) };
  }
  if (times === 1) return body;
  if (!hasGroup(g.children)) return [repeat(times, body, sport)];
  const out: GarminStep[] = [];
  for (let i = 0; i < times; i++) out.push(...body);
  return out;
}

function energySteps(s: AgonEnergyStep, sport: GarminSport, ctx: AthleteTrainingContext): GarminStep[] {
  if (s.type === "group") return groupSteps(s, sport, ctx);
  if (s.type === "exercise") return [exerciseStep(s, sport, ctx)];
  return [intervalStep(s, sport, ctx)];
}

function classiqueBlockSteps(b: AgonSpecificBlock, sport: GarminSport, ctx: AthleteTrainingContext): GarminStep[] {
  const title = join([b.title, b.instructions], " — ");
  let steps: GarminStep[];
  if (b.kind === "wod") {
    steps = b.steps.flatMap((s) => energySteps(s, sport, ctx));
  } else {
    steps = b.items.map((it) =>
      step({
        intensity: "ACTIVE",
        durationType: "OPEN",
        description: join([it.name, it.prescription, it.rest ? `récup ${it.rest}` : null, it.notes]),
      }),
    );
  }
  if (title && steps[0] && steps[0].type === "WorkoutStep") {
    steps[0] = { ...steps[0], description: clip(join([title, steps[0].description], " — "), MAX_STEP_DESC) };
  }
  return steps;
}

export function translateEnergySession(session: AgonEnergySession, ctx: AthleteTrainingContext): TranslateResult {
  const sport = energySport(session);
  const blocks = session.format === "classique" ? session.classique_structure?.blocks ?? [] : [];
  const steps =
    blocks.length > 0
      ? blocks.flatMap((b) => classiqueBlockSteps(b, sport, ctx))
      : (session.intervals ?? []).flatMap((s) => energySteps(s, sport, ctx));
  return finish(session.name, session.notes ?? null, sport, steps, []);
}

// ── Musculation ─────────────────────────────────────────────────────────────

function setStep(ex: ResolvedStrengthExercise, set: ResolvedSet, warmup: boolean): GarminWorkoutStep {
  const timed = set.iso && set.reps != null && set.reps > 0;
  const range = set.repsMax != null && set.reps != null && set.repsMax !== set.reps ? `${set.reps}–${set.repsMax} reps` : null;
  const description = join([
    ex.name,
    timed ? `maintien ${fmtDuration(set.reps as number)}` : range,
    set.kg == null ? set.loadText : null,
    set.rir != null ? `RIR ${set.rir}` : null,
    set.tempo ? `tempo ${set.tempo}` : null,
    ex.cluster ? `cluster ${ex.cluster.reps.join("+")}, ${ex.cluster.restS} s entre` : null,
    ex.methodName ? `méthode ${ex.methodName}` : null,
    ex.comment,
  ]);
  const hasReps = set.reps != null && set.reps > 0;
  return step({
    intensity: warmup ? "WARMUP" : "ACTIVE",
    durationType: timed ? "TIME" : hasReps ? "REPS" : "OPEN",
    durationValue: hasReps ? Math.round(set.reps as number) : null,
    exerciseCategory: ex.garmin?.category ?? null,
    exerciseName: ex.garmin?.name ?? null,
    weightValue: set.kg,
    weightDisplayUnit: set.kg == null ? null : "KILOGRAM",
    description,
  });
}

function restStep(bloc: ResolvedStrengthBloc): GarminWorkoutStep {
  if (bloc.restS && bloc.restS > 0) {
    return step({ intensity: "REST", durationType: "TIME", durationValue: Math.round(bloc.restS) });
  }
  return step({
    intensity: "REST",
    durationType: "OPEN",
    description: bloc.departS ? `Départ toutes les ${fmtDuration(bloc.departS)}` : "Repos libre",
  });
}

function sameSet(a: ResolvedSet, b: ResolvedSet): boolean {
  return a.reps === b.reps && a.repsMax === b.repsMax && a.iso === b.iso && a.kg === b.kg && a.loadText === b.loadText
    && a.rir === b.rir && a.tempo === b.tempo;
}

/** Exercices enchaînés par `supersetWithNext` (un exercice seul = groupe de 1). */
function supersetGroups(exercises: ResolvedStrengthExercise[]): ResolvedStrengthExercise[][] {
  const groups: ResolvedStrengthExercise[][] = [];
  let current: ResolvedStrengthExercise[] = [];
  for (const ex of exercises) {
    current.push(ex);
    if (!ex.supersetWithNext) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function blocSteps(bloc: ResolvedStrengthBloc): GarminStep[] {
  const warmup = (bloc.category ?? "").toLowerCase() === "echauffement";
  const out: GarminStep[] = [];
  for (const group of supersetGroups(bloc.exercises)) {
    const libres = group.filter((e) => e.mode === "libre");
    for (const ex of libres) {
      out.push(step({ intensity: warmup ? "WARMUP" : "ACTIVE", durationType: "OPEN", description: join([ex.name, ex.libreText, ex.comment]) }));
    }
    const structured = group.filter((e) => e.mode !== "libre" && e.sets.length > 0);
    if (structured.length === 0) continue;
    const rounds = Math.max(...structured.map((e) => e.sets.length));
    const roundSteps = (i: number): GarminStep[] => [
      ...structured.filter((e) => i < e.sets.length).map((e) => setStep(e, e.sets[i], warmup)),
      restStep(bloc),
    ];
    const uniform = structured.every((e) => e.sets.length === rounds && e.sets.every((s) => sameSet(s, e.sets[0])));
    if (uniform && rounds > 1) {
      out.push(repeat(rounds, roundSteps(0), "STRENGTH_TRAINING"));
    } else {
      for (let i = 0; i < rounds; i++) out.push(...roundSteps(i));
    }
  }
  const note = join([bloc.name, bloc.instructions], " — ");
  const first = out[0];
  if (note && first) {
    if (first.type === "WorkoutStep") out[0] = { ...first, description: clip(join([note, first.description], " — "), MAX_STEP_DESC) };
    else if (first.steps[0]?.type === "WorkoutStep") {
      const inner = first.steps[0];
      out[0] = { ...first, steps: [{ ...inner, description: clip(join([note, inner.description], " — "), MAX_STEP_DESC) }, ...first.steps.slice(1)] };
    }
  }
  return out;
}

export function translateStrengthSession(session: ResolvedStrengthSession): TranslateResult {
  const warnings: string[] = [];
  const unmapped = new Set<string>();
  for (const b of session.blocs) for (const e of b.exercises) if (e.mode !== "libre" && !e.garmin) unmapped.add(e.name);
  if (unmapped.size) warnings.push(`sans équivalent Garmin : ${[...unmapped].join(", ")}`);
  const steps = session.blocs.flatMap(blocSteps);
  return finish(session.name, null, "STRENGTH_TRAINING", steps, warnings);
}
