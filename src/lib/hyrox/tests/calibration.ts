/**
 * Calibration du chrono estimé : dernière analyse avant une course vs chrono réel.
 * Sert à recaler les grilles « ma méthode » et le modèle chrono sur nos athlètes.
 * Pur : reçoit les lignes déjà lues (analyses et hyrox_results).
 */
import { SEGMENTS, type SegmentName } from "./chronoData";
import { segmentsAt, type ChronoPrediction, type Division } from "./chrono";
import type { AthleteTestProfile } from "./types";

export interface CalibrationAnalysis {
  id: string;
  athlete_id: string;
  date: string;
  profile: AthleteTestProfile;
  outputs: { chrono?: ChronoPrediction | null } & Record<string, unknown>;
  algo_version: string;
  grid_version: string;
}

export interface CalibrationRace {
  id: string;
  athlete_id: string;
  date: string;
  event_name: string;
  format: string;
  division: string;
  status: string;
  total_s: number;
  run_1_s?: number | null; run_2_s?: number | null; run_3_s?: number | null; run_4_s?: number | null;
  run_5_s?: number | null; run_6_s?: number | null; run_7_s?: number | null; run_8_s?: number | null;
  ski_s?: number | null; sled_push_s?: number | null; sled_pull_s?: number | null; bbj_s?: number | null;
  row_s?: number | null; farmers_s?: number | null; lunges_s?: number | null; wall_balls_s?: number | null;
  roxzone_total_s?: number | null;
}

export interface CalibrationSegment { segment: SegmentName | "Course (8 km)"; predicted_s: number; real_s: number; gap_s: number }

export interface CalibrationRow {
  athlete_id: string;
  race_id: string;
  race_date: string;
  event_name: string;
  race_division: string;
  analysis_id: string;
  analysis_date: string;
  days_before: number;
  algo_version: string;
  grid_version: string;
  predicted_s: number;
  low_s: number;
  high_s: number;
  real_s: number;
  /** Réel − estimé (s) : positif = plus lent que prévu. */
  gap_s: number;
  gap_pct: number;
  in_range: boolean;
  /** Division de la course différente de celle du profil analysé. */
  division_mismatch: boolean;
  segments: CalibrationSegment[];
}

const REAL_KEYS: Record<SegmentName, keyof CalibrationRace> = {
  SkiErg: "ski_s", "Sled Push": "sled_push_s", "Sled Pull": "sled_pull_s", BBJ: "bbj_s", Rameur: "row_s",
  Farmers: "farmers_s", Fentes: "lunges_s", "Wall balls": "wall_balls_s", Roxzone: "roxzone_total_s",
};

/** Division du profil (H/F, Open/Pro) -> divisions solo de hyrox_results. */
function soloDivision(p: AthleteTestProfile): string {
  return `${p.sex === "H" ? "men" : "women"}${p.category === "Pro" ? "_pro" : ""}`;
}

/**
 * Pour chaque course solo terminée, la dernière analyse de l'athlète faite avant
 * (au plus max_days avant la course), comparée au chrono réel.
 */
export function calibrationRows(analyses: CalibrationAnalysis[], races: CalibrationRace[], opts: { max_days?: number } = {}): CalibrationRow[] {
  const maxDays = opts.max_days ?? 240;
  const rows: CalibrationRow[] = [];
  for (const race of races) {
    if (race.format !== "solo" || race.status !== "finished" || !(race.total_s > 0)) continue;
    const before = analyses
      .filter(a => a.athlete_id === race.athlete_id && a.date <= race.date && a.outputs?.chrono)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const a = before[0];
    if (!a) continue;
    const days = Math.round((Date.parse(`${race.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`)) / 86_400_000);
    if (days > maxDays) continue;
    const c = a.outputs.chrono as ChronoPrediction;
    const d: Division = { sex: a.profile.sex, category: a.profile.category };
    const pred = segmentsAt(c.median_s, d);
    const segments: CalibrationSegment[] = [];
    const runs = [race.run_1_s, race.run_2_s, race.run_3_s, race.run_4_s, race.run_5_s, race.run_6_s, race.run_7_s, race.run_8_s];
    if (runs.every(x => x != null && x > 0)) {
      const real = (runs as number[]).reduce((s, x) => s + x, 0);
      segments.push({ segment: "Course (8 km)", predicted_s: c.run_s, real_s: real, gap_s: real - c.run_s });
    }
    SEGMENTS.forEach((seg, i) => {
      const real = race[REAL_KEYS[seg]] as number | null | undefined;
      if (real != null && real > 0) segments.push({ segment: seg, predicted_s: pred[i], real_s: real, gap_s: real - pred[i] });
    });
    const gap = race.total_s - c.median_s;
    rows.push({
      athlete_id: race.athlete_id, race_id: race.id, race_date: race.date, event_name: race.event_name, race_division: race.division,
      analysis_id: a.id, analysis_date: a.date, days_before: days, algo_version: a.algo_version, grid_version: a.grid_version,
      predicted_s: c.median_s, low_s: c.low_s, high_s: c.high_s, real_s: race.total_s, gap_s: gap, gap_pct: gap / c.median_s,
      in_range: race.total_s >= c.low_s && race.total_s <= c.high_s,
      division_mismatch: race.division !== soloDivision(a.profile),
      segments,
    });
  }
  return rows.sort((x, y) => (x.race_date < y.race_date ? 1 : -1));
}

export interface CalibrationSummary { n: number; mean_gap_s: number | null; mean_abs_gap_s: number | null; in_range_pct: number | null }

export function calibrationSummary(rows: CalibrationRow[]): CalibrationSummary {
  if (!rows.length) return { n: 0, mean_gap_s: null, mean_abs_gap_s: null, in_range_pct: null };
  const n = rows.length;
  return {
    n,
    mean_gap_s: rows.reduce((s, r) => s + r.gap_s, 0) / n,
    mean_abs_gap_s: rows.reduce((s, r) => s + Math.abs(r.gap_s), 0) / n,
    in_range_pct: rows.filter(r => r.in_range).length / n,
  };
}

const csvCell = (x: unknown) => {
  const s = x == null ? "" : String(x);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export CSV (séparateur « ; », lisible par Excel en français). Une ligne par course et par segment. */
export function calibrationCsv(rows: CalibrationRow[], names: Record<string, string> = {}): string {
  const head = ["athlete", "course", "date_course", "division_course", "analyse", "date_analyse", "jours_avant", "algo", "grilles",
    "segment", "estime_s", "reel_s", "ecart_s", "ecart_pct", "dans_fourchette", "fourchette_basse_s", "fourchette_haute_s"];
  const out = [head.join(";")];
  for (const r of rows) {
    const base = [names[r.athlete_id] ?? r.athlete_id, r.event_name, r.race_date, r.race_division, r.analysis_id, r.analysis_date, r.days_before, r.algo_version, r.grid_version];
    out.push([...base, "Total", Math.round(r.predicted_s), r.real_s, Math.round(r.gap_s), (r.gap_pct * 100).toFixed(1), r.in_range ? "oui" : "non", Math.round(r.low_s), Math.round(r.high_s)].map(csvCell).join(";"));
    for (const s of r.segments)
      out.push([...base, s.segment, Math.round(s.predicted_s), s.real_s, Math.round(s.gap_s), ((s.gap_s / s.predicted_s) * 100).toFixed(1), "", "", ""].map(csvCell).join(";"));
  }
  return out.join("\n");
}
