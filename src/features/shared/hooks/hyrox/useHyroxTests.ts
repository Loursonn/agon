/**
 * Tests HYROX : batterie v3, résultats, grilles versionnées, analyses et axes.
 *
 * Saisie : athlète comme coach passent par test_sessions (circuit existant) ;
 * le trigger sync_test_session_to_results alimente athlete_test_results.
 * Analyse : calculée côté client par le moteur pur (src/lib/hyrox/tests),
 * enregistrée figée dans hyrox_test_analyses. Brouillon d'axes : coach seulement.
 * Accès aux données : src/api/hyrox.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelTestWeek,
  createHyroxAnalysis,
  getActiveGridSet,
  getAxesDraft,
  getGridSet,
  getHyroxAthleteProfile,
  getHyroxCalibration,
  hyroxKeys,
  invalidateBatterySessions,
  invalidateHyrox,
  listBattery,
  listBatteryCalendar,
  listBatteryResults,
  listHyroxAnalyses,
  saveAxesDraft,
  saveBatteryEntry,
  scheduleTestWeek,
  setHyroxCategory,
  validateAxes,
  type BatteryCalendarRow,
  type BatteryEntryInput,
  type BatteryTest,
  type CalibrationData,
  type CreateAnalysisInput,
  type HyroxAthleteProfile,
} from "@/api/hyrox";
import type {
  AthleteContext, AxesPlan, BatteryResult, GridSet, HyroxTestAnalysisRow, HyroxTestAxesDraftRow, ValidatedAxes,
} from "@/lib/hyrox/tests";

export type {
  BatteryCalendarRow, BatteryTest, BatteryVariable, CalibrationData, CreateAnalysisInput, HyroxAthleteProfile,
} from "@/api/hyrox";

// ── Batterie v3 ──────────────────────────────────────────────────────────────

export function useHyroxBattery() {
  return useQuery<BatteryTest[]>({
    queryKey: hyroxKeys.battery,
    staleTime: 10 * 60_000,
    queryFn: listBattery,
  });
}

// ── Résultats de la batterie ─────────────────────────────────────────────────

export function useHyroxBatteryResults(athleteId: string | undefined) {
  return useQuery<BatteryResult[]>({
    queryKey: hyroxKeys.batteryResults(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listBatteryResults(athleteId as string),
  });
}

/** Saisie d'un test de la batterie : une ligne test_sessions complétée (le trigger fait le reste). */
export function useSaveBatteryEntry(athleteId: string) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: (input: BatteryEntryInput) => {
      const coachId = user?.id === athleteId ? profile?.coach_id ?? null : user?.id ?? null;
      return saveBatteryEntry(athleteId, input, coachId);
    },
    onSuccess: () => {
      // Résultats, calendrier, planning et références (trigger) à jour.
      void invalidateBatterySessions(qc, athleteId);
      toast.success("Résultat enregistré");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

// ── Programmation de la semaine de tests ─────────────────────────────────────

/** Tests de la batterie présents dans le calendrier de l'athlète, par titre exact. */
export function useBatteryCalendar(athleteId: string | undefined, names: string[]) {
  return useQuery<BatteryCalendarRow[]>({
    queryKey: hyroxKeys.batteryCalendar(athleteId ?? "", names),
    enabled: !!athleteId && names.length > 0,
    queryFn: () => listBatteryCalendar(athleteId as string, names),
  });
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
    mutationFn: (items: { name: string; date: string }[]) => scheduleTestWeek(athleteId, items, user?.id ?? null),
    onSuccess: n => {
      void invalidateBatterySessions(qc, athleteId);
      toast.success(n > 1 ? `${n} tests programmés` : n === 1 ? "1 test programmé" : "Rien à programmer");
    },
    onError: () => toast.error("Erreur lors de la programmation"),
  });
}

/** Retire des tests programmés, seulement s'ils ne sont pas encore faits. */
export function useCancelTestWeek(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => cancelTestWeek(ids),
    onSuccess: () => {
      void invalidateBatterySessions(qc, athleteId);
      toast.success("Tests retirés du calendrier");
    },
    onError: () => toast.error("Erreur lors du retrait"),
  });
}

// ── Profil de l'athlète ──────────────────────────────────────────────────────

export function useHyroxAthleteProfile(athleteId: string | undefined) {
  return useQuery<HyroxAthleteProfile | null>({
    queryKey: hyroxKeys.profile(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => getHyroxAthleteProfile(athleteId as string),
  });
}

export function useSetHyroxCategory(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: "open" | "pro") => setHyroxCategory(athleteId, category),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Catégorie HYROX enregistrée");
    },
    onError: () => toast.error("Impossible d'enregistrer la catégorie"),
  });
}

// ── Grilles versionnées ──────────────────────────────────────────────────────

export function useGridSet(version: string | undefined) {
  return useQuery<GridSet>({
    queryKey: hyroxKeys.gridSet(version ?? ""),
    enabled: !!version,
    staleTime: Infinity,
    queryFn: () => getGridSet(version as string),
  });
}

/** Version active : celle des nouvelles analyses. */
export function useActiveGridSet() {
  return useQuery<GridSet>({
    queryKey: hyroxKeys.activeGrid,
    staleTime: 10 * 60_000,
    queryFn: getActiveGridSet,
  });
}

// ── Analyses ─────────────────────────────────────────────────────────────────

export function useHyroxAnalyses(athleteId: string | undefined) {
  return useQuery<HyroxTestAnalysisRow[]>({
    queryKey: hyroxKeys.analyses(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listHyroxAnalyses(athleteId as string),
  });
}

export function useHyroxAxesDraft(analysisId: string | undefined, enabled = true) {
  return useQuery<HyroxTestAxesDraftRow | null>({
    queryKey: hyroxKeys.axesDraft(analysisId ?? ""),
    enabled: !!analysisId && enabled,
    queryFn: () => getAxesDraft(analysisId as string),
  });
}

/** Calcule et enregistre une analyse figée, plus son brouillon d'axes. */
export function useCreateHyroxAnalysis(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: CreateAnalysisInput) => createHyroxAnalysis(athleteId, input, user?.id ?? null),
    onSuccess: (row, input) => {
      void invalidateHyrox(qc, athleteId);
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
    mutationFn: (input: { analysis_id: string; context: AthleteContext; axes_plan: AxesPlan | null; target_s: number | null }) =>
      saveAxesDraft(input, user?.id ?? null),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
    },
    onError: () => toast.error("Brouillon non enregistré"),
  });
}

/** Validation : ce que l'athlète verra. validated = false retire l'accès (le texte reste). */
export function useValidateAxes(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: { analysis_id: string; axes: ValidatedAxes; validated: boolean }) => validateAxes(input, user?.id ?? null),
    onSuccess: (_d, input) => {
      void invalidateHyrox(qc, athleteId);
      toast.success(input.validated ? "Validé : l'athlète voit son bilan" : "Validation retirée : bilan masqué à l'athlète");
    },
    onError: () => toast.error("Erreur lors de la validation"),
  });
}

// ── Calibration (admin) ──────────────────────────────────────────────────────

export function useHyroxCalibration(enabled: boolean) {
  return useQuery<CalibrationData>({
    queryKey: hyroxKeys.calibration,
    enabled,
    queryFn: getHyroxCalibration,
  });
}
