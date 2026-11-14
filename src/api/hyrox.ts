import type { QueryClient } from "@tanstack/react-query";
import {
  analyzeTests, BATTERY_IDS, gridSetFromRows, storedOutputs,
  type AthleteContext, type AthleteTestProfile, type AxesPlan, type AxesParamsDbRow, type BatteryResult, type BatterySession,
  type CalibrationAnalysis, type CalibrationRace, type GridDbRow, type GridSet, type HyroxTestAnalysisRow,
  type HyroxTestAxesDraftRow, type HyroxTestInputs, type ParamsDbRow, type ProfileSource, type RuleDbRow, type ValidatedAxes,
} from "@/lib/hyrox/tests";
import type { HyroxReferenceSegment, HyroxResult, HyroxResultInsert } from "@/features/shared/types/hyrox";
import type { BetterWhen, TestFillMode, ValueType } from "@/features/shared/types/tests";
import { check, db, unwrap, unwrapRows } from "./client";
import { invalidateTests } from "./tests";

/**
 * HYROX : drapeau « athlète HYROX », courses (`hyrox_results`), temps de
 * référence, batterie de tests v3 (saisie par `test_sessions` → trigger →
 * `athlete_test_results`), semaine de tests, profil et catégorie, grilles
 * versionnées, analyses figées et axes de travail, calibration (admin).
 *
 * Les calculs restent purs dans `src/lib/hyrox/` ; ce module ne fait que lire
 * et écrire. Après une écriture : `invalidateHyrox(qc, athleteId)` (et
 * `invalidateTests` quand des séances de test changent — fait ici).
 */

// Tables HYROX absentes des types générés : client non typé, lignes typées à la main.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = () => db() as any;

// ── Clés React Query ─────────────────────────────────────────────────────────

export const hyroxKeys = {
  athlete: (athleteId: string) => ["hyrox", athleteId] as const,
  flag: (athleteId: string) => ["hyrox", athleteId, "flag"] as const,
  results: (athleteId: string) => ["hyrox", athleteId, "results"] as const,
  /** Une course, par id (fiche course). */
  result: (id: string) => ["hyrox", "_result", id] as const,
  references: ["hyrox", "_references"] as const,
  battery: ["hyrox", "_battery"] as const,
  batteryResults: (athleteId: string) => ["hyrox", athleteId, "battery-results"] as const,
  batteryCalendar: (athleteId: string, names: readonly string[]) =>
    ["hyrox", athleteId, "battery-calendar", [...names].sort().join("|")] as const,
  profile: (athleteId: string) => ["hyrox", athleteId, "profile"] as const,
  analyses: (athleteId: string) => ["hyrox", athleteId, "analyses"] as const,
  axesDraft: (analysisId: string) => ["hyrox", "_draft", analysisId] as const,
  gridSet: (version: string) => ["hyrox", "_grid", version] as const,
  activeGrid: ["hyrox", "_grid", "_active"] as const,
  calibration: ["hyrox", "_calibration"] as const,
  /** Activités de montre du jour d'une course (analyse de course). */
  raceActivities: (athleteId: string, date: string) => ["hyrox", athleteId, "race-activities", date] as const,
};

/**
 * Tout ce qui est HYROX pour un athlète (drapeau, courses, batterie, profil,
 * analyses), plus les fiches course, brouillons d'axes et la calibration.
 */
export function invalidateHyrox(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: hyroxKeys.athlete(athleteId) }),
    qc.invalidateQueries({ queryKey: ["hyrox", "_result"] }),
    qc.invalidateQueries({ queryKey: ["hyrox", "_draft"] }),
    qc.invalidateQueries({ queryKey: hyroxKeys.calibration }),
  ]);
}

// ── Drapeau « athlète HYROX » (profiles.is_hyrox_athlete) ────────────────────

export async function getHyroxFlag(athleteId: string): Promise<boolean> {
  const row = unwrap(
    await untyped().from("profiles").select("is_hyrox_athlete").eq("id", athleteId).maybeSingle(),
    "Profil HYROX non chargé",
  ) as { is_hyrox_athlete?: boolean | null } | null;
  return !!row?.is_hyrox_athlete;
}

export async function setHyroxFlag(athleteId: string, enabled: boolean): Promise<void> {
  check(
    await untyped().from("profiles").update({ is_hyrox_athlete: enabled }).eq("id", athleteId),
    "Impossible de modifier le flag HYROX",
  );
}

// ── Temps de référence ───────────────────────────────────────────────────────

export async function listHyroxReferences(): Promise<HyroxReferenceSegment[]> {
  return unwrapRows(
    await untyped().from("hyrox_reference_segments").select("*"),
    "Références HYROX non chargées",
  ) as HyroxReferenceSegment[];
}

/** Sélecteur pur : ligne de référence, repli bracket→'all' puis division→'all'. */
export function pickRef(
  refs: HyroxReferenceSegment[],
  division: string,
  segment: string,
  bracket = "all",
): HyroxReferenceSegment | null {
  const find = (d: string, b: string) =>
    refs.find(r => r.division === d && r.bracket === b && r.segment === segment) ?? null;
  return find(division, bracket) ?? find(division, "all") ?? find("all", bracket) ?? find("all", "all");
}

// ── Courses ──────────────────────────────────────────────────────────────────

export async function listHyroxResults(athleteId: string): Promise<HyroxResult[]> {
  return unwrapRows(
    await untyped().from("hyrox_results").select("*").eq("athlete_id", athleteId).order("date", { ascending: false }),
    "Courses HYROX non chargées",
  ) as HyroxResult[];
}

export interface RaceActivityCandidate {
  id: string;
  durationS: number | null;
  source: string;
}

/**
 * Activités de montre ou de fichier du jour d'une course : l'analyse retient
 * celle dont la durée est la plus proche du chrono (`pickRaceActivity`).
 */
export async function listRaceActivityCandidates(athleteId: string, date: string): Promise<RaceActivityCandidate[]> {
  const rows = unwrapRows(
    await db().from("provider_activities")
      .select("id, duration_s, source")
      .eq("athlete_id", athleteId)
      .eq("local_date", date),
    "Activités du jour de course non chargées",
  ) as Array<{ id: string; duration_s: number | null; source: string }>;
  return rows.map((r) => ({ id: r.id, durationS: r.duration_s == null ? null : Number(r.duration_s), source: r.source }));
}

/** Une course ; `null` si elle n'existe pas (ou n'est pas visible). */
export async function getHyroxResult(id: string): Promise<HyroxResult | null> {
  return unwrap(
    await untyped().from("hyrox_results").select("*").eq("id", id).maybeSingle(),
    "Course HYROX non chargée",
  ) as HyroxResult | null;
}

export async function createHyroxResult(result: HyroxResultInsert, createdBy: string | null): Promise<HyroxResult> {
  const row = unwrap(
    await untyped().from("hyrox_results").insert({ ...result, created_by: createdBy }).select("*").single(),
    "Course HYROX non enregistrée",
  ) as HyroxResult | null;
  if (!row) throw new Error("Course HYROX non enregistrée");
  return row;
}

export async function updateHyroxResult(id: string, fields: Partial<HyroxResult>): Promise<HyroxResult> {
  const row = unwrap(
    await untyped().from("hyrox_results").update(fields).eq("id", id).select("*").single(),
    "Course HYROX non modifiée",
  ) as HyroxResult | null;
  if (!row) throw new Error("Course HYROX non modifiée");
  return row;
}

export async function deleteHyroxResult(id: string): Promise<void> {
  check(await untyped().from("hyrox_results").delete().eq("id", id), "Course HYROX non supprimée");
}

// ── Batterie v3 ──────────────────────────────────────────────────────────────

export interface BatteryVariable {
  id: string;
  key: string;
  label: string;
  unit: string;
  value_type: ValueType;
  better_when: BetterWhen;
}

export interface BatteryTest {
  id: string;
  name: string;
  fill_mode: TestFillMode;
  media_url: string | null;
  description: string | null;
  protocol: { text?: string; video?: string } | null;
  battery_session: BatterySession;
  battery_order: number;
  test_variables: BatteryVariable[];
}

/** Ordre de saisie des variables (celui du protocole), la FC et l'effort en dernier. */
const VAR_ORDER = [
  "best_cm", "distance_cm", "distance_m", "time", "load_kg", "reps", "left_cm", "right_cm", "left_reps", "right_reps",
  "load_80", "time_80", "load_100", "time_100", "load_120", "time_120", "jumps",
  "min_1", "min_2", "min_3", "min_4", "min_5", "total", "no_reps",
  ...[1, 2, 3].flatMap(r => [1, 2, 3, 4].map(t => `r${r}_t${t}`)),
  "hr_avg", "hr_max", "rpe", "hr_1min",
];
const varRank = (k: string) => { const i = VAR_ORDER.indexOf(k); return i < 0 ? 999 : i; };
const SESSION_ORDER: BatterySession[] = ["S1", "S2", "S3", "S4", "S5", "W1"];

/** Tri pur : séances S1…W1, ordre dans la séance, variables dans l'ordre du protocole. */
export function sortBattery(tests: BatteryTest[]): BatteryTest[] {
  return tests
    .map(t => ({ ...t, test_variables: [...(t.test_variables ?? [])].sort((a, b) => varRank(a.key) - varRank(b.key)) }))
    .sort((a, b) => SESSION_ORDER.indexOf(a.battery_session) - SESSION_ORDER.indexOf(b.battery_session) || a.battery_order - b.battery_order);
}

export async function listBattery(): Promise<BatteryTest[]> {
  const rows = unwrapRows(
    await untyped()
      .from("test_definitions")
      .select("id, name, fill_mode, media_url, description, protocol, battery_session, battery_order, test_variables(id, key, label, unit, value_type, better_when)")
      .eq("battery", "hyrox_v3"),
    "Batterie HYROX non chargée",
  ) as BatteryTest[];
  return sortBattery(rows);
}

const BATTERY_DEF_IDS = Object.values(BATTERY_IDS);

interface ResultRowDb {
  id: string;
  test_definition_id: string;
  performed_at: string;
  athlete_test_values: { value: number | string; test_variables: { key: string } | null }[] | null;
}

/** Résultats de la batterie, le plus récent d'abord, valeurs par clé de variable. */
export async function listBatteryResults(athleteId: string): Promise<BatteryResult[]> {
  const rows = unwrapRows(
    await untyped()
      .from("athlete_test_results")
      .select("id, test_definition_id, performed_at, athlete_test_values(value, test_variables(key))")
      .eq("athlete_id", athleteId)
      .in("test_definition_id", BATTERY_DEF_IDS)
      .order("performed_at", { ascending: false }),
    "Résultats de la batterie non chargés",
  ) as ResultRowDb[];
  return rows.map(r => ({
    id: r.id,
    test_definition_id: r.test_definition_id,
    performed_at: String(r.performed_at).slice(0, 10),
    values: Object.fromEntries(
      (r.athlete_test_values ?? []).filter(v => v.test_variables?.key).map(v => [v.test_variables!.key, Number(v.value)]),
    ),
  }));
}

export interface BatteryEntryInput {
  test: BatteryTest;
  /** "YYYY-MM-DD" */
  date: string;
  values: Record<string, number | null>;
  comment?: string;
}

/**
 * Saisie d'un test de la batterie : une séance de test complétée (le trigger
 * crée le résultat). Une seule séance par test et par jour : on met à jour
 * celle qui existe ; sinon on reprend un test programmé pas encore fait (à la
 * date réelle) ; sinon on en crée une. `coachId` : coach à rattacher en cas
 * de création.
 */
export async function saveBatteryEntry(athleteId: string, input: BatteryEntryInput, coachId: string | null): Promise<void> {
  const parts = input.test.test_variables
    .filter(v => input.values[v.key] != null)
    .map(v => `${v.label}: ${input.values[v.key]} ${v.unit}`);
  const results_structured: Record<string, unknown> = { variables: input.values };
  if (input.comment?.trim()) results_structured.comment = input.comment.trim();
  const row = { completed: true, results_note: parts.join(" · ") || null, results_structured };

  const existing = unwrapRows(
    await untyped()
      .from("test_sessions")
      .select("id")
      .eq("athlete_id", athleteId)
      .eq("date", input.date)
      .ilike("title", input.test.name)
      .limit(1),
    "Séance de test non chargée",
  ) as { id: string }[];
  let target = existing[0]?.id;
  let moveTo: string | undefined;
  if (!target) {
    const planned = unwrapRows(
      await untyped()
        .from("test_sessions")
        .select("id")
        .eq("athlete_id", athleteId)
        .eq("completed", false)
        .ilike("title", input.test.name)
        .order("date", { ascending: true })
        .limit(1),
      "Tests programmés non chargés",
    ) as { id: string }[];
    target = planned[0]?.id;
    moveTo = target ? input.date : undefined;
  }
  if (target) {
    check(
      await untyped().from("test_sessions").update(moveTo ? { ...row, date: moveTo } : row).eq("id", target),
      "Résultat non enregistré",
    );
  } else {
    check(
      await untyped().from("test_sessions").insert({
        athlete_id: athleteId, coach_id: coachId, title: input.test.name, type: "autre", date: input.date, ...row,
      }),
      "Résultat non enregistré",
    );
  }
}

// ── Semaine de tests ─────────────────────────────────────────────────────────

/** Un test de la batterie posé dans le calendrier de l'athlète (prévu ou fait). */
export interface BatteryCalendarRow {
  id: string;
  title: string;
  date: string;
  completed: boolean;
}

/** Tests de la batterie présents dans le calendrier de l'athlète, par titre exact. */
export async function listBatteryCalendar(athleteId: string, names: string[]): Promise<BatteryCalendarRow[]> {
  if (names.length === 0) return [];
  const rows = unwrapRows(
    await untyped()
      .from("test_sessions")
      .select("id, title, date, completed")
      .eq("athlete_id", athleteId)
      .in("title", names)
      .order("date", { ascending: true }),
    "Calendrier des tests non chargé",
  ) as BatteryCalendarRow[];
  return rows.map(r => ({ ...r, date: String(r.date).slice(0, 10), completed: !!r.completed }));
}

/** Pose les tests « à faire », en un seul envoi (tout ou rien). Renvoie le nombre posé. */
export async function scheduleTestWeek(
  athleteId: string,
  items: { name: string; date: string }[],
  coachId: string | null,
): Promise<number> {
  if (!items.length) return 0;
  const rows = items.map(i => ({
    athlete_id: athleteId, coach_id: coachId, title: i.name, type: "autre", date: i.date, completed: false,
  }));
  check(await untyped().from("test_sessions").insert(rows), "Tests non programmés");
  return rows.length;
}

/** Retire des tests programmés, seulement s'ils ne sont pas encore faits. */
export async function cancelTestWeek(ids: string[]): Promise<void> {
  if (!ids.length) return;
  check(await untyped().from("test_sessions").delete().in("id", ids).eq("completed", false), "Tests non retirés");
}

/** Après une écriture de séances de test HYROX : batterie + tout le domaine tests. */
export function invalidateBatterySessions(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([invalidateHyrox(qc, athleteId), invalidateTests(qc, athleteId)]);
}

// ── Profil de l'athlète ──────────────────────────────────────────────────────

export interface HyroxAthleteProfile extends ProfileSource {
  id: string;
  full_name: string | null;
}

export async function getHyroxAthleteProfile(athleteId: string): Promise<HyroxAthleteProfile | null> {
  return unwrap(
    await untyped()
      .from("profiles")
      .select("id, full_name, gender, age, birth_date, weight_kg, height_cm, hyrox_category")
      .eq("id", athleteId)
      .maybeSingle(),
    "Profil HYROX non chargé",
  ) as HyroxAthleteProfile | null;
}

export async function setHyroxCategory(athleteId: string, category: "open" | "pro"): Promise<void> {
  check(
    await untyped().from("profiles").update({ hyrox_category: category }).eq("id", athleteId),
    "Impossible d'enregistrer la catégorie",
  );
}

// ── Grilles versionnées ──────────────────────────────────────────────────────

export async function getGridSet(version: string): Promise<GridSet> {
  const [g, p, a, r] = await Promise.all([
    untyped().from("hyrox_test_grids").select("version, metric_key, axis, sex, category, thresholds, direction, source, weight, active, notes").eq("version", version),
    untyped().from("hyrox_test_params").select("version, scope, params").eq("version", version),
    untyped().from("hyrox_axes_params").select("version, params").eq("version", version).maybeSingle(),
    untyped().from("hyrox_work_axes_rules").select("version, rule_key, step, group_name, metric_key, condition, axis, means, rationale, to_recalibrate, active, sort_order").eq("version", version),
  ]);
  const grids = unwrapRows(g, "Grilles HYROX non chargées") as GridDbRow[];
  const params = unwrapRows(p, "Paramètres HYROX non chargés") as ParamsDbRow[];
  const axes = unwrap(a, "Paramètres d'axes non chargés") as AxesParamsDbRow | null;
  const rules = unwrapRows(r, "Règles d'axes non chargées") as RuleDbRow[];
  if (!axes) throw new Error(`Paramètres incomplets pour la version ${version}`);
  return gridSetFromRows(version, { grids, params, axes, rules });
}

/** Version active : celle des nouvelles analyses. */
export async function getActiveGridSet(): Promise<GridSet> {
  const row = unwrap(
    await untyped().from("hyrox_test_grid_versions").select("version").eq("active", true).maybeSingle(),
    "Version de grilles non chargée",
  ) as { version: string } | null;
  if (!row) throw new Error("Aucune version de grilles active");
  return getGridSet(row.version);
}

// ── Analyses ─────────────────────────────────────────────────────────────────

export async function listHyroxAnalyses(athleteId: string): Promise<HyroxTestAnalysisRow[]> {
  const rows = unwrapRows(
    await untyped()
      .from("hyrox_test_analyses")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    "Analyses HYROX non chargées",
  ) as HyroxTestAnalysisRow[];
  return rows;
}

export async function getAxesDraft(analysisId: string): Promise<HyroxTestAxesDraftRow | null> {
  return unwrap(
    await untyped().from("hyrox_test_axes_drafts").select("*").eq("analysis_id", analysisId).maybeSingle(),
    "Brouillon d'axes non chargé",
  ) as HyroxTestAxesDraftRow | null;
}

export interface CreateAnalysisInput {
  kind: "bilan" | "retest";
  date: string;
  inputs: HyroxTestInputs;
  profile: AthleteTestProfile;
  set: GridSet;
  source_result_ids: string[];
  target_s: number | null;
  context: AthleteContext;
  recalculated_from?: string | null;
}

/**
 * Calcule et enregistre une analyse figée, plus son brouillon d'axes. Si le
 * brouillon échoue, l'analyse reste (le brouillon se recrée à l'enregistrement
 * suivant : `saveAxesDraft` fait un upsert) et l'erreur remonte.
 */
export async function createHyroxAnalysis(
  athleteId: string,
  input: CreateAnalysisInput,
  userId: string | null,
): Promise<HyroxTestAnalysisRow> {
  const out = analyzeTests(input.inputs, input.profile, { set: input.set, target_s: input.target_s, context: input.context });
  const row = unwrap(
    await untyped()
      .from("hyrox_test_analyses")
      .insert({
        athlete_id: athleteId,
        kind: input.kind,
        date: input.date,
        source_result_ids: input.source_result_ids,
        inputs: input.inputs,
        profile: input.profile,
        outputs: storedOutputs(out),
        algo_version: out.algo_version,
        grid_version: out.grid_version,
        target_s: input.target_s,
        recalculated_from: input.recalculated_from ?? null,
        created_by: userId,
      })
      .select("*")
      .single(),
    "Analyse non enregistrée",
  ) as HyroxTestAnalysisRow | null;
  if (!row) throw new Error("Analyse non enregistrée");
  check(
    await untyped().from("hyrox_test_axes_drafts").insert({
      analysis_id: row.id, context: input.context, axes_plan: out.axes_plan, updated_by: userId,
    }),
    "Brouillon d'axes non enregistré",
  );
  return row;
}

/** Brouillon : contexte et proposition recalculée (chrono visé, cas types). Coach seulement. */
export async function saveAxesDraft(
  input: { analysis_id: string; context: AthleteContext; axes_plan: AxesPlan | null; target_s: number | null },
  userId: string | null,
): Promise<void> {
  check(
    await untyped().from("hyrox_test_axes_drafts").upsert({
      analysis_id: input.analysis_id, context: input.context, axes_plan: input.axes_plan, updated_by: userId,
    }),
    "Brouillon non enregistré",
  );
  check(
    await untyped().from("hyrox_test_analyses").update({ target_s: input.target_s }).eq("id", input.analysis_id),
    "Chrono visé non enregistré",
  );
}

/** Validation : ce que l'athlète verra. `validated = false` retire l'accès (le texte reste). */
export async function validateAxes(
  input: { analysis_id: string; axes: ValidatedAxes; validated: boolean },
  userId: string | null,
): Promise<void> {
  check(
    await untyped()
      .from("hyrox_test_analyses")
      .update({
        axes_validated: input.axes,
        validated_at: input.validated ? new Date().toISOString() : null,
        validated_by: input.validated ? userId : null,
      })
      .eq("id", input.analysis_id),
    "Validation non enregistrée",
  );
}

// ── Calibration (admin) ──────────────────────────────────────────────────────

export interface CalibrationData {
  analyses: CalibrationAnalysis[];
  races: CalibrationRace[];
  names: Record<string, string>;
}

export async function getHyroxCalibration(): Promise<CalibrationData> {
  const [a, r] = await Promise.all([
    untyped().from("hyrox_test_analyses").select("id, athlete_id, date, profile, outputs, algo_version, grid_version"),
    untyped().from("hyrox_results").select(
      "id, athlete_id, date, event_name, format, division, status, total_s, run_1_s, run_2_s, run_3_s, run_4_s, run_5_s, run_6_s, run_7_s, run_8_s, ski_s, sled_push_s, sled_pull_s, bbj_s, row_s, farmers_s, lunges_s, wall_balls_s, roxzone_total_s",
    ),
  ]);
  const analyses = unwrapRows(a, "Analyses non chargées") as CalibrationAnalysis[];
  const races = unwrapRows(r, "Courses non chargées") as CalibrationRace[];
  const ids = [...new Set(analyses.map(x => x.athlete_id))];
  let names: Record<string, string> = {};
  if (ids.length) {
    const rows = unwrapRows(
      await untyped().from("profiles").select("id, full_name").in("id", ids),
      "Noms des athlètes non chargés",
    ) as { id: string; full_name: string | null }[];
    names = Object.fromEntries(rows.map(p => [p.id, p.full_name ?? p.id]));
  }
  return { analyses, races, names };
}
