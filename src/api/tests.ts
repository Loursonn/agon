import type { QueryClient, Query } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import type {
  AthleteCurrentValue,
  AthleteTestResult,
  CreateTestDefinitionInput,
  CreateTestResultInput,
  TestCategory,
  TestDefinitionWithVariables,
  TestVariable,
  UpdateTestDefinitionInput,
} from "@/features/shared/types/tests";
import type { IsoDay } from "@shared/domain/dates";
import { check, db, unwrap, unwrapRows } from "./client";
import { invalidateReferences } from "./references";

/**
 * Tests : définitions (banque du coach), séances de test (`test_sessions`,
 * saisie de l'athlète ou du coach), résultats objectifs (`athlete_test_results`
 * + `athlete_test_values`, vue `athlete_current_values`), file « à noter » du
 * coach, séries par catégorie, progression d'un macrocycle (ancien `test_results`).
 *
 * - Une séance de test complétée alimente les résultats par trigger SQL
 *   (`sync_test_session_to_results`) ; une valeur de test peut créer une
 *   référence (VMA…) par un autre trigger (`sync_extrap_to_performance`).
 *   Donc : après toute écriture, `invalidateTests` (qui appelle aussi
 *   `invalidateReferences`).
 * - Résultat saisi par le coach : RPC atomique `save_athlete_test_result`
 *   (migration 20261109120000) — avant, une modification supprimait toutes
 *   les valeurs puis les réinsérait : un échec entre les deux les perdait.
 * - La définition liée à une séance se retrouve par son titre, comme le
 *   trigger : `pickDefinitionByName` (test global d'abord, puis le plus ancien).
 */

export type {
  AthleteCurrentValue,
  AthleteTestResult,
  CreateTestDefinitionInput,
  CreateTestResultInput,
  TestDefinitionWithVariables,
  TestVariable,
  UpdateTestDefinitionInput,
};

// ── Clés React Query ─────────────────────────────────────────────────────────

export const testKeys = {
  athlete: (athleteId: string) => ["tests", athleteId] as const,
  results: (athleteId: string) => ["tests", athleteId, "results"] as const,
  currentValues: (athleteId: string) => ["tests", athleteId, "current-values"] as const,
  categorySeries: (athleteId: string, category: TestCategory) => ["tests", athleteId, "category-series", category] as const,
  pendingCoach: (athleteId: string) => ["tests", athleteId, "pending-coach"] as const,
  /** Séances de test (prévues et faites) — `listTestSessions`. */
  sessions: (athleteId: string) => ["tests", athleteId, "sessions"] as const,
  /** Banque de tests visible par un coach (globaux + les siens). */
  definitions: (coachId: string) => ["tests", "_definitions", coachId] as const,
  /** Progression des tests d'un macrocycle (planning coach). */
  macrocycleProgression: (macrocycleId: string) => ["tests", "_macrocycle", macrocycleId, "progression"] as const,
};

/** Préfixes d'autres modules / écrans qui lisent les séances ou résultats de test d'un athlète. */
const ATHLETE_SCOPED_ELSEWHERE: readonly (readonly string[])[] = [
  ["articularProfile"],      // profil articulaire (résultats « bilan articulaire »)
  ["testSessions"],          // ancienne clé (QK.testSessions)
  ["activePlan"],            // semaine / programme athlète (tests du jour)
  ["cal"],                   // calendrier unifié / planning coach
  ["calendar-events"],
  ["week-schedule"],
  ["hyrox"],                 // batterie HYROX (résultats et calendrier) — src/api/hyrox.ts
  ["pendingCoachTests"], ["athleteTestResults"], ["athleteCurrentValues"], ["categoryTestSeries"], // anciennes clés
];

/**
 * Tout ce qui dépend des séances et résultats de test d'un athlète : ses
 * résultats, valeurs courantes, séries, file « à noter », progression des
 * macrocycles, planning et semaine, batterie HYROX, tests à venir de
 * l'accueil coach — et ses références (créées par trigger).
 */
export function invalidateTests(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: testKeys.athlete(athleteId) }),
    qc.invalidateQueries({ queryKey: ["tests", "_macrocycle"] }),
    qc.invalidateQueries({ queryKey: ["test-progression"] }),
    qc.invalidateQueries({ queryKey: ["coachDashboard", "upcomingTests"] }),
    qc.invalidateQueries({
      predicate: (q: Query) =>
        ATHLETE_SCOPED_ELSEWHERE.some(([head]) => q.queryKey[0] === head) && q.queryKey[1] === athleteId,
    }),
    invalidateReferences(qc, athleteId),
  ]);
}

/** Banque de tests (tous coachs) et batterie HYROX, qui en fait partie. */
export function invalidateTestDefinitions(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["tests", "_definitions"] }),
    qc.invalidateQueries({ queryKey: ["hyrox", "_battery"] }),
    qc.invalidateQueries({ queryKey: ["testDefinitions"] }), // ancienne clé
  ]);
}

// Tables / colonnes partiellement absentes des types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = () => db() as any;

// ── Utilitaires purs ─────────────────────────────────────────────────────────

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

function withSortedVariables<T extends { test_variables?: TestVariable[] | null }>(d: T): T {
  return { ...d, test_variables: [...(d.test_variables ?? [])].sort(byLabel) };
}

/**
 * Définition correspondant au titre d'une séance de test, comme le trigger
 * SQL : même nom sans tenir compte de la casse, test global d'abord, puis le
 * plus ancien.
 */
export function pickDefinitionByName<T extends { name: string; is_global?: boolean | null; created_at?: string | null }>(
  defs: readonly T[],
  title: string,
): T | null {
  const t = title.trim().toLowerCase();
  const hits = defs.filter((d) => d.name.trim().toLowerCase() === t);
  hits.sort(
    (a, b) =>
      Number(!!b.is_global) - Number(!!a.is_global) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );
  return hits[0] ?? null;
}

/** Une valeur saisie exploitable (le trigger SQL ne garde que les nombres). */
function isNumeric(v: unknown): boolean {
  return v != null && v !== "" && !Number.isNaN(Number(v));
}

// ── Définitions ──────────────────────────────────────────────────────────────

/** Tests globaux + ceux créés par le coach, variables triées par libellé. */
export async function listTestDefinitions(coachId: string): Promise<TestDefinitionWithVariables[]> {
  const rows = unwrapRows(
    await untyped()
      .from("test_definitions")
      .select("*, test_variables(*)")
      .or(`is_global.eq.true,created_by.eq.${coachId}`)
      .order("kind") // ordre historique de la banque
      .order("name"),
    "Banque de tests non chargée",
  ) as TestDefinitionWithVariables[];
  return rows.map(withSortedVariables);
}

const definitionFields = (input: CreateTestDefinitionInput) => ({
  name: input.name.trim(),
  category: input.category ?? null,
  articulation: input.category === "bilan_articulaire" ? input.articulation?.trim() || null : null,
  media_url: input.media_url?.trim() || null,
  fill_mode: input.fill_mode ?? "self",
  description: input.description.trim() || null,
  protocol: input.protocol.trim() ? { text: input.protocol.trim() } : null,
});

/** Crée un test du coach et ses variables (la définition est retirée si les variables échouent). */
export async function createTestDefinition(coachId: string, input: CreateTestDefinitionInput): Promise<{ id: string }> {
  const def = unwrap(
    await untyped()
      .from("test_definitions")
      .insert({ ...definitionFields(input), kind: "custom", created_by: coachId, is_global: false })
      .select()
      .single(),
    "Test non créé",
  ) as { id: string } | null;
  if (!def) throw new Error("Test non créé");
  const res = await untyped()
    .from("test_variables")
    .insert(input.variables.map((v) => ({ ...v, test_definition_id: def.id })));
  if (res.error) {
    await untyped().from("test_definitions").delete().eq("id", def.id);
    check(res, "Variables du test non créées");
  }
  return def;
}

/**
 * Met à jour un test et synchronise ses variables (retire celles qui ne sont
 * plus dans le formulaire, ajoute / modifie les autres par clé). Une variable
 * qui a déjà des valeurs ne peut pas être retirée (la base refuse).
 */
export async function updateTestDefinition(input: UpdateTestDefinitionInput): Promise<void> {
  check(
    await untyped()
      .from("test_definitions")
      .update({ ...definitionFields(input), updated_at: new Date().toISOString() })
      .eq("id", input.id),
    "Test non modifié",
  );
  const existing = unwrapRows(
    await untyped().from("test_variables").select("id, key").eq("test_definition_id", input.id),
    "Variables du test non chargées",
  ) as { id: string; key: string }[];
  const formKeys = new Set(input.variables.map((v) => v.key));
  const toDelete = existing.filter((e) => !formKeys.has(e.key));
  if (toDelete.length > 0) {
    check(
      await untyped().from("test_variables").delete().in("id", toDelete.map((d) => d.id)),
      "Variables retirées non supprimées",
    );
  }
  check(
    await untyped()
      .from("test_variables")
      .upsert(input.variables.map((v) => ({ ...v, test_definition_id: input.id })), { onConflict: "test_definition_id,key" }),
    "Variables du test non enregistrées",
  );
}

/** Supprime un test du coach (ses variables suivent). */
export async function deleteTestDefinition(id: string): Promise<void> {
  check(await untyped().from("test_definitions").delete().eq("id", id), "Test non supprimé");
}

// ── Résultats ────────────────────────────────────────────────────────────────

const RESULT_SELECT = `
  *,
  test_definitions (
    id, name, kind, category, description, battery,
    test_variables (id, key, label, unit, value_type, better_when)
  ),
  athlete_test_values (
    id, result_id, variable_id, value,
    test_variables (id, key, label, unit, value_type, better_when)
  )
`;

/** Résultats d'un athlète, le plus récent d'abord, avec test et valeurs. */
export async function listTestResults(athleteId: string): Promise<AthleteTestResult[]> {
  const rows = unwrapRows(
    await untyped()
      .from("athlete_test_results")
      .select(RESULT_SELECT)
      .eq("athlete_id", athleteId)
      .order("performed_at", { ascending: false }),
    "Résultats de tests non chargés",
  );
  return rows as AthleteTestResult[];
}

/** Meilleure valeur par variable (vue `athlete_current_values`). */
export async function listCurrentValues(athleteId: string): Promise<AthleteCurrentValue[]> {
  const rows = unwrapRows(
    await untyped().from("athlete_current_values").select("*").eq("athlete_id", athleteId),
    "Valeurs de tests non chargées",
  );
  return rows as AthleteCurrentValue[];
}

/** Valeurs numériques seulement (`variable_id → valeur`). */
function cleanValues(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && !Number.isNaN(v)) out[k] = Number(v);
  return out;
}

/**
 * Crée (sans `resultId`) ou modifie un résultat saisi par le coach, valeurs
 * comprises, en une transaction. Renvoie l'id du résultat.
 */
export async function saveTestResult(
  athleteId: string,
  input: CreateTestResultInput & { resultId?: string | null },
): Promise<string> {
  const id = unwrap(
    await db().rpc("save_athlete_test_result", {
      p_athlete: athleteId,
      p_definition: input.test_definition_id,
      p_performed_at: input.performed_at,
      p_notes: input.notes.trim() || null,
      p_values: cleanValues(input.values),
      p_result: input.resultId ?? null,
    }),
    input.resultId ? "Résultat non modifié" : "Résultat non enregistré",
  );
  if (!id) throw new Error("Résultat non enregistré");
  return id as string;
}

/** Supprime un résultat (ses valeurs suivent ; la référence créée reste). */
export async function deleteTestResult(resultId: string): Promise<void> {
  check(await untyped().from("athlete_test_results").delete().eq("id", resultId), "Résultat non supprimé");
}

// ── Séries par catégorie (profil sportif coach) ──────────────────────────────

export interface CatSeriesPoint { date: string; value: number }
export interface CatSeries {
  testId: string;
  testName: string;
  varId: string;
  varKey: string;
  varLabel: string;
  unit: string;
  betterHigher: boolean;
  extrapMetric: string | null;
  extrapOp: "div" | "mul" | null;
  extrapFactor: number | null;
  points: CatSeriesPoint[]; // asc par date
}

interface VarMeta {
  id: string; key: string; label: string; unit: string; better_when: string;
  extrap_metric: string | null; extrap_op: "div" | "mul" | null; extrap_factor: number | null;
}
export interface CategoryDefRow { id: string; name: string; test_variables: VarMeta[] }
export interface CategoryResultRow {
  test_definition_id: string;
  performed_at: string;
  athlete_test_values: { value: number | string; variable_id: string }[] | null;
}

/** Une série par (test, variable), points du plus ancien au plus récent. */
export function buildCategorySeries(defs: CategoryDefRow[], results: CategoryResultRow[]): CatSeries[] {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const varById = new Map<string, VarMeta>();
  for (const d of defs) for (const v of d.test_variables ?? []) varById.set(v.id, v);

  const map = new Map<string, CatSeries>();
  for (const r of results) {
    const def = defById.get(r.test_definition_id);
    for (const v of r.athlete_test_values ?? []) {
      const meta = varById.get(v.variable_id);
      if (!meta) continue;
      const key = `${r.test_definition_id}:${v.variable_id}`;
      let s = map.get(key);
      if (!s) {
        s = {
          testId: r.test_definition_id, testName: def?.name ?? "",
          varId: v.variable_id, varKey: meta.key, varLabel: meta.label, unit: meta.unit,
          betterHigher: meta.better_when === "higher",
          extrapMetric: meta.extrap_metric, extrapOp: meta.extrap_op, extrapFactor: meta.extrap_factor,
          points: [],
        };
        map.set(key, s);
      }
      s.points.push({ date: r.performed_at, value: Number(v.value) });
    }
  }
  for (const s of map.values()) s.points.sort((a, b) => a.date.localeCompare(b.date));
  return [...map.values()];
}

/** Séries de résultats (par test + variable) d'une catégorie, ordre chronologique. */
export async function getCategoryTestSeries(athleteId: string, category: TestCategory): Promise<CatSeries[]> {
  const defs = unwrapRows(
    await untyped()
      .from("test_definitions")
      .select("id, name, test_variables(id, key, label, unit, better_when, extrap_metric, extrap_op, extrap_factor)")
      .eq("category", category),
    "Tests de la catégorie non chargés",
  ) as CategoryDefRow[];
  if (defs.length === 0) return [];
  const results = unwrapRows(
    await untyped()
      .from("athlete_test_results")
      .select("test_definition_id, performed_at, athlete_test_values(value, variable_id)")
      .eq("athlete_id", athleteId)
      .in("test_definition_id", defs.map((d) => d.id))
      .order("performed_at", { ascending: false }),
    "Résultats de la catégorie non chargés",
  ) as CategoryResultRow[];
  return buildCategorySeries(defs, results);
}

// ── Séances de test ──────────────────────────────────────────────────────────

export interface TestSessionFill {
  id: string;
  title: string;
  type: string;
  date: string;
  completed: boolean;
  description: string | null;
  results_note: string | null;
  results_structured: Record<string, unknown> | null;
}

/** Séance de test telle que l'affiche la semaine / le programme de l'athlète. */
export interface TestSessionSummary {
  id: string;
  type: string;
  title: string;
  date: string;
  completed: boolean;
}

/** Séances de test d'un athlète (prévues et faites), par date croissante. Lève en cas d'erreur. */
export async function listTestSessions(athleteId: string): Promise<TestSessionSummary[]> {
  const rows = unwrapRows(
    await untyped()
      .from("test_sessions")
      .select("id,type,title,date,completed")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: true }),
    "Tests programmés non chargés",
  ) as TestSessionSummary[];
  return rows.map((r) => ({ ...r, completed: r.completed === true }));
}

/** Séance de test + définition correspondante (variables triées), pour le tiroir de saisie. */
export async function getTestSessionForFill(
  sessionId: string,
): Promise<{ session: TestSessionFill | null; definition: TestDefinitionWithVariables | null }> {
  const session = unwrap(
    await untyped()
      .from("test_sessions")
      .select("id, title, type, date, completed, description, results_note, results_structured")
      .eq("id", sessionId)
      .maybeSingle(),
    "Test non chargé",
  ) as TestSessionFill | null;
  if (!session?.title) return { session, definition: null };
  const defs = unwrapRows(
    await untyped().from("test_definitions").select("*, test_variables(*)").ilike("name", session.title.trim()),
    "Définition du test non chargée",
  ) as TestDefinitionWithVariables[];
  const def = pickDefinitionByName(defs, session.title);
  return { session, definition: def ? withSortedVariables(def) : null };
}

/** L'athlète enregistre son test : séance complétée (le trigger crée le résultat). */
export async function completeTestSession(
  sessionId: string,
  data: { resultsNote: string | null; resultsStructured: Record<string, unknown> | null },
): Promise<void> {
  check(
    await untyped()
      .from("test_sessions")
      .update({ completed: true, results_note: data.resultsNote, results_structured: data.resultsStructured })
      .eq("id", sessionId),
    "Test non enregistré",
  );
}

// ── File « à noter » du coach ────────────────────────────────────────────────

export interface PendingCoachTest {
  sessionId: string;
  title: string;
  date: string;
  comment: string | null;
  variables: TestVariable[];
}

type CompletedSessionRow = {
  id: string; title: string; date: string;
  results_structured: { variables?: Record<string, unknown>; comment?: string } | null;
};
type CoachDefRow = { id: string; name: string; is_global?: boolean | null; created_at?: string | null; test_variables: TestVariable[] };

/** Séances complétées d'un test « rempli par le coach » sans aucune valeur saisie. */
export function pendingCoachTests(sessions: CompletedSessionRow[], coachDefs: CoachDefRow[]): PendingCoachTest[] {
  const out: PendingCoachTest[] = [];
  for (const s of sessions) {
    const def = pickDefinitionByName(coachDefs, s.title ?? "");
    if (!def) continue; // pas un test coach
    const vars = s.results_structured?.variables;
    if (vars && Object.values(vars).some(isNumeric)) continue; // déjà rempli
    out.push({
      sessionId: s.id, title: s.title, date: s.date,
      comment: s.results_structured?.comment ?? null,
      variables: [...(def.test_variables ?? [])].sort(byLabel),
    });
  }
  return out;
}

/**
 * Tests programmés « mode coach » que l'athlète a faits (séance complétée)
 * mais que le coach n'a pas encore notés.
 */
export async function listPendingCoachTests(athleteId: string): Promise<PendingCoachTest[]> {
  const sessions = unwrapRows(
    await untyped()
      .from("test_sessions")
      .select("id, title, date, results_structured")
      .eq("athlete_id", athleteId)
      .eq("completed", true)
      .order("date", { ascending: false }),
    "Tests réalisés non chargés",
  ) as CompletedSessionRow[];
  if (sessions.length === 0) return [];
  const defs = unwrapRows(
    await untyped().from("test_definitions").select("id, name, is_global, created_at, fill_mode, test_variables(*)").eq("fill_mode", "coach"),
    "Tests à noter non chargés",
  ) as CoachDefRow[];
  return pendingCoachTests(sessions, defs);
}

/** Le coach saisit les valeurs dans la séance de test (le trigger crée le résultat). */
export async function fillCoachTestSession(sessionId: string, variables: Record<string, number>): Promise<void> {
  check(
    await untyped()
      .from("test_sessions")
      .update({ completed: true, results_structured: { variables } })
      .eq("id", sessionId),
    "Test non noté",
  );
}

// ── Progression d'un macrocycle (ancienne table `test_results`) ──────────────

export interface TestProgressionSeries {
  name: string;
  /** `date` au format "dd/MM". */
  data: { date: string; value: number }[];
}

export interface ProgressionRow { test_date: string; value: number | string; test: { name: string } | null }

/** Une série par test, dans l'ordre des dates. */
export function buildTestProgression(rows: ProgressionRow[]): TestProgressionSeries[] {
  const byTest: Record<string, { date: string; value: number }[]> = {};
  for (const row of rows) {
    const name = row.test?.name ?? "Test";
    const day = String(row.test_date).slice(0, 10);
    const label = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
    (byTest[name] ??= []).push({ date: label, value: Number(row.value) });
  }
  return Object.entries(byTest).map(([name, data]) => ({ name, data }));
}

export async function getTestProgression(macrocycleId: string): Promise<TestProgressionSeries[]> {
  const rows = unwrapRows(
    await untyped()
      .from("test_results")
      .select("test_date, value, test:tests(name)")
      .eq("macrocycle_id", macrocycleId)
      .order("test_date"),
    "Progression des tests non chargée",
  ) as ProgressionRow[];
  return buildTestProgression(rows);
}

/** Séances de test d'une période avec leurs résultats (Retours). Lève en cas d'erreur. */
export async function listTestSessionsWithResults(athleteId: string, from: string, to: string): Promise<TestSessionWithResults[]> {
  return unwrapRows(
    await untyped()
      .from("test_sessions")
      .select("id, title, type, date, completed, results_note, results_structured")
      .eq("athlete_id", athleteId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true }),
    "Tests de la période non chargés",
  ) as TestSessionWithResults[];
}

export interface TestSessionWithResults {
  id: string;
  title: string;
  type: string;
  date: string;
  completed: boolean | null;
  results_note: string | null;
  results_structured: Record<string, unknown> | null;
}

// ── Séances de test du planning (frise, calendrier unifié) ───────────────────

export interface TestSessionBrief {
  id: string; title: string; type: string; date: string; completed: boolean;
  description: string | null; results_note: string | null;
}

/** Séances de test d'un athlète sur une plage, par date. */
export async function listTestSessionsBetween(athleteId: string, from: IsoDay, to: IsoDay): Promise<TestSessionBrief[]> {
  const rows = unwrapRows<Record<string, unknown>>(
    (await db().from("test_sessions").select("id, title, type, date, completed, description, results_note")
      .eq("athlete_id", athleteId).gte("date", from).lte("date", to).order("date")) as never,
    "Lecture des tests impossible",
  );
  return rows.map((t) => ({
    id: String(t.id), title: String(t.title ?? ""), type: String(t.type ?? ""), date: String(t.date ?? "").slice(0, 10),
    completed: t.completed === true,
    description: (t.description as string | null) ?? null,
    results_note: (t.results_note as string | null) ?? null,
  }));
}

export async function createTestSession(p: { athleteId: string; coachId: string; title: string; type: string; date: IsoDay }): Promise<void> {
  check(
    await db().from("test_sessions").insert({
      athlete_id: p.athleteId, coach_id: p.coachId, title: p.title, type: p.type, date: p.date, completed: false,
    } as never),
    "Création du test impossible",
  );
}

export async function rescheduleTestSession(id: string, date: IsoDay): Promise<void> {
  check(await db().from("test_sessions").update({ date } as never).eq("id", id), "Déplacement du test impossible");
}

export async function deleteTestSession(id: string): Promise<void> {
  check(await db().from("test_sessions").delete().eq("id", id), "Suppression du test impossible");
}

export interface MacrocycleTestResult {
  id: string; test_id: string; value: number; test_date: string; notes?: string | null;
  test?: { name: string; unit?: string | null; higher_is_better: boolean } | null;
}

/** Résultats de tests rattachés à un macrocycle (ancienne table `test_results`). */
export async function listMacrocycleTestResults(athleteId: string, macrocycleId: string): Promise<MacrocycleTestResult[]> {
  return unwrapRows<MacrocycleTestResult>(
    (await db().from("test_results")
      .select("id, test_id, value, test_date, notes, test:tests(name, unit, higher_is_better)")
      .eq("athlete_id", athleteId).eq("macrocycle_id", macrocycleId).order("test_date")) as never,
    "Lecture des résultats de test impossible",
  );
}
