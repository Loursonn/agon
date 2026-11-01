/**
 * Tests HYROX : batterie v3, résultats, grilles versionnées, analyses et axes.
 *
 * Saisie : athlète comme coach passent par test_sessions (circuit existant) ;
 * le trigger sync_test_session_to_results alimente athlete_test_results.
 * Analyse : calculée côté client par le moteur pur (src/lib/hyrox/tests),
 * enregistrée figée dans hyrox_test_analyses. Brouillon d'axes : coach seulement.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QK } from "@/lib/queryKeys";
import {
  analyzeTests, BATTERY_IDS, gridSetFromRows, storedOutputs,
  type AthleteContext, type AthleteTestProfile, type AxesPlan, type AxesParamsDbRow, type BatteryResult, type BatterySession,
  type CalibrationAnalysis, type CalibrationRace, type GridDbRow, type GridSet, type HyroxTestAnalysisRow,
  type HyroxTestAxesDraftRow, type HyroxTestInputs, type ParamsDbRow, type ProfileSource, type RuleDbRow, type ValidatedAxes,
} from "@/lib/hyrox/tests";
import type { ValueType, BetterWhen, TestFillMode } from "@/features/shared/types/tests";

// Tables HYROX absentes des types générés : client non typé, lignes typées à la main.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

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

export function useHyroxBattery() {
  return useQuery<BatteryTest[]>({
    queryKey: QK.hyroxBattery,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("test_definitions")
        .select("id, name, fill_mode, media_url, description, protocol, battery_session, battery_order, test_variables(id, key, label, unit, value_type, better_when)")
        .eq("battery", "hyrox_v3");
      if (error) throw error;
      return ((data ?? []) as BatteryTest[])
        .map(t => ({ ...t, test_variables: [...t.test_variables].sort((a, b) => varRank(a.key) - varRank(b.key)) }))
        .sort((a, b) => SESSION_ORDER.indexOf(a.battery_session) - SESSION_ORDER.indexOf(b.battery_session) || a.battery_order - b.battery_order);
    },
  });
}

// ── Résultats de la batterie ─────────────────────────────────────────────────

const BATTERY_DEF_IDS = Object.values(BATTERY_IDS);
const resultsKey = (aid: string) => ["hyroxTests", "results", aid] as const;

interface ResultRowDb {
  id: string;
  test_definition_id: string;
  performed_at: string;
  athlete_test_values: { value: number; test_variables: { key: string } | null }[];
}

export function useHyroxBatteryResults(athleteId: string | undefined) {
  return useQuery<BatteryResult[]>({
    queryKey: resultsKey(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("athlete_test_results")
        .select("id, test_definition_id, performed_at, athlete_test_values(value, test_variables(key))")
        .eq("athlete_id", athleteId)
        .in("test_definition_id", BATTERY_DEF_IDS)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ResultRowDb[]).map(r => ({
        id: r.id,
        test_definition_id: r.test_definition_id,
        performed_at: String(r.performed_at).slice(0, 10),
        values: Object.fromEntries(
          r.athlete_test_values.filter(v => v.test_variables?.key).map(v => [v.test_variables!.key, Number(v.value)]),
        ),
      }));
    },
  });
}

/** Saisie d'un test de la batterie : une ligne test_sessions complétée (le trigger fait le reste). */
export function useSaveBatteryEntry(athleteId: string) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { test: BatteryTest; date: string; values: Record<string, number | null>; comment?: string }) => {
      const parts = input.test.test_variables
        .filter(v => input.values[v.key] != null)
        .map(v => `${v.label}: ${input.values[v.key]} ${v.unit}`);
      const results_structured: Record<string, unknown> = { variables: input.values };
      if (input.comment?.trim()) results_structured.comment = input.comment.trim();
      const row = {
        completed: true,
        results_note: parts.join(" · ") || null,
        results_structured,
      };
      // Une seule séance par test et par jour : on met à jour si elle existe.
      const { data: existing, error: e1 } = await db
        .from("test_sessions")
        .select("id")
        .eq("athlete_id", athleteId)
        .eq("date", input.date)
        .ilike("title", input.test.name)
        .limit(1);
      if (e1) throw e1;
      // Sinon, un test programmé pas encore fait (semaine de tests) : il est
      // repris à la date réelle plutôt que de rester « à faire » à côté.
      let target = existing?.[0]?.id as string | undefined;
      let moveTo: string | undefined;
      if (!target) {
        const { data: planned, error: e2 } = await db
          .from("test_sessions")
          .select("id")
          .eq("athlete_id", athleteId)
          .eq("completed", false)
          .ilike("title", input.test.name)
          .order("date", { ascending: true })
          .limit(1);
        if (e2) throw e2;
        target = planned?.[0]?.id;
        moveTo = target ? input.date : undefined;
      }
      if (target) {
        const { error } = await db.from("test_sessions").update(moveTo ? { ...row, date: moveTo } : row).eq("id", target);
        if (error) throw error;
      } else {
        const coachId = user?.id === athleteId ? profile?.coach_id ?? null : user?.id ?? null;
        const { error } = await db.from("test_sessions").insert({
          athlete_id: athleteId, coach_id: coachId, title: input.test.name, type: "autre", date: input.date, ...row,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resultsKey(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteTestResults(athleteId) });
      qc.invalidateQueries({ queryKey: QK.athleteCurrentValues(athleteId) });
      qc.invalidateQueries({ queryKey: QK.testSessions(athleteId) });
      qc.invalidateQueries({ queryKey: ["calendar-events", athleteId] });
      qc.invalidateQueries({ queryKey: ["hyroxTests", "calendar", athleteId] });
      qc.invalidateQueries({ queryKey: QK.cal(athleteId) });
      toast.success("Résultat enregistré");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

// ── Programmation de la semaine de tests ─────────────────────────────────────

/** Un test de la batterie posé dans le calendrier de l'athlète (prévu ou fait). */
export interface BatteryCalendarRow {
  id: string;
  title: string;
  date: string;
  completed: boolean;
}

const calendarKey = (aid: string) => ["hyroxTests", "calendar", aid] as const;

/** Tests de la batterie présents dans le calendrier de l'athlète, par titre exact. */
export function useBatteryCalendar(athleteId: string | undefined, names: string[]) {
  return useQuery<BatteryCalendarRow[]>({
    queryKey: [...calendarKey(athleteId ?? ""), names.length],
    enabled: !!athleteId && names.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("test_sessions")
        .select("id, title, date, completed")
        .eq("athlete_id", athleteId)
        .in("title", names)
        .order("date", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as BatteryCalendarRow[]).map(r => ({ ...r, date: String(r.date).slice(0, 10), completed: !!r.completed }));
    },
  });
}

function invalidateCalendar(qc: ReturnType<typeof useQueryClient>, athleteId: string) {
  qc.invalidateQueries({ queryKey: calendarKey(athleteId) });
  qc.invalidateQueries({ queryKey: QK.testSessions(athleteId) });
  qc.invalidateQueries({ queryKey: QK.cal(athleteId) });
  qc.invalidateQueries({ queryKey: ["calendar-events", athleteId] });
  qc.invalidateQueries({ queryKey: ["week-schedule", athleteId] });
}

/**
 * Pose les tests de la semaine dans le calendrier : une ligne test_sessions
 * « à faire » par test, en un seul envoi (tout ou rien). La saisie se fait
 * ensuite comme pour n'importe quel test programmé.
 */
export function useScheduleTestWeek(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (items: { name: string; date: string }[]) => {
      if (!items.length) return 0;
      const rows = items.map(i => ({
        athlete_id: athleteId, coach_id: user?.id ?? null, title: i.name, type: "autre", date: i.date, completed: false,
      }));
      const { error } = await db.from("test_sessions").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: n => {
      invalidateCalendar(qc, athleteId);
      toast.success(n > 1 ? `${n} tests programmés` : n === 1 ? "1 test programmé" : "Rien à programmer");
    },
    onError: () => toast.error("Erreur lors de la programmation"),
  });
}

/** Retire des tests programmés, seulement s'ils ne sont pas encore faits. */
export function useCancelTestWeek(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await db.from("test_sessions").delete().in("id", ids).eq("completed", false);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCalendar(qc, athleteId);
      toast.success("Tests retirés du calendrier");
    },
    onError: () => toast.error("Erreur lors du retrait"),
  });
}

// ── Profil de l'athlète ──────────────────────────────────────────────────────

export interface HyroxAthleteProfile extends ProfileSource {
  id: string;
  full_name: string | null;
}

export function useHyroxAthleteProfile(athleteId: string | undefined) {
  return useQuery<HyroxAthleteProfile | null>({
    queryKey: QK.hyroxAthleteProfile(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, gender, age, birth_date, weight_kg, height_cm, hyrox_category")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data as HyroxAthleteProfile | null;
    },
  });
}

export function useSetHyroxCategory(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (category: "open" | "pro") => {
      const { error } = await db.from("profiles").update({ hyrox_category: category }).eq("id", athleteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.hyroxAthleteProfile(athleteId) });
      toast.success("Catégorie HYROX enregistrée");
    },
    onError: () => toast.error("Impossible d'enregistrer la catégorie"),
  });
}

// ── Grilles versionnées ──────────────────────────────────────────────────────

async function loadGridSet(version: string): Promise<GridSet> {
  const [g, p, a, r] = await Promise.all([
    db.from("hyrox_test_grids").select("version, metric_key, axis, sex, category, thresholds, direction, source, weight, active, notes").eq("version", version),
    db.from("hyrox_test_params").select("version, scope, params").eq("version", version),
    db.from("hyrox_axes_params").select("version, params").eq("version", version).maybeSingle(),
    db.from("hyrox_work_axes_rules").select("version, rule_key, step, group_name, metric_key, condition, axis, means, rationale, to_recalibrate, active, sort_order").eq("version", version),
  ]);
  for (const x of [g, p, a, r]) if (x.error) throw x.error;
  if (!a.data) throw new Error(`Paramètres incomplets pour la version ${version}`);
  return gridSetFromRows(version, {
    grids: g.data as GridDbRow[],
    params: p.data as ParamsDbRow[],
    axes: a.data as AxesParamsDbRow,
    rules: r.data as RuleDbRow[],
  });
}

export function useGridSet(version: string | undefined) {
  return useQuery<GridSet>({
    queryKey: QK.hyroxGridSet(version ?? ""),
    enabled: !!version,
    staleTime: Infinity,
    queryFn: () => loadGridSet(version as string),
  });
}

/** Version active : celle des nouvelles analyses. */
export function useActiveGridSet() {
  return useQuery<GridSet>({
    queryKey: QK.hyroxActiveGrid,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("hyrox_test_grid_versions").select("version").eq("active", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Aucune version de grilles active");
      return loadGridSet(data.version as string);
    },
  });
}

// ── Analyses ─────────────────────────────────────────────────────────────────

export function useHyroxAnalyses(athleteId: string | undefined) {
  return useQuery<HyroxTestAnalysisRow[]>({
    queryKey: QK.hyroxAnalyses(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("hyrox_test_analyses")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HyroxTestAnalysisRow[];
    },
  });
}

export function useHyroxAxesDraft(analysisId: string | undefined, enabled = true) {
  return useQuery<HyroxTestAxesDraftRow | null>({
    queryKey: QK.hyroxAxesDraft(analysisId ?? ""),
    enabled: !!analysisId && enabled,
    queryFn: async () => {
      const { data, error } = await db.from("hyrox_test_axes_drafts").select("*").eq("analysis_id", analysisId).maybeSingle();
      if (error) throw error;
      return data as HyroxTestAxesDraftRow | null;
    },
  });
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

/** Calcule et enregistre une analyse figée, plus son brouillon d'axes. */
export function useCreateHyroxAnalysis(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateAnalysisInput) => {
      const out = analyzeTests(input.inputs, input.profile, { set: input.set, target_s: input.target_s, context: input.context });
      const { data, error } = await db
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
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      const row = data as HyroxTestAnalysisRow;
      const { error: e2 } = await db.from("hyrox_test_axes_drafts").insert({
        analysis_id: row.id, context: input.context, axes_plan: out.axes_plan, updated_by: user?.id ?? null,
      });
      if (e2) throw e2;
      return row;
    },
    onSuccess: (row, input) => {
      qc.invalidateQueries({ queryKey: QK.hyroxAnalyses(athleteId) });
      toast.success(input.recalculated_from ? "Nouvelle analyse recalculée" : "Analyse enregistrée");
      return row;
    },
    onError: () => toast.error("Erreur lors du calcul de l'analyse"),
  });
}

/** Brouillon : contexte et proposition recalculée (chrono visé, cas types). Coach seulement. */
export function useSaveAxesDraft(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { analysis_id: string; context: AthleteContext; axes_plan: AxesPlan | null; target_s: number | null }) => {
      const { error } = await db.from("hyrox_test_axes_drafts").upsert({
        analysis_id: input.analysis_id, context: input.context, axes_plan: input.axes_plan, updated_by: user?.id ?? null,
      });
      if (error) throw error;
      const { error: e2 } = await db.from("hyrox_test_analyses").update({ target_s: input.target_s }).eq("id", input.analysis_id);
      if (e2) throw e2;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: QK.hyroxAxesDraft(input.analysis_id) });
      qc.invalidateQueries({ queryKey: QK.hyroxAnalyses(athleteId) });
    },
    onError: () => toast.error("Brouillon non enregistré"),
  });
}

/** Validation : ce que l'athlète verra. validated = false retire l'accès (le texte reste). */
export function useValidateAxes(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { analysis_id: string; axes: ValidatedAxes; validated: boolean }) => {
      const { error } = await db
        .from("hyrox_test_analyses")
        .update({
          axes_validated: input.axes,
          validated_at: input.validated ? new Date().toISOString() : null,
          validated_by: input.validated ? user?.id ?? null : null,
        })
        .eq("id", input.analysis_id);
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: QK.hyroxAnalyses(athleteId) });
      toast.success(input.validated ? "Validé : l'athlète voit son bilan" : "Validation retirée : bilan masqué à l'athlète");
    },
    onError: () => toast.error("Erreur lors de la validation"),
  });
}

// ── Calibration (admin) ──────────────────────────────────────────────────────

export interface CalibrationData {
  analyses: CalibrationAnalysis[];
  races: CalibrationRace[];
  names: Record<string, string>;
}

export function useHyroxCalibration(enabled: boolean) {
  return useQuery<CalibrationData>({
    queryKey: QK.hyroxCalibration,
    enabled,
    queryFn: async () => {
      const [a, r] = await Promise.all([
        db.from("hyrox_test_analyses").select("id, athlete_id, date, profile, outputs, algo_version, grid_version"),
        db.from("hyrox_results").select(
          "id, athlete_id, date, event_name, format, division, status, total_s, run_1_s, run_2_s, run_3_s, run_4_s, run_5_s, run_6_s, run_7_s, run_8_s, ski_s, sled_push_s, sled_pull_s, bbj_s, row_s, farmers_s, lunges_s, wall_balls_s, roxzone_total_s",
        ),
      ]);
      if (a.error) throw a.error;
      if (r.error) throw r.error;
      const analyses = (a.data ?? []) as CalibrationAnalysis[];
      const ids = [...new Set(analyses.map(x => x.athlete_id))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data, error } = await db.from("profiles").select("id, full_name").in("id", ids);
        if (error) throw error;
        names = Object.fromEntries(((data ?? []) as { id: string; full_name: string | null }[]).map(p => [p.id, p.full_name ?? p.id]));
      }
      return { analyses, races: (r.data ?? []) as CalibrationRace[], names };
    },
  });
}
