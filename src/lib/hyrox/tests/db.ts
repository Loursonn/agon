/**
 * Pont entre le moteur Tests HYROX et la base (migration 20261101130000_hyrox_tests.sql).
 *
 * - gridSetToRows / gridSetFromRows : GridSet <-> lignes des tables
 *   hyrox_test_grids, hyrox_test_params, hyrox_axes_params, hyrox_work_axes_rules.
 * - seedSql : le seed SQL d'une version, généré (jamais recopié à la main).
 *   Un test vérifie que la migration contient exactement seedSql(GRID_SET_V1).
 * - Types des lignes hyrox_test_analyses / hyrox_test_axes_drafts.
 */
import type { AthleteContext, AxesPlan, PlanItem } from "./insights";
import type {
  AxesParams, AxisKey, GridRow, GridSet, HyroxTestInputs, AthleteTestProfile, MetricKey, MetricSource,
  RuleCondition, RuleStep, RunningParams, ScoringParams, Sex, HyroxCategory, WorkAxisRule,
} from "./types";

export interface GridDbRow {
  version: string;
  metric_key: MetricKey;
  axis: AxisKey;
  sex: Sex | null;
  category: HyroxCategory | null;
  thresholds: number[];
  direction: "higher" | "lower";
  source: MetricSource;
  weight: number;
  active: boolean;
  notes: string | null;
}

export interface ParamsDbRow { version: string; scope: "scoring" | "running"; params: ScoringParams | RunningParams }
export interface AxesParamsDbRow { version: string; params: AxesParams }

export interface RuleDbRow {
  version: string;
  rule_key: string;
  step: RuleStep;
  group_name: string;
  metric_key: string | null;
  condition: RuleCondition;
  axis: string;
  means: string;
  rationale: string;
  to_recalibrate: boolean;
  active: boolean;
  sort_order: number;
}

export interface GridSetRows {
  grids: GridDbRow[];
  params: ParamsDbRow[];
  axes: AxesParamsDbRow;
  rules: RuleDbRow[];
}

/** Première métrique citée par une condition (colonne metric_key, pour filtrer). */
export function primaryMetric(c: RuleCondition): string | null {
  if ("all" in c) return c.all.length ? primaryMetric(c.all[0]) : null;
  if ("any" in c) return c.any.length ? primaryMetric(c.any[0]) : null;
  return c.metric;
}

export function gridSetToRows(set: GridSet): GridSetRows {
  return {
    grids: set.rows.map(r => ({
      version: set.version, metric_key: r.metric_key, axis: r.axis, sex: r.sex, category: r.category,
      thresholds: [...r.thresholds], direction: r.direction, source: r.source, weight: r.weight, active: true, notes: r.notes ?? null,
    })),
    params: [
      { version: set.version, scope: "scoring", params: set.scoring },
      { version: set.version, scope: "running", params: set.running },
    ],
    axes: { version: set.version, params: set.axes },
    rules: set.rules.map((r, i) => ({
      version: set.version, rule_key: r.id, step: r.step, group_name: r.group, metric_key: primaryMetric(r.condition),
      condition: r.condition, axis: r.axis, means: r.means, rationale: r.rationale, to_recalibrate: !!r.to_recalibrate, active: r.active,
      sort_order: i + 1,
    })),
  };
}

/** Reconstruit un GridSet depuis les lignes d'une version (lignes inactives de grille ignorées). */
export function gridSetFromRows(version: string, rows: GridSetRows): GridSet {
  const scoring = rows.params.find(p => p.version === version && p.scope === "scoring")?.params as ScoringParams | undefined;
  const running = rows.params.find(p => p.version === version && p.scope === "running")?.params as RunningParams | undefined;
  if (!scoring || !running || rows.axes.version !== version) throw new Error(`Paramètres incomplets pour la version ${version}`);
  return {
    version,
    rows: rows.grids
      .filter(g => g.version === version && g.active)
      .map((g): GridRow => {
        const row: GridRow = {
          metric_key: g.metric_key, axis: g.axis, sex: g.sex, category: g.category,
          thresholds: g.thresholds.map(Number) as GridRow["thresholds"], direction: g.direction, source: g.source, weight: Number(g.weight),
        };
        if (g.notes) row.notes = g.notes;
        return row;
      }),
    scoring,
    running,
    axes: rows.axes.params,
    rules: rows.rules
      .filter(r => r.version === version)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r): WorkAxisRule => {
        const rule: WorkAxisRule = { id: r.rule_key, step: r.step, group: r.group_name, condition: r.condition, axis: r.axis, means: r.means, rationale: r.rationale, active: r.active };
        if (r.to_recalibrate) rule.to_recalibrate = true;
        return rule;
      }),
  };
}

// ── Seed SQL ─────────────────────────────────────────────────────────────────

const q = (s: string | null) => (s == null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const j = (o: unknown) => `${q(JSON.stringify(o))}::jsonb`;
const n = (x: number) => String(x);

export function seedSql(rows: GridSetRows, opts: { active: boolean; notes: string }): string {
  const v = rows.axes.version;
  const out: string[] = [];
  out.push(`INSERT INTO public.hyrox_test_grid_versions (version, active, notes) VALUES (${q(v)}, ${opts.active}, ${q(opts.notes)})\nON CONFLICT (version) DO NOTHING;`);
  out.push(
    "INSERT INTO public.hyrox_test_grids (version, metric_key, axis, sex, category, thresholds, direction, source, weight, active, notes) VALUES\n" +
      rows.grids
        .map(g => `  (${q(v)}, ${q(g.metric_key)}, ${q(g.axis)}, ${q(g.sex)}, ${q(g.category)}, ARRAY[${g.thresholds.map(n).join(", ")}]::numeric[], ${q(g.direction)}, ${q(g.source)}, ${n(g.weight)}, ${g.active}, ${q(g.notes)})`)
        .join(",\n") +
      "\nON CONFLICT DO NOTHING;",
  );
  out.push(
    "INSERT INTO public.hyrox_test_params (version, scope, params) VALUES\n" +
      rows.params.map(p => `  (${q(v)}, ${q(p.scope)}, ${j(p.params)})`).join(",\n") +
      "\nON CONFLICT (version, scope) DO NOTHING;",
  );
  out.push(`INSERT INTO public.hyrox_axes_params (version, params) VALUES\n  (${q(v)}, ${j(rows.axes.params)})\nON CONFLICT (version) DO NOTHING;`);
  out.push(
    "INSERT INTO public.hyrox_work_axes_rules (version, rule_key, step, group_name, metric_key, condition, axis, means, rationale, to_recalibrate, active, sort_order) VALUES\n" +
      rows.rules
        .map(r => `  (${q(v)}, ${q(r.rule_key)}, ${q(r.step)}, ${q(r.group_name)}, ${q(r.metric_key)}, ${j(r.condition)}, ${q(r.axis)}, ${q(r.means)}, ${q(r.rationale)}, ${r.to_recalibrate}, ${r.active}, ${r.sort_order})`)
        .join(",\n") +
      "\nON CONFLICT (version, rule_key) DO NOTHING;",
  );
  return out.join("\n\n");
}

// ── Analyses ─────────────────────────────────────────────────────────────────

export type AnalysisKind = "bilan" | "retest";

/** Ligne de hyrox_test_analyses. inputs / profile / outputs sont figés à la création. */
export interface HyroxTestAnalysisRow {
  id: string;
  athlete_id: string;
  kind: AnalysisKind;
  date: string;
  source_result_ids: string[];
  inputs: HyroxTestInputs;
  profile: AthleteTestProfile;
  /** Sorties du moteur (HyroxTestAnalysisOutputs, sans axes_plan : la proposition vit dans le brouillon). */
  outputs: Record<string, unknown>;
  algo_version: string;
  grid_version: string;
  target_s: number | null;
  axes_validated: ValidatedAxes | null;
  validated_at: string | null;
  validated_by: string | null;
  recalculated_from: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Axes de travail validés par le coach (seule version que voit l'athlète).
 * Partent de la proposition du moteur (AxesPlan), réécrits par le coach.
 */
export interface ValidatedAxes {
  principal1: PlanItem;
  principal2: PlanItem;
  appoint: string[];
  maintenance: string[];
  safety: string[];
  block: string[];
  roxzone: string | null;
  coach_note: string | null;
  /** Version du plan d'origine (axes@x.y.z), null si écrit à la main. */
  from_engine: string | null;
}

export function validatedFromPlan(plan: AxesPlan | null): ValidatedAxes {
  if (!plan)
    return { principal1: { label: "Course", detail: "" }, principal2: { label: "", detail: "" }, appoint: [], maintenance: [], safety: [], block: [], roxzone: null, coach_note: null, from_engine: null };
  return {
    principal1: { ...plan.principal1 },
    principal2: { label: plan.principal2.label, detail: plan.principal2.detail },
    appoint: [...plan.appoint.items, ...(plan.appoint.detail ? [plan.appoint.detail] : [])],
    maintenance: [...plan.maintenance],
    safety: [...plan.safety],
    block: [...plan.block],
    roxzone: plan.roxzone.text,
    coach_note: null,
    from_engine: plan.algo,
  };
}

/** Ligne de hyrox_test_axes_drafts : coach et admin seulement, jamais l'athlète. */
export interface HyroxTestAxesDraftRow {
  analysis_id: string;
  context: AthleteContext;
  axes_plan: AxesPlan | null;
  updated_at: string;
  updated_by: string | null;
}
